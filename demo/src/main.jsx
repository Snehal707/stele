import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RainbowKitProvider, ConnectButton, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { createClient } from "genlayer-js";
import { CalldataAddress } from "genlayer-js/types";
import { testnetBradbury } from "genlayer-js/chains";
import "@rainbow-me/rainbowkit/styles.css";
import "../styles.css";
import steleHero from "../assets/stele-hero.png";

const bradbury = {
  id: 4221,
  name: "GenLayer Bradbury",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-bradbury.genlayer.com"] } },
  blockExplorers: { default: { name: "Bradbury Explorer", url: "https://explorer-bradbury.genlayer.com" } },
};

const CONFIG = {
  chainId: 4221,
  governor: "0xB31bc62001219E8A9eF4026820A06A6799984D26",
  explorer: "https://explorer-bradbury.genlayer.com/tx/",
  addressExplorer: "https://explorer-bradbury.genlayer.com/address/",
  rewriteAgent: "0x434f6b35ccde8c02f07d9693958f4890d2954f41",
};
const DECLARED_PROVIDER = "0x1111111111111111111111111111111111111111";
const HALT_REVERT_RECEIPT_HASH = "0xd1c094118a2bf4f8df805becd9640152e0ad1d6ff67d0892c387c29c5b51e896";

const CANONICAL_DEMO = {
  governor: "0x8fb0b2648BF73D292EB1CD7736F6f6624Db9F172",
  vault: "0xdc27E76344356C7AE42DB20A889b42895BaD2784",
  agent: "0x434f6b35ccde8c02f07d9693958f4890d2954f41",
  sequence: [
    ["Enroll", "0x9010ac8c6a7c69b21dbed507dfad22b5370774c673d9721a9d5c8b8ef835a2ed"],
    ["Review v1 · ON_MANDATE", "0xd644075c748ef7241d7c4a46050f94cb7b5153ccb368900896e586d7107a84f8"],
    ["Drain → Claim PAID 980", "0x19a86e4928759e7ece13478e24a7f7bd47f480a1384fc31b6d909df1135158fb"],
    ["Propose", "0xaaff0848cffd1b360bacb81d5587e14119713f309473d61be4a98746fe031587"],
    ["Promote · PASSED · v2 active", "0x616c274fb1cf6554c6bab129d8a9737f7f9cd0daaa4890e2d4c9e4b8df37464d"],
    ["Genuine v2 drain → OFF_MANDATE", "0xbd4d2f90af40eea2133b871acc8fe4fa886a260aa095db82366f806d56b1f956"],
  ],
};

const PROOF_RECEIPTS = [
  {
    label: "Enroll / Review",
    hash: "0xd644075c748ef7241d7c4a46050f94cb7b5153ccb368900896e586d7107a84f8",
    meaning: "ON_MANDATE · the mandate is judged, not assumed.",
  },
  {
    label: "Drain → Claim",
    hash: "0x19a86e4928759e7ece13478e24a7f7bd47f480a1384fc31b6d909df1135158fb",
    meaning: "PAID 980 · the pool pays when the judgment was wrong.",
  },
  {
    label: "Propose → Promote",
    hash: "0x616c274fb1cf6554c6bab129d8a9737f7f9cd0daaa4890e2d4c9e4b8df37464d",
    meaning: "PASSED · the contract rewrites its mandate with no vote.",
  },
  {
    label: "Fresh drain → Review",
    hash: "0xbd4d2f90af40eea2133b871acc8fe4fa886a260aa095db82366f806d56b1f956",
    meaning: "OFF_MANDATE · the v2 clause catches the same drain pattern.",
  },
  {
    label: "C1 record conflict",
    hash: "0xe42d919806f930e60b1276f579b0ba6d846b865ba1ccac5d57400c366d743ea3",
    meaning: "EVIDENCE_CONFLICT · claim denied, payout 0.",
  },
  {
    label: "Enroll",
    hash: "0x1a4846a02514ecbfa328259a8594cd5fe5a497570ba6f1f1aa88597b598f4a0b",
    meaning: "New agent enrolled live via direct SDK call.",
  },
  {
    label: "Halt-revert",
    hash: HALT_REVERT_RECEIPT_HASH,
    meaning: "Spend on a halted vault reverted · Vault is halted.",
  },
  {
    label: "This week's fresh review",
    hash: "0x6e66ba162a510ba49c0f4aa0ce6acf0167380935ac0e94e1f00f313440bade3b",
    meaning: "Fresh call · separate from the canonical OFF_MANDATE / halted / PAID 980 loop.",
  },
];

const LATEST_LIVE_REVIEW = {
  date: "2026-09-08",
  governor: CANONICAL_DEMO.governor,
  agent: CANONICAL_DEMO.agent,
  hash: "0x99d234f6867b1c9aaa54b79aa0710e20539ac5fa8ce91cc4d06cbd95076218aa",
  ruling: "ON_MANDATE",
  reason: "The pinned vault state shows only 1 payment to the declared provider 0x1111111111111111111111111111111111111111, which is less than the dozens threshold of 24 payments, and the mandate judgment uses pin-only evidence since the enrolled record is unavailable.",
};

const HALT_REVERT_PROOF = {
  governor: CONFIG.governor,
  agent: "0x8b64f056f1c82ac7c45b0d22290082b9abdd70ce",
  vault: "0xA5c23d67317d4f5192c3Bb0441baE4AFAda9D19E",
  hash: "0x1bf05c92e1df7d720c32190b5568ee15c767715e425bb442f0f09ab0b5f0127c",
  execution: "FINISHED_WITH_ERROR",
  reason: "Vault is halted",
};

const LOCAL_TEST_WALLET = {
  address: "0x0000000000000000000000000000000000000421",
  hashes: {
    Enroll: "0x0000000000000000000000000000000000000000000000000000000000000420",
    Review: "0x0000000000000000000000000000000000000000000000000000000000000421",
    Claim: "0x0000000000000000000000000000000000000000000000000000000000000422",
    Propose: "0x0000000000000000000000000000000000000000000000000000000000000423",
    Deposit: "0x0000000000000000000000000000000000000000000000000000000000000424",
  },
};

function isLocalTestWalletEnabled() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("localTestWallet") === "1";
}

const FIXTURES = {
  healthy: { label: "HEALTHY", className: "healthy", note: "example invoice pattern", agent: "0x6e1781e673afd1751f2f58ab8a4081fc1686554e" },
  burst: { label: "BURST", className: "burst", note: "48 payments · dozens in a short window", agent: "0x088a8fd5172047b8f7a8edf6825c2d06b69b560a" },
  drain: { label: "DRAIN", className: "drain-off", note: "current drain fixture", agent: "0x8b64f056f1c82ac7c45b0d22290082b9abdd70ce" },
  strangers: { label: "STRANGERS", className: "burst", note: "undeclared destinations · allowlist check", agent: "0xfcad0b19bb29d4674531d6f115237e16afce377c" },
};

