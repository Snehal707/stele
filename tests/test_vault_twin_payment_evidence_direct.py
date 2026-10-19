"""Direct-mode checks for verified payment history and mandate-scoped review."""

import importlib
import sys
from types import SimpleNamespace


AGENT_HEX = "0x1111111111111111111111111111111111111111"
GOVERNOR_HEX = "0x2222222222222222222222222222222222222222"
PROVIDER_HEX = "0x3333333333333333333333333333333333333333"


def _deploy_vault(direct_vm, direct_deploy, monkeypatch, balance=1000):
    registry = sys.modules.get("genlayer.gl.genvm_contracts")
    if registry is not None:
        registry.__known_contract__ = None
    governor = direct_deploy("contracts/governor.py")
    governor_module = importlib.import_module(governor._instance.__class__.__module__)
    registry = importlib.import_module("genlayer.gl.genvm_contracts")
    registry.__known_contract__ = None
    vault = direct_deploy(
        "contracts/vault_twin.py",
        balance,
        governor_module.Address(AGENT_HEX),
        governor_module.Address(GOVERNOR_HEX),
    )
    module = importlib.import_module(vault._instance.__class__.__module__)
    provider = module.Address(PROVIDER_HEX)
    governor = SimpleNamespace(view=lambda: SimpleNamespace(
        is_halted=lambda _: False,
        is_review_stale=lambda _: False,
    ))
    monkeypatch.setattr(module, "_get_contract_at", lambda _: governor)
    agent = bytes.fromhex(AGENT_HEX[2:])
    direct_vm.sender = agent
    return vault, module, agent, provider


def test_positive_spend_records_explicit_before_after_and_drain(direct_vm, direct_deploy, monkeypatch):
    vault, _, _, provider = _deploy_vault(direct_vm, direct_deploy, monkeypatch)

    vault.spend(provider, 20)
    evidence = vault.last_payment_evidence()
    assert int(evidence["sequence"]) == 1
    assert str(evidence["destination"]).lower() == PROVIDER_HEX
    assert int(evidence["amount"]) == 20
    assert int(evidence["balance_before"]) == 1000
    assert int(evidence["balance_after"]) == 980

    vault.spend(provider, 980)
    evidence = vault.last_payment_evidence()
    assert int(evidence["sequence"]) == 2
    assert int(evidence["amount"]) == 980
    assert int(evidence["balance_before"]) == 980
    assert int(evidence["balance_after"]) == 0


def test_zero_value_and_initially_empty_spends_do_not_create_drain_evidence(
    direct_vm, direct_deploy, monkeypatch
):
    vault, _, _, provider = _deploy_vault(direct_vm, direct_deploy, monkeypatch)
    vault.spend(provider, 0)
    assert int(vault.last_payment_evidence()["sequence"]) == 0

    empty, _, _, empty_provider = _deploy_vault(
        direct_vm, direct_deploy, monkeypatch, balance=0
    )
    empty.spend(empty_provider, 0)
    evidence = empty.last_payment_evidence()
    assert int(evidence["sequence"]) == 0
    assert int(evidence["balance_before"]) == 0
    assert int(evidence["balance_after"]) == 0


def test_rejected_spend_leaves_payment_evidence_unchanged(direct_vm, direct_deploy, monkeypatch):
    vault, _, _, provider = _deploy_vault(direct_vm, direct_deploy, monkeypatch)
    vault.spend(provider, 20)
    before = vault.last_payment_evidence()
    with direct_vm.expect_revert("Insufficient balance"):
        vault.spend(provider, 981)
    assert vault.last_payment_evidence() == before


def test_seeded_balance_zero_has_no_verified_payment_history(direct_vm, direct_deploy, monkeypatch):
    vault, _, _, _ = _deploy_vault(direct_vm, direct_deploy, monkeypatch)
    vault.seed_state(1000, 1, 0, PROVIDER_HEX, "1", "1000")
    evidence = vault.last_payment_evidence()
    assert int(evidence["sequence"]) == 0
    assert int(evidence["amount"]) == 0


