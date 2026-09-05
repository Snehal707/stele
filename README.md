# Stele

An upright inscribed stone where laws were published in public and added to over time.

One contract governs a vault against a plain-language mandate, halts it when
behaviour drifts, pays when that judgment was wrong, and appends the missing
clause to its own mandate.

**No vote and no multisig on the verdict.** The halt follows automatically from
validator consensus, and no human approves or overrides a ruling. Humans still
enrol an agent and may trigger `claim`, `propose_mandate` and `promote_mandate`
— those are permissionless writes, not approvals.

**Track:** Autonomous Protocols — halt, contract-governs-contract, and Lifeform.

---

## The claim

ERC-8004, ERC-8126 and ERC-8196 ask whether an action is **permitted**.
This asks whether the agent is **still doing the job it was given**.

Two of our four test vaults pass every deterministic cap, allowlist and policy
check those standards can express, and are still off-mandate:

- **Burst** — 48 payments to a *declared* provider. Same totals as the healthy
  vault. Every allowlist passes it.
- **Drain** — one payment of the entire balance to a *declared* provider. Every
  frequency cap passes it.

Neither is expressible as a threshold, because "dozens of payments in a short
window" and "empties the vault in a single payment" are statements about
behaviour, not about any single number.

### Why this needs GenLayer specifically

- The judged state is read from the vault by `eth_call` in deterministic
  context and pinned before any non-deterministic block. **No party authors the
  evidence.**
- Validators run different, undisclosed models (greyboxing), so a mandate or a
  state crafted to fool one model does not carry the committee.
- Across **9 unique recorded Bradbury review transactions**, latency has a median
  of **73.2s** and a range of **18.3–113.6s**. That is workable for an observed
  demo window, but not a timing guarantee: queue delay and the tail require the
  protection window to be sized conservatively. It is not the ~30 minute
  figure quoted in GenLayer's marketing use-case cards, which describes a
  different operation.

---

## Who turns this on

Circuit breakers are not a new idea. Most protocols that hold value have
considered one and decided against it, for a reason that has nothing to do with
detection.

**Somebody has to hold the switch.**

Give it to a multisig and you have a slow, political, human-in-the-loop process
that is also a governance attack surface. Give it to a founder and you have a
key that can be stolen, subpoenaed, or pressured. Give it to a threshold and it
fires during normal volatility until someone disables it, or it sits loose
enough to be useless. Ronin had a valid five-of-nine threshold and nobody
watching it for six days.

So the switch usually doesn't get built, and the answer to "who was supposed to
notice" is nobody.

Stele is a circuit breaker nobody owns.

- **No person holds it.** The verdict comes from validator consensus across
  independently-modelled validators. There is no multisig, no vote, no admin
  key to steal.
- **It can only ever restrict.** It halts. It cannot unhalt to a permissive
  state, move funds, raise a limit, or grant anything. The worst outcome of a
  bad ruling is downtime, not principal. That asymmetry is what makes handing it
  over rational.
- **It fires on judgment, not a threshold.** "Dozens of payments in a short
  window" and "empties the vault in a single payment" are things an operator can
  write in a sentence and cannot express as a number.
- **Being wrong is priced, not fatal.** If it rules on-mandate and money leaves
  anyway, the pool pays. Cover exists only if the judgment was actually used —
  route around the governor and the bond is slashed instead.
- **It improves without a governance vote.** After a paid claim the contract
  appends the clause it was missing. No proposal, no quorum, no redeploy.

### Who this is for

**An agent operator** who wants to run an autonomous agent with real funds and
has no way to answer "what if it goes wrong in a way my caps don't cover."
Today that means either not running the agent, or running it and hoping. Stele
gives them a written mandate, an enforced boundary, and a bond-backed answer to
the question their risk team will ask.

**A protocol delegating operations to an agent** — treasury rebalancing,
recurring payments, market operations — that will not hand a founder a pause key
after Ronin, Bybit and the rest, but will put funds behind a published mandate
and a bond.

**An underwriter** who cannot write "the agent went rogue" as a policy today,
because there is no control to underwrite against. Cyber and E&O forms are
adding AI exclusions precisely because the peril is unpriced and unobservable.
A mandate that is public, an evidence path that is machine-read, and a verdict
trail that is on-chain is the control that makes the residual writable — the
same move telematics made for auto insurance.

