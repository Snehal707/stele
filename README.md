**Primary Governor: `0x8fb0b2648BF73D292EB1CD7736F6f6624Db9F172` (Bradbury). The primary lifecycle proof can be verified against this one address.**

### Proof receipts.

- **Enroll / Review — `0xd644075c748ef7241d7c4a46050f94cb7b5153ccb368900896e586d7107a84f8`** — `ON_MANDATE`: the mandate is judged, not assumed.
- **Drain → Claim — `0x19a86e4928759e7ece13478e24a7f7bd47f480a1384fc31b6d909df1135158fb`** — `PAID 980`: the pool pays when the judgment was wrong.
- **Propose → Promote — `0x616c274fb1cf6554c6bab129d8a9737f7f9cd0daaa4890e2d4c9e4b8df37464d`** — `PASSED`: the contract rewrites its mandate after a paid claim, with no vote.
- **Fresh drain → Review — `0xbd4d2f90af40eea2133b871acc8fe4fa886a260aa095db82366f806d56b1f956`** — `OFF_MANDATE` under v2: the same drain pattern is caught after the clause is active.
- `0xe42d9198…3ea3` — C1 `EVIDENCE_CONFLICT` → claim denied, payout 0 (Governor `0xb77B…f0AF`; evidence path required a redeploy)  
  Studio regression suite: `gltest --network studionet tests/test_evidence_conflict.py` — 3 tests covering double-enroll, sticky halt, and conflict/deny
- **Enroll — `0x1a4846a02514ecbfa328259a8594cd5fe5a497570ba6f1f1aa88597b598f4a0b`** — new agent enrolled live via direct SDK call.
- **Halt-revert — `0xd1c094118a2bf4f8df805becd9640152e0ad1d6ff67d0892c387c29c5b51e896`** — spend attempted on a halted vault, reverted with “Vault is halted.”
- **This week's fresh review — `0x6e66ba162a510ba49c0f4aa0ce6acf0167380935ac0e94e1f00f313440bade3b`** — fresh call, separate from the canonical `OFF_MANDATE` / halted / `PAID 980` lifecycle loop.

First four on `0x8fb0…`; conflict on `0xb77B…` after the evidence redeploy.

A governor cuts an agent's vault when behaviour leaves a written mandate. If that cut cost money, the pool pays and the mandate grows a clause. No vote.

# Stele

Operational guidance, invariants, threat model, and the judge walkthrough are
documented in [docs/operator-guidance.md](docs/operator-guidance.md).

An upright inscribed stone where laws were published in public and added to over time.

One contract governs a vault against a plain-language mandate, halts it when
behaviour drifts, pays when that judgment was wrong, and appends the missing
clause to its own mandate.

**No vote and no multisig on the verdict.** The halt follows automatically from
validator consensus, and no human approves or overrides a ruling. Humans still
enrol an agent and may trigger `claim`, `propose_mandate` and `promote_mandate`
— those are permissionless writes, not approvals.

**Track:** Autonomous Protocols — halt, contract-governs-contract, and Lifeform.

### Verification status

**Bradbury-proven**

- OFF sets halt.
- ON cannot clear halt.
- Evidence conflict denies payout.
- Promotion preserves the mandate prefix.
- Full v4 Lifeform loop.
- Halted spend reverts with `Vault is halted`.

**Studio-verified; Bradbury pending**

- `REVIEW_STALE` rejects stale large spends.

**Direct-mode helper-logic verified; review-path and cross-contract EVM interaction unverified**

- Provider-feed `_payment_count`, `_record_feed_conflict`, and `_record_review_failure` helpers.

**Implemented locally, lint-clean, manually audited; zero runtime verification**

- Provider-feed cross-contract EVM read and agreement path.

The provider-feed Governor implementation is currently preserved on branch
`codex/provider-feed-freshness-wip`; it is not yet merged into `master` or
deployed on Bradbury. `master` currently contains the documentation, UI
wiring, and direct helper coverage, but not the Governor implementation itself.

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

