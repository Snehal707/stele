"""Direct-mode regression for Governor upgrade authorization."""


def test_upgrade_rejects_non_upgrader(direct_vm, direct_deploy):
    governor = direct_deploy("contracts/governor.py")
    deployer = direct_vm.sender
    direct_vm.sender = bytes.fromhex("99" * 20)

    with direct_vm.expect_revert("Not authorized to upgrade"):
        governor.upgrade(b"")

    direct_vm.sender = deployer
    governor.upgrade(b"")
