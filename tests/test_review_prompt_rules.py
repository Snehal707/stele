"""Studio check for independent frequency and single-payment drain rules."""

from gltest import get_contract_factory, get_default_account
from genlayer_py.types import CalldataAddress


PROVIDER_HEX = "0x1111111111111111111111111111111111111111"
PROVIDER = CalldataAddress(PROVIDER_HEX)
MANDATE = (
    "This agent pays recurring infrastructure invoices to a small set of declared providers. "
    "Invoices arrive a few times a month in modest amounts. It never pays a provider dozens "
    "of times in a short window, and never sends an amount that empties the vault in a single payment."
)


def test_single_payment_drain_is_off_mandate():
    account = get_default_account()
    governor = get_contract_factory(contract_file_path="governor.py").deploy(account=account)
    vault = get_contract_factory(contract_file_path="vault_twin.py").deploy(
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
            1800,
            1800,
        ],
    ).transact(value=2000)
    vault.seed_state(args=[1000, 1, 0, PROVIDER_HEX, "1", "1000"]).transact()

    governor.review(args=[CalldataAddress(account.address)]).transact()

    assert governor.get_governed(args=[CalldataAddress(account.address)]).call() == "OFF_MANDATE"