def test_review_uses_active_mandate_and_comparative_validation(
    direct_deploy, monkeypatch
):
    governor = direct_deploy("contracts/governor.py")
    module = importlib.import_module(governor._instance.__class__.__module__)
    agent = module.Address(AGENT_HEX)
    vault_address = module.Address(GOVERNOR_HEX)
    provider = module.Address(PROVIDER_HEX)
    mandate = "Pay the declared provider for routine invoices."
    governor._initialize_enrollment(agent, vault_address, mandate, 1800, 1800, "", "", 1800)
    governor.providers.get_or_insert_default(agent).append(provider)
    state = {
        "spend_total": 1000,
        "destination_count": 1,
        "balance": 0,
        "payments": {PROVIDER_HEX: 2},
        "total": {PROVIDER_HEX: 1000},
        "last_payment": {
            "sequence": 2,
            "destination": PROVIDER_HEX,
            "amount": 980,
            "balance_before": 980,
            "balance_after": 0,
        },
    }
    monkeypatch.setattr(
        module, "_get_contract_at",
        lambda _: SimpleNamespace(view=lambda: SimpleNamespace(agent_state=lambda: state)),
    )
    monkeypatch.setattr(module.gl.eq_principle, "strict_eq", lambda operation: operation())
    captured = {}

    def model(prompt, **kwargs):
        captured["prompt"] = prompt
        return {"ruling": "ON_MANDATE", "reason": "Routine provider payment evidence."}

    def comparative(operation, principle):
        captured["principle"] = principle
        return operation()

    monkeypatch.setattr(module.gl.nondet, "exec_prompt", model)
    monkeypatch.setattr(module.gl.eq_principle, "prompt_comparative", comparative)
    governor.review(agent)

    assert governor.governed[agent] == "ON_MANDATE"
    assert "ACTIVE_MANDATE_VERSION=1" in captured["prompt"]
    assert mandate in captured["prompt"]
    assert "This mandate has two independent rules" not in captured["prompt"]
    assert "aggregate balance=0" in captured["prompt"].lower()
    assert "agree on the ruling" in captured["principle"]

    governor.mandates[agent] = mandate + " Never sends a single payment that empties the vault."
    governor.active_version[agent] = 2
    monkeypatch.setattr(
        module.gl.nondet, "exec_prompt",
        lambda prompt, **kwargs: {"ruling": "OFF_MANDATE", "reason": "Payment 980 reduced balance from 980 to 0."},
    )
    monkeypatch.setattr(module.gl.eq_principle, "prompt_comparative", lambda operation, principle: operation())
    governor.review(agent)
    assert governor.governed[agent] == "OFF_MANDATE"
    latest = governor.latest_verdict(agent)
    assert latest["ruling"] == "OFF_MANDATE"
    assert "payment_sequence=2" in latest["pinned_state"]
    assert "last_payment_amount=980" in latest["pinned_state"]

    state["last_payment"] = {"sequence": 0, "amount": 0, "balance_before": 0, "balance_after": 0}
    monkeypatch.setattr(
        module.gl.nondet, "exec_prompt",
        lambda prompt, **kwargs: {"ruling": "ON_MANDATE", "reason": "No verified payment event is present."},
    )
    governor.mandates[agent] = mandate
    governor.active_version[agent] = 1
    governor.review(agent)
    assert governor.governed[agent] == "ON_MANDATE"

    monkeypatch.setattr(module.gl.nondet, "exec_prompt", lambda *args, **kwargs: "not json")
    governor.review(agent)
    assert governor.governed[agent] == "REVIEW_FAILED"
    assert governor.halted[agent] is True


def test_comparative_disagreement_does_not_store_a_new_ruling(direct_deploy, monkeypatch):
    governor = direct_deploy("contracts/governor.py")
    module = importlib.import_module(governor._instance.__class__.__module__)
    agent = module.Address(AGENT_HEX)
    vault_address = module.Address(GOVERNOR_HEX)
    provider = module.Address(PROVIDER_HEX)
    governor._initialize_enrollment(agent, vault_address, "Pay routine invoices.", 1800, 1800, "", "", 1800)
    governor.providers.get_or_insert_default(agent).append(provider)
    state = {
        "spend_total": 0,
        "destination_count": 0,
        "balance": 1000,
        "payments": {},
        "total": {},
        "last_payment": {"sequence": 0, "amount": 0, "balance_before": 0, "balance_after": 0},
    }
    monkeypatch.setattr(
        module,
        "_get_contract_at",
        lambda _: SimpleNamespace(view=lambda: SimpleNamespace(agent_state=lambda: state)),
    )
    monkeypatch.setattr(module.gl.eq_principle, "strict_eq", lambda operation: operation())
    monkeypatch.setattr(
        module.gl.nondet,
        "exec_prompt",
        lambda *args, **kwargs: {"ruling": "ON_MANDATE", "reason": "Routine invoice behavior."},
    )

    def disagree(operation, principle):
        operation()
        raise ValueError("simulated validator disagreement")

    monkeypatch.setattr(module.gl.eq_principle, "prompt_comparative", disagree)
    governor.governed[agent] = "ON_MANDATE"
    initial_verdict_count = len(governor.verdicts)
    initial_review_time = governor.last_review_timestamp.get(agent, 0)

    try:
        governor.review(agent)
    except ValueError as error:
        assert "validator disagreement" in str(error)
    else:
        raise AssertionError("comparative disagreement unexpectedly produced a ruling")

    assert governor.governed[agent] == "ON_MANDATE"
    assert governor.halted.get(agent, False) is False
    assert len(governor.verdicts) == initial_verdict_count
    assert governor.last_review_timestamp.get(agent, 0) == initial_review_time
