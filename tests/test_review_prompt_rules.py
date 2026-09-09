"""Studio check for independent frequency and single-payment drain rules."""

from gltest import create_account, get_contract_factory, get_default_account
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


def test_healthy_and_burst_same_totals_have_opposite_rulings():
    """Same totals and destination, but 1 vs 48 payments, produce opposite rulings."""
    governor_factory = get_contract_factory(contract_file_path="governor.py")
    vault_factory = get_contract_factory(contract_file_path="vault_twin.py")

    healthy_account = get_default_account()
    healthy_governor = governor_factory.deploy(account=healthy_account)
    healthy_vault = vault_factory.deploy(
        args=[
            1000,
            CalldataAddress(healthy_account.address),
            CalldataAddress(healthy_governor.address),
        ],
        account=healthy_account,
    )
    healthy_governor.enroll_covered(
        args=[
            CalldataAddress(healthy_account.address),
            CalldataAddress(healthy_vault.address),
            MANDATE,
            [PROVIDER],
            1800,
            1800,
        ],
    ).transact(value=2000)
    healthy_vault.seed_state(args=[220, 1, 780, PROVIDER_HEX, "1", "220"]).transact()
    healthy_governor.review(args=[CalldataAddress(healthy_account.address)]).transact()

    burst_account = create_account()
    burst_governor = governor_factory.deploy(account=burst_account)
    burst_vault = vault_factory.deploy(
        args=[
            1000,
            CalldataAddress(burst_account.address),
            CalldataAddress(burst_governor.address),
        ],
        account=burst_account,
    )
    burst_governor.enroll_covered(
        args=[
            CalldataAddress(burst_account.address),
            CalldataAddress(burst_vault.address),
            MANDATE,
            [PROVIDER],
            1800,
            1800,
        ],
    ).transact(value=2000)
    burst_vault.seed_state(args=[220, 48, 780, PROVIDER_HEX, "48", "220"]).transact()
    burst_governor.review(args=[CalldataAddress(burst_account.address)]).transact()

    assert healthy_governor.get_governed(args=[CalldataAddress(healthy_account.address)]).call() == "ON_MANDATE"
    assert burst_governor.get_governed(args=[CalldataAddress(burst_account.address)]).call() == "OFF_MANDATE"