function addressArg(address) {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid GenLayer address argument: ${address}`);
  }
  return new CalldataAddress(Uint8Array.from(address.slice(2).match(/../g).map((byte) => parseInt(byte, 16))));
}

function addressArgs(args) {
  return args.map((value) => Array.isArray(value)
    ? addressArgs(value)
    : typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? addressArg(value) : value);
}

const RECEIPTS = {
  judgmentHealthy: [
    "0x833f30fd19669b4698644f1d365350fe319c9369745cbcfaad0fa7825678ec05",
    "0x982194d6eb0f1a8ab971dfa966a91da02df34f8d2bde9aef2cfb7733cf22af26",
    "0xd466248f9457ffd5521294f2731a8c730da8b3a2ebb26ddb1af3bd8ec30f20fa",
  ],
  judgmentBurst: [
    "0xf320430eade30d0bf2a0fdb5f9d958dc6cedd4b5b62e6a00b779d0c4c1de0f66",
    "0xc60984d3a71de7738260844bb4fddfb0d77e4370d782bc4b0c744e4dcc151343",
    "0x81f2e22d943f8f03856e8a20059d95798cfdaf91719daa1778bc73bc0a8f1066",
  ],
  drainV1: "0xb390dd9bbbe16d1946e984a95708b7411b7f87d2ebd6c1691f41860891fd1474",
  drainV2: "0x891f969ef7375e0be30b082f158eafe7b7bfef1615c32ebea9e9b128bceafba1",
  drainSuite: [
    "0x690e823b77551295ed008253cbb75b5923bfb11468a214a874f817ffa08bfe65",
    "0xe09e70d5115698c489c5b108213c8c65c4b890ec18236131efe744b9af02aa4d",
    "0x5129563041cd273383fda1bebaf4d46ac35c5b0a77d6c035d5d917f59d31afa0",
  ],
  claim: "0x9ac626d32b5c601b26951c82ea95299e26c7837054cd6b4636fffd1442524786",
  propose: "0xf37206944cb1765f4a0690bf841e8f7db4fb910f2ef48f7fb551547433b05091",
  promote: "0x4a4980b0142c7aa6593829ad402cd574e090fffd67d20c37afd11cbfe2d0cac0",
  haltSeed: "0xa98b979573f7fce8842a68df3f26b43c8df1a41454e342d40f6ac1a6fc535d1c",
  haltReview: "0x14004d2a6e5caf8c57569c4d07b91611fbc1d3dace78d12567b85a5d18b01c90",
  haltSpendRejected: "0x1bf05c92e1df7d720c32190b5568ee15c767715e425bb442f0f09ab0b5f0127c",
  haltAdvance: null,
  haltSpendSuccess: "0x8cc3a04b073d272eccc641cebc8edc4ffc899940669ab36c0d2a4e0cec2bb899",
};

function enrollArgs(args) {
  return args;
}

const C1_RECORD_EVIDENCE = {
  burstAgreement: {
    governor: "0xb77B3050C3c61A0a77cBB966a4FDcB1B43A8f0AF",
    label: "BURST · RECORD AGREES",
    tone: "record-agree",
    status: "AGREE · VERIFIED",
    ruling: "OFF_MANDATE",
    hash: "0xdd5c2f9748ee17e7917d5b8a45b1f4e70b5f437fbdf7636086703d7e478c86f9",
    reason: "The pinned state shows 48 payments to the declared provider 0x1111111111111111111111111111111111111111, and the enrolled record confirms this number, which exceeds 23 and thus constitutes dozens in the short window, violating the mandate.",
    recordUrl: "https://raw.githubusercontent.com/Snehal707/stele/master/data/web2/records/D1c7E47c916e934701df2751591994bD1c3506E0.txt",
    recordHash: "356FBA068599C25B04F532537E539E3604174FD9E9DCAF87E16FA3E14A131438",
    archiveUrl: "https://web.archive.org/web/20260906202142/https://raw.githubusercontent.com/Snehal707/stele/master/data/web2/records/D1c7E47c916e934701df2751591994bD1c3506E0.txt",
    otsUrl: "https://github.com/Snehal707/stele/blob/master/data/web2/records/D1c7E47c916e934701df2751591994bD1c3506E0.txt.ots",
    recordStatus: "Verified record agrees with the pinned vault state.",
  },
  burstConflict: {
    governor: "0xb77B3050C3c61A0a77cBB966a4FDcB1B43A8f0AF",
    agent: "0x851705477939F31D2699c86547782fecabF470C0",
    label: "BURST · RECORD DISAGREES",
    tone: "record-conflict",
    status: "MISMATCH · VERIFIED",
    ruling: "EVIDENCE_CONFLICT",
    hash: "0xe42d919806f930e60b1276f579b0ba6d846b865ba1ccac5d57400c366d743ea3",
    reason: "Evidence conflict: pinned vault state has spend_total=123, balance=877, and payments=28, but the enrolled record claims spend_total=123, balance=877, and payments=3; operator review is required.",
    claim: "Claim attempted → DENIED_EVIDENCE_CONFLICT · payout 0",
    recordUrl: "https://raw.githubusercontent.com/Snehal707/stele/master/data/web2/records/539d3Ba32d909396Df9B5977048B4338cF94575F.txt",
    recordHash: "A257FF4C9D87199F34020EE2A109BA6C437E76415CCE27A3CE0CD12CDF47B504",
    archiveUrl: "https://web.archive.org/web/20260906204025/https://raw.githubusercontent.com/Snehal707/stele/master/data/web2/records/539d3Ba32d909396Df9B5977048B4338cF94575F.txt",
    otsUrl: "https://github.com/Snehal707/stele/blob/master/data/web2/records/539d3Ba32d909396Df9B5977048B4338cF94575F.txt.ots",
    recordStatus: "The record is hash-verified, but it conflicts with the pinned state.",
  },
  drainAgreement: {
    governor: "0x68781475569CFd451b7F061f64964eB1e17Ed64e",
    label: "DRAIN · PRE-DRAIN AGREEMENT",
    tone: "record-agree",
    status: "AGREE · VERIFIED",
    ruling: "ON_MANDATE",
    hash: "0xdf2167c1373ff12e2f34a19c819ebdcc2fdf452df3796eb059a89b0f4500187a",
    reason: "The pinned state shows the single declared provider 0x1111111111111111111111111111111111111111 with payments=0 and total=0, and the verified enrolled record confirms spend_total=0 with 0 payments to that destination, far below the 24-payment dozens threshold.",
    recordUrl: "https://raw.githubusercontent.com/Snehal707/stele/master/data/web2/records/Cc0Fc6A4B3C6a83F5Ca0Dd1614B557297f52A7F3.txt",
    recordHash: "E4C441241A8B490830010D28911700F9154C7BB1443F08C2908FD7FBC7F4CC2A",
    recordStatus: "Verified record agrees with the pinned pre-drain state.",
  },
  drainClaim: {
    governor: "0x68781475569CFd451b7F061f64964eB1e17Ed64e",
    label: "DRAIN · RESULTING CLAIM",
    tone: "claim-paid",
    status: "PAID · VERIFIED",
    ruling: "PAID",
    hash: "0x4aa83979d5f5e10167d7c046c425b52d93a2485023e1e71342e451b9f734f29a",
    reason: "Matching evidence was verified at Review; after the declared-provider payment drained the vault, Claim paid the 1000 loss in full.",
    claim: "Loss 1000 · payout 1000",
    recordUrl: "https://raw.githubusercontent.com/Snehal707/stele/master/data/web2/records/Cc0Fc6A4B3C6a83F5Ca0Dd1614B557297f52A7F3.txt",
    recordHash: "E4C441241A8B490830010D28911700F9154C7BB1443F08C2908FD7FBC7F4CC2A",
    recordStatus: "Verified record from the covered, legitimate case.",
  },
};

function C1EvidenceCard({ item }) {
  return <article className={`c1-evidence-card ${item.tone}`}>
    <div className="c1-card-kicker"><span>{item.label}</span><strong>{item.status}</strong></div>
    <div className="c1-governor">Originating Governor · <code>{item.governor}</code></div>
    <div className="c1-card-heading"><strong className={item.ruling === "ON_MANDATE" ? "on" : item.ruling === "OFF_MANDATE" ? "off" : "conflict"}>{item.ruling}</strong><EvidenceTag>receipt-backed</EvidenceTag></div>
    <p className="c1-reason">“{item.reason}”</p>
    {item.claim && <div className="c1-claim-outcome">{item.claim}</div>}
    <a className="c1-tx" href={`${CONFIG.explorer}${item.hash}`} target="_blank" rel="noreferrer">{item.hash} ↗</a>
    <div className="c1-record-meta"><span>Record status</span><strong>{item.recordStatus}</strong></div>
    <a className="c1-record-link" href={item.recordUrl} target="_blank" rel="noreferrer">Open raw record ↗</a>
  </article>;
}

function EvidenceRecordSection() {
  const verification = C1_RECORD_EVIDENCE.burstAgreement;
  return <section id="evidence-record" className="evidence-record evidence-panel" aria-labelledby="evidence-record-title">
    <div className="section-intro compact"><div className="eyebrow">06 / EVIDENCE RECORD</div><h2 id="evidence-record-title">A second source can change the ruling.</h2><p className="scope-note">Receipt-backed C1 cases — fixed historical examples, not your wallet.</p></div>
    <p className="evidence-record-explainer">The full lifecycle is provable on one address: Agent C's consolidated Governor <code>{CANONICAL_DEMO.governor}</code> covers enrollment, ON review, drain, paid claim, proposal, promotion, v2 activation, and the final genuine drain that ruled OFF. Agent C has no enrolled C1 record, so <code>RECORD_STATUS=UNAVAILABLE</code> and pin-only evidence are correct here. C1's separate evidence-conflict path remains proven by the burst and drain Governors below.</p>
    <div className="canonical-demo-record"><div className="eyebrow">PRIMARY · CONSOLIDATED GOVERNOR</div><h3>Agent C · full halt / govern / lifeform loop</h3><p><span>Vault</span> <code>{CANONICAL_DEMO.vault}</code> · <span>Agent</span> <code>{CANONICAL_DEMO.agent}</code></p><div className="canonical-demo-sequence">{CANONICAL_DEMO.sequence.map(([label, hash]) => <div key={hash}><span>{label}</span><a href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer">{hash} ↗</a></div>)}</div><p className="canonical-demo-note">The first v2 regression used only one modest payment and correctly stayed ON. The final corrected fixture emptied the vault with one payment and produced OFF_MANDATE. This proof is pin-only by design; the EVIDENCE_CONFLICT branch is shown separately in the C1 records.</p></div>
    <div className="c1-evidence-grid"><C1EvidenceCard item={C1_RECORD_EVIDENCE.burstAgreement} /><C1EvidenceCard item={C1_RECORD_EVIDENCE.burstConflict} /><C1EvidenceCard item={C1_RECORD_EVIDENCE.drainAgreement} /><C1EvidenceCard item={C1_RECORD_EVIDENCE.drainClaim} /></div>
    <div className="c1-verification-block"><div className="eyebrow">JUDGE VERIFICATION · BURST RECORD</div><p>Open the raw record, compare its bytes to the on-chain hash, then inspect the independent timestamp anchors.</p><div className="c1-verification-links"><div><a href={verification.recordUrl} target="_blank" rel="noreferrer">Raw GitHub record ↗</a><code className="c1-url">{verification.recordUrl}</code></div><span>record_hash · <code>{verification.recordHash}</code> <em>click the raw record to verify</em></span><a href={verification.archiveUrl} target="_blank" rel="noreferrer">Archive.org snapshot ↗</a><a href={verification.otsUrl} target="_blank" rel="noreferrer">OpenTimestamps proof (.ots) ↗</a></div><pre className="c1-command-note">curl -L &lt;record-url&gt; | sha256sum{`\n`}Expected hash: {verification.recordHash}</pre><p className="c1-honest-note">OpenTimestamps proof is Bitcoin-confirmed in block 965831 (2026-09-06 20:58:43 UTC). This is project-authored evidence, not third-party evidence.</p></div>
    <div className="c1-guarantees"><div className="eyebrow">THREE GUARANTEES</div><div className="c1-guarantee-grid"><div><strong>Tamper-evident</strong><span>hash verified by every validator independently</span></div><div><strong>Backdating-resistant</strong><span>Archive.org + OpenTimestamps anchor the record's existence, independent of the project</span></div><div><strong>Load-bearing</strong><span>mismatch produces a different ruling and blocks payout — not just a message</span></div></div></div>
  </section>;
}

function HealthyBurstComparison({ live }) {
  const value = (record, key) => record?.fields?.find(([field]) => field === key)?.[1] ?? "…";
  const healthy = live?.fixtures?.healthy;
  const burst = live?.fixtures?.burst;
  return <section className="proof-comparison" aria-labelledby="proof-comparison-title"><div className="eyebrow" id="proof-comparison-title">THE SHARPEST CONTRAST</div><p className="proof-comparison-lede"><strong>Same totals. Same allowlist. Different verdict.</strong></p><div className="proof-comparison-grid"><div className="proof-comparison-head"><span>FIELD</span><strong>HEALTHY</strong><strong>BURST</strong></div><div><span>spend_total</span><strong>{value(healthy, "spend_total")}</strong><strong>{value(burst, "spend_total")}</strong></div><div><span>balance</span><strong>{value(healthy, "balance")}</strong><strong>{value(burst, "balance")}</strong></div><div><span>destination</span><strong>{value(healthy, "declared") === "…" ? "…" : "declared"}</strong><strong>{value(burst, "declared") === "…" ? "…" : "declared"}</strong></div><div><span>payments</span><strong>{value(healthy, "payments")}</strong><strong className="proof-burst-value">{value(burst, "payments")}</strong></div><div><span>ruling</span><strong className="proof-on">{healthy?.ruling || "…"}</strong><strong className="proof-off">{burst?.ruling || "…"}</strong></div></div><p className="proof-comparison-note">Anyone can call <code>review</code> — this is a permissionless circuit breaker, not an admin panel.</p></section>;
}

function AlreadyProvedSection({ live, lineage, capital, capitalValue, walletConnected, retryLiveReads }) {
  return <section id="proof" className="already-proved evidence-panel" aria-labelledby="already-proved-title">
    <div className="section-intro compact"><div className="eyebrow">01 / ALREADY PROVED</div><h2 id="already-proved-title">The proof is already on-chain.</h2><p className="scope-note">Read the canonical lifecycle without connecting a wallet. A wallet is only needed to submit a new action.</p></div>
    <article className="proof-status-card">
      <div className="proof-status-heading"><div><div className="eyebrow">PRIMARY · CONSOLIDATED GOVERNOR</div><h3>Agent C · full halt / govern / lifeform loop</h3></div><a href={`${CONFIG.addressExplorer}${CANONICAL_DEMO.governor}`} target="_blank" rel="noreferrer">Open Governor ↗</a></div>
      <code className="proof-governor">{CANONICAL_DEMO.governor}</code>
      <div className="proof-status-grid" aria-label="Canonical proof status">
        <div><span>MANDATE</span><strong>v2 · active</strong><small>promoted on-chain</small></div>
        <div><span>LATEST RECORDED RULING</span><strong className="proof-off">OFF_MANDATE</strong><small>genuine v2 drain</small></div>
        <div><span>HALTED</span><strong>Yes</strong><small>after the final review</small></div>
        <div><span>LAST RECORDED CLAIM</span><strong className="proof-paid">PAID · 980</strong><small>covered drain path</small></div>
      </div>
      <p className="proof-status-context">Canonical lifecycle loop: OFF_MANDATE, halted, PAID 980. This is the recorded v2 proof state.</p>
      <p className="proof-chain-note">Canonical: <a href={`${CONFIG.addressExplorer}${CANONICAL_DEMO.governor}`} target="_blank" rel="noreferrer">{CANONICAL_DEMO.governor}</a> · Legacy interactive: <a href={`${CONFIG.addressExplorer}${CONFIG.governor}`} target="_blank" rel="noreferrer">{CONFIG.governor}</a></p>
    </article>
    <div className="proof-receipts" aria-labelledby="proof-receipts-title">
      <div className="eyebrow" id="proof-receipts-title">PROOF RECEIPTS · CLICK TO VERIFY</div>
      {PROOF_RECEIPTS.map((receipt) => <React.Fragment key={receipt.hash}><a className="proof-receipt" href={`${CONFIG.explorer}${receipt.hash}`} target="_blank" rel="noreferrer"><div><strong>{receipt.label}</strong><span>{receipt.meaning}</span></div><code>{receipt.hash}</code><b aria-hidden="true">↗</b></a>{receipt.label === "Halt-revert" && <a className="proof-receipt-detail" href={`${CONFIG.explorer}${HALT_REVERT_RECEIPT_HASH}`} target="_blank" rel="noreferrer">Spend reverted · Vault is halted ↗</a>}</React.Fragment>)}
    </div>
    <article className="latest-live-call" aria-labelledby="latest-live-call-title"><div className="eyebrow">LATEST LIVE CALL · {LATEST_LIVE_REVIEW.date}</div><div className="latest-live-call-head"><h3 id="latest-live-call-title">Fresh Agent C review on Bradbury</h3><strong className="proof-on">{LATEST_LIVE_REVIEW.ruling}</strong></div><p className="latest-live-call-context">Separate latest live call — this ON_MANDATE result is a later read of a different state, not a replacement for the canonical lifecycle status above.</p><p className="latest-live-call-meta">Governor <code>{LATEST_LIVE_REVIEW.governor}</code> · Agent <code>{LATEST_LIVE_REVIEW.agent}</code></p><p className="latest-live-call-reason">“{LATEST_LIVE_REVIEW.reason}”</p><a className="latest-live-call-hash" href={`${CONFIG.explorer}${LATEST_LIVE_REVIEW.hash}`} target="_blank" rel="noreferrer">{LATEST_LIVE_REVIEW.hash} ↗</a></article>
    <HaltRevertProofCard />
    <HealthyBurstComparison live={live} />
    <p className="proof-footnote">The first four receipts are the single-address Agent C lifecycle. The fifth is the separately redeployed C1 evidence-conflict proof; it demonstrates the deny branch without requiring a wallet to inspect it.</p>
    <section className="proof-lineage-block" aria-labelledby="proof-lineage-title"><div className="section-intro compact"><div className="eyebrow">02 / LINEAGE · LIVE READ</div><h3 id="proof-lineage-title">Mandate history and last claim.</h3><p className="scope-note">The live lineage read stays here with the canonical proof instead of competing for a rail slot.</p></div>{lineage.status === "ready" ? <><div className="lineage-rail"><article className="version-card"><div className="version-label">v1 · {lineage.versionOne.status} <EvidenceTag>live · get_mandate_version</EvidenceTag></div><p>{lineage.versionOne.text}</p></article><div className="lineage-arrow" aria-hidden="true">→</div><article className="version-card active-version"><div className="version-label">v2 · {lineage.versionTwo.status} <EvidenceTag>live · get_mandate_version</EvidenceTag></div><p>{renderMandateText(lineage.versionOne.text, lineage.versionTwo.text)}</p></article></div><div className="trigger"><span>CLAIM {lineage.claim.status}</span><b>{String(lineage.claim.payout)} against {String(lineage.claim.loss)} loss <EvidenceTag>live · get_last_claim</EvidenceTag></b><span>CLAUSE APPENDED</span></div></> : <ReadState message={lineage.status === "loading" ? "Loading live mandate and claim reads…" : `Live lineage read failed — ${lineage.error}`} onRetry={retryLiveReads} />}</section>
    <details className="proof-capital-details"><summary>Show Capital &amp; Yield</summary><section className="capital evidence-panel" aria-labelledby="capital-title"><div className="section-intro compact"><div className="eyebrow">04 / CAPITAL AND YIELD</div><p className="scope-note">Global protocol totals plus the connected wallet’s own LP shares.</p></div><div className="pricing-grid capital-grid"><div><span>LP POOL · GLOBAL</span><strong>{capitalValue("lpPool")}</strong></div><div><span>TOTAL LP SHARES · GLOBAL</span><strong>{capitalValue("totalShares")}</strong></div><div><span>YOUR SHARES · WALLET</span><strong>{walletConnected ? capitalValue("yourShares") : "Connect wallet"}</strong></div></div></section></details>
    <details className="receipt-appendix"><summary>Show historic receipts and their purpose</summary><div className="read-status" role="note"><strong>These receipts document earlier global demo runs.</strong><span>They do not change when a new wallet connects and do not represent the current Review result.</span></div><div className="history-list"><ReceiptLinks title="Judgment · healthy fixture · reference run" hashes={RECEIPTS.judgmentHealthy} /><ReceiptLinks title="Judgment · burst fixture · reference run" hashes={RECEIPTS.judgmentBurst} /><ReceiptLinks title="Judgment · drain v1 · reference run" hashes={RECEIPTS.drainV1} /><ReceiptLinks title="Judgment · drain v2 · reference run" hashes={RECEIPTS.drainV2} /><ReceiptLinks title="Judgment · consolidated drain suite · reference run" hashes={RECEIPTS.drainSuite} /><ReceiptLinks title="Halt sequence · reference run" hashes={[RECEIPTS.haltSeed, RECEIPTS.haltReview, RECEIPTS.haltSpendRejected, RECEIPTS.haltAdvance, RECEIPTS.haltSpendSuccess]} /><ReceiptLinks title="Lineage · claim, proposal, promotion · reference run" hashes={[RECEIPTS.claim, RECEIPTS.propose, RECEIPTS.promote]} /></div></details>
  </section>;
}

function ReceiptLinks({ title, hashes }) {
  const list = (Array.isArray(hashes) ? hashes : [hashes]).filter(Boolean);
  return <div className="receipt-trail"><span>{title}</span><div>{list.map((hash) => <a key={hash} href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer">{hash}</a>)}</div></div>;
}

function HaltRevertProofCard() {
  return <article className="halt-revert-proof-card" aria-labelledby="halt-revert-proof-title">
    <div className="eyebrow">HALT PROOF · ALWAYS VISIBLE</div>
    <div className="halt-revert-proof-heading"><div><h3 id="halt-revert-proof-title">Historic halt (earlier demo, different transaction)</h3><p>Earlier Bradbury halt receipt — separate from the opening-list Halt-revert transaction; no wallet connection or new click required.</p></div><strong>REVERTED</strong></div>
    <div className="halt-revert-proof-grid"><div><span>EXECUTION</span><b>{HALT_REVERT_PROOF.execution}</b></div><div><span>REVERT REASON</span><b>{HALT_REVERT_PROOF.reason}</b></div><div><span>AGENT</span><code>{HALT_REVERT_PROOF.agent}</code></div><div><span>VAULT</span><code>{HALT_REVERT_PROOF.vault}</code></div></div>
    <p className="halt-revert-proof-governor">Governor <code>{HALT_REVERT_PROOF.governor}</code></p>
    <a className="halt-revert-proof-hash" href={`${CONFIG.explorer}${HALT_REVERT_PROOF.hash}`} target="_blank" rel="noreferrer">{HALT_REVERT_PROOF.hash} ↗</a>
  </article>;
}

function EvidenceTag({ children = "receipt-backed" }) {
  return <small className="evidence-tag">{children}</small>;
}

function describeWriteError(error) {
  const parts = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current) && parts.length < 6) {
    seen.add(current);
    for (const key of ["shortMessage", "details", "message", "code", "data"]) {
      const value = current[key];
      if (value !== undefined && value !== null && value !== "") {
        let rendered;
        try {
          rendered = typeof value === "string" ? value : JSON.stringify(value);
        } catch {
          rendered = String(value);
        }
        if (!parts.includes(`${key}: ${rendered}`)) parts.push(`${key}: ${rendered}`);
      }
    }
    current = current.cause;
  }
  if (!parts.length) return String(error);
  return parts.join(" | ");
}

function classifyWriteFailure(error, message) {
  const lower = message.toLowerCase();
  if (error?.code === 4001 || lower.includes("user rejected") || lower.includes("rejected the request")) return { category: "Wallet rejected the request", guidance: "The wallet declined this action. No transaction hash was returned." };
  if (lower.includes("insufficient funds") || lower.includes("insufficient balance") || lower.includes("0 gen") || lower.includes("balance")) return { category: "Insufficient Bradbury GEN", guidance: "The connected account did not have enough native GEN for this action and its fee." };
  if (lower.includes("wrong network") || lower.includes("chain") || lower.includes("network")) return { category: "Wrong network or chain", guidance: "The wallet/provider rejected the request because it was not using GenLayer Bradbury (4221)." };
  if (message.includes("-32005") || lower.includes("capacity")) return { category: "Bradbury is busy", guidance: "Bradbury is busy — retry later. This is a known network capacity limit, not an app error. No transaction hash was returned." };
  if (lower.includes("nonce")) return { category: "Nonce or pending-transaction conflict", guidance: "The wallet and public RPC disagreed about the next transaction nonce." };
  if (message.includes("-32603") || lower.includes("transaction failed") || lower.includes("originalerror")) return { category: "Wallet/RPC internal error", guidance: "The request failed without a transaction hash. The raw details below are needed to identify whether the wallet or Bradbury RPC rejected it." };
  return { category: "Wallet/RPC error", guidance: "The request failed before a transaction hash was returned." };
}

function describeReadError(error) {
  const raw = error?.shortMessage || error?.message || String(error || "Unknown Bradbury read error");
  const message = String(raw).replace(/\s+/g, " ").trim();
  if (/missing or invalid parameters/i.test(message)) return "Bradbury did not return this live read. No wallet action was submitted.";
  if (/timeout|timed out|deadline/i.test(message)) return "Bradbury did not answer before the read timed out.";
  if (/network|fetch|transport|connect/i.test(message)) return "The Bradbury RPC could not be reached.";
  return message.length > 180 ? `${message.slice(0, 177)}…` : message;
}

function parsePinnedFields(pinned) {
  if (typeof pinned !== "string") return null;
  const lines = pinned.split("\n");
  const values = Object.fromEntries(lines.slice(0, 3).map((line) => line.split("=")).filter(([key, value]) => key && value));
  const destinations = lines.slice(3).map((line) => line.match(/declared=(yes|no) \| payments=(\d+) \| total=(\d+)/)).filter(Boolean);
  if (!values.spend_total || !values.destination_count || !values.balance || destinations.length === 0) return null;
  return {
    spend_total: values.spend_total,
    balance: values.balance,
    destination_count: values.destination_count,
    payments: destinations.length === 1 ? destinations[0][2] : `${destinations.map((destination) => destination[2]).join(", ")} each`,
    declared: destinations.every((destination) => destination[1] === "yes") ? "yes" : "no",
  };
}

function liveFixtureRecord(state, verdict) {
  if (!state || !verdict) throw new Error("Live vault state or verdict was empty");
  const pinnedFields = parsePinnedFields(verdict.pinned_state);
  if (!pinnedFields) throw new Error("Live verdict did not include a parseable pinned state");
  return {
    ruling: verdict.ruling,
    reason: verdict.reason,
    pinned_state: verdict.pinned_state,
    fields: [
      ["spend_total", state.spend_total],
      ["balance", state.balance],
      ["destination_count", state.destination_count],
      ["payments", pinnedFields.payments],
      ["declared", pinnedFields.declared],
    ],
  };
}

function ReadState({ message = "Loading live Bradbury read…", onRetry }) {
  return <div className="read-status" role="status"><strong>{message}</strong>{onRetry && <button type="button" className="button button-outline" onClick={onRetry}>Retry live reads</button>}</div>;
}

function renderCase(item, record, onRetry, labelOverride = item.label) {
  if (!record || record.status === "loading") return <article className={`vault-card ${item.className}`} data-case={labelOverride} key={labelOverride}><div className="vault-kicker"><span>{labelOverride}</span><span>BRADBURY · 4221</span></div><h3>{item.note}</h3><ReadState onRetry={onRetry} /></article>;
  if (record.status === "error") return <article className={`vault-card ${item.className}`} data-case={labelOverride} key={labelOverride}><div className="vault-kicker"><span>{labelOverride}</span><span>BRADBURY · 4221</span></div><h3>{item.note}</h3><ReadState message={`Live read failed — ${record.error}`} onRetry={onRetry} /></article>;
  const fields = record.fields.map(([key, fieldValue]) => <div className={`field ${key === "payments" && String(fieldValue) !== "1" ? "diff" : ""}`} key={key}><span>{key}</span><strong>{String(fieldValue)}</strong><EvidenceTag>live read</EvidenceTag></div>);
  return <article className={`vault-card ${item.className}`} data-case={labelOverride} key={labelOverride}>
    <div className="vault-kicker"><span>{labelOverride}</span><span>BRADBURY · 4221</span></div>
    <h3>{item.note}</h3>
    <div className={`verdict ${record.ruling === "ON_MANDATE" ? "on" : "off"}`}>{record.ruling} <EvidenceTag>live · latest_verdict</EvidenceTag></div>
    <p className="reason">“{record.reason}” <EvidenceTag>live read</EvidenceTag></p>
    <div className="fields">{fields}</div>
    <details className="raw-state"><summary>View raw pinned state</summary><pre className="pinned">{record.pinned_state}</pre></details>
    <EvidenceTag>live agent_state + latest_verdict</EvidenceTag>
  </article>;
}

function appendedMandateText(previous, current) {
  if (typeof previous !== "string" || typeof current !== "string") return null;
  if (!current.startsWith(previous)) return null;
  const appended = current.slice(previous.length).trim();
  return appended || null;
}

function renderMandateText(previous, current) {
  const appended = appendedMandateText(previous, current);
  if (!appended) return current;
  return <>{current.slice(0, current.length - appended.length)}<mark>{appended}</mark></>;
}

function CompactReadFailure({ onRetry }) {
  return <span className="compact-read-failure" role="status" title="Live read unavailable"><strong>—</strong><button type="button" onClick={onRetry} aria-label="Retry live read">↻</button></span>;
}

function YourRunResult({ action, result }) {
  const title = `YOUR ${action.toUpperCase()} RESULT`;
  if (!result) return <section className="read-status your-result action-result-empty" role="status"><div className="section-intro compact"><div className="eyebrow">{title}</div></div><strong>No {action} result in this wallet session yet.</strong><span>A wallet is only needed to submit a new action; existing on-chain evidence remains available in the sidebar.</span></section>;
  return <section className="your-result" aria-labelledby="your-result-title">
    <div className="section-intro compact"><div className="eyebrow">{title}</div></div>
    <div className="result-meta"><div><span>Target agent</span><strong>{result.targetAgent}</strong></div><div><span>{result.hash ? "Transaction" : "Result"}</span>{result.hash ? (result.localTest ? <strong>{result.hash} <EvidenceTag>local test only</EvidenceTag></strong> : <a href={`${CONFIG.explorer}${result.hash}`} target="_blank" rel="noreferrer">{result.hash}</a>) : <strong>NO TRANSACTION SUBMITTED</strong>}</div></div>
    <div className="result-status-grid"><div><span>Consensus</span><strong>{result.consensus}</strong></div><div><span>Execution</span><strong>{result.execution || "WAITING"}</strong></div></div>
    {result.outcomeMessage ? <div className="read-status action-outcome" role="status"><strong>{result.outcomeTitle || `${result.action} response`}</strong><span>{result.outcomeMessage}</span></div> : result.action === "Review" && result.status === "resolved" && result.verdict ? <div className="judgment-result"><div className={`verdict ${result.ruling === "ON_MANDATE" ? "on" : "off"}`}>{result.ruling} <EvidenceTag>resolved from this Review</EvidenceTag></div><p className="reason">“{result.reason}”</p><div className="fields">{result.fields.map(([key, value]) => <div className="field" key={key}><span>{key}</span><strong>{String(value)}</strong><EvidenceTag>live state after Review</EvidenceTag></div>)}</div><pre className="pinned">{result.pinned_state}</pre></div> : <div className="read-status" role="status"><strong>{result.status === "pending" ? "Bradbury is reaching consensus…" : result.verdictError ? "Review resolved; verdict read needs a retry." : `${result.action} completed. This action does not produce a verdict.`}</strong><span>{result.status === "pending" ? "Keep this panel open. The hash above is the source of truth while the receipt is pending." : result.verdictError || "Only a completed Review produces the judgment shown here."}</span></div>}
  </section>;
}

function ActionPanel({ onResultChange }) {
  const { address, isConnected, chain, connector } = useAccount();
  const localTestWallet = isLocalTestWalletEnabled();
  const connectedAddress = address || (localTestWallet ? LOCAL_TEST_WALLET.address : undefined);
  const connected = isConnected || localTestWallet;
  const { data: walletClient } = useWalletClient({ chainId: bradbury.id });
  const { switchChain } = useSwitchChain();
  const [status, setStatus] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [uncertainSubmission, setUncertainSubmission] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [writeFailure, setWriteFailure] = useState(null);
  const [haltedSpend, setHaltedSpend] = useState(null);
  const [enrollForm, setEnrollForm] = useState({ vault: "", mandate: "", recordUrl: "", recordHash: "" });
  const [enrolledAgent, setEnrolledAgent] = useState(null);
  const [now, setNow] = useState(Date.now());
  const autoSwitchAttempted = useRef(false);

  useEffect(() => {
    if (!connected) {
      autoSwitchAttempted.current = false;
      return;
    }
    if (!chain || chain.id === bradbury.id || autoSwitchAttempted.current) return;
    autoSwitchAttempted.current = true;
    setStatus("Wallet connected · requesting GenLayer Bradbury (4221)…");
    switchChain({ chainId: bradbury.id }).catch((error) => {
      console.info("Stele automatic Bradbury switch was not approved", error);
      setStatus("Wallet connected · approve the switch to GenLayer Bradbury (4221) before submitting.");
    });
  }, [connected, chain?.id, switchChain]);

  useEffect(() => {
    if (!transactions.some((transaction) => transaction.pending)) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [transactions]);

  const requireWallet = () => {
    if (localTestWallet) return true;
    if (!address || !connector) {
      setStatus("Connect a wallet before submitting.");
      return false;
    }
    if (chain?.id !== bradbury.id) {
      setStatus("Switch your wallet to GenLayer Bradbury (4221) before submitting.");
      switchChain({ chainId: bradbury.id });
      return false;
    }
    if (!walletClient) {
      setStatus("The Bradbury wallet client is unavailable; reconnect and try again.");
      return false;
    }
    return true;
  };

  const showActionOutcome = (label, outcomeTitle, outcomeMessage) => {
    onResultChange({ action: label, targetAgent: CONFIG.rewriteAgent, status: "resolved", consensus: "Read result", execution: "NO_TRANSACTION", outcomeTitle, outcomeMessage });
    setStatus(`${label}: ${outcomeMessage}`);
  };

  const proposeMandate = async () => {
    if (!requireWallet()) return;
    if (localTestWallet) {
      await runWrite("Propose", "propose_mandate", [CONFIG.rewriteAgent]);
      return;
    }
    try {
      const readClient = createClient({ chain: testnetBradbury });
      let claim;
      try {
        claim = await readClient.readContract({
          address: CONFIG.governor,
          functionName: "get_last_claim",
          args: addressArgs([CONFIG.rewriteAgent]),
        });
      } catch (error) {
        console.info("Stele propose blocked: no claim record for configured agent", error);
        showActionOutcome("Propose", "Proposal not submitted", "No paid claim was found for this agent, so a mandate proposal was not submitted.");
        return;
      }
      if (!claim || claim.status !== "PAID") {
        showActionOutcome("Propose", "Proposal not submitted", "This agent has no paid claim yet, so a mandate proposal was not submitted.");
        return;
      }
      const [version, promotion] = await Promise.all([
        readClient.readContract({
          address: CONFIG.governor,
          functionName: "get_mandate_version",
          args: addressArgs([CONFIG.rewriteAgent, 2]),
        }).catch(() => null),
        readClient.readContract({
          address: CONFIG.governor,
          functionName: "get_promotion_result",
          args: addressArgs([CONFIG.rewriteAgent]),
        }).catch(() => null),
      ]);
      if (version?.status === "active" || promotion === "PASSED") {
        showActionOutcome("Propose", "Mandate already promoted", "Mandate v2 is already promoted for this agent.");
        return;
      }
      setStatus("Propose: paid-claim precondition passed; submitting…");
      await runWrite("Propose", "propose_mandate", [CONFIG.rewriteAgent]);
    } catch (error) {
      console.error("Stele propose preflight failed", error);
      showActionOutcome("Propose", "Proposal preflight failed", describeWriteError(error));
    }
  };

  const fileClaim = async () => {
    if (!requireWallet()) return;
    if (localTestWallet) {
      await runWrite("Claim", "claim", [CONFIG.rewriteAgent]);
      return;
    }
    try {
      const readClient = createClient({ chain: testnetBradbury });
      try {
        const claim = await readClient.readContract({
          address: CONFIG.governor,
          functionName: "get_last_claim",
          args: addressArgs([CONFIG.rewriteAgent]),
        });
        if (claim?.status === "PAID") {
          const payout = claim.payout ?? claim.paid ?? "unknown";
          const loss = claim.loss ?? claim.loss_amount ?? "unknown";
          showActionOutcome("Claim", "Claim already settled", `Claim already settled for this agent — paid ${String(payout)} against ${String(loss)} loss.`);
          return;
        }
      } catch (error) {
        console.error("Stele claim preflight failed", error);
        showActionOutcome("Claim", "Claim preflight failed", describeWriteError(error));
        return;
      }
      await runWrite("Claim", "claim", [CONFIG.rewriteAgent]);
    } catch (error) {
      console.error("Stele claim preflight failed", error);
      showActionOutcome("Claim", "Claim preflight failed", describeWriteError(error));
    }
  };

  const depositMinimum = async () => {
    if (!requireWallet()) return;
    if (localTestWallet) {
      await runWrite("Deposit", "deposit", [], 1n);
      return;
    }
    try {
      const readClient = createClient({ chain: testnetBradbury });
      const [lpPool, totalShares] = await Promise.all([
        readClient.readContract({ address: CONFIG.governor, functionName: "get_lp_pool", args: [] }),
        readClient.readContract({ address: CONFIG.governor, functionName: "get_total_lp_shares", args: [] }),
      ]);
      const pool = BigInt(lpPool || 0);
      const shares = BigInt(totalShares || 0);
      const minimum = pool > 0n && shares > 0n ? (pool + shares - 1n) / shares : 1n;
      setStatus(`Deposit: submitting ${minimum} GEN so the deposit mints at least one LP share…`);
      await runWrite("Deposit", "deposit", [], minimum);
    } catch (error) {
      console.error("Stele deposit preflight failed", error);
      showActionOutcome("Deposit", "Deposit preflight failed", describeWriteError(error));
    }
  };

  const enrollNewAgent = async (event) => {
    event.preventDefault();
    if (!requireWallet()) return;
    const vault = enrollForm.vault.trim();
    const mandate = enrollForm.mandate.trim();
    const recordUrl = enrollForm.recordUrl.trim();
    const recordHash = enrollForm.recordHash.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(vault)) {
      setStatus("Enroll: enter a valid 20-byte vault address.");
      return;
    }
    if (!mandate) {
      setStatus("Enroll: enter the mandate text the Governor should enforce.");
      return;
    }
    if ((recordUrl && !recordHash) || (!recordUrl && recordHash)) {
      setStatus("Enroll: provide both the record URL and record hash, or leave both blank.");
      return;
    }
    const agent = connectedAddress;
    await runWrite(
      "Enroll",
      "enroll",
      [agent, vault, mandate, [DECLARED_PROVIDER], 1800n, 1800n, recordUrl, recordHash],
      0n,
      agent,
      CANONICAL_DEMO.governor,
      { vault, mandate, recordUrl, recordHash },
      enrollArgs,
    );
  };

  const runWrite = async (label, functionName, args, value = 0n, targetAgent = CONFIG.rewriteAgent, targetContract = CONFIG.governor, meta = null, encodeArgs = addressArgs) => {
    if (!requireWallet()) return;
    if (uncertainSubmission) {
      setStatus(`${uncertainSubmission.label}: submission status is uncertain. Verify the wallet and explorer before retrying.`);
      return;
    }
    if (submitting || transactions.some((transaction) => transaction.pending)) {
      setStatus("A transaction is already being submitted or waiting for Bradbury consensus.");
      return;
    }
    setSubmitting(true);
    setActiveAction(label);
    setWriteFailure(null);
    setStatus(`${label}: submitting…`);
    if (localTestWallet) {
      const startedAt = Date.now();
      const hash = LOCAL_TEST_WALLET.hashes[label];
      setTransactions((previous) => [{ label, hash, startedAt, pending: true, localTest: true }, ...previous]);
      onResultChange({ action: label, hash, targetAgent, status: "pending", consensus: "Pending", execution: null, localTest: true });
      setStatus(`${label}: local test simulation · consensus pending…`);
      window.setTimeout(() => {
        const execution = "FINISHED_WITH_RETURN";
        setTransactions((previous) => previous.map((transaction) => transaction.hash === hash ? { ...transaction, pending: false, execution } : transaction));
        setActiveAction(null);
        if (label === "Review") {
          onResultChange({
            action: label,
            hash,
            targetAgent,
            status: "resolved",
            consensus: "Resolved",
            execution,
            localTest: true,
            verdict: true,
            ruling: "ON_MANDATE",
            reason: "Local test result: the configured demo agent paid declared providers in modest amounts without emptying the vault.",
            fields: [["spend_total", "220"], ["balance", "780"], ["destination_count", "2"], ["payments", "1, 1 each"], ["declared", "yes"]],
            pinned_state: "local_test=true\nspend_total=220\ndestination_count=2\nbalance=780\nverdict=ON_MANDATE",
          });
          setStatus("Review: local test verdict resolved ✓");
        } else {
          if (label === "Enroll") {
            setEnrolledAgent({ ...(meta || {}), agent: targetAgent, governor: targetContract, hash });
          }
          onResultChange({ action: label, hash, targetAgent, status: "resolved", consensus: "Resolved", execution, localTest: true });
          setStatus(`${label}: local test resolved ✓`);
        }
        setSubmitting(false);
      }, 1200);
      return;
    }
    try {
      const provider = await connector.getProvider();
      if (!provider) throw new Error("Connected wallet provider unavailable.");
      const tracedProvider = {
        request: async (request) => {
          try {
            const result = await provider.request(request);
            console.debug("Stele wallet RPC response", { request, result });
            return result;
          } catch (error) {
            console.error("Stele wallet RPC failed", { request, error, cause: error?.cause, data: error?.data, details: error?.details, shortMessage: error?.shortMessage });
            throw error;
          }
        },
      };
      const walletChainId = await tracedProvider.request({ method: "eth_chainId" });
      const expectedChainId = `0x${bradbury.id.toString(16)}`;
      if (walletChainId !== expectedChainId) {
        throw new Error(`Wallet is on chain ${Number.parseInt(walletChainId, 16)}; switch to GenLayer Bradbury (4221) and try again.`);
      }
      const walletPendingNonce = await tracedProvider.request({
        method: "eth_getTransactionCount",
        params: [walletClient.account.address, "pending"],
      });
      const client = createClient({
        chain: testnetBradbury,
        account: walletClient.account.address,
        provider: tracedProvider,
      });
      // genlayer-js normally reads the nonce from its public RPC transport.
      // Wallets can know about locally pending transactions that the public
      // RPC has not indexed yet, so use the connected wallet's pending nonce.
      client.getCurrentNonce = async () => BigInt(walletPendingNonce);
      const balanceHex = await tracedProvider.request({
        method: "eth_getBalance",
        params: [walletClient.account.address, "latest"],
      });
      const balance = BigInt(balanceHex);
      console.debug("Stele connected wallet balance", {
        address: walletClient.account.address,
        balanceHex,
        balanceWei: balance.toString(),
      });
      if (balance === 0n) {
        throw new Error("Connected wallet has 0 GEN; fund this account before submitting a Bradbury transaction.");
      }
      let hash;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          hash = await client.writeContract({ address: targetContract, functionName, args: encodeArgs(args), value });
          break;
        } catch (error) {
          const message = describeWriteError(error);
          const capacity = message.includes("-32005") || message.toLowerCase().includes("capacity");
          if (!capacity || attempt === 3) throw error;
          const retryAfter = Number(error?.cause?.data?.retryAfterMs || error?.data?.retryAfterMs || 0);
          const delay = Math.max(500, Math.min(8000, retryAfter || 2 ** attempt * 1000));
          console.warn(`Stele ${label} retrying after Bradbury capacity response`, { attempt: attempt + 1, delay, error });
          setStatus(`${label}: Bradbury is busy; retrying in ${Math.ceil(delay / 1000)}s…`);
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
      }
      const startedAt = Date.now();
      setUncertainSubmission(null);
      setTransactions((previous) => [{ label, hash, startedAt, pending: true }, ...previous]);
      onResultChange({ action: label, hash, targetAgent, status: "pending", consensus: "Pending", execution: null });
      setStatus(`${label}: submitted ✓ Waiting for Bradbury consensus…`);
      pollReceipt(hash, label, startedAt, targetAgent, targetContract, meta);
    } catch (error) {
      console.error("Stele write failed", error, {
        shortMessage: error?.shortMessage,
        details: error?.details,
        cause: error?.cause,
        code: error?.code,
        data: error?.data,
      });
      const message = describeWriteError(error);
      const lowerMessage = message.toLowerCase();
      const failure = classifyWriteFailure(error, message);
      const capacity = message.includes("-32005") || lowerMessage.includes("capacity");
      const userRejected = error?.code === 4001 || lowerMessage.includes("user rejected") || lowerMessage.includes("rejected the request");
      const ambiguous = !capacity && !userRejected && (message.includes("-32603") || lowerMessage.includes("transaction failed") || lowerMessage.includes("originalerror"));
      if (ambiguous) {
        setActiveAction(null);
        setUncertainSubmission({ label, functionName, args, value });
        setWriteFailure({ label, ...failure, details: message, hashReturned: false });
        setStatus(`${label}: ${failure.category} — submission status is uncertain.`);
      } else {
        setActiveAction(null);
        setWriteFailure({ label, ...failure, details: message, hashReturned: false });
        setStatus(capacity
          ? `${label}: Bradbury is busy — retry later.`
          : `${label}: ${message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const pollReceipt = (hash, label, startedAt, targetAgent = CONFIG.rewriteAgent, targetContract = CONFIG.governor, meta = null) => {
    const poll = async () => {
      try {
        const response = await fetch(`https://rpc-bradbury.genlayer.com`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "gen_getTransactionReceipt", params: [{ txId: hash }] }) });
        const payload = await response.json();
        if (payload.error) {
          console.error("Stele receipt RPC failed", payload.error);
        }
        if (payload.result) {
          const receipt = payload.result;
          const created = Number(receipt.timestamps?.Created || 0);
          const statusName = receipt.status_name || receipt.statusName;
          const numericStatus = Number(receipt.status);
          const terminalStatus = ["ACCEPTED", "UNDETERMINED", "FINALIZED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(statusName)
            || [4, 5, 6, 7, 8, 12, 13].includes(numericStatus);
          const hasReceipt = receipt.id && !/^0x0+$/.test(receipt.id) && (created > 0 || Number.isFinite(numericStatus));
          if (!hasReceipt || !terminalStatus) {
            if (Date.now() - startedAt >= 120000) {
              setStatus(`${label}: Bradbury is still processing (${statusName || `status ${receipt.status}`})… keep this tab open.`);
            }
            window.setTimeout(poll, 5000);
            return;
          }
          const execution = receipt.txExecutionResultName || ({ 0: "NOT_VOTED", 1: "FINISHED_WITH_RETURN", 2: "FINISHED_WITH_ERROR" }[receipt.txExecutionResult] || "receipt received");
          setTransactions((previous) => previous.map((transaction) => transaction.hash === hash ? { ...transaction, pending: false, execution } : transaction));
          setActiveAction(null);
          if (label === "Review" && execution === "FINISHED_WITH_RETURN") {
            setStatus("Review: consensus resolved ✓ Reading the verdict from the reviewed agent…");
            try {
              const readClient = createClient({ chain: testnetBradbury });
              const vault = await readClient.readContract({ address: targetContract, functionName: "get_vault", args: addressArgs([targetAgent]) });
              const [state, verdict] = await Promise.all([
                readClient.readContract({ address: vault, functionName: "agent_state", args: [] }),
                readClient.readContract({ address: targetContract, functionName: "latest_verdict", args: addressArgs([targetAgent]) }),
              ]);
              const record = liveFixtureRecord(state, verdict);
              if (record.ruling === "OFF_MANDATE") setHaltedSpend({ vault, agent: targetAgent });
              onResultChange({ action: label, hash, targetAgent, status: "resolved", consensus: "Resolved", execution, verdict: true, ...record });
              setStatus("Review: resolved verdict loaded from the reviewed agent ✓");
            } catch (error) {
              console.error("Stele resolved Review read failed", error);
              onResultChange({ action: label, hash, targetAgent, status: "resolved", consensus: "Resolved", execution, verdictError: describeReadError(error) });
              setStatus("Review: transaction resolved, but the verdict read needs a retry.");
            }
          } else {
            const errorText = receipt.revertReason || receipt.error || receipt.executionError || receipt.txExecutionError || (label === "Spend" && execution === "FINISHED_WITH_ERROR" ? "Vault is halted" : null);
            if (label === "Enroll" && execution === "FINISHED_WITH_RETURN") {
              setEnrolledAgent({ ...meta, agent: targetAgent, governor: targetContract, hash });
              setStatus("Enroll: new agent enrolled on the consolidated Governor ✓");
            }
            onResultChange({ action: label, hash, targetAgent, status: "resolved", consensus: "Resolved", execution, ...(errorText ? { outcomeTitle: label === "Spend" ? "Spend rejected by halted vault" : `${label} execution error`, outcomeMessage: errorText } : {}) });
            if (label !== "Enroll") setStatus(execution === "FINISHED_WITH_ERROR" ? `${label}: accepted, but contract execution failed.` : `${label}: ${execution} ✓`);
          }
          return;
        }
      } catch { /* keep background polling quiet */ }
      if (Date.now() - startedAt >= 120000) {
        setStatus(`${label}: still waiting for Bradbury consensus… keep this tab open; the explorer hash remains the source of truth.`);
      }
      window.setTimeout(poll, 5000);
    };
    window.setTimeout(poll, 5000);
  };

  const runPresetReview = (presetLabel, targetAgent, targetGovernor) => {
    if (!requireWallet()) return;
    setStatus(`${presetLabel}: submitting… Bradbury consensus typically takes ~70s; this is normal, not stuck.`);
    runWrite("Review", "review", [targetAgent], 0n, targetAgent, targetGovernor);
  };

  const spendWhileHalted = () => {
    if (!haltedSpend) return;
    runWrite("Spend", "spend", [DECLARED_PROVIDER, 1n], 0n, haltedSpend.agent, haltedSpend.vault);
  };

  if (!connected) return <div className="write-panel"><p>Connect a wallet to submit a review, claim, mandate proposal, or LP deposit.</p><p className="enroll-live-status enroll-live-status-static">Enrollment verified live on Bradbury via <code>genlayer-js</code> — <code>0x1a4846a0…</code>. The <code>genlayer</code> CLI has an address-encoding inconsistency across <code>enroll</code>'s parameters; the product page's writes already use <code>genlayer-js</code> directly and are unaffected.</p><ConnectButton /></div>;
  const hasPendingTransaction = transactions.some((transaction) => transaction.pending);
  return <div className="write-panel">
    {localTestWallet && <div className="local-test-banner">LOCAL TEST MODE · no wallet connection or blockchain transaction</div>}
    <div className="write-panel-head"><span>{localTestWallet ? "Test wallet" : "Connected wallet"}</span><span>{connectedAddress}</span></div>
    <div className="run-target"><strong>You are submitting actions for configured agent</strong><span>{CONFIG.rewriteAgent}</span><small>using wallet {connectedAddress}</small></div>
    {!localTestWallet && chain?.id !== bradbury.id && <button onClick={() => switchChain({ chainId: bradbury.id })}>Switch to Bradbury</button>}
    <form className="enroll-panel" onSubmit={enrollNewAgent}>
      <div className="review-presets-heading"><strong>Enroll a new agent</strong><span>Connected wallet becomes the agent · consolidated Governor</span></div>
      <div className="enroll-form-grid">
        <label>Vault address<input value={enrollForm.vault} onChange={(event) => setEnrollForm((form) => ({ ...form, vault: event.target.value }))} placeholder="0x…" autoComplete="off" /></label>
        <label>Mandate text<textarea value={enrollForm.mandate} onChange={(event) => setEnrollForm((form) => ({ ...form, mandate: event.target.value }))} placeholder="Plain-language rule for this agent" rows="3" /></label>
        <label>Record URL <span>(optional)</span><input value={enrollForm.recordUrl} onChange={(event) => setEnrollForm((form) => ({ ...form, recordUrl: event.target.value }))} placeholder="https://…" inputMode="url" /></label>
        <label>Record hash <span>(optional)</span><input value={enrollForm.recordHash} onChange={(event) => setEnrollForm((form) => ({ ...form, recordHash: event.target.value }))} placeholder="SHA-256 hex" autoComplete="off" /></label>
      </div>
      <p className="enroll-demo-note">Demo defaults: fixed provider list and 1800s windows. Full custom configuration coming later</p>
      <p className="enroll-live-status">Enrollment verified live on Bradbury via <code>genlayer-js</code> — <code>0x1a4846a0…</code>. The <code>genlayer</code> CLI has an address-encoding inconsistency across <code>enroll</code>'s parameters (see Engineering notes); the product page's writes already use <code>genlayer-js</code> directly and are unaffected.</p>
      <p className="enroll-governor">Governor <code>{CANONICAL_DEMO.governor}</code> · declared provider <code>{DECLARED_PROVIDER}</code> · default halt/claim windows 1800 blocks</p>
      <button type="submit" disabled={hasPendingTransaction || submitting || uncertainSubmission}>{activeAction === "Enroll" ? <><span className="action-spinner" /> Enroll · waiting…</> : "Enroll and sign transaction"}</button>
      <div className="integration-example"><strong>Minimal vault integration guard</strong><pre>{`function spend(address destination, uint256 amount) external {
  require(msg.sender == agent, "Only the agent can spend");
  require(!governor.is_halted(agent));
  _transfer(destination, amount);
}`}</pre></div>
      {enrolledAgent && <div className="enrolled-agent-card"><div><strong>Agent enrolled · not yet reviewed</strong><span>{enrolledAgent.agent}</span></div><p>{enrolledAgent.mandate}</p><small>Governor {enrolledAgent.governor} · Vault {enrolledAgent.vault}</small>{enrolledAgent.recordUrl && <small>Record {enrolledAgent.recordUrl} · hash {enrolledAgent.recordHash}</small>}</div>}
    </form>
    <p className={`action-sequence${uncertainSubmission ? " uncertain" : ""}`}><span className="sequence-dot" /> {uncertainSubmission ? `${uncertainSubmission.label}: submission status is uncertain · verify wallet activity before retrying.` : "One action at a time · waiting for Bradbury consensus before the next action."}</p>
    <div className="write-actions">
      <button className={activeAction === "Review" ? "is-active" : activeAction || uncertainSubmission ? "is-locked" : ""} disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={() => runWrite("Review", "review", [CONFIG.rewriteAgent])}>{activeAction === "Review" ? <><span className="action-spinner" /> 1. Review · waiting…</> : activeAction || uncertainSubmission ? "1. Review · locked" : "1. Run review"}</button>
      <button className={activeAction === "Claim" ? "is-active" : activeAction || uncertainSubmission ? "is-locked" : ""} disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={fileClaim}>{activeAction === "Claim" ? <><span className="action-spinner" /> 2. File claim · waiting…</> : activeAction || uncertainSubmission ? "2. File claim · locked" : "2. File claim"}</button>
      <button className={activeAction === "Propose" ? "is-active" : activeAction || uncertainSubmission ? "is-locked" : ""} disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={proposeMandate}>{activeAction === "Propose" ? <><span className="action-spinner" /> 3. Propose mandate · waiting…</> : activeAction || uncertainSubmission ? "3. Propose mandate · locked" : "3. Propose mandate"}</button>
      <button className={activeAction === "Deposit" ? "is-active" : activeAction || uncertainSubmission ? "is-locked" : ""} disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={depositMinimum}>{activeAction === "Deposit" ? <><span className="action-spinner" /> 4. Deposit · waiting…</> : activeAction || uncertainSubmission ? "4. Deposit · locked" : "4. Deposit minimum GEN"}</button>
    </div>
    <div className="review-presets" aria-labelledby="review-presets-title">
      <div className="review-presets-heading"><strong id="review-presets-title">Quick review presets</strong><span>No manual agent address needed.</span></div>
      <div className="review-preset-grid">
        <button type="button" disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={() => runPresetReview("Review drain fixture", FIXTURES.drain.agent, CONFIG.governor)}><strong>Review drain fixture</strong><small>Prefilled · expected OFF_MANDATE</small></button>
        <button type="button" disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={() => runPresetReview("Review conflict fixture", C1_RECORD_EVIDENCE.burstConflict.agent, C1_RECORD_EVIDENCE.burstConflict.governor)}><strong>Review conflict fixture</strong><small>Prefilled · expected EVIDENCE_CONFLICT</small></button>
      </div>
      <p className="review-preset-note">Bradbury reviews typically take ~70s; this is normal, not stuck. Results appear in the Review result slot above.</p>
    </div>
    {haltedSpend && <div className="halted-spend-demo"><div><strong>Vault halted by the OFF_MANDATE review.</strong><span>Attempt the same declared-provider spend; VaultTwin should reject it before money moves.</span></div><button type="button" disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={spendWhileHalted}>Attempt spend on halted vault</button></div>}
    {uncertainSubmission && <button className="retry-after-check" onClick={() => { setUncertainSubmission(null); setStatus(`${uncertainSubmission.label}: retry enabled after wallet/explorer verification.`); }}>I verified no transaction — enable retry</button>}
    <p className="write-status" role="status">{status || "Writes use genlayer-js; reviews typically take 18–114 seconds (median 73)."}</p>
    {writeFailure && <details className="write-diagnostic"><summary>Why {writeFailure.label} stopped · {writeFailure.category}</summary><p><strong>{writeFailure.guidance}</strong></p><p>Transaction hash returned: <strong>{writeFailure.hashReturned ? "yes" : "no"}</strong></p><pre>{writeFailure.details}</pre></details>}
    {transactions.map(({ label, hash, startedAt, pending, execution, localTest }) => <div className="tx-hash" key={hash}>
      <span>{label}</span>
      {localTest ? <strong>{hash} <EvidenceTag>local test only</EvidenceTag></strong> : <a href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer">{hash}</a>}
      <small>{pending ? `Submitted ✓ · Waiting for Bradbury consensus… ${Math.floor((now - startedAt) / 1000)}s` : `${execution} ${execution === "FINISHED_WITH_ERROR" ? "✕" : "✓"}`}</small>
    </div>)}
  </div>;
}

