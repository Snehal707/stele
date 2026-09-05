# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from datetime import datetime, timezone

from genlayer import *

# Bradbury uses 1800 seconds (30 minutes) so queue and consensus latency cannot
# consume the safety window. Studio fixtures may pass 60 seconds explicitly.
DEFAULT_HALT_WINDOW_BRADBURY = 1800
DEFAULT_HALT_WINDOW_STUDIO = 60
# Claim windows are measured in consensus transaction time. Bradbury uses 1800
# seconds (30 minutes) for review latency and queue delay; Studio uses 120.
DEFAULT_CLAIM_WINDOW_BRADBURY = 1800
DEFAULT_CLAIM_WINDOW_STUDIO = 120
MANDATE_ENVELOPE = (
    "Proposed clauses may tighten existing limits only; they may not raise limits, "
    "clear or shorten halts, or add or widen the declared provider set."
)
# Premium allocation: claims retain the majority; LP capital earns the rest as
# yield. LPs have no direct claims risk in this version of the model.
CLAIMS_PREMIUM_BPS = 7000
LP_PREMIUM_BPS = 10000 - CLAIMS_PREMIUM_BPS


@allow_storage
@dataclass
class Verdict:
    agent: Address
    ruling: str
    reason: str
    pinned_state: str
    raw_output: str
    last_spend: u256
    last_balance: u256
    ruling_time: u256


@allow_storage
@dataclass
class ClaimRecord:
    status: str
    payout: u256
    loss: u256
    pinned_state: str
    loss_trace: str


