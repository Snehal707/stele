"""Studio regression for time-based stale-review protection."""

import time

from gltest import get_contract_factory, get_default_account
from genlayer_py.types import CalldataAddress


PROVIDER_HEX = "0x1111111111111111111111111111111111111111"
PROVIDER = CalldataAddress(PROVIDER_HEX)
MANDATE = "The agent may pay the declared provider in ordinary amounts."


def _receipt_text(receipt):
    return repr(receipt)


def test_fresh_review_allows_spend_then_stale_review_rejects():
    """A reviewed vault can spend immediately, but not after the review window."""
    account = get_default_account()
    governor = get_contract_factory(contract_file_path="governor.py").deploy(account=account)
    vault = get_contract_factory(contract_file_path="vault_twin.py").deploy(
        args=[1000, CalldataAddress(account.address), CalldataAddress(governor.address)],
        account=account,
    )

    governor.enroll_one(
        args=[
            CalldataAddress(account.address),
            CalldataAddress(vault.address),
            MANDATE,
            PROVIDER,
            3600,
            120,
            "",
            "",
            180,
        ]
    ).transact()
    vault.seed_state(args=[0, 0, 1000, "", "", ""]).transact()

    governor.review(args=[CalldataAddress(account.address)]).transact()
    assert governor.is_review_stale(args=[CalldataAddress(account.address)]).call() is False

    fresh_spend = vault.spend(
        args=[CalldataAddress("0x2222222222222222222222222222222222222222"), 10]
    ).transact()
    assert "REVIEW_STALE" not in _receipt_text(fresh_spend)

    time.sleep(185)
    assert governor.is_review_stale(args=[CalldataAddress(account.address)]).call() is True
    stale_spend = vault.spend(
        args=[CalldataAddress("0x2222222222222222222222222222222222222222"), 10]
    ).transact()
    assert "REVIEW_STALE" in _receipt_text(stale_spend)
