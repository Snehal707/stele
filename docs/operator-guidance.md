# Stele operator guidance

This document is the operational companion to the contract and demo. It is
written for an operator, reviewer, or judge who needs to understand what is
safe to do, what must be verified, and what remains platform-dependent.

## Current deployment boundary

The current post-deployment Governor is on Studio Next (chain 61997):

`0x63C1c91358fA4e778550C663465e105590F6f567`

Explorer: https://explorer-studio-dev.genlayer.com/address/0x63C1c91358fA4e778550C663465e105590F6f567

The deployed source includes the enrollment guard, sticky halt semantics,
evidence-conflict handling, trace-based promotion, access-controlled
upgrades, and the zero-address default for `get_vault()`. The post-deployment
smoke test completed VaultTwin deployment, enrollment, state seeding, an
ON review and normal spend, an OFF review, and halted-spend rejection.

The full claim-and-rewrite lifecycle has additionally passed twice on fresh,
isolated Studio Next Governor/VaultTwin deployments (chain 61997) using real
contract calls and no fixture state injection. Both runs verified ON review,
spends of 20 and 980, a `PAID` claim with a delivered 980-unit simulator
message, proposal and promotion to active mandate v2, an OFF review and halt,
and a rejected post-halt spend with unchanged VaultTwin state. These test
deployments do not replace or change the public Governor above. The detailed
receipts, transaction hashes, source hashes, and state checks are in
[run 1](../results/studio-next-full-lifecycle-1792424915897.json) and
[run 2](../results/studio-next-full-lifecycle-1792425537112.json). VaultTwin
models a balance; the test does not claim a real merchant payment.

The Bradbury Governors and receipts elsewhere in this document are historical
evidence and platform-investigation records. They are not the active demo
deployment. Enrollment remains write-once for an agent: a second enrollment
reverts.

Bradbury deployment and upgrade transactions can take several minutes to reach
finality. A wallet receipt or explorer `ACCEPTED` status is not the same as
successful contract execution. Always inspect the execution result, and do not
submit a follow-up action until the prior action has reached a terminal result.

## Threat model

| Threat or failure | Required control | Operator response |
| --- | --- | --- |
| A wallet address is entered as the VaultTwin address | Verify contract code, `agent_state()`, agent identity, and Governor identity before enrollment | Stop enrollment; use the actual deployed VaultTwin address |
| The same agent is enrolled twice | Governor’s one-enrollment invariant | Treat the second attempt as an expected revert; recover the existing enrollment instead of retrying |
| A VaultTwin belongs to another agent or Governor | Read back both identities before signing | Reject the address and deploy/choose a matching VaultTwin |
| Deployment is accepted but not executable | Separate receipt/consensus state from execution status | Wait for finalization and surface the actual execution failure |
| Review targets a demo agent instead of the connected enrollment | Keep the active review target explicit in the UI | Confirm target agent and Governor before pressing Review |
| Review evidence is unavailable, malformed, or conflicting | Fail closed with `REVIEW_FAILED` or `EVIDENCE_CONFLICT` | Do not claim a valid verdict; investigate the evidence path |
| An off-mandate ruling is disputed | Bond, halt, and claim path | Inspect the ruling, pinned state, and claim window before claiming |
| A halted vault attempts to spend | Vault checks Governor halt state | Expect the spend to revert; do not interpret it as a deployment failure |
| Studio Next or Bradbury RPC/consensus stalls | One action at a time and explicit terminal-state checks | Preserve the transaction hash, stop retries, and check the network/tooling issue |
| A live Governor upgrade changes storage behavior | Full field-by-field pre/post state diff | No live upgrade without an isolated test pass and explicit go-ahead |

The threat model assumes an honest operator can still make mistakes and that
the network can return incomplete or delayed information. The UI is a guardrail;
the contract’s enrollment and halt invariants remain the security boundary.

## Invariant table

These are the properties the walkthrough and any future deployment should
preserve.