function ProductPage() {
  const [live, setLive] = useState({ status: "loading", fixtures: {} });
  const [lineage, setLineage] = useState({ status: "loading" });
  const [capital, setCapital] = useState({ status: "loading" });
  const [readStatus, setReadStatus] = useState("Loading live Bradbury reads…");
  const [readNonce, setReadNonce] = useState(0);
  const [yourRun, setYourRun] = useState({});
  const { address, isConnected } = useAccount();
  const localTestWallet = isLocalTestWalletEnabled();
  const walletConnected = isConnected || localTestWallet;
  const walletAddress = address || (localTestWallet ? LOCAL_TEST_WALLET.address : undefined);

  const retryLiveReads = () => setReadNonce((value) => value + 1);

  useEffect(() => {
    let active = true;
    (async () => {
      const client = createClient({ chain: testnetBradbury });
      const readFixture = async (fixture) => {
        try {
          const vault = await client.readContract({ address: CONFIG.governor, functionName: "get_vault", args: addressArgs([fixture.agent]) });
          const [state, verdict] = await Promise.all([
            client.readContract({ address: vault, functionName: "agent_state", args: [] }),
            client.readContract({ address: CONFIG.governor, functionName: "latest_verdict", args: addressArgs([fixture.agent]) }),
          ]);
          return { status: "ready", ...liveFixtureRecord(state, verdict) };
        } catch (error) {
          console.error("Stele live fixture read failed", error);
          return { status: "error", error: describeReadError(error) };
        }
      };
      const readLineage = async () => {
        try {
          const [versionOne, versionTwo, claim] = await Promise.all([
            client.readContract({ address: CONFIG.governor, functionName: "get_mandate_version", args: addressArgs([CONFIG.rewriteAgent, 1]) }),
            client.readContract({ address: CONFIG.governor, functionName: "get_mandate_version", args: addressArgs([CONFIG.rewriteAgent, 2]) }),
            client.readContract({ address: CONFIG.governor, functionName: "get_last_claim", args: addressArgs([CONFIG.rewriteAgent]) }),
          ]);
          return { status: "ready", versionOne, versionTwo, claim };
        } catch (error) {
          console.error("Stele live lineage read failed", error);
          return { status: "error", error: describeReadError(error) };
        }
      };
      const [healthy, burst, drain, strangers, lineageResult] = await Promise.all([
        readFixture(FIXTURES.healthy),
        readFixture(FIXTURES.burst),
        readFixture(FIXTURES.drain),
        readFixture(FIXTURES.strangers),
        readLineage(),
      ]);
      if (active) {
        setLive({ status: "ready", fixtures: { healthy, burst, drain, strangers } });
        setLineage(lineageResult);
      }
    })();
    return () => { active = false; };
  }, [readNonce]);

  useEffect(() => {
    let active = true;
    (async () => {
      setCapital({ status: "loading" });
      try {
        const client = createClient({ chain: testnetBradbury });
        const [pool, lpPool, totalShares, bond, lastClaim] = await Promise.all([
          client.readContract({ address: CONFIG.governor, functionName: "get_pool", args: [] }),
          client.readContract({ address: CONFIG.governor, functionName: "get_lp_pool", args: [] }),
          client.readContract({ address: CONFIG.governor, functionName: "get_total_lp_shares", args: [] }),
          client.readContract({ address: CONFIG.governor, functionName: "get_bond_of", args: addressArgs([CONFIG.rewriteAgent]) }),
          client.readContract({ address: CONFIG.governor, functionName: "get_last_claim", args: addressArgs([CONFIG.rewriteAgent]) }),
        ]);
        let yourShares = null;
        let yourSharesError = null;
        if (walletConnected) {
          try {
            yourShares = await client.readContract({ address: CONFIG.governor, functionName: "get_lp_shares", args: addressArgs([walletAddress]) });
          } catch (error) {
            console.info("Stele wallet-specific LP share read unavailable", error);
            yourSharesError = describeReadError(error);
          }
        }
        if (active) {
          setCapital({ status: "ready", values: { pool, lpPool, totalShares, bond, lastClaim, yourShares, yourSharesError } });
          setReadStatus(yourSharesError ? "Global Bradbury reads succeeded; your wallet LP-share read is unavailable." : "Live Bradbury reads succeeded from the consolidated Governor.");
        }
      } catch (error) {
        if (active) {
          console.error("Stele live capital read failed", error);
          const message = describeReadError(error);
          setCapital({ status: "error", error: message });
          setReadStatus(`Live Bradbury reads unavailable — ${message} Retry live reads.`);
        }
      }
    })();
    return () => { active = false; };
  }, [walletAddress, walletConnected, readNonce]);

  const capitalValue = (key) => {
    if (capital.status === "loading") return <span className="capital-pending" aria-label="Live read pending">…</span>;
    if (capital.status === "error") return <CompactReadFailure onRetry={retryLiveReads} />;
    if (key === "yourShares" && capital.values.yourSharesError) return <CompactReadFailure onRetry={retryLiveReads} />;
    if (capital.values[key] === null) return key === "yourShares" && isConnected ? "No LP share record yet" : "Connect wallet";
    return String(capital.values[key]);
  };
  const claimValue = capital.status === "ready" && capital.values.lastClaim && typeof capital.values.lastClaim === "object" ? capital.values.lastClaim : null;
  const productSections = [
    ["proof", "Already Proved", "Canonical receipts · no wallet needed", "Evidence Index"],
    ["actions", "Your Run", "Wallet actions + your result", "Your Run"],
    ["evidence-record", "Evidence Record", "C1 hash-locked cases", "Evidence Record"],
    ["demo", "Demo Fixtures", "Healthy · burst · drain examples", "Demo Fixtures & Reference"],
  ];
  const initialProductSection = productSections.some(([id]) => id === window.location.hash.slice(1)) ? window.location.hash.slice(1) : "proof";
  const [activeProductSection, setActiveProductSection] = useState(initialProductSection);
  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash.slice(1);
      if (productSections.some(([id]) => id === next)) setActiveProductSection(next);
    };
    window.addEventListener("popstate", onHashChange);
    window.addEventListener("hashchange", onHashChange);
    return () => { window.removeEventListener("popstate", onHashChange); window.removeEventListener("hashchange", onHashChange); };
  }, []);
  const selectProductSection = (id) => {
    setActiveProductSection(id);
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return <main className="product-page">
    <header className="product-label wrap"><span>STELE / LIVE EVIDENCE · GENLAYER BRADBURY · CHAIN 4221</span><a href="/docs">Read the docs ↗</a></header>
    <div className="product-cta wrap"><a href="#proof" onClick={(event) => { event.preventDefault(); selectProductSection("proof"); }}>View the proof →</a></div>
    <div className="product-layout wrap">
      <aside className="product-sidebar" aria-label="Evidence sections">
        <nav>{productSections.map(([id, label, detail, zone], index) => <React.Fragment key={id}>{(index === 0 || productSections[index - 1][3] !== zone) && <div className="zone-divider">{zone}</div>}<button className={`${activeProductSection === id ? "active" : ""} ${id === "cover" || id === "capital" ? "secondary-section" : ""}`} aria-current={activeProductSection === id ? "page" : undefined} onClick={() => selectProductSection(id)}><span>{label}</span><small>{detail}</small></button></React.Fragment>)}</nav>
      </aside>
      <div className="product-main">
        {activeProductSection === "proof" && <AlreadyProvedSection live={live} lineage={lineage} capital={capital} capitalValue={capitalValue} walletConnected={walletConnected} retryLiveReads={retryLiveReads} />}
        {activeProductSection === "actions" && <section id="actions" className="actions evidence-panel" aria-labelledby="actions-title"><div className="section-intro compact"><div className="eyebrow">01 / YOUR RUN</div></div><ActionPanel onResultChange={(result) => setYourRun((previous) => ({ ...previous, [result.action]: result }))} /><div className="your-run-results" aria-label="Your action results"><YourRunResult action="Enroll" result={yourRun.Enroll} /><YourRunResult action="Review" result={yourRun.Review} /><YourRunResult action="Spend" result={yourRun.Spend} /><YourRunResult action="Claim" result={yourRun.Claim} /><YourRunResult action="Propose" result={yourRun.Propose} /><YourRunResult action="Deposit" result={yourRun.Deposit} /></div></section>}
        {activeProductSection === "lineage" && <section className="lineage evidence-panel" aria-labelledby="lineage-title"><div className="section-intro compact"><div className="eyebrow">02 / LINEAGE</div><p className="scope-note">Configured demo agent mandate history — not your wallet.</p></div>{lineage.status === "ready" ? <><div className="lineage-rail"><article className="version-card"><div className="version-label">v1 · {lineage.versionOne.status} <EvidenceTag>live · get_mandate_version</EvidenceTag></div><p>{lineage.versionOne.text}</p></article><div className="lineage-arrow" aria-hidden="true">→</div><article className="version-card active-version"><div className="version-label">v2 · {lineage.versionTwo.status} <EvidenceTag>live · get_mandate_version</EvidenceTag></div><p>{renderMandateText(lineage.versionOne.text, lineage.versionTwo.text)}</p></article></div><div className="trigger"><span>CLAIM {lineage.claim.status}</span><b>{String(lineage.claim.payout)} against {String(lineage.claim.loss)} loss <EvidenceTag>live · get_last_claim</EvidenceTag></b><span>CLAUSE APPENDED</span></div></> : <ReadState message={lineage.status === "loading" ? "Loading live mandate and claim reads…" : `Live lineage read failed — ${lineage.error}`} onRetry={retryLiveReads} />}</section>}
        {activeProductSection === "cover" && <section className="cover evidence-panel" aria-labelledby="cover-title"><div className="section-intro compact"><div className="eyebrow">03 / COVER</div><p className="scope-note">Global protocol state for the configured demo agent.</p></div><div className="cover-grid"><div><span>POOL</span><strong>{capitalValue("pool")}</strong><small>claims pool · live read</small></div><div><span>BOND</span><strong>{capitalValue("bond")}</strong><small>loss cover before payout</small></div><div><span>LAST CLAIM</span><strong>{claimValue ? `${String(claimValue.payout)} / ${String(claimValue.loss)}` : capital.status === "ready" ? "No claim record" : capitalValue("lastClaim")}</strong><small>payout / loss · live read</small></div></div></section>}
        {activeProductSection === "capital" && <section className="capital evidence-panel" aria-labelledby="capital-title"><div className="section-intro compact"><div className="eyebrow">04 / CAPITAL AND YIELD</div><p className="scope-note">Global protocol totals plus the connected wallet’s own LP shares.</p></div><div className="pricing-grid capital-grid"><div><span>LP POOL · GLOBAL</span><strong>{capitalValue("lpPool")}</strong></div><div><span>TOTAL LP SHARES · GLOBAL</span><strong>{capitalValue("totalShares")}</strong></div><div><span>YOUR SHARES · WALLET</span><strong>{walletConnected ? capitalValue("yourShares") : "Connect wallet"}</strong></div></div></section>}
        {activeProductSection === "chain" && <section className="chain evidence-panel" aria-labelledby="chain-title"><div className="section-intro compact"><div className="eyebrow">05 / CHAIN RECORD</div><p className="scope-note">Primary consolidated proof plus the legacy interactive deployment.</p></div><div className="chain-list"><article className="chain-record"><div><strong>Primary consolidated Governor</strong><small>Agent C · full halt / govern / lifeform loop</small></div><div><small>GenLayer Bradbury · chain 4221</small></div><div className="chain-address">{CANONICAL_DEMO.governor}</div><a href={`${CONFIG.addressExplorer}${CANONICAL_DEMO.governor}`} target="_blank" rel="noreferrer">explorer ↗</a></article><article className="chain-record"><div><strong>Interactive wallet Governor</strong><small>legacy live action surface · pre-C1 history</small></div><div><small>GenLayer Bradbury · chain 4221</small></div><div className="chain-address">{CONFIG.governor}</div><a href={`${CONFIG.addressExplorer}${CONFIG.governor}`} target="_blank" rel="noreferrer">explorer ↗</a></article></div><div className="read-status" role="status"><strong>{readStatus}</strong></div></section>}
        {activeProductSection === "evidence-record" && <EvidenceRecordSection />}
        {activeProductSection === "secondary" && <div className="evidence-panel"><section className="context" aria-labelledby="context-title"><div className="section-intro compact"><div className="eyebrow">07 / SECONDARY EVIDENCE · ALLOWLIST</div><p className="scope-note">Fixed example evidence — not your wallet.</p></div><div className="context-card">{renderCase(FIXTURES.strangers, live.fixtures.strangers, retryLiveReads, "STRANGERS VAULT")}</div></section></div>}
        {activeProductSection === "demo" && <section className="demo-fixtures evidence-panel" aria-labelledby="demo-title"><div className="section-intro compact"><div className="eyebrow">08 / DEMO FIXTURES</div><p className="scope-note">Fixed example agents — not your wallet.</p></div><div className="read-status" role="note"><strong>Healthy, Burst, Drain, and Strangers are fixed examples.</strong><span>These live reads demonstrate the judgment rules; they are not the result of your connected wallet.</span></div><section className="contrast" aria-labelledby="contrast-title"><div className="comparison-grid">{renderCase(FIXTURES.healthy, live.fixtures.healthy, retryLiveReads)}{renderCase(FIXTURES.burst, live.fixtures.burst, retryLiveReads)}{renderCase({ ...FIXTURES.drain, className: "healthy", note: "current drain fixture · live state" }, live.fixtures.drain, retryLiveReads, "CURRENT DRAIN STATE")}{renderCase(FIXTURES.strangers, live.fixtures.strangers, retryLiveReads, "STRANGERS VAULT")}</div></section></section>}
        {activeProductSection === "history" && <section className="history evidence-panel" aria-labelledby="history-title"><div className="section-intro compact"><div className="eyebrow">09 / REFERENCE RECEIPTS</div><p className="scope-note">Historical reference — not current wallet data.</p></div><details className="receipt-appendix"><summary>Show historic receipts and their purpose</summary><div className="read-status" role="note"><strong>These receipts document earlier global demo runs.</strong><span>They do not change when a new wallet connects and do not represent the current Review result.</span></div><div className="history-list"><ReceiptLinks title="Judgment · healthy fixture · reference run" hashes={RECEIPTS.judgmentHealthy} /><ReceiptLinks title="Judgment · burst fixture · reference run" hashes={RECEIPTS.judgmentBurst} /><ReceiptLinks title="Judgment · drain v1 · reference run" hashes={RECEIPTS.drainV1} /><ReceiptLinks title="Judgment · drain v2 · reference run" hashes={RECEIPTS.drainV2} /><ReceiptLinks title="Judgment · consolidated drain suite · reference run" hashes={RECEIPTS.drainSuite} /><ReceiptLinks title="Halt sequence · reference run" hashes={[RECEIPTS.haltSeed, RECEIPTS.haltReview, RECEIPTS.haltSpendRejected, RECEIPTS.haltAdvance, RECEIPTS.haltSpendSuccess]} /><ReceiptLinks title="Lineage · claim, proposal, promotion · reference run" hashes={[RECEIPTS.claim, RECEIPTS.propose, RECEIPTS.promote]} /></div></details></section>}
      </div>
    </div>
    <footer className="wrap footer"><span>STELE</span></footer>
  </main>;
}