- The judged vault state is read by `eth_call` in deterministic context and
  pinned before any non-deterministic block. C1 also checks a project-authored,
  hash-locked record as a second source; that record is explicitly disclosed
  below as a designed fixture, not live spend history.
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

Minimal integration in the governed contract:

```solidity
interface IGovernor {
    function is_halted(address agent) external view returns (bool);
}
function spend(address destination, uint256 amount) external {
    require(msg.sender == agent, "Only the agent can spend");
    require(!IGovernor(governor).is_halted(agent), "Vault is halted");
    _transfer(destination, amount);
}
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

`review(agent)` still takes **one argument**. The caller cannot supply a URL,
description, or narrative. The current C1 path is a two-stage review:

```python
review(agent) →
    pin vault state via eth_call                         # deterministic source 1
    fetch enrolled record_url and verify record_hash      # source 2
    parse and compare record fields with strict_eq        # load-bearing agreement check
    if fields match: judge both sources against mandate
    if fields conflict: write EVIDENCE_CONFLICT and halt
    if fetch fails: record UNAVAILABLE; judge pinned state alone
    if hash mismatches: write EVIDENCE_CONFLICT and halt
    if parsing fails: write REVIEW_FAILED and halt
```

The enrolled `record_url` is supplied at enrollment and its SHA-256
`record_hash` is stored on-chain. Validators independently fetch,
hash-check, parse, and compare the record to the pinned vault state before the
mandate judgment. The C1 record is part of the ruling path, not a decorative
citation. `claim()` rejects payout for `EVIDENCE_CONFLICT`.

Agent C is pin-only; C1 is hash-locked. Canonical proof is Agent C.

This supersedes the original pin-only design. The earlier design remains useful
as historical context, but it is not the active review path.

### Provider-feed cross-contract pattern

The optional `enroll_with_feed(...)` path keeps `review(agent)` to one argument.
It stores a provider feed address per agent, reads the feed from the Governor,
and compares its sealed `invoiceCount` with the sum of the pinned
per-destination payment counts. An unavailable or unsealed feed fails closed
with `REVIEW_FAILED`; a count mismatch writes `EVIDENCE_CONFLICT` and blocks
payout. `contracts/ProviderInvoiceFeed.sol` is a minimal provider-controlled
sealed-feed demo. It demonstrates the cross-contract retrieval pattern, but it
is not independent third-party evidence while the feed is operated by this
project.

**Status: implementation preserved on `codex/provider-feed-freshness-wip`,
not yet merged or runtime-confirmed.** Local test execution is currently
blocked by an apparent GenLayer tooling issue unrelated to this contract; see
Engineering notes.

**Evidence precedence:** an agent enrolled with both a provider feed and a C1
record is evaluated feed-first. An unavailable or unsealed feed produces
`REVIEW_FAILED` and halts before the C1 record is checked at all. This is
intentional — it is the more conservative ordering, since it fails fast on the
newest and least-tested evidence path rather than potentially masking a feed
problem behind a passing C1 check. Agents enrolled through the original
`enroll`/`enroll_one`/`enroll_covered` methods are unaffected — they have no
`feed_of` entry and go straight to the existing C1/pin-only path.

---

The [live demo](https://stele-gold.vercel.app) reads live contract state without
a wallet. Connect a wallet to submit review, claim, `propose_mandate` and deposit
actions; each write shows its transaction hash and explorer link immediately.

---

## Testing

The v3/v4 regression tests in `tests/test_evidence_conflict.py` are intended to
cover these safety guarantees in GenLayer Studio mode: double enrollment
rejects, an `ON_MANDATE` review cannot clear a prior halt, and a hash mismatch
produces `EVIDENCE_CONFLICT` with `DENIED_EVIDENCE_CONFLICT` and payout `0`.
Runtime confirmation is subject to the local/Studio availability noted below.

Use Python 3.12+ and install `genlayer-test`, then run on hosted Studio:

```text
python -m pip install genlayer-test
gltest --network studionet tests/test_evidence_conflict.py -v -s
```

This runs all three regression tests against fresh Governor/VaultTwin pairs.
The Studio run exercises two real contract deployments per scenario and does
not replace a Bradbury consensus receipt.

The per-clause review-prompt regression is also covered by
`tests/test_review_prompt_rules.py` and runs in hosted Studio with:

```text
gltest --network studionet tests/test_review_prompt_rules.py -v -s
```

Native Windows may still hit `genlayer-test`'s temp-file cleanup issue
(`WinError 32`); run the Studio test via WSL or Linux/Mac for a clean pass.

Known limitation: the installed `genlayer-test` 0.29.2 does not expose the
direct/in-memory fixtures described by newer documentation. These tests
therefore require the Studio/integration runner; the Bradbury C1 conflict
receipt is recorded as
`0xe42d919806f930e60b1276f579b0ba6d846b865ba1ccac5d57400c366d743ea3`.

---

## 1. Judgment — four vaults (Bradbury)

The older consolidated Governor is `0xB31bc62001219E8A9eF4026820A06A6799984D26`.
The C1 receipts below came from two later Bradbury Governors because adding
record evidence required redeployment: burst uses
`0xb77B3050C3c61A0a77cBB966a4FDcB1B43A8f0AF`; drain uses
`0x68781475569CFd451b7F061f64964eB1e17Ed64e`.

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
`0xCc0Fc6A4B3C6a83F5Ca0Dd1614B557297f52A7F3`.

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

### Superseded — historical explorer fetch

The original implementation derived the Bradbury explorer address from
`vault_of[agent]` and tried `gl.nondet.web.render()` as supplementary evidence.
It is retained only as historical engineering context. It was replaced by the
C1 record system below and is no longer part of `review()` or the active ruling
path.

The old Studio probe returned shell-only text in one mode and a rendered HTML
payload in another, but it exposed address/network context rather than
transaction-level payment facts. That probe is recorded in
`results/web_evidence_burst.json` and is not C1 evidence.

### C1 hash-locked evidence records

This record is a hand-authored fixture matching a designed test scenario,
hash-locked at enrollment. It is not derived from live spend history — see
Limitations for what this does and does not prove.

The C1 evidence path makes the enrolled record load-bearing. At enrollment,
each agent stores the caller-supplied `record_url` and the SHA-256 `record_hash`
of a frozen plain-text record in `data/web2/records/<vault>.txt`. Every
validator independently fetches, hash-checks, parses, and compares that record
inside `gl.eq_principle.strict_eq`; raw page bytes are not used as the judgment
input. The record is compared with the pinned vault state before the mandate
judgment runs.

The review branches are explicit:

- Matching fields run the normal mandate judgment with both sources in the
  input.
- A failed fetch or hash check records `UNAVAILABLE` or `HASH_MISMATCH` and
  continues on pinned vault state alone; a website cannot halt review.
- A field mismatch records the distinct `EVIDENCE_CONFLICT` ruling, halts the
  agent, and `claim()` records `DENIED_EVIDENCE_CONFLICT` with zero payout.

The explorer fetch is not used by `review()` and cannot decide a ruling.

### C1 receipt ledger

These are the four receipt-backed C1 results, grouped by the Governor that
actually produced them:

| Case | Governor | Receipt | Ruling | Reason |
|---|---|---|---|---|
| Burst agreement | `0xb77B3050C3c61A0a77cBB966a4FDcB1B43A8f0AF` | `0xdd5c2f9748ee17e7917d5b8a45b1f4e70b5f437fbdf7636086703d7e478c86f9` | `OFF_MANDATE` | The pinned state shows 48 payments to the declared provider `0x1111111111111111111111111111111111111111`, and the enrolled record confirms this number, which exceeds 23 and thus constitutes dozens in the short window, violating the mandate. |
| Burst conflict | `0xb77B3050C3c61A0a77cBB966a4FDcB1B43A8f0AF` | `0xe42d919806f930e60b1276f579b0ba6d846b865ba1ccac5d57400c366d743ea3` | `EVIDENCE_CONFLICT` | Pinned state says `payments=28`; the enrolled record says `payments=3`; operator review is required. |
| Drain agreement | `0x68781475569CFd451b7F061f64964eB1e17Ed64e` | `0xdf2167c1373ff12e2f34a19c819ebdcc2fdf452df3796eb059a89b0f4500187a` | `ON_MANDATE` | The pinned state shows the single declared provider `0x1111111111111111111111111111111111111111` with payments=0 and total=0, and the verified enrolled record confirms spend_total=0 with 0 payments to that destination, far below the 24-payment dozens threshold. |
| Drain claim | `0x68781475569CFd451b7F061f64964eB1e17Ed64e` | `0x4aa83979d5f5e10167d7c046c425b52d93a2485023e1e71342e451b9f734f29a` | `PAID` | Matching evidence was verified at Review; after the declared-provider payment drained the vault, Claim paid the 1000 loss in full. |

Full machine-readable receipts are in `results/c1_evidence.json` (burst
agreement/conflict and conflict claim) and `results/c1_drain_evidence.json`
(drain agreement and covered claim).

These guarantees must not be conflated:

1. **Tamper-evident.** Every validator independently fetches and hashes the
   record; a record edited or inconsistently served after enrollment fails
   consensus before judgment runs.
2. **Backdating-resistant.** The record's content and existence at enrollment
   time are independently corroborated by an Internet Archive snapshot and an
   OpenTimestamps proof anchored toward Bitcoin. The burst-agreement proof is
   now confirmed in Bitcoin block `965831` (2026-09-06 20:58:43 UTC). The
   conflict proof has since independently resolved through the OpenTimestamps
   calendars. The public verifier returned Bitcoin attestations at blocks
   `965831`, `965832`, `965862`, and `965884`; the strongest independent
   cross-check is [block 965884 on Blockstream](https://blockstream.info/block-height/965884),
   timestamped `2026-09-07 04:57:21 UTC`. Open the [DGI OpenTimestamps
   verifier](https://www.dgi.io/ots/) and upload the [conflict proof
   file](https://github.com/Snehal707/stele/blob/master/data/web2/records/539d3Ba32d909396Df9B5977048B4338cF94575F.txt.ots)
   to independently reproduce the result.
3. **Load-bearing.** A record that disagrees with pinned vault state produces
   `EVIDENCE_CONFLICT` and blocks payout, rather than being decorative evidence.

The records are still authored and hosted by this project. These checks do
**not** prove that their content is objectively true or constitute independent
third-party payment data.

#### Judge verification sequence

1. Compute the record URL from the enrolled vault address, exactly as the
   contract does: `https://raw.githubusercontent.com/Snehal707/stele/master/data/web2/records/<vault>.txt`.
