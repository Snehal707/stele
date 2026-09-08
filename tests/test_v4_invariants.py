"""Studio regression for the v4 mandate lineage invariant."""

from gltest import get_contract_factory, get_default_account
from genlayer_py.types import CalldataAddress


PROVIDER_HEX = "0x1111111111111111111111111111111111111111"
PROVIDER = CalldataAddress(PROVIDER_HEX)
MANDATE = (
    "The agent may pay the declared provider and must not pay it dozens of "
    "times in a short window."
)


def test_proposed_mandate_preserves_parent_prefix_before_promotion():
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

    governor.enroll_covered(
        args=[
            CalldataAddress(account.address),
            CalldataAddress(vault.address),
            MANDATE,
            [PROVIDER],
            3600,
            120,
        ],
    ).transact(value=2000)

    vault.seed_state(args=[20, 1, 980, PROVIDER_HEX, "1", "20"]).transact()
    governor.review(args=[CalldataAddress(account.address)]).transact()
    assert governor.get_governed(args=[CalldataAddress(account.address)]).call() == "ON_MANDATE"

    vault.seed_state(args=[1000, 1, 0, PROVIDER_HEX, "1", "1000"]).transact()
    governor.claim(args=[CalldataAddress(account.address)]).transact()
    assert governor.get_last_claim(args=[CalldataAddress(account.address)]).call()["status"] == "PAID"

    governor.propose_mandate(args=[CalldataAddress(account.address)]).transact()
    candidate = governor.get_mandate_version(
        args=[CalldataAddress(account.address), 2]
    ).call()
    assert candidate["status"] == "dead_branch"
    assert candidate["text"].startswith(MANDATE)
