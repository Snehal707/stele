"""Studio-mode regressions for Governor v3 safety semantics.

This is intentionally an integration test: Governor and VaultTwin are both
deployed through ``gltest`` contract factories on the same Studio network.
The current ``contracts/governor.py`` implementation is the v3 behavior under
test: enrollment guards, sticky halts, and hash-locked evidence conflicts.
The fetched record is a real, hash-locked public record, but it describes a
different vault, so the expected result is the deliberate conflict branch.
The direct runner remains documented as unable to host this two-contract case
in one process.
"""

from gltest import get_contract_factory, get_default_account
from genlayer_py.types import CalldataAddress


CONFLICT_RECORD_URL = (
    "https://raw.githubusercontent.com/Snehal707/stele/master/"
    "data/web2/records/D1c7E47c916e934701df2751591994bD1c3506E0.txt"
)
CONFLICT_RECORD_HASH = (
    "356fba068599c25b04f532537e539e3604174fd9e9dcaf87e16fa3e14a131438"
)
PROVIDER_HEX = "0x1111111111111111111111111111111111111111"
PROVIDER = CalldataAddress(PROVIDER_HEX)
MANDATE = (
    "The agent may pay the declared provider and must not pay it dozens of "
    "times in a short window."
)


def _deploy_pair(account):
    """Deploy a fresh v3 Governor/VaultTwin pair for one isolated scenario."""
    governor_factory = get_contract_factory(contract_file_path="governor.py")
    vault_factory = get_contract_factory(contract_file_path="vault_twin.py")
    governor = governor_factory.deploy(account=account)
    vault = vault_factory.deploy(
        args=[
            1000,
            CalldataAddress(account.address),
            CalldataAddress(governor.address),
        ],
        account=account,
    )
    return governor, vault


def _enroll(
    governor,
    vault,
    account,
    *,
    halt_window=3600,
    record_url="",
    record_hash="",
):
    return governor.enroll_one(
        args=[
            CalldataAddress(account.address),
            CalldataAddress(vault.address),
            MANDATE,
            PROVIDER,
            halt_window,
            120,
            record_url,
            record_hash,
        ]
    ).transact()


def _receipt_text(receipt):
    """Keep rollback assertions readable across gltest receipt shapes."""
    return repr(receipt)


def test_v3_enroll_guard_rejects_double_enrollment():
    """v3 refuses a second enrollment for an already enrolled agent."""
    account = get_default_account()
    governor, vault = _deploy_pair(account)
    _enroll(governor, vault, account)

    duplicate = _enroll(governor, vault, account)

    assert "Agent already enrolled" in _receipt_text(duplicate)


def test_v3_off_then_on_review_keeps_halt_sticky():
    """An ON review after an OFF review cannot clear the v3 halt early."""
    account = get_default_account()
    governor, vault = _deploy_pair(account)
    _enroll(governor, vault, account)

    vault.seed_state(args=[48, 1, 0, PROVIDER_HEX, "48", "1000"]).transact()
    governor.review(args=[CalldataAddress(account.address)]).transact()
    assert governor.get_governed(args=[CalldataAddress(account.address)]).call() == "OFF_MANDATE"
    assert governor.is_halted(args=[CalldataAddress(account.address)]).call() is True

    vault.seed_state(args=[1, 1, 999, PROVIDER_HEX, "1", "1"]).transact()
    governor.review(args=[CalldataAddress(account.address)]).transact()
    assert governor.get_governed(args=[CalldataAddress(account.address)]).call() == "ON_MANDATE"
    assert governor.is_halted(args=[CalldataAddress(account.address)]).call() is True


def test_v3_hash_mismatch_conflict_denies_claim_with_zero_payout():
    """A v3 hash mismatch becomes EVIDENCE_CONFLICT and pays nothing."""
    account = get_default_account()
    governor, vault = _deploy_pair(account)
    _enroll(
        governor,
        vault,
        account,
        record_url=CONFLICT_RECORD_URL,
        record_hash=CONFLICT_RECORD_HASH,
    )
    vault.seed_state(args=[123, 1, 877, PROVIDER_HEX, "3", "123"]).transact()

    governor.review(args=[CalldataAddress(account.address)]).transact()
    verdict = governor.latest_verdict(args=[CalldataAddress(account.address)]).call()
    assert verdict["ruling"] == "EVIDENCE_CONFLICT"

    governor.claim(args=[CalldataAddress(account.address)]).transact()
    claim = governor.get_last_claim(args=[CalldataAddress(account.address)]).call()
    assert claim["status"] == "DENIED_EVIDENCE_CONFLICT"
    assert claim["payout"] == 0
