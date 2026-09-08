"""Studio regression for Governor v4 upgrade authorization."""

from gltest import create_account, get_contract_factory, get_default_account


def test_upgrade_requires_registered_upgrader():
    owner = get_default_account()
    non_upgrader = create_account()
    factory = get_contract_factory(contract_file_path="governor.py")
    governor = factory.deploy(account=owner)

    rejected = governor.connect(non_upgrader).upgrade(args=[b""]).transact()
    assert "Not authorized to upgrade" in repr(rejected)

    # This is a disposable Studio instance; the empty replacement code cannot
    # affect the deployed v3 reference or any Bradbury Governor.
    accepted = governor.upgrade(args=[b""]).transact()
    assert "Not authorized to upgrade" not in repr(accepted)