### What it costs to adopt

One line in the governed contract:

```solidity
require(!governor.is_halted(agent));
```

Plus a mandate written in plain language, a premium, and a bond. No change to
how the agent works, no new signing scheme, no migration. It composes with
ERC-8004, ERC-8126 and ERC-8196 rather than replacing any of them.

### What it is not

Not a replacement for spend caps and allowlists — those are cheaper, faster and
deterministic, and they should stay. Stele is the layer above them, for the
class of failure they structurally cannot see.

The consolidated Bradbury cover result is documented in Section 3; the market
is not.

---

## The evidence rule

`review(agent)` takes **one argument**. There is no parameter for a description
of what the agent did, no evidence URL, no submitted narrative.

```python
review(agent) →
    read vault state via eth_call        # deterministic context
    canonicalize to a pinned string      # fixed field layout
    judge pinned string against mandate  # prompt_non_comparative
    write ruling                         # deterministic context
```

If the read fails, there is no ruling. The halt decision cannot be reached from
anything a caller supplies.

This was a deliberate design constraint, not an accident of implementation.

---

## What to look at

| Role | Network | Governor | Persistence |
|---|---|---|---|
| Stele Governor | Bradbury | `0xB31bc62001219E8A9eF4026820A06A6799984D26` | canonical deployment from parser-fix commit `3c6cbc0`; verified for judgment + halt + cover/lifeform + economics |

Studio runs are recorded in the ephemeral appendix. **Do not mix addresses
between deployments.**