2. Run `curl -s <record_url>` and confirm the displayed fields.
3. Hash the exact fetched bytes with `sha256sum` and compare the result with
   the enrolled on-chain `record_hash`.
4. Open the matching Archive.org snapshot and confirm it shows the same record
   content and timestamp.
5. Run `ots verify <file>.ots`; only claim the timestamp is finalized when the
   output includes a Bitcoin block attestation. The burst-agreement proof
   resolves to block `965831` (2026-09-06 20:58:43 UTC). The conflict proof
   independently resolves through the [DGI verifier](https://www.dgi.io/ots/),
   with a public Bitcoin cross-check at [block 965884](https://blockstream.info/block-height/965884)
   (`2026-09-07 04:57:21 UTC). The raw [conflict `.ots` proof](https://github.com/Snehal707/stele/blob/master/data/web2/records/539d3Ba32d909396Df9B5977048B4338cF94575F.txt.ots)
   and [conflict record](https://raw.githubusercontent.com/Snehal707/stele/master/data/web2/records/539d3Ba32d909396Df9B5977048B4338cF94575F.txt)
   are both public.
6. Open the review transaction and confirm the reason cites the pinned fields
   and the enrolled record.
7. For a conflict case, confirm the reason names the on-chain/record mismatch
   and confirm a subsequent `claim()` has status
   `DENIED_EVIDENCE_CONFLICT` with payout `0`.

The deployed Bradbury proof is recorded in `results/c1_evidence.json`.

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

Halt is set by an off-mandate or evidence-conflict ruling. It is not cleared by
a later ON_MANDATE review. It ends when the enrolled halt window expires.

Hashes: clean review `0x682ecccc99261f3c2e32ee4bd8301759db545d03986e8045c623eb70932cb31e`,
rejected spend `0xcf580c5918ef5c2a522ca9428668afcd940debe4404a7be332aad671ab010a20`,
expiry-advance seed `0x865891e8eeb45f0bd211e195a6fda84a0898b33b545fa85ae86ca2fdaddebb0f`,
successful post-expiry spend `0x64af7688033ec67d7a4cae3775ea3dd390c58e12cd0266906bb024388e4174c8`.
The halt VaultTwin is `0xd6b583a251E7B4C9c18cC9af628F068D0240e2e9`.

---

## 3. Cover and Lifeform

The full lifecycle is provable on one address; C1's evidence-conflict path is
provable on another. Agent C is the canonical single-address demonstration on
Bradbury Governor `0x8fb0b2648BF73D292EB1CD7736F6f6624Db9F172`, with vault
`0xdc27E76344356C7AE42DB20A889b42895BaD2784` and agent
`0x434f6b35ccde8c02f07d9693958f4890d2954f41`.

This one contract proves the complete halt/govern/lifeform loop: thin mandate,
ON review, drain, paid claim, proposal, promotion, v2 activation, and a genuine
v2 drain that rules OFF. Agent C has no enrolled C1 record, so
`RECORD_STATUS=UNAVAILABLE` and `web_source=none` are correct and expected for
this pin-only lifecycle proof. The separate C1 evidence-conflict branch remains
demonstrated by Agent A on the earlier burst and drain Governors below.

### Interactive v4 Lifeform sequence — same Governor

The current interactive Governor carries the same complete loop for agent
`0x434f6b35ccde8c02f07d9693958f4890d2954f41`: enroll
`0x4bd547cff84c5da9900840ee3e015b8282fffbfc77fa8bbb339eff80af2d2a88` →
healthy `ON_MANDATE` review
`0x2c1d5010ff39c0c8be047d08c206ea4393621754778018b263fdbebbef2e86dc` →
drain `0x05ed80c604f54459ef93679fca16f5925a2583808beb7f0a036540930d6ab135`
→ `PAID 980` claim
`0x5779f823632333389b0c25987184919480ec26bf02172b06db9bcb4ae98c5993` →
proposal `0x57bb1197d32f174095bfa20397085b372248ded06e1d88e165dcc5dd0e482642`
→ promotion **PASSED**
`0x95970c354e1ff690bcf275b333fe85597645bae0c3472bdef76b1c26671c6c70` →
v2 drain `0xc1c804080704aff94ce8eb448bf0f8bde8efe4e9016a72f164b9ec614d41959c`
→ final **OFF_MANDATE** citing Rule 2
`0xf11037a7c950f69262087fe4637679d3dad2342acc3eb0b7a9005058da004073`.
This is the interactive/post-fix v4 story; the frozen Agent C address above
remains the wallet-free canonical archive.

### Canonical Agent C sequence — one Governor

The fixture deployment finalized as
`0xedf0aafabd6706c536f16928465ced85ef2893e54baec368a3a90e6d5140fc9a`.
Every lifecycle transaction below used the same Governor; the two seed/reset
transactions are included so the judge can reproduce the exact pre- and
post-drain states.

| Step | Transaction hash | Result |
|---|---|---|
| enroll covered Agent C | `0x9010ac8c6a7c69b21dbed507dfad22b5370774c673d9721a9d5c8b8ef835a2ed` | thin mandate enrolled |
| seed initial state | `0x7ec777ebe8ec8d1f38d691e1c1b34081e7d6480dc2d2984d99eb1e91504a212e` | `spend_total=20`, balance `980` |
| review v1 | `0xd644075c748ef7241d7c4a46050f94cb7b5153ccb368900896e586d7107a84f8` | **ON_MANDATE** |
| drain v1 | `0x9414184e69ad1dba19cb6b0f7a115cdbe162a0a9557ac2b88db1b5c066439406` | balance `0` |
| claim | `0x19a86e4928759e7ece13478e24a7f7bd47f480a1384fc31b6d909df1135158fb` | **PAID 980** |
| propose mandate | `0xaaff0848cffd1b360bacb81d5587e14119713f309473d61be4a98746fe031587` | version `10`, `dead_branch` |
| promote mandate | `0x616c274fb1cf6554c6bab129d8a9737f7f9cd0daaa4890e2d4c9e4b8df37464d` | **PASSED**; v1 `9` superseded, v2 `10` active |
| reset fixture for genuine v2 drain | `0xf1a00f484ad7731e9d0067ebd70a9f3bfc3a3d0d43785289ba5b330c2b009c52` | funded baseline restored |
| genuine v2 drain | `0x8953b0cdf3254c109bcde8643142234717f764ecde22800683affff9750782bc` | balance `0` |
| review v2 regression | `0x7ab41c1f083f2d78a1034149318ec8af9c9ecc02f023bbbd93d7d3f819f9c17a` | **ON_MANDATE** on the one-payment fixture |
| corrected genuine drain seed | `0x50d73dd9d67b946ef226431344603e043977f944fd5fd1bb013ae3d8069efa7f` | `spend_total=1000`, one payment totaling `1000`, balance `0` |
| final v2 review | `0xbd4d2f90af40eea2133b871acc8fe4fa886a260aa095db82366f806d56b1f956` | **OFF_MANDATE**; unanimous consensus |

The first v2 regression above intentionally exposed an insufficient fixture:
one payment totaling `20` did not represent the proven drain shape, so its
`ON_MANDATE` result was correct. The corrected final review uses one payment
that empties the vault and records this reason: “The pinned state shows a single
payment of total=1000 to `0x1111111111111111111111111111111111111111` with
spend_total=1000 and balance=0, which empties the vault in one payment; this
mandate judgment uses pin-only evidence because `RECORD_STATUS=UNAVAILABLE`.”

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
    pays a provider dozens of times in a short window.

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

**Provider-feed feature: implementation complete, runtime verification blocked.**
Added `enroll_with_feed`, `feed_of: TreeMap[Address, Address]`, a sealed-feed
EVM read via `@gl.evm.contract_interface`, exact-match payment-count comparison,
and fail-closed handling (`REVIEW_FAILED` on unavailable or unsealed feed,
`EVIDENCE_CONFLICT` on mismatch, both halting).

Validation performed: GenVM lint (29 methods, passed), Python syntax check
(passed), `git diff --check` (passed), and a manual line-by-line audit of
`enroll_with_feed` and the feed branch in `review()` against the original
enrollment paths; no shared-state regression was found. Premium accounting was
also centralized in `_apply_premium` for `enroll_covered` and
`enroll_with_feed`.

Direct-mode logic test: `tests/test_provider_feed_logic_direct.py` passed
(`1 passed in 0.21s`) on stable `genlayer-test 0.29.2` / `genlayer-py 0.16.3`.
It verifies the payment-count helper and fail-closed recorders by calling those
helpers directly, but does not exercise `review()`'s feed branching or a real
cross-contract EVM read.

Validation not performed: the integration test suite has not run to completion.
Local
`genlayer up --headless` and `gltest --network studionet` fail before contract
deployment with:

```text
Failed to start module
module: web
error: missing field `session_create_request`
RuntimeError: Failed to start module
```

The issue was isolated through checks of npm/registry connectivity, GitHub rate
limits, stale CLI locks, orphaned processes, Docker context, and WSL2. It is an
apparent `genlayer-test 0.29.2` / `genlayer-py 0.16.3` schema mismatch with the
local JSON-RPC `web` module. Stable direct mode is available for local logic
tests, but its cross-contract EVM hook is not a real deployed EVM interaction.
No Bradbury deployment was attempted for the provider-feed feature. The exact
versions and error text are ready to report to GenLayer while awaiting a
compatible integration path.

**Complete interactive-v4 Lifeform loop.** On Governor
`0x36b49eFFd0b9d5C47D8Cf93734BE34b911a6c3C9`, agent
`0x434f6b35ccde8c02f07d9693958f4890d2954f41` completed the full sequence:

| Step | Transaction hash | Result |
|---|---|---|
| enroll covered | `0x4bd547cff84c5da9900840ee3e015b8282fffbfc77fa8bbb339eff80af2d2a88` | thin mandate enrolled |
| healthy review | `0x2c1d5010ff39c0c8be047d08c206ea4393621754778018b263fdbebbef2e86dc` | **ON_MANDATE** |
| drain after ON | `0x05ed80c604f54459ef93679fca16f5925a2583808beb7f0a036540930d6ab135` | balance reached `0` |
| paid claim | `0x5779f823632333389b0c25987184919480ec26bf02172b06db9bcb4ae98c5993` | **PAID 980** |
| propose mandate | `0x57bb1197d32f174095bfa20397085b372248ded06e1d88e165dcc5dd0e482642` | candidate version `3`, `dead_branch` |
| promote mandate | `0x95970c354e1ff690bcf275b333fe85597645bae0c3472bdef76b1c26671c6c70` | **PASSED**; v2 active |
| genuine v2 drain | `0xc1c804080704aff94ce8eb448bf0f8bde8efe4e9016a72f164b9ec614d41959c` | balance `0`, one payment |
| v2 review | `0xf11037a7c950f69262087fe4637679d3dad2342acc3eb0b7a9005058da004073` | **OFF_MANDATE**, citing Rule 2 |

This is the complete interactive story: enroll → ON → drain → PAID 980 →
propose → promote PASSED → v2 genuine drain → OFF_MANDATE. Bradbury state
reads can be stale when a dependent transaction is submitted immediately after
the preceding write reaches `ACCEPTED`; wait for state visibility to stabilize
before issuing the next review. The successful final review used the accepted
seed state with `balance=0` confirmed before submission.

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

**`REVIEW_STALE` Bradbury deployment note.** `REVIEW_STALE` is implemented and
Studio-verified (`1 passed in 280.04s`). The Bradbury deployment session was
compromised partway through by an unrelated placeholder `Tiny` contract being
deployed during nonce/gas debugging instead of the current `governor.py`; the
resulting missing `review` method was not a defect in `REVIEW_STALE`. A clean
Bradbury deployment attempt is queued for the next session.

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

**Fee-aware SDK compatibility:** the v2 fee estimator currently cannot be used
against this Bradbury deployment. `estimateTransactionFeesForWrite()` reaches
Bradbury's FeeManager and the live RPC reverts on `quoteGasPrice()` before a
transaction hash exists. This is a protocol/SDK release mismatch, not wallet
balance or transaction capacity. Test the v2 fee-funded flow on GenLayer's
Studio-dev environment (`https://studio-next.genlayer.com/contracts`) until
Bradbury exposes the matching fee-manager interface.

**Multi-clause review prompt failure and fix.** On pin-only evidence with a
two-clause mandate (frequency limit plus single-payment-drain prohibition),
`review` was observed twice to apply only the frequency heuristic and ignore
the drain clause entirely, returning `ON_MANDATE` on a vault genuinely emptied
to zero. The failures were `0xe6a28ea6…57c0d9` and
`0x39007602…b7ea06`, and both reproduced with the exact canonical mandate
text, ruling out a wording issue. The review prompt was restructured to require
explicit, separate evaluation of each mandate clause before reaching a
verdict. The Studio regression `tests/test_review_prompt_rules.py` then passed
(`1 passed in 84.05s`; Studio's `gltest` output does not expose a public receipt
hash), and the live Bradbury confirmation was `0xbab9a405…065c99`. Its reason
explicitly names the violation: “Rule 2 (single-payment drain) is violated
because a single payment of 1000 to declared provider … reduced the vault
balance to zero.” This is a real general LLM failure mode—attention anchoring
on the first or most salient condition in a multi-condition prompt—not a
GenLayer or Bradbury issue. The fix is a prompt-engineering pattern: force
per-clause reasoning for mandates with more than one independent rule.

**v4 halt confirmation.** The same Governor now has the complete live loop:
enroll, genuine drain, correctly reasoned `OFF_MANDATE` naming Rule 2, and a
halt that physically stopped money. On
`0x36b49eFFd0b9d5C47D8Cf93734BE34b911a6c3C9`, the drain review was
`0xbab9a405…065c99`; `is_halted` then read `true`, and the spend attempt
`0xd98033826d9737f6598e35cd23b862fe0207a3057f59b3ce163137d4e87ed557`
finished with error and the trace reported `Vault is halted`.

---

## Limitations

Deployer can replace code via `upgrade()`, restricted to addresses in
`root.upgraders`; rulings themselves have no admin unhalt — only the halt
window or a fresh off-mandate/conflict review changes the flag.

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

**AgentVault is currently a Python twin, not a live Solidity contract, and this is a platform boundary, not an unbuilt feature.** We deployed a real minimal Solidity vault on Bradbury (`0x674F94Dc94560c09184cBeAC9563281D211bB5A7`) with `require(!IGovernor(governor).is_halted(agent))`. The vault's own revert logic works correctly, but the nested call into the Governor fails — a direct `eth_call` to the Governor's `is_halted(address)` selector returns `execution reverted`. GenLayer's Ghost contracts relay EVM transactions into Intelligent Contracts one-directionally; they do not currently expose synchronous Solidity-callable views into Intelligent Contract state. This is confirmed against GenLayer's own EVM interoperability and Ghost/Messages documentation, not an implementation gap on our side.

Evidence receipts: [Solidity deployment `0x6d310c117a075ab11e28be71b906f0699908a08cc07cee13459b51f38a044e10`](https://explorer-bradbury.genlayer.com/tx/0x6d310c117a075ab11e28be71b906f0699908a08cc07cee13459b51f38a044e10); [failed spend `0xa802fef14ef6b32681a4d6f5ba7a088a5c2252b31265673efa973bec00ff4852`](https://explorer-bradbury.genlayer.com/tx/0xa802fef14ef6b32681a4d6f5ba7a088a5c2252b31265673efa973bec00ff4852), an EVM receipt with status `0`.

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

## Appendix — additional verification paths

The primary lifecycle above uses Agent C's consolidated Governor. These
additional deployments preserve the separately verified C1 evidence-conflict
branch and earlier historical receipts. **Do not mix addresses between
deployments.**

| Role | Network | Governor | Persistence |
|---|---|---|---|
| C1 burst records | Bradbury | `0xb77B3050C3c61A0a77cBB966a4FDcB1B43A8f0AF` | burst agreement + conflict receipts |
| C1 drain records | Bradbury | `0x68781475569CFd451b7F061f64964eB1e17Ed64e` | drain agreement + covered claim receipts |
| Pre-C1 consolidated demo | Bradbury | `0xB31bc62001219E8A9eF4026820A06A6799984D26` | earlier judgment/halt/cover/lifeform/economics runs; not the C1 receipt source |

Studio runs are recorded in the ephemeral appendix.

Governor v4 on Bradbury: `0x36b49eFFd0b9d5C47D8Cf93734BE34b911a6c3C9` carries the enrollment guard, sticky halt semantics, safe evidence-conflict handling, trace-based promotion, access-controlled upgrades, and the per-clause review prompt fix; the frozen `0x8fb0…F172` address remains the Already Proved canonical lifecycle.

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