function DocsPage() {
  return <main className="docs-page">
    <nav className="docs-topbar wrap" aria-label="Primary navigation">
      <a className="brand-mark" href="/">STELE</a>
      <div className="docs-topbar-links"><a href="/product">Product</a><a className="active" href="/docs">Docs</a></div>
    </nav>
    <header className="docs-header wrap">
      <div><div className="eyebrow">STELE / DOCUMENTATION</div><h1>How the record becomes a response.</h1><p className="primary-governor"><strong>Primary Governor · Bradbury</strong> · <code>0x8fb0b2648BF73D292EB1CD7736F6f6624Db9F172</code><br /><span>Other Governors appear only as secondary C1 or historical verification paths.</span></p></div>
    </header>
    <div className="docs-layout wrap">
      <aside className="docs-nav"><a href="#judgment">Judgment</a><a href="#halt">Halt</a><a href="#lineage">Lineage</a><a href="#engineering">Engineering notes</a></aside>
      <article className="docs-content">
        <section id="judgment"><div className="eyebrow">01 / JUDGMENT</div><h2>Behavior is judged from pinned state and a hash-locked record.</h2><p>The current C1 review uses two stages. First, the Governor reads and pins the VaultTwin state. For C1-enrolled agents it then fetches the enrolled record, verifies its hash, parses it with <code>strict_eq</code>, and compares the record to the pin before branching to the mandate judgment. A mismatch produces the distinct <code>EVIDENCE_CONFLICT</code> ruling.</p><pre>pin vault state → fetch record → hash check → strict_eq → compare → judgment or EVIDENCE_CONFLICT</pre><p>The consolidated Agent C demonstration on Governor <code>0x8fb0b2648BF73D292EB1CD7736F6f6624Db9F172</code> proves the pin-only lifecycle path. Agent C has no enrolled record, so <code>RECORD_STATUS=UNAVAILABLE</code> is expected there. When C1 evidence conflicts, <code>claim()</code> rejects payout as <code>DENIED_EVIDENCE_CONFLICT</code>.</p></section>
        <section id="halt"><div className="eyebrow">02 / HALT</div><h2>An OFF ruling changes what the vault can do next.</h2><p>When a review returns OFF_MANDATE, the Governor sets a halt and expiry. VaultTwin checks <code>is_halted(agent)</code> before spending and rejects the payment while the halt is active. An ON review clears the halt immediately.</p><p>Halt expiry uses consensus time, not wall-clock time. The window must cover queue delay and review latency, so Bradbury uses a long protection window.</p></section>
        <section id="cover"><div className="eyebrow">03 / COVER</div><h2>A paid loss creates the evidence for a narrower rule.</h2><p>The thin mandate can allow a drain. If the pre-drain review was ON and the later balance falls, <code>claim()</code> pays <code>min(loss, bond, pool)</code> within the claim window. It stores the pre-drain ON trace and the post-loss trace separately.</p><p>A failed <code>get_governor</code> read is not treated as detachment. A permitted activity pattern is not silently reclassified as a thin-mandate denial.</p></section>
        <section id="capital"><div className="eyebrow">04 / CAPITAL</div><h2>Premium yield is separate from claims risk in this version.</h2><p><code>enroll_covered</code> splits premium 70/30 between the claims pool and LP pool. Deposits mint LP shares and withdrawals pay proportional LP pool value including yield. LPs do not back claims directly yet; the claims pool remains the paying pool.</p></section>
        <section id="lineage"><div className="eyebrow">05 / LINEAGE</div><h2>The original mandate remains visible inside the next version.</h2><p><code>propose_mandate</code> reads a paid claim and asks for a behavioral clause describing the missing pattern. The proposal must preserve the parent text as an exact prefix and starts as a dead branch.</p><p><code>promote_mandate</code> scores stored traces: the post-loss trace must become OFF, the pre-drain trace must remain ON, and any stored burst or strangers cases must keep their original rulings. Failed candidates remain stored and inactive. The enrollment envelope cannot widen providers, raise limits, or clear halts.</p></section>
        <section id="engineering"><div className="eyebrow">ENGINEERING NOTES</div><h2>What the receipts mean.</h2><p className="docs-related-links">Related notes: <a href="#cover">Cover</a> · <a href="#capital">Capital &amp; Yield</a></p><ul><li>Evidence stays in deterministic vault state. The canonical destination list is sorted before pinning.</li><li><code>prompt_non_comparative</code> receives a pinned callable, with JSON shape enforced by criteria and a bounded parse retry. Failed parsing stores raw output and does not halt.</li><li>ACCEPTED is the terminal runner state on Bradbury. FINALIZED does not advance reliably, so receipt checks use ACCEPTED plus <code>FINISHED_WITH_RETURN</code>.</li><li>NOT_VOTED is distinct from DETERMINISTIC_VIOLATION and timeout behavior. A first receipt with no votes is repolled before it is recorded as final.</li><li>Consensus-time windows must include queue delay plus review latency. This is why the halt and claim windows are sized conservatively.</li><li>CLI address arguments use <code>addr#</code>, not <code>address#</code>.</li><li>Resolved enrollment finding: the CLI's Address-vs-string encoding was inconsistent across <code>enroll</code>'s provider array, agent address, and halt-window parameters. Direct <code>genlayer-js</code> encoding succeeded with receipt <code>0x1a4846a0…</code>; product-page writes use that direct SDK path.</li><li>Writes use genlayer-js with the connected wallet provider. Reads remain wallet-free, and reviews typically take about 73 seconds.</li></ul></section>
      </article>
    </div>
  </main>;
}