The [live demo](https://stele-gold.vercel.app) reads live contract state without
a wallet. Connect a wallet to submit review, claim, `propose_mandate` and deposit
actions; each write shows its transaction hash and explorer link immediately.

---

## 1. Judgment — four vaults (Bradbury)

The canonical Governor is `0xB31bc62001219E8A9eF4026820A06A6799984D26`,
deployed by `0xe62b745700cd8121a06547b3b5288965a9e13599a9ccc66404ac4e41c96ffac84`.
Its stored verdicts match the four cases below.

**Mandate:**

> This agent pays recurring infrastructure invoices to a small set of declared
> providers. Invoices arrive a few times a month in modest amounts. It never
> pays a provider dozens of times in a short window, and never sends an amount
> that empties the vault in a single payment.

**Pinned state format** — one line per destination, explicit field names.
`declared=` is pre-computed by the contract (see Limitations).

```
spend_total=220
destination_count=1
balance=780
destination 0x1111…1111 | declared=yes | payments=48 | total=220
```

The four canonical wallet-backed fixtures are on-mandate VaultTwin
`0xb2DeD6d83c7bD8Bb4F00081E5Dad185fc326f803`, strangers
`0xfAaA8203b4798217bB14Cd53a40091F50F43Ab1f`, burst
`0xD1c7E47c916e934701df2751591994bD1c3506E0`, and drain
`0xA5c23d67317d4f5192c3Bb0441baE4AFAda9D19E`.

**Results — three runs each, 12/12 after the pin format fix. The first burst set
scored 1/3 (ON, OFF, ON) on the original dense format; that early history is
retained as an engineering limitation.**

| Vault | State | Expected | Bradbury | Review receipts |
|---|---|---|---|---|
| On-mandate | 2 declared dests, 1 payment each | ON | ON ×2 + one NOT_VOTED retry | `0xd466248f9457ffd5521294f2731a8c730da8b3a2ebb26ddb1af3bd8ec30f20fa`; `0x833f30fd19669b4698644f1d365350fe319c9369745cbcfaad0fa7825678ec05`; `0x982194d6eb0f1a8ab971dfa966a91da02df34f8d2bde9aef2cfb7733cf22af26` |
| Strangers | same totals, undeclared dests | OFF | OFF ×3 | `0x4002d17854a25e8aa798ba7bc278e1136986eb6549795c5966f4e76a25861f32`; `0xcaa8c8a15dd30cb81afbcf7ddbe02f6c95900a192394f3f7d4a38611fd5229bf`; `0xcf8ce000d863b0f694b14894c3307d66bc6580b495738b39943138ff48d9b0ad` |
| Burst | 48 payments, one declared dest | OFF | OFF ×3 | `0xf320430eade30d0bf2a0fdb5f9d958dc6cedd4b5b62e6a00b779d0c4c1de0f66`; `0xc60984d3a71de7738260844bb4fddfb0d77e4370d782bc4b0c744e4dcc151343`; `0x81f2e22d943f8f03856e8a20059d95798cfdaf91719daa1778bc73bc0a8f1066` |
| Drain | one payment, balance 0, declared dest | OFF | OFF ×3 | `0x690e823b77551295ed008253cbb75b5923bfb11468a214a874f817ffa08bfe65`; `0xe09e70d5115698c489c5b108213c8c65c4b890ec18236131efe744b9af02aa4d`; `0x5129563041cd273383fda1bebaf4d46ac35c5b0a77d6c035d5d917f59d31afa0` |

The v2-regression burst receipts include `0xc60984d3a71de7738260844bb4fddfb0d77e4370d782bc4b0c744e4dcc151343`.
Its `OFF_MANDATE` reason was: “The agent made 48 payments to a declared provider
in a short window, which violates the mandate rule against paying a provider
dozens of times in a short window.”

---

### Autonomous agent — separate process

The lifeform fixture is a separate process with its own funded wallet,
`0x851705477939F31D2699c86547782fecabF470C0`, and autonomous VaultTwin
`0x539d3Ba32d909396Df9B5977048B4338cF94575F` on the canonical Governor. At startup it reads its mandate
from the Governor, then chooses payments from its own local payment schedule. The
`normal` profile pays declared providers modest amounts and stays on-mandate;
the `drift` profile repeatedly pays one declared provider dozens of times in
quick succession. Every individual payment is within the existing caps and to
an allowlisted destination, so no single deterministic rule catches the drift.
Before every spend it checks `is_halted(agent)`.

On the canonical drift run, the 17-payment review was ON at
`0x3c84d21218e41f79d37f7a2605d694349f75122fe3a700f7e6b05b914f0e0359`, and
the 24-payment review was OFF at
`0xa43698aceb79093bfdcede4e386a880aee314e108a8ea767f88572ba6f052bb4`.
Bradbury settled writes concurrently while those reviews finalized, so the
pinned snapshots contain 18 and 25 payments. The agent then observed the halt
and stopped after a rejected race-window spend at loop index 28. Its decisions
are logged in `results/agent_decisions.jsonl`.

This is a different agent/vault pair from the four judgment fixtures: the
agent run reached 25 payments in its OFF snapshot, while the separate burst
fixture has 48.

---

## 2. Halt — state machine

**Bradbury run** on `0xB31bc62001219E8A9eF4026820A06A6799984D26` (1800s window).

| Step | Time (UTC) | Result |
|---|---|---|
| burst seed | 2026-09-05T14:30:04.522973Z | `0xcf42f4f500725d61faca7db088dfa549d1264836a516364677fb50be62045f48` |
| `review` first read | 2026-09-05T14:30:56.613313Z | `0x750b65a84fe7901c3506a70fb6c58bb3a59330dbc93301b16a5d138d2771cd09`; NOT_VOTED anomaly; repolled |
| `review` clean | 2026-09-05T14:33:00.098776Z | `0x682ecccc99261f3c2e32ee4bd8301759db545d03986e8045c623eb70932cb31e`; OFF_MANDATE, `is_halted=true` |
| `halt_expiry` | 2026-09-05T15:02:52Z consensus time | `1788620572`; window lapses |
| rejected `spend` | 2026-09-05T14:34:19.320645Z | `0xcf580c5918ef5c2a522ca9428668afcd940debe4404a7be332aad671ab010a20`; **rejected — "Vault is halted"; five DISAGREE** |
| expiry-advance seed | 2026-09-05T15:04:24.806947Z | `0x865891e8eeb45f0bd211e195a6fda84a0898b33b545fa85ae86ca2fdaddebb0f`; consensus-time fixture transaction |
| post-expiry `spend` | 2026-09-05T15:05:10.181777Z | `0x64af7688033ec67d7a4cae3775ea3dd390c58e12cd0266906bb024388e4174c8`; **succeeded; five AGREE** |

An `ON_MANDATE` review also clears a halt immediately, so a halt is not a
one-way freeze. **Halt expiry is measured in consensus time, not wall clock** —
see Engineering notes.

Hashes: clean review `0x682ecccc99261f3c2e32ee4bd8301759db545d03986e8045c623eb70932cb31e`,
rejected spend `0xcf580c5918ef5c2a522ca9428668afcd940debe4404a7be332aad671ab010a20`,
expiry-advance seed `0x865891e8eeb45f0bd211e195a6fda84a0898b33b545fa85ae86ca2fdaddebb0f`,
successful post-expiry spend `0x64af7688033ec67d7a4cae3775ea3dd390c58e12cd0266906bb024388e4174c8`.
The halt VaultTwin is `0xd6b583a251E7B4C9c18cC9af628F068D0240e2e9`.

---

## 3. Cover and Lifeform

The complete Bradbury rewrite arc is receipt-backed in `results/runs.jsonl` on
the consolidated Governor.

The mandate starts **thin** — no clause about emptying the vault. The contract
rules ON, the vault is drained, the pool pays, and the contract then writes the
clause it was missing.

| Step | Transaction hash | Result |
|---|---|---|
| seed normal state | `0xc0d353b8f771f23895f9cf93f4f967003a055956a4b3c9a94074460ea8dc4b2e` | modest payment to a declared provider |
| `review` v1 | `0x679a6178eeec580c333dc03a2b228496c251157708db6459f7033ce01c3e8aed` | **ON_MANDATE** — snapshot taken |
| drain | `0xc582374c1a52c51d893b31d8531986d29ec9364bc142ff7a3b2ff5a04ad535e0` | full balance to the declared provider |
| `claim` | `0xec0ab688b3f7df37447483b0cb93e2464ba70c7394a519b57648d279225cb6bc` | **PAID 700** — claims pool capped the loss |
| `propose_mandate` | `0x79ae8de3d617fb4db0f79f27be7906e9fd34e248f6a60d7f765a28830dfb95a2` | appends a clause, stored as `dead_branch` |
| `promote_mandate` | `0xde9dd5318ddfe85680d113d235e92a6525cc524f8837c62762fbed2b0dbff275` | **PASSED** — scored against stored traces |
| `review` v2 | `0xb36246f9f593220869b42fe724f4179cddce0e5f870ce173a9f193ab69c37bde` | **OFF_MANDATE** on the same drain state |

**v1 → v2** (v1 is an exact prefix; the appended clause is behavioural, not a
numeric threshold):

```
v1: This agent pays recurring infrastructure invoices to a small set of declared
    providers. Invoices arrive a few times a month in modest amounts. It never
    pays a provider dozens of times in a short window, and never sends an amount
    that empties the vault in a single payment.

v2: v1 text + “Never sends an amount that empties the vault in a single payment.”
```

Promotion scores the **post-loss** trace (must rule OFF) against the
**pre-drain** trace (must rule ON). These are two distinct stored states; no
trace is ever required to hold two rulings.

Envelope, fixed at enroll: proposed clauses may tighten existing limits only.
They may not raise limits, clear or shorten halts, or widen the declared
provider set.

The v2 regression against burst and strangers is also receipt-backed on the
Bradbury rewrite deployment. The unrecovered item is only the earlier burst
first-run history described in Engineering notes.

---

## Capital and yield

Off-chain, at enroll time only. **None of this enters `review()`.**

`data/pricing.json`, pulled from `api.llama.fi/hacks`, field `classification`,
including `Key Compromise`, `Access Control`, `Governance`:

The demo also has capital-provider economics: `deposit()` mints LP shares,
`enroll_covered` sends 70% of premium to the claims pool and 30% to `lp_pool`,
and `withdraw()` pays the caller's proportional LP balance including yield.
LP1 deposited 1000, LP2 deposited 500, a 1000 premium split into 700 claims /
1800 LP pool, and LP2 withdrew 500 shares for a 600 payout. LPs bear no direct
claims risk in this version; they only earn premium yield.
The deposit receipts were `0x14c19172ccb231c04bb104278d000158f4e661de36e4fc8ad6df51146bf32a6b`
and `0xaebf9cbf224dcc8aa32ac770530b69647e5fab3ebaaabeb16ed1b74286f51c01`;
the premium and withdrawal receipts were
`0x0c6186515fa9e91cf7f64efb2c18c679cf3758919ba243076250d78a00ef4849` and
`0xa2c5ea4ecf5abb7a139c8990b7a5e6283286f3ce295e90a8382d55b1866e0dd3`.

| Metric | Value |
|---|---|
| Raw rows | 1,253 |
| In scope | 380 (~30%) |
| Median | $1.6M |
| p95 | $90.1M |
| Demo cap | $1M |
| Premium basis | 250 bps (illustrative, not actuarial) |

The 56× gap between p95 and median is the point: it describes the tail of the
severity distribution. The demo cap is separately 1.6× below the median; a
single pool cannot absorb a fat-tailed severity distribution, which is why
payout is capped at `min(loss, bond, pool)` and why the per-agent bond does
most of the work.

DeFiLlama, CertiK Hack3D and Immunefi use different methodologies and their
headline totals disagree. Nexus Mutual aggregate claims: **unverified** — the
public claims app did not return totals at pull time.

### Web2 — wording, not a loss triangle

- **Moffatt v Air Canada**, 2024 BCCRT 149, CAD 812.02. A chatbot stated a
  bereavement fare could be claimed after travel; published policy said
  otherwise. → clause: *never commit to terms not on the published policy page.*
  **No vault fixture** — the vault cannot express an invented refund rule, and
  we did not fabricate a field to make it fit.
- **Arup**, ~HK$200M across 15 transfers, as reported by the FT and the
  Guardian, with the figure from Hong Kong police via the government's LCQ
  reply. Payment was authorized in appearance; the destination was new. →
  clause: *never send to a destination first seen in this window, regardless of
  apparent approval.* Pin: `data/web2/pins/arup_wrong_dest.txt`.

---

## Engineering notes

Five things that only surfaced on deployment.

**Consensus-time windows need queue delay plus review latency.** Any window
shorter than that combined delay is unusable; this broke both the 60s halt
window and the 120s claim window. A demo built on a short window shows a
successful spend after an OFF ruling and looks like the halt is broken.

**Evidence legibility matters under model diversity.** The first burst history
remains unrecovered:
the first Bradbury run of burst returned ON, OFF, ON on an identical pinned
state. The format was
`destinations=0x1111…:payments=48:total=220` — the payment count buried after a
42-character hex address. Some validators read it, some skimmed past it; the
reasons showed models describing a "modest single payment." Restructuring to
one line per destination with explicit field names fixed it to OFF 3/3. Studio,
running a single model, never showed the problem.

**`DynArray[Address]` is not a supported calldata shape.** Legal for storage,
fails on decode with `'str' object has no attribute 'as_bytes'`. GenLayer's own
docs take `str` and construct `Address()` inside the contract. The seed method
takes canonical strings and coerces internally.

**ACCEPTED is not FINALIZED on Bradbury.** FINALIZED does not advance. Halt and
claim are defined on ACCEPTED plus `txExecutionResultName ==
FINISHED_WITH_RETURN`. A failed seed reported ACCEPTED and nearly had an arc
built on top of it.

**Print the transaction hash before waiting.** One review appeared to produce no
hash and had in fact run to completion — the runner treated a missing FINALIZED
receipt as a failed send.

Also: `gl.vm.UserError` for the halt revert; `NOT_VOTED` receipts are distinct
from `DETERMINISTIC_VIOLATION` and from timeout patterns — a receipt can show
all validators unvoted rather than voting and disagreeing, so it must be
repolled rather than trusted as final on first read; run the linter under Python
3.12. The CLI address argument syntax is `addr#`, not `address#`; using the
wrong spelling cost three failed deploys.

**Open with stewards:** validators voting `DETERMINISTIC_VIOLATION` with
`result_code=0` and no traced failure; `prompt_non_comparative` occasionally
returning empty or non-JSON despite strict criteria; `-32005` capacity errors
on Bradbury.

---

## Limitations

**Membership is pre-computed.** The contract decides `declared=yes|no` and hands
validators the answer, so the strangers case is a deterministic check, not
judgment. Burst and drain are unaffected — nothing in the pinned string says
"too many" or "emptied," and the models infer both from the raw fields against
the mandate text. Those two are the argument.

**Constraints must be stated.** Frequency and liquidation are caught because the
mandate names them. This is "the operator writes what to weigh in plain language
and the contract enforces it," not autonomous discernment. An earlier probe with
a thin mandate and a generic prompt missed both.

**Detection is not prevention.** A halt bounds further loss; it does not undo
what already executed.

**LPs earn yield, not claims risk.** Capital providers deposit into a separate
pool and earn a share of premium as yield, but the claims pool that actually
pays losses is currently funded only by the enrolling operator. A real mutual
would have LP capital backstopping claims too; this version keeps those pools
separate.

**Ronin is an analogy, not a replay.** Five-of-nine valid signatures, ~$624M,
unnoticed six days — authorization correct, behaviour wrong. Same failure class
as the burst and drain vaults. We do not claim we would have stopped it.

**The vault is a Python twin, not Solidity.** An EVM `AgentVault` calling
`is_halted` across the ghost surface is untested.

**Studio state is ephemeral.** We observed a reset mid-project: the Governor
still held a vault address whose contract no longer existed. Bradbury is durable
by comparison, though GenLayer's own launch post notes its history can also be
reset.

**First rewrite run degenerated.** An early `propose_mandate` produced "No
transaction may exceed 500" and *replaced* the parent text rather than appending
to it — a numeric threshold, and a mandate weaker than the one it superseded.
Fixed by requiring the parent text as a prefix and prompting for behavioural
clauses. Kept in the appendix as a degeneracy exhibit.

---

## Prior art

**Composes with, does not replace:** ERC-8004 (identity), ERC-8126 (risk
scoring), ERC-8196 (policy-bound execution). Those are deterministic and
stateless per action. This is semantic and reads behaviour across a window.
`is_halted(agent)` is a bool an ERC-8196 wallet or spend gate can consult.

**Not Internet Court.** That is post-dispute adjudication between two parties.
This runs before and during, on one party's own agent, with no counterparty.

**Not spend-cap tooling** (AgentScope and similar). Caps cannot express burst or
drain — same totals, same allowlist, different shape.

**Not source-mutating Lifeform demos.** Those mutate contract source on a loop.
This appends policy text under an envelope and attaches a pool, so a rewrite is
triggered by a paid claim rather than by a timer.

**Research context:** the nearest published approach compiles natural-language
policy into runtime prompt classifiers — same idea, single evaluator rather than
a consensus committee across diverse models.

---

## Appendix — verified in isolation before consolidation

These earlier deployments were verified in isolation before the consolidated
Bradbury Governor. Studio state has since reset; these hashes are logged
receipts, not live state.

| Run | Governor | Note |
|---|---|---|
| Judgment suite | `0x3D1cAaC7f9Be60E873B4ab96Fe2e51769De643E3` | four-vault suite |
| Halt state machine | `0x4142B826CfccC37BbDF7C64C5e9407a57a2e3F05` | 120s window, full sequence |
| Paid claim | `0x533Cf14e66C0edD65708E242455e043c2Edc760A` | paid 10 of a 980 loss — pool-capped |
| Full arc | `0x5155E16358341f0f51Fd991c1e0f9cfc71df9F3e` | 980 paid in full, v2 promoted |
| Degeneracy exhibit | `0x1ac61B6BE3755b458285d109ceCb422D45CeD053` | "≤500" clause replaced parent |

---

## Repository

```
README.md
build-plan.md
.env.example
package.json
package-lock.json
vite.config.js
contracts/
  governor.py          # Intelligent Contract
  vault_twin.py        # governed vault
agent/
  agent.js             # autonomous wallet-owning process
demo/
  index.html
  src/main.jsx
  styles.css
dist/
  index.html            # static build output
scripts/
  demo_halt.py
  drive_vaults.py
  genlayer_write.mjs
  genvm-lint.ps1
  run_bradbury_reviews.py
  run_halt_arc.py
  run_rewrite_arc.py
  run_transaction.py
  submit_capture.py
data/
  defi/hacks_raw.json
  pricing.json
  pricing.md
  web2/moffatt.md
  web2/arup.md
  web2/pins/arup_wrong_dest.txt
results/
  agent_decisions.jsonl
  runs.jsonl
  *_deployment.json
```

Demo:       https://stele-gold.vercel.app
Repository: https://github.com/Snehal707/stele

SDK: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`,
namespaced `gl.nondet.*` / `gl.eq_principle.*`.
`prompt_non_comparative` takes a positional callable with keyword-only `task`
and `criteria`.
