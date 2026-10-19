import importlib
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize("kind", ["native", "evm"])
def test_enrollment_records_explicit_transport(direct_vm, direct_deploy, direct_alice, kind):
    governor = direct_deploy("contracts/governor.py")
    module = importlib.import_module(governor._instance.__class__.__module__)
    agent = module.Address("0x" + direct_alice.hex())
    vault = module.Address("0x" + "22" * 20)
    feed = module.Address("0x" + "33" * 20)
    direct_vm.value = 100
    governor.enroll_with_feed(agent, vault, "Pay infrastructure invoices.",
                             [agent], 1800, 1800, feed, "", "", 1800, kind)
    assert governor.feed_kind_of[agent] == kind
    assert governor.feed_of[agent] == feed


def test_enrollment_rejects_unknown_transport(direct_vm, direct_deploy, direct_alice):
    governor = direct_deploy("contracts/governor.py")
    module = importlib.import_module(governor._instance.__class__.__module__)
    agent = module.Address("0x" + direct_alice.hex())
    direct_vm.value = 100
    with direct_vm.expect_revert("Provider feed kind must be evm or native"):
        governor.enroll_with_feed(agent, agent, "Pay invoices.",
                                 [agent], 1800, 1800, agent, "", "", 1800, "auto")
    assert not governor._is_enrolled(agent)


def test_native_feed_ownership_and_sealing(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    feed = direct_deploy("contracts/provider_invoice_feed.py")
    assert feed.snapshot()["initialized"] is False
    with direct_vm.expect_revert("must call update_feed before seal"):
        feed.seal()
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only provider"):
        feed.update_feed("0" * 64, 3, 1)
    with direct_vm.expect_revert("Only provider"):
        feed.seal()
    direct_vm.sender = direct_alice
    feed.update_feed("0" * 64, 3, 1)
    feed.seal()
    assert feed.snapshot()["sealed"] is True
    assert feed.snapshot()["invoice_count"] == 3
    with direct_vm.expect_revert("feed sealed"):
        feed.update_feed("1" * 64, 4, 2)
    assert feed.snapshot()["invoice_count"] == 3


@pytest.mark.parametrize("snapshot,expected", [
    ({"initialized": True, "sealed": True, "invoice_count": 3}, "READY"),
    ({"initialized": False, "sealed": False, "invoice_count": 0}, "UNAVAILABLE"),
    ({"initialized": True, "sealed": False, "invoice_count": 3}, "UNAVAILABLE"),
    ({"initialized": True, "sealed": True, "invoice_count": -1}, "UNAVAILABLE"),
    ({"initialized": True, "sealed": True, "invoice_count": True}, "UNAVAILABLE"),
    ({"initialized": True, "sealed": "true", "invoice_count": 3}, "UNAVAILABLE"),
    ({}, "UNAVAILABLE"),
])
def test_native_reader_fail_closed(direct_deploy, monkeypatch, snapshot, expected):
    governor = direct_deploy("contracts/governor.py")
    module = importlib.import_module(governor._instance.__class__.__module__)
    feed = SimpleNamespace(view=lambda: SimpleNamespace(snapshot=lambda: snapshot))
    monkeypatch.setattr(module, "_get_contract_at", lambda address: feed)
    result = governor._provider_feed_read(module.Address("0x" + "11" * 20), "native")
    assert result["status"] == expected
    if expected == "READY":
        assert result["invoice_count"] == 3


def test_evm_reader_uses_matching_abi_and_does_not_fallback(direct_deploy, monkeypatch):
    governor = direct_deploy("contracts/governor.py")
    module = importlib.import_module(governor._instance.__class__.__module__)
    address = module.Address("0x" + "11" * 20)
    view = SimpleNamespace(initialized=lambda: True, is_sealed=lambda: True, invoice_count=lambda: 3)
    monkeypatch.setattr(module, "_ProviderInvoiceFeed", lambda address: SimpleNamespace(view=lambda: view))
    assert governor._provider_feed_read(address)["invoice_count"] == 3
    assert governor._provider_feed_read(address, "")["status"] == "READY"
    assert governor._provider_feed_read(address, "unknown")["status"] == "UNAVAILABLE"
    def broken(address):
        raise RuntimeError("unavailable")
    monkeypatch.setattr(module, "_ProviderInvoiceFeed", broken)
    assert governor._provider_feed_read(address)["status"] == "UNAVAILABLE"


@pytest.mark.parametrize("count,sealed,expected", [
    (3, True, "ON_MANDATE"), (2, True, "EVIDENCE_CONFLICT"), (3, False, "REVIEW_FAILED"),
])
def test_review_dispatches_native_feed(direct_deploy, monkeypatch, count, sealed, expected):
    governor = direct_deploy("contracts/governor.py")
    module = importlib.import_module(governor._instance.__class__.__module__)
    agent = module.Address("0x" + "11" * 20)
    vault = module.Address("0x" + "22" * 20)
    feed = module.Address("0x" + "33" * 20)
    governor._initialize_enrollment(agent, vault, "Pay infrastructure invoices.", 1800, 1800, "", "", 1800)
    governor.providers.get_or_insert_default(agent).append(agent)
    governor.feed_of[agent] = feed
    governor.feed_kind_of[agent] = "native"
    state = {"spend_total": 30, "destination_count": 1, "balance": 970,
             "payments": {str(agent): 3}, "total": {str(agent): 30}}
    def contract_at(address):
        if address == vault:
            return SimpleNamespace(view=lambda: SimpleNamespace(agent_state=lambda: state))
        assert address == feed
        return SimpleNamespace(view=lambda: SimpleNamespace(snapshot=lambda: {
            "initialized": True, "sealed": sealed, "invoice_count": count}))
    monkeypatch.setattr(module, "_get_contract_at", contract_at)
    monkeypatch.setattr(module.gl.eq_principle, "prompt_non_comparative",
                        lambda *args, **kwargs: '{"ruling":"ON_MANDATE","reason":"Only three payments and balance 970."}')
    governor.review(agent)
    assert governor.governed[agent] == expected
    assert bool(governor.halted[agent]) == (expected != "ON_MANDATE")
