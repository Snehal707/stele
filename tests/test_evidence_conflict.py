"""Focused direct-mode regression for the C1 conflict-to-deny path.

Requires the GenLayer direct-test pytest plugin (``genlayer-test``). The
current direct runner is single-contract-per-process; the Governor + VaultTwin
deployment below is therefore executable documentation of the expected
cross-contract assertions and should be run through Studio integration when
the direct runner raises its contract-registry limitation.
"""

import hashlib

import pytest

pytest.importorskip("gltest")


def address_text(value):
    """Render direct-mode byte addresses in the contract's canonical form."""
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()
    return str(value)


def reset_direct_contract_registry():
    """Allow gltest 0.29.2 to load a second contract in one test process."""
    import genlayer.gl.genvm_contracts as genvm_contracts

    genvm_contracts.__known_contract__ = None


def test_evidence_conflict_denies_claim_with_zero_payout(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    governor = direct_deploy("contracts/governor.py", sdk_version="v0.2.12")
    from genlayer.py.types import Address

    agent = Address(direct_alice)
    provider = Address(direct_bob)
    reset_direct_contract_registry()
    vault = direct_deploy(
        "contracts/vault_twin.py",
        1000,
        agent,
        governor.address,
        sdk_version="v0.2.12",
    )

    record = (
        f"vault={address_text(vault.address)}\n"
        "spend_total=123\n"
        "destination_count=1\n"
        "balance=877\n"
        f"dest={address_text(provider)} payments=3 total=123\n"
    )
    record_hash = hashlib.sha256(record.encode("utf-8")).hexdigest()
    direct_vm.mock_web(r".*conflict-record.*", {"status": 200, "body": record})

    direct_vm.sender = agent
    governor.enroll_one(
        agent,
        vault.address,
        "The agent may pay the declared provider and must not pay it dozens of times in a short window.",
        provider,
        1800,
        1800,
        "https://evidence.test/conflict-record.txt",
        record_hash,
    )

    direct_vm.sender = agent
    vault.seed_state(123, 1, 877, str(provider), "28", "123")

    governor.review(agent)
    assert governor.latest_verdict(agent)["ruling"] == "EVIDENCE_CONFLICT"

    governor.claim(agent)
    claim = governor.get_last_claim(agent)
    assert claim["status"] == "DENIED_EVIDENCE_CONFLICT"
    assert claim["payout"] == 0