| Invariant | Meaning | Evidence/check |
| --- | --- | --- |
| One enrollment per agent | `vault_of[agent]` is assigned only on first enrollment | Second enrollment must revert; read back the stored vault |
| Vault is a contract | The enrollment target has deployed code | `eth_getCode` from the operator/frontend before submission, plus contract-level validation where available |
| Vault identity matches | The VaultTwin reports the connected agent | Read `agent_state()` and compare with the enrolling wallet |
| Governor identity matches | The VaultTwin points at the active Governor | Read `get_governor()` and compare with the configured Governor |
| Mandate is non-empty | Every enrolled agent has a meaningful rule | Reject blank/whitespace-only mandate text |
| Review has an explicit target | The displayed target is the enrolled agent or an intentionally labeled fixture | Compare the target address, Governor, and UI label before submission |
| Execution status is authoritative | A transaction is successful only after execution resolves successfully | Show consensus/receipt and execution separately; never treat receipt existence as success |
| Review is fail-closed | Unavailable, malformed, or conflicting evidence cannot silently become approval | Record `REVIEW_FAILED`/`EVIDENCE_CONFLICT` and halt where required |
| OFF_MANDATE halts | A negative ruling cannot leave the vault freely spendable | Read `is_halted(agent)` and test the vault’s spend gate |
| ON_MANDATE does not erase a halt | A later favorable review cannot silently clear an existing safety stop | Inspect halt state and expiry explicitly |
| Claims require the right ruling and loss | Payout is not automatic merely because a review exists | Check latest verdict, balance delta, and claim window |
| Upgrade preserves state | A repair upgrade must not alter unrelated enrolled-agent data | Snapshot every relevant field before and after in Studio before any live attempt |

## Core lifecycle

The enforcement loop is:

```mermaid
flowchart LR
    A[Agent / VaultTwin] -->|spend behavior| G[Governor review]
    G --> C[Validator consensus]
    C -->|ON_MANDATE| O[Continue operating]
    C -->|OFF_MANDATE or conflict| H[Set halt]
    H --> R[Spend gate rejects payment]
    H --> L[Valid loss can claim pool payout]
    G -.-> E[Pin state and evaluate evidence]
    E -.-> C
```

The agent action is permissionless, while the verdict and halt come from the
Governor's validator consensus rather than an administrator or multisig.

## Operator runbook

### 1. Before connecting a wallet

1. Confirm the network is Studio Next (chain 61997) and record the active
   Governor address. Treat Bradbury addresses as historical unless the run is
   explicitly reproducing a Bradbury receipt.
2. Confirm the wallet is the intended agent; never paste the wallet address into
   the VaultTwin field by mistake.
3. If the wallet is already enrolled, read the stored vault first. An existing
   enrollment cannot be replaced through the current Governor.

### 2. Deploy a VaultTwin

1. Use the self-service deployment control only when a new enrollment is
   actually needed.
2. Confirm the constructor inputs shown by the UI: balance, connected wallet as
   agent, and the current Governor.
3. Record the transaction hash.
4. Wait for finalization and confirm `FINISHED_WITH_RETURN` (or the exact
   successful execution status), not merely `ACCEPTED` or “receipt found.”
5. Read back `agent_state()` and `get_governor()` from the returned address.
6. Continue only if the agent and Governor match the intended values.

If deployment fails, preserve the displayed reason and transaction link. Do
not enter the wallet address into the enrollment form as a substitute.

### 3. Enroll an agent

1. Enter the verified VaultTwin address.
2. Enter a non-empty mandate that states the behavioral constraints in plain
   language.
3. Confirm the UI shows the active Governor and the intended agent.
4. Sign once and wait for consensus and execution to resolve.
5. Confirm the enrollment result shows the target agent, transaction hash,
   resolved consensus, and successful execution.
6. Confirm the UI switches the review target to this newly enrolled agent.

Enrollment does not itself produce a verdict. A completed Review is the action
that produces the judgment shown in the review result.

### 4. Review and interpret the result

1. Confirm the Review button’s label identifies the intended target.
2. Submit one review and wait; Studio Next consensus latency is variable.
3. Separate these states:
   - transaction accepted: the network accepted the request;
   - execution successful: the contract method completed;
   - verdict available: the review result was read back and parsed.
4. For `ON_MANDATE`, inspect whether the vault remains halted from an earlier
   ruling; a positive review is not an implicit unhalt operation.
5. For `OFF_MANDATE`, verify the halt and inspect the pinned state and reason.
6. For `EVIDENCE_CONFLICT` or `REVIEW_FAILED`, treat the result as a safety
   stop, not as a successful review.

### 5. Existing or unusable enrollments

The current Governor has no `unenroll`, `replace_vault`, or repair method.
Therefore:

- a valid existing enrollment should be reviewed through its stored VaultTwin;
- an enrollment pointing at a non-contract or mismatched address cannot be
  repaired through the current live Governor;
