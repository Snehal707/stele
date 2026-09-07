"""Studio-mode regression for the C1 conflict-to-deny path.

This is intentionally an integration test: Governor and VaultTwin are both
deployed through ``gltest`` contract factories on the same Studio network.
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


def test_evidence_conflict_denies_claim_with_zero_payout():
    """Deploy both contracts in Studio and verify conflict blocks payout."""
    account = get_default_account()
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

    governor.enroll_one(
        args=[
            CalldataAddress(account.address),
            CalldataAddress(vault.address),
            MANDATE,
            PROVIDER,
            60,
            120,
            CONFLICT_RECORD_URL,
            CONFLICT_RECORD_HASH,
        ]
    ).transact()
    vault.seed_state(args=[123, 1, 877, PROVIDER_HEX, "3", "123"]).transact()

    governor.review(args=[CalldataAddress(account.address)]).transact()
    verdict = governor.latest_verdict(args=[CalldataAddress(account.address)]).call()
    assert verdict["ruling"] == "EVIDENCE_CONFLICT"

    governor.claim(args=[CalldataAddress(account.address)]).transact()
    claim = governor.get_last_claim(args=[CalldataAddress(account.address)]).call()
    assert claim["status"] == "DENIED_EVIDENCE_CONFLICT"
    assert claim["payout"] == 0