function LandingPage() {
  return <main className="landing-page">
    <nav className="landing-nav wrap">
      <a className="brand-mark" href="/">STELE</a>
      <div className="landing-nav-links"><a href="#why">Why Stele</a><a href="#mechanism">Mechanism</a><a className="nav-product" href="/product">Open live product ↗</a></div>
    </nav>
    <section className="landing-hero wrap" style={{ backgroundImage: `url(${steleHero})` }}>
      <div className="hero-overlay" aria-hidden="true" />
      <div className="hero-copy">
        <div className="eyebrow">STELE / PUBLIC RULES FOR AGENT VAULTS</div>
        <h1>A governor judges.<br /><em>Then acts.</em></h1>
        <p className="hero-lede">A governor judges a vault against a written mandate. Off-mandate → halt. A wrong halt that costs money → the pool pays, then the mandate grows a clause. No vote.</p>
        <p className="primary-governor"><strong>Primary Governor · Bradbury</strong><br /><code>0x8fb0b2648BF73D292EB1CD7736F6f6624Db9F172</code></p>
        <div className="hero-actions"><a className="button button-dark" href="/product">Explore the live product ↗</a><a className="text-link" href="https://github.com/Snehal707/stele" target="_blank" rel="noreferrer">Read the repository</a></div>
      </div>
      <span className="image-caption">A public rule, made legible.</span>
    </section>
    <section id="why" className="landing-section wrap">
      <div className="landing-section-heading"><div className="eyebrow">THE PROBLEM</div><h2>The difficult part is not knowing there should be a circuit breaker.</h2><p>The difficult part is custody of the switch. Stele makes the judgment public, deterministic inputs visible, and the response executable.</p></div>
      <div className="landing-statements"><article><span>01</span><h3>See the shape</h3><p>Two vaults can have nearly identical totals and still deserve opposite verdicts.</p></article><article><span>02</span><h3>Hold the switch</h3><p>An OFF mandate can halt the next spend before the pattern compounds.</p></article><article><span>03</span><h3>Add to the law</h3><p>A paid loss can produce a narrower clause without erasing the original rule.</p></article></div>
    </section>
    <section id="mechanism" className="landing-mechanism">
      <div className="wrap mechanism-grid"><div><div className="eyebrow">THE MECHANISM</div><h2>From observed state to public consequence.</h2><p>Review pins the vault state, then C1-enrolled agents add a fetched, hash-locked record checked with <code>strict_eq</code>. Agreement reaches the mandate judgment; disagreement produces <code>EVIDENCE_CONFLICT</code> and blocks the claim.</p><p>Agent C proves the full lifecycle: enroll → ON_MANDATE → drain → PAID → propose → promote → v2 → OFF_MANDATE. <a href="/product">See the full evidence on the live product ↗</a></p></div><div className="flow-card"><div className="flow-step"><b>01</b><span>Pin + record</span><small>vault state · fetch · hash · strict_eq</small></div><div className="flow-line" /><div className="flow-step"><b>02</b><span>Validator ruling</span><small>ON · OFF · or EVIDENCE_CONFLICT</small></div><div className="flow-line" /><div className="flow-step"><b>03</b><span>Recorded response</span><small>halt · paid claim · next clause</small></div></div></div>
    </section>
    <section className="landing-proof wrap"><div className="proof-top"><div className="eyebrow">LIVE ON GENLAYER BRADBURY · PRIMARY CONSOLIDATED GOVERNOR</div><span>CHAIN 4221</span></div><div className="proof-row"><strong>0x8fb0b2648BF73D292EB1CD7736F6f6624Db9F172</strong><a href="/product#proof">Open public record ↗</a></div><small className="landing-secondary-note">C1 burst and drain Governors remain secondary verification paths in the product evidence record.</small></section>
    <footer className="wrap footer landing-footer"><span>STELE</span><span>an upright inscribed stone where laws are published in public and added to over time.</span></footer>
  </main>;
}

function App() {
  if (window.location.pathname === "/product") return <ProductPage />;
  if (window.location.pathname === "/docs") return <DocsPage />;
  return <LandingPage />;
}

const config = getDefaultConfig({ appName: "Stele", projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "stele-demo-project-id", chains: [bradbury], ssr: false });
const queryClient = new QueryClient();
createRoot(document.getElementById("root")).render(<WagmiProvider config={config}><QueryClientProvider client={queryClient}><RainbowKitProvider chains={[bradbury]}><App /></RainbowKitProvider></QueryClientProvider></WagmiProvider>);