- the UI must show the stored address and the precise validation reason;
- the prepared fixture review must be clearly labeled as a fixture and must not
  be presented as a review of the unusable enrollment;
- do not imply that connecting a fresh wallet repairs the old enrollment; it
  only creates a separate test identity.

The isolated repair fork is an experimental, unshipped path. It remains
subject to the live upgrade and transaction-pool blocker documented in issue
[#402](https://github.com/genlayerlabs/genlayer-cli/issues/402).

### 6. Incident handling

When an action stalls, fails, or produces contradictory RPC views:

1. Stop submitting replacement transactions.
2. Save the wallet address, Governor address, transaction hash, nonce, and
   explorer link.
3. Query both latest and pending nonce values, if available.
4. Record consensus status separately from outer EVM execution status.
5. Do not infer success from an `ACCEPTED` banner.
6. Escalate with the exact reproduction instead of retrying blindly.

Known Bradbury limits: the network's outer transaction gas cap is `2^24`
(16,777,216); 16,777,217 is rejected. A large Governor payload can be admitted
at the cap and still run out of gas during deployment. This is a Bradbury
configuration, not a universal GenLayer limit. The related exact-estimate and
nonce/RPC symptoms are tracked separately in
[#402](https://github.com/genlayerlabs/genlayer-cli/issues/402); replacement
behavior for the large-upgrade case remains unresolved. See
[#419](https://github.com/genlayerlabs/genlayer-cli/issues/419) for the cap
measurements and trace discussion.

## External GenLayer follow-ups

Blockers on our end tied to reports filed against GenLayer's own tooling.
Not Stele features; not claimed as fixed.

| Report | Blocks | Status |
|---|---|---|
| [genlayer-studio #1761](https://github.com/genlayerlabs/genlayer-studio/issues/1761) | Local Studio/`gltest` runtime testing | Open. The suggested override cleared `session_create_request`, then our local startup required `REDIS_URL`; supported Compose topology is still requested. |
| [genlayer-cli #418](https://github.com/genlayerlabs/genlayer-cli/issues/418) | Local `genlayer up` startup | Open. Maintainer reproduced the pre-Docker version-check stall on `v0.40-dev`; [PR #422](https://github.com/genlayerlabs/genlayer-cli/pull/422) proposes a bounded, best-effort check and is open. |
| [genlayer-testing-suite #113](https://github.com/genlayerlabs/genlayer-testing-suite/issues/113) | `0.30.0rc2` direct-mode import failure | Open. Maintainer reproduced the error and traced it to stale `sdk_compat.py` imports after SDK module relocation; a fix was announced as forthcoming. The two-`Address` probe was not the root cause. |
| [genlayer-cli #402](https://github.com/genlayerlabs/genlayer-cli/issues/402) | Bradbury gas estimation and stuck-nonce symptoms | Open. Follow-up PRs [genlayer-js #215](https://github.com/genlayerlabs/genlayer-js/pull/215) and [CLI #413](https://github.com/genlayerlabs/genlayer-cli/pull/413) are open; they add explicit gas overrides and SDK headroom. The large-upgrade replacement case remains unresolved. |
| [genlayer-cli #419](https://github.com/genlayerlabs/genlayer-cli/issues/419) | Bradbury Governor-sized deployment path | Open. Bradbury's flat outer-gas cap is confirmed at `2^24`; our payload still reverts at the admitted cap. A separate deployment trace reported by another builder shows out-of-gas behavior consistent with this; our own RPC trace was unavailable. |
| [genlayer-cli #420](https://github.com/genlayerlabs/genlayer-cli/issues/420) | StudioNet IC-to-IC `get_contract_at(...).view()` prototype | Open. Original failure remains unexplained; the original store/caller sources had the same runner pin. A later same-pin view/write control on chain 61999 succeeded, but used different caller source/client versions, so this does not establish a fix. |

## Judge walkthrough checklist

- [ ] Identify the Governor and the agent target.
- [ ] Show a verified VaultTwin address, not the wallet address.
- [ ] Show the mandate before enrollment.
- [ ] Show enrollment execution status, not only receipt/consensus status.
- [ ] Show the read-back agent and Governor match.
- [ ] Run Review against the explicitly displayed target.
- [ ] Explain that enrollment produces no verdict; Review does.
- [ ] Interpret the verdict, halt state, and evidence status separately.
- [ ] State clearly which results are historical Bradbury evidence and which
      are verified on the current Studio Next deployment.
- [ ] Do not present the old Bradbury deployment or a pending upgrade as the
      active deployment.