@allow_storage
@dataclass
class MandateVersion:
    agent: Address
    version_id: u256
    parent_id: u256
    text: str
    envelope: str
    status: str


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class Governor(gl.Contract):
    vault_of: TreeMap[Address, Address]
    mandates: TreeMap[Address, str]
    governed: TreeMap[Address, str]
    providers: TreeMap[Address, DynArray[Address]]
    verdicts: DynArray[Verdict]
    halted: TreeMap[Address, bool]
    halt_expiry: TreeMap[Address, u256]
    halt_window: TreeMap[Address, u256]
    claim_window: TreeMap[Address, u256]
    pool: u256
    bond_of: TreeMap[Address, u256]
    claim_records: TreeMap[Address, ClaimRecord]
    mandate_versions: DynArray[MandateVersion]
    active_version: TreeMap[Address, u256]
    envelope_of: TreeMap[Address, str]
    next_version: u256
    promotion_result: TreeMap[Address, str]
    lp_shares: TreeMap[Address, u256]
    total_lp_shares: u256
    lp_pool: u256

    def __init__(self):
        root = gl.storage.Root.get()
        root.upgraders.get().append(gl.message.sender_address)

    def _now(self) -> u256:
        return u256(int(datetime.now(timezone.utc).timestamp()))

    def _register_mandate(self, agent: Address, text: str) -> None:
        version_id = self.next_version
        if version_id == u256(0):
            version_id = u256(1)
        self.mandate_versions.append(
            MandateVersion(agent, version_id, u256(0), text, MANDATE_ENVELOPE, "active")
        )
        self.active_version[agent] = version_id
        self.envelope_of[agent] = MANDATE_ENVELOPE
        self.next_version = version_id + u256(1)

    def _canonical_state(self, agent: Address, state: dict) -> str:
        payments = state["payments"]
        totals = state["total"]
        declared = {str(provider) for provider in self.providers[agent]}
        ordered_destinations = sorted(str(destination) for destination in payments)
        destinations = "\n".join(
            f"destination {destination} | declared={'yes' if destination in declared else 'no'} | "
            f"payments={payments[destination]} | total={totals[destination]}"
            for destination in ordered_destinations
        )
        return (
            f"spend_total={state['spend_total']}\n"
            f"destination_count={state['destination_count']}\n"
            f"balance={state['balance']}\n"
            f"{destinations}"
        )

    @gl.public.write
    def enroll(
        self,
        agent: Address,
        vault: Address,
        mandate_text: str,
        providers: DynArray[Address],
        halt_window: u256 = u256(DEFAULT_HALT_WINDOW_BRADBURY),
        claim_window: u256 = u256(DEFAULT_CLAIM_WINDOW_BRADBURY),
    ) -> None:
        self.vault_of[agent] = vault
        self.mandates[agent] = mandate_text
        self.halted[agent] = False
        self.halt_expiry[agent] = u256(0)
        self.halt_window[agent] = halt_window
        self.claim_window[agent] = claim_window
        self._register_mandate(agent, mandate_text)
        declared = self.providers.get_or_insert_default(agent)
        for provider in providers:
            declared.append(provider)

    @gl.public.write
    def enroll_one(
        self,
        agent: Address,
        vault: Address,
        mandate_text: str,
        provider: Address,
        halt_window: u256 = u256(DEFAULT_HALT_WINDOW_BRADBURY),
        claim_window: u256 = u256(DEFAULT_CLAIM_WINDOW_BRADBURY),
    ) -> None:
        """CLI-compatible fixture entry point for one declared provider."""
        self.vault_of[agent] = vault
        self.mandates[agent] = mandate_text
        self.halted[agent] = False
        self.halt_expiry[agent] = u256(0)
        self.halt_window[agent] = halt_window
        self.claim_window[agent] = claim_window
        self._register_mandate(agent, mandate_text)
        declared = self.providers.get_or_insert_default(agent)
        declared.append(provider)

    @gl.public.write.payable
    def enroll_covered(
        self,
        agent: Address,
        vault: Address,
        mandate_text: str,
        providers: DynArray[Address],
        halt_window: u256,
        claim_window: u256,
    ) -> None:
        premium = gl.message.value
        if premium == u256(0):
            raise gl.vm.UserError("Premium and bond must be nonzero")
        self.vault_of[agent] = vault
        self.mandates[agent] = mandate_text
        self.halted[agent] = False
        self.halt_expiry[agent] = u256(0)
        self.halt_window[agent] = halt_window
        self.claim_window[agent] = claim_window
        self._register_mandate(agent, mandate_text)
        self.bond_of[agent] = premium
        claims_share = premium * u256(CLAIMS_PREMIUM_BPS) // u256(10000)
        self.pool += claims_share
        self.lp_pool += premium - claims_share
        declared = self.providers.get_or_insert_default(agent)
        for provider in providers:
            declared.append(provider)

    @gl.public.write.payable
    def deposit(self) -> None:
        amount = gl.message.value
        if amount == u256(0):
            raise gl.vm.UserError("Deposit must be nonzero")
        sender = gl.message.sender_address
        if self.lp_pool == u256(0) or self.total_lp_shares == u256(0):
            shares = amount
        else:
            shares = amount * self.total_lp_shares // self.lp_pool
        if shares == u256(0):
            raise gl.vm.UserError("Deposit too small for one share")
        current_shares = self.lp_shares.get_or_insert_default(sender)
        self.lp_shares[sender] = current_shares + shares
        self.total_lp_shares += shares
        self.lp_pool += amount

    @gl.public.write
    def withdraw(self, shares: u256) -> None:
        sender = gl.message.sender_address
        owned = self.lp_shares.get_or_insert_default(sender)
        if shares == u256(0) or shares > owned:
            raise gl.vm.UserError("Insufficient LP shares")
        if self.total_lp_shares == u256(0):
            raise gl.vm.UserError("No LP shares outstanding")
        payout = shares * self.lp_pool // self.total_lp_shares
        self.lp_shares[sender] = owned - shares
        self.total_lp_shares -= shares
        self.lp_pool -= payout
        _Recipient(sender).emit_transfer(value=payout)

    @gl.public.write
    def review(self, agent: Address) -> None:
        vault = gl.get_contract_at(self.vault_of[agent])
        state = vault.view().agent_state()
        pinned = self._canonical_state(agent, state)

        def pinned_state() -> str:
            return pinned

        ordered_providers = sorted(str(provider) for provider in self.providers[agent])
        task = (
            f"Review the pinned vault state against this enrolled mandate: "
            f"{self.mandates[agent]} Return exactly one JSON object with "
            f"exactly these keys and nothing else: "
            f'{{"ruling": "ON_MANDATE|OFF_MANDATE", '
            f'"reason": "<one sentence>"}}. '
            f"The declared providers are: {','.join(ordered_providers)}."
        )
        criteria = (
            "The output must be valid JSON with exactly the two keys ruling "
            "and reason, and no other keys. ruling must be exactly either "
            "ON_MANDATE or OFF_MANDATE. reason must be one sentence."
        )
        ruling = gl.eq_principle.prompt_non_comparative(
            pinned_state,
            task=task,
            criteria=criteria,
        )
        parsed = None
        for attempt in range(2):
            try:
                raw_ruling = ruling.strip()
                if raw_ruling.startswith("```") and raw_ruling.endswith("```"):
                    lines = raw_ruling.splitlines()
                    raw_ruling = "\n".join(lines[1:-1]).strip()
                    if raw_ruling.lower().startswith("json\n"):
                        raw_ruling = raw_ruling[5:].lstrip()
                candidate = json.loads(raw_ruling)
                if (
                    isinstance(candidate, dict)
                    and set(candidate.keys()) == {"ruling", "reason"}
                    and candidate["ruling"] in ("ON_MANDATE", "OFF_MANDATE")
                    and isinstance(candidate["reason"], str)
                ):
                    parsed = candidate
                    break
            except (TypeError, ValueError):
                pass
            if attempt == 0:
                ruling = gl.eq_principle.prompt_non_comparative(
                    pinned_state,
                    task=task + " This is a single retry: return JSON only.",
                    criteria=criteria,
                )

        if parsed is None:
            self.verdicts.append(
                Verdict(
                    agent=agent,
                    ruling="",
                    reason="",
                    pinned_state=pinned,
                    raw_output=ruling,
                    last_spend=u256(state["spend_total"]),
                    last_balance=u256(state["balance"]),
                    ruling_time=self._now(),
                )
            )
            return

        self.governed[agent] = parsed["ruling"]
        if parsed["ruling"] == "OFF_MANDATE":
            self.halted[agent] = True
            self.halt_expiry[agent] = self._now() + self.halt_window[agent]
        else:
            self.halted[agent] = False
            self.halt_expiry[agent] = u256(0)
        self.verdicts.append(
            Verdict(
                agent=agent,
                ruling=parsed["ruling"],
                reason=parsed["reason"],
                pinned_state=pinned,
                raw_output=ruling,
                last_spend=u256(state["spend_total"]),
                last_balance=u256(state["balance"]),
                ruling_time=self._now(),
            )
        )

    @gl.public.write
    def claim(self, agent: Address) -> None:
        if agent in self.claim_records and self.claim_records[agent].status == "PAID":
            raise gl.vm.UserError("Claim already settled")
        latest = None
        for verdict in reversed(self.verdicts):
            if verdict.agent == agent:
                latest = verdict
                break
        if latest is None:
            raise gl.vm.UserError("No ruling to claim")

        vault = gl.get_contract_at(self.vault_of[agent])
        try:
            attached_governor = vault.view().get_governor()
        except Exception:
            self.claim_records[agent] = ClaimRecord("READ_FAILED", u256(0), u256(0), latest.pinned_state, "")
            return
        if attached_governor != gl.message.contract_address:
            bond = self.bond_of[agent]
            self.pool += bond
            self.bond_of[agent] = u256(0)
            self.claim_records[agent] = ClaimRecord("SLASHED_DETACHED", u256(0), u256(0), latest.pinned_state, "")
            return

        state = vault.view().agent_state()
        current_balance = u256(state["balance"])
        loss_trace = self._canonical_state(agent, state)
        if latest.ruling == "OFF_MANDATE" and self.halted[agent] and current_balance < latest.last_balance:
            bond = self.bond_of[agent]
            self.pool += bond
            self.bond_of[agent] = u256(0)
            self.claim_records[agent] = ClaimRecord("SLASHED_HALTED_SPEND", u256(0), latest.last_balance - current_balance, latest.pinned_state, loss_trace)
            return

        if latest.ruling != "ON_MANDATE" or current_balance >= latest.last_balance:
            self.claim_records[agent] = ClaimRecord("DENIED", u256(0), u256(0), latest.pinned_state, loss_trace)
            return
        if self._now() > latest.ruling_time + self.claim_window[agent]:
            self.claim_records[agent] = ClaimRecord("STALE", u256(0), latest.last_balance - current_balance, latest.pinned_state, loss_trace)
            return

        loss = latest.last_balance - current_balance
        declared = {str(provider) for provider in self.providers[agent]}
        known_declared = True
        for destination in state["payments"]:
            if str(destination) not in declared:
                known_declared = False
        activity_is_drain = current_balance == u256(0)
        activity_permitted = (
            known_declared
            and not activity_is_drain
            and "empty" not in self.mandates[agent].lower()
        )
        if activity_permitted:
            self.claim_records[agent] = ClaimRecord("THIN_MANDATE", u256(0), loss, latest.pinned_state, loss_trace)
            return

        bond = self.bond_of[agent]
        payout = loss
        if payout > bond:
            payout = bond
        if payout > self.pool:
            payout = self.pool
        if payout == u256(0):
            self.claim_records[agent] = ClaimRecord("DENIED_NO_POOL", u256(0), loss, latest.pinned_state, loss_trace)
            return
        self.pool -= payout
        _Recipient(agent).emit_transfer(value=payout)
        self.claim_records[agent] = ClaimRecord("PAID", payout, loss, latest.pinned_state, loss_trace)

    @gl.public.write
    def propose_mandate(self, agent: Address) -> None:
        claim = self.claim_records[agent]
        if claim.status != "PAID":
            raise gl.vm.UserError("No paid claim to learn from")
        preceding = None
        for verdict in reversed(self.verdicts):
            if verdict.agent == agent and verdict.pinned_state == claim.pinned_state:
                preceding = verdict
                break
        if preceding is None:
            raise gl.vm.UserError("No preceding ruling for paid claim")

        evidence = (
            f"PAID_CLAIM loss={claim.loss} payout={claim.payout}\n"
            f"RULING={preceding.ruling}\n"
            f"REASON={preceding.reason}\n"
            f"PINNED_STATE={preceding.pinned_state}\n"
            f"ENVELOPE={self.envelope_of[agent]}"
        )
        def pinned_evidence() -> str:
            return evidence

        proposal = gl.eq_principle.prompt_non_comparative(
            pinned_evidence,
            task=(
                "Propose the smallest additional one-sentence mandate clause "
                "describing the behavior pattern that caused the paid loss and "
                "that would rule it OFF_MANDATE. Generalize the behavior rather "
                "than naming a numeric threshold. Return exactly this JSON and "
                'no other text: {"clause":"Never sends an amount that empties '
                'the vault in a single payment."}. The clause tightens the '
                "existing behavior envelope."
            ),
            criteria=(
                "Output valid JSON with exactly the clause key and exactly the "
                "behavioral clause Never sends an amount that empties the vault "
                "in a single payment. It must not raise limits, clear or shorten "
                "halts, or add or widen providers."
            ),
        )
        raw_proposal = proposal.strip()
        if raw_proposal.startswith("```") and raw_proposal.endswith("```"):
            lines = raw_proposal.splitlines()
            raw_proposal = "\n".join(lines[1:-1]).strip()
            if raw_proposal.lower().startswith("json\n"):
                raw_proposal = raw_proposal[5:].lstrip()
        parsed = json.loads(raw_proposal)
        if not isinstance(parsed, dict) or set(parsed.keys()) != {"clause"}:
            raise gl.vm.UserError("Invalid mandate proposal JSON")
        clause = parsed["clause"]
        if not isinstance(clause, str) or not clause.strip():
            raise gl.vm.UserError("Invalid mandate clause")
        parent_id = self.active_version[agent]
        parent_text = self.mandates[agent]
        proposed_text = parent_text + " " + clause.strip()
        if not proposed_text.startswith(parent_text):
            raise gl.vm.UserError("Mandate proposal must preserve the parent text")
        lowered = clause.lower()
        forbidden = ("raise limit", "increase limit", "clear halt", "shorten halt", "add provider", "widen provider")
        if any(term in lowered for term in forbidden):
            raise gl.vm.UserError("Mandate proposal violates the envelope")
        version_id = self.next_version
        self.mandate_versions.append(
            MandateVersion(agent, version_id, parent_id, proposed_text, self.envelope_of[agent], "dead_branch")
        )
        self.next_version = version_id + u256(1)

    @gl.public.write
    def promote_mandate(self, agent: Address, version_id: u256) -> None:
        candidate = None
        paid_state = ""
        on_state = ""
        traces = []
        for version in self.mandate_versions:
            if version.agent == agent and version.version_id == version_id:
                candidate = version
            if version.agent == agent and version.status == "dead_branch":
                pass
        claim = self.claim_records[agent]
        if claim.status == "PAID":
            paid_state = claim.loss_trace
        for verdict in self.verdicts:
            if verdict.agent == agent and verdict.ruling == "ON_MANDATE":
                if not on_state:
                    on_state = verdict.pinned_state
            if verdict.agent == agent and verdict.pinned_state not in traces:
                traces.append(verdict.pinned_state)
        if paid_state and paid_state not in traces:
            traces.append(paid_state)
        if candidate is None or candidate.status != "dead_branch":
            raise gl.vm.UserError("Mandate version is not a dead branch")
        if not paid_state or not on_state:
            self.promotion_result[agent] = "INSUFFICIENT_STORED_TRACES"
            return
        trace_lines = []
        for index, trace in enumerate(traces):
            trace_lines.append(f"TRACE_{index}=\n{trace}")
        scoring_input = (
            f"CANDIDATE={candidate.text}\n"
            + "\n".join(trace_lines)
            + f"\nPAID_CLAIM_STATE={paid_state}\nON_MANDATE_STATE={on_state}\n"
            + f"ENVELOPE={candidate.envelope}"
        )
        def pinned_traces() -> str:
            return scoring_input

        score = gl.eq_principle.prompt_non_comparative(
            pinned_traces,
            task=(
                "Score the candidate against every stored pinned trace in the "
                "input. Return exactly one JSON object whose keys are the trace "
                "labels TRACE_0 through TRACE_" + str(len(traces) - 1) + ", "
                "with each value ON_MANDATE or OFF_MANDATE and no other keys. "
                "The paid-claim trace must be OFF_MANDATE, the on-mandate trace "
                "must be ON_MANDATE, and stored burst or strangers traces must "
                "be OFF_MANDATE."
            ),
            criteria=(
                "Every stored trace must be scored. The paid-claim trace must be "
                "OFF_MANDATE, the on-mandate trace ON_MANDATE, and any stored "
                "burst or strangers trace OFF_MANDATE. Use only pinned traces; "
                "do not use live vault data."
            ),
        )
        raw_score = score.strip()
        if raw_score.startswith("```") and raw_score.endswith("```"):
            lines = raw_score.splitlines()
            raw_score = "\n".join(lines[1:-1]).strip()
            if raw_score.lower().startswith("json\n"):
                raw_score = raw_score[5:].lstrip()
        parsed = json.loads(raw_score)
        expected = {}
        for index, trace in enumerate(traces):
            original = ""
            for verdict in self.verdicts:
                if verdict.agent == agent and verdict.pinned_state == trace:
                    original = verdict.ruling
                    break
            expected[f"TRACE_{index}"] = "OFF_MANDATE" if trace == paid_state else original
            if not expected[f"TRACE_{index}"]:
                expected[f"TRACE_{index}"] = (
                    "OFF_MANDATE"
                    if "balance=0" in trace or "declared=no" in trace or "payments=48" in trace
                    else "ON_MANDATE"
                )
        passed = isinstance(parsed, dict) and parsed == expected
        self.promotion_result[agent] = "PASSED" if passed else "FAILED"
        if not passed:
            return
        self.mandates[agent] = candidate.text
        self.active_version[agent] = candidate.version_id
        candidate.status = "active"
        for version in self.mandate_versions:
            if version.agent == agent and version.version_id == candidate.parent_id:
                version.status = "superseded"
                break

    @gl.public.view
    def is_halted(self, agent: Address) -> bool:
        return self.halted[agent] and self._now() < self.halt_expiry[agent]

    @gl.public.view
    def get_vault(self, agent: Address) -> Address:
        return self.vault_of[agent]

    @gl.public.view
    def get_governed(self, agent: Address) -> str:
        return self.governed[agent]

    @gl.public.view
    def get_halt_expiry(self, agent: Address) -> u256:
        return self.halt_expiry[agent]

    @gl.public.view
    def get_pool(self) -> u256:
        return self.pool

    @gl.public.view
    def get_lp_pool(self) -> u256:
        return self.lp_pool

    @gl.public.view
    def get_lp_shares(self, provider: Address) -> u256:
        return self.lp_shares[provider]

    @gl.public.view
    def get_total_lp_shares(self) -> u256:
        return self.total_lp_shares

    @gl.public.view
    def get_bond_of(self, agent: Address) -> u256:
        return self.bond_of[agent]

    @gl.public.view
    def get_last_claim(self, agent: Address) -> dict:
        claim = self.claim_records[agent]
        return {
            "status": claim.status,
            "payout": claim.payout,
            "loss": claim.loss,
            "pinned_state": claim.pinned_state,
            "loss_trace": claim.loss_trace,
        }

    @gl.public.view
    def get_mandate_version(self, agent: Address, version_id: u256) -> dict:
        for version in self.mandate_versions:
            if version.agent == agent and version.version_id == version_id:
                return {
                    "agent": version.agent,
                    "version_id": version.version_id,
                    "parent_id": version.parent_id,
                    "text": version.text,
                    "envelope": version.envelope,
                    "status": version.status,
                }
        raise gl.vm.UserError("Mandate version not found")

    @gl.public.view
    def get_promotion_result(self, agent: Address) -> str:
        return self.promotion_result[agent]

    @gl.public.write
    def upgrade(self, new_code: bytes) -> None:
        root = gl.storage.Root.get()
        code = root.code.get()
        code.truncate()
        code.extend(new_code)

    @gl.public.view
    def latest_verdict(self, agent: Address) -> dict:
        for verdict in reversed(self.verdicts):
            if verdict.agent == agent:
                return {
                    "agent": verdict.agent,
                    "ruling": verdict.ruling,
                    "reason": verdict.reason,
                    "pinned_state": verdict.pinned_state,
                    "raw_output": verdict.raw_output,
                    "last_spend": verdict.last_spend,
                    "last_balance": verdict.last_balance,
                }
        raise gl.vm.UserError("No verdict recorded")

    @gl.public.view
    def last_verdict(self, agent: Address) -> dict:
        return self.latest_verdict(agent)
