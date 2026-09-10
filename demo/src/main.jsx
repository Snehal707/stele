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
import vaultTwinSource from "../../contracts/vault_twin.py?raw";

const bradbury = {
  id: 4221,
  name: "GenLayer Bradbury",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-bradbury.genlayer.com"] } },
  blockExplorers: { default: { name: "Bradbury Explorer", url: "https://explorer-bradbury.genlayer.com" } },
};

const CONFIG = {
  chainId: 4221,
  governor: "0x36b49eFFd0b9d5C47D8Cf93734BE34b911a6c3C9",
  explorer: "https://explorer-bradbury.genlayer.com/tx/",
  addressExplorer: "https://explorer-bradbury.genlayer.com/address/",
  rewriteAgent: "0xfcad0b19bb29d4674531d6f115237e16afce377c",
};
const DECLARED_PROVIDER = "0x1111111111111111111111111111111111111111";
const HALT_REVERT_RECEIPT_HASH = "0xd98033826d9737f6598e35cd23b862fe0207a3057f59b3ce163137d4e87ed557";
const DEFAULT_V4_AGENT = "0xfcad0b19bb29d4674531d6f115237e16afce377c";
const INTERACTIVE_V4_AGENT = DEFAULT_V4_AGENT;

function shortAddress(address) {
  if (typeof address !== "string" || address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

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

const ARCHIVE_PROOF_RECEIPTS = PROOF_RECEIPTS.slice(0, 4);

const INTERACTIVE_V4_EVIDENCE = {
  governor: CONFIG.governor,
  agent: "0x434f6b35ccde8c02f07d9693958f4890d2954f41",
  enroll: "0x4bd547cff84c5da9900840ee3e015b8282fffbfc77fa8bbb339eff80af2d2a88",
  reviewOn: "0x2c1d5010ff39c0c8be047d08c206ea4393621754778018b263fdbebbef2e86dc",
  drainSeed: "0x05ed80c604f54459ef93679fca16f5925a2583808beb7f0a036540930d6ab135",
  claim: "0x5779f823632333389b0c25987184919480ec26bf02172b06db9bcb4ae98c5993",
  propose: "0x57bb1197d32f174095bfa20397085b372248ded06e1d88e165dcc5dd0e482642",
  promote: "0x95970c354e1ff690bcf275b333fe85597645bae0c3472bdef76b1c26671c6c70",
  v2DrainSeed: "0xc1c804080704aff94ce8eb448bf0f8bde8efe4e9016a72f164b9ec614d41959c",
  reviewOff: "0xf11037a7c950f69262087fe4637679d3dad2342acc3eb0b7a9005058da004073",
  reviewOffReason: "Rule 2 (single-payment drain) was violated because the pin-only evidence shows balance=0 after the declared provider 0x1111111111111111111111111111111111111111 received payments=1 totaling 20, while Rule 1 was not violated because that provider had only 1 payment.",
};

const HALT_REVERT_PROOF = {
  governor: CONFIG.governor,
  agent: DEFAULT_V4_AGENT,
  vault: "0x66a7e61239ce7cc0B1E85ba62575e9026CC54f9b",
  hash: HALT_REVERT_RECEIPT_HASH,
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
    "Deploy VaultTwin": "0x0000000000000000000000000000000000000000000000000000000000000425",
  },
};

function isLocalTestWalletEnabled() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("localTestWallet") === "1";
}

const FIXTURES = {
  healthy: { label: "HEALTHY", className: "healthy", note: "example invoice pattern", agent: "0x6e1781e673afd1751f2f58ab8a4081fc1686554e" },
  burst: { label: "BURST", className: "burst", note: "48 payments · dozens in a short window", agent: "0x088a8fd5172047b8f7a8edf6825c2d06b69b560a" },
  drain: { label: "DRAIN", className: "drain-off", note: "drain fixture", agent: DEFAULT_V4_AGENT },
  strangers: { label: "STRANGERS", className: "burst", note: "undeclared destinations · allowlist check", agent: "0xfcad0b19bb29d4674531d6f115237e16afce377c", live: false },
};

const DEMO_FIXTURE_FALLBACKS = {
  HEALTHY: { fields: [["spend_total", "220"], ["balance", "780"], ["payments", "1"]], ruling: "ON_MANDATE" },
  BURST: { fields: [["spend_total", "220"], ["balance", "780"], ["payments", "48"]], ruling: "OFF_MANDATE" },
  DRAIN: { fields: [["state", "emptied"]], ruling: "OFF_MANDATE" },
  STRANGERS: { fields: [["destinations", "undeclared"]], ruling: "OFF_MANDATE" },
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
    confirmation: "OpenTimestamps proof is Bitcoin-confirmed in block 965884 (2026-09-07 04:57:21 UTC).",
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

function C1VerificationBlock({ item, label }) {
  return <div className="c1-verification-block"><div className="eyebrow">JUDGE VERIFICATION · {label}</div><p>Open the raw record, compare its bytes to the on-chain hash, then inspect the independent timestamp anchors.</p><div className="c1-verification-links"><div><a href={item.recordUrl} target="_blank" rel="noreferrer">Raw GitHub record ↗</a><code className="c1-url">{item.recordUrl}</code></div><span>record_hash · <code>{item.recordHash}</code> <em>click the raw record to verify</em></span><a href={item.archiveUrl} target="_blank" rel="noreferrer">Archive.org snapshot ↗</a><a href={item.otsUrl} target="_blank" rel="noreferrer">OpenTimestamps proof (.ots) ↗</a></div><pre className="c1-command-note">curl -L &lt;record-url&gt; | sha256sum{`\n`}Expected hash: {item.recordHash}</pre><p className="c1-honest-note">{item.confirmation || "OpenTimestamps proof is Bitcoin-confirmed in block 965831 (2026-09-06 20:58:43 UTC)."} This is project-authored evidence, not third-party evidence.</p></div>;
}

function C1ProofAccessSection() {
  const records = [
    ["Burst record", C1_RECORD_EVIDENCE.burstAgreement, "Bitcoin-confirmed in block 965831 (2026-09-06 20:58:43 UTC)."],
    ["Conflict record", C1_RECORD_EVIDENCE.burstConflict, C1_RECORD_EVIDENCE.burstConflict.confirmation],
  ];
  return <section className="c1-proof-access" aria-labelledby="c1-proof-access-title">
    <div className="eyebrow">C1 EVIDENCE · CLICK TO VERIFY</div>
    <h3 id="c1-proof-access-title">Burst and conflict records</h3>
    <div className="c1-proof-access-grid">{records.map(([label, item, confirmation]) => <article key={label}>
      <strong>{label}</strong>
      <span>{item.ruling} · record hash <code>{item.recordHash}</code></span>
      <div><a href={item.archiveUrl} target="_blank" rel="noreferrer">Archive.org snapshot ↗</a><a href={item.otsUrl} target="_blank" rel="noreferrer">OpenTimestamps proof (.ots) ↗</a></div>
      <small>{confirmation}</small>
    </article>)}</div>
  </section>;
}

function EvidenceRecordSection() {
  const verification = C1_RECORD_EVIDENCE.burstAgreement;
  return <section id="evidence-record" className="evidence-record evidence-panel" aria-labelledby="evidence-record-title">
    <div className="section-intro compact"><div className="eyebrow">06 / EVIDENCE RECORD</div><h2 id="evidence-record-title">A second source can change the ruling.</h2><p className="scope-note">Receipt-backed C1 cases — fixed historical examples, not your wallet.</p></div>
    <p className="evidence-record-explainer">The full lifecycle is provable on one address: Agent C's primary Governor <code>{CANONICAL_DEMO.governor}</code> covers enrollment, ON review, drain, paid claim, proposal, promotion, v2 activation, and the final genuine drain that ruled OFF. Agent C has no enrolled C1 record, so <code>RECORD_STATUS=UNAVAILABLE</code> and pin-only evidence are correct here. Agent C is pin-only; C1 is hash-locked. Canonical proof is Agent C. C1's separate evidence-conflict path remains proven by the burst and drain Governors below.</p>
    <div className="canonical-demo-record"><div className="eyebrow">PRIMARY · CONSOLIDATED GOVERNOR</div><h3>Agent C · full halt / govern / lifeform loop</h3><p><span>Vault</span> <code>{CANONICAL_DEMO.vault}</code> · <span>Agent</span> <code>{CANONICAL_DEMO.agent}</code></p><div className="canonical-demo-sequence">{CANONICAL_DEMO.sequence.map(([label, hash]) => <div key={hash}><span>{label}</span><a href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer">{hash} ↗</a></div>)}</div><p className="canonical-demo-note">The first v2 regression used only one modest payment and correctly stayed ON. The final corrected fixture emptied the vault with one payment and produced OFF_MANDATE. This proof is pin-only by design; the EVIDENCE_CONFLICT branch is shown separately in the C1 records.</p></div>
    <div className="c1-evidence-grid"><C1EvidenceCard item={C1_RECORD_EVIDENCE.burstAgreement} /><C1EvidenceCard item={C1_RECORD_EVIDENCE.burstConflict} /><C1EvidenceCard item={C1_RECORD_EVIDENCE.drainAgreement} /><C1EvidenceCard item={C1_RECORD_EVIDENCE.drainClaim} /></div>
    <C1VerificationBlock item={verification} label="BURST RECORD" />
    <C1VerificationBlock item={C1_RECORD_EVIDENCE.burstConflict} label="CONFLICT RECORD" />
    <div className="c1-guarantees"><div className="eyebrow">THREE GUARANTEES</div><div className="c1-guarantee-grid"><div><strong>Tamper-evident</strong><span>hash verified by every validator independently</span></div><div><strong>Backdating-resistant</strong><span>Archive.org + OpenTimestamps anchor the record's existence, independent of the project</span></div><div><strong>Load-bearing</strong><span>mismatch produces a different ruling and blocks payout — not just a message</span></div></div></div>
  </section>;
}

function HealthyBurstComparison({ live }) {
  const fixture = {
    healthy: { spend_total: "220", balance: "780", declared: "yes", payments: "1", ruling: "ON_MANDATE" },
    burst: { spend_total: "220", balance: "780", declared: "yes", payments: "48", ruling: "OFF_MANDATE" },
  };
  const value = (record, key, fallback) => {
    const liveValue = key === "ruling" ? record?.ruling : record?.fields?.find(([field]) => field === key)?.[1];
    return liveValue == null ? { value: fallback, fixture: true } : { value: liveValue, fixture: false };
  };
  const healthy = live?.fixtures?.healthy;
  const burst = live?.fixtures?.burst;
  const healthyValues = Object.fromEntries(Object.keys(fixture.healthy).map((key) => [key, value(healthy, key, fixture.healthy[key])]));
  const burstValues = Object.fromEntries(Object.keys(fixture.burst).map((key) => [key, value(burst, key, fixture.burst[key])]));
  const fixtureFallback = [...Object.values(healthyValues), ...Object.values(burstValues)].some((entry) => entry.fixture);
  return <section className="proof-comparison" aria-labelledby="proof-comparison-title"><div className="eyebrow" id="proof-comparison-title">THE SHARPEST CONTRAST</div><p className="proof-comparison-lede"><strong>Same totals. Same allowlist. Different verdict.</strong></p>{fixtureFallback && <p className="proof-comparison-source">Live read unavailable — showing last recorded receipt (on-chain)</p>}<div className="proof-comparison-grid"><div className="proof-comparison-head"><span>FIELD</span><strong>HEALTHY</strong><strong>BURST</strong></div><div><span>spend_total</span><strong>{healthyValues.spend_total.value}</strong><strong>{burstValues.spend_total.value}</strong></div><div><span>balance</span><strong>{healthyValues.balance.value}</strong><strong>{burstValues.balance.value}</strong></div><div><span>destination</span><strong>{healthyValues.declared.value === "yes" ? "declared" : healthyValues.declared.value}</strong><strong>{burstValues.declared.value === "yes" ? "declared" : burstValues.declared.value}</strong></div><div><span>payments</span><strong>{healthyValues.payments.value}</strong><strong className="proof-burst-value">{burstValues.payments.value}</strong></div><div><span>ruling</span><strong className="proof-on">{healthyValues.ruling.value}</strong><strong className="proof-off">{burstValues.ruling.value}</strong></div></div><p className="proof-comparison-note">Anyone can call <code>review</code> — this is a permissionless circuit breaker, not an admin panel.</p></section>;
}

function InteractiveV4Evidence() {
  const receipt = (label, hash, meaning) => <a className="proof-receipt" href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer"><div><strong>{label}</strong><span>{meaning}</span></div><code>{hash}</code><b aria-hidden="true">↗</b></a>;
  return <section className="interactive-v4-evidence" aria-labelledby="interactive-v4-evidence-title">
    <div className="eyebrow">INTERACTIVE GOVERNOR · NO WALLET NEEDED</div>
    <div className="section-intro compact"><h3 id="interactive-v4-evidence-title">The v4 loop, recorded on {INTERACTIVE_V4_EVIDENCE.governor}</h3><p className="scope-note">A static evidence trail for the current interactive Governor. These receipts are separate from the frozen Agent C archive.</p></div>
    <div className="proof-receipts interactive-v4-receipts">
      {receipt("Enroll", INTERACTIVE_V4_EVIDENCE.enroll, `agent ${INTERACTIVE_V4_EVIDENCE.agent} enrolled on the current v4 Governor.`)}
      {receipt("Review ON_MANDATE", INTERACTIVE_V4_EVIDENCE.reviewOn, "healthy pre-drain snapshot; the mandate was still satisfied.")}
      {receipt("Drain", INTERACTIVE_V4_EVIDENCE.drainSeed, "single-payment drain seeded; the later claim paid the 980 loss.")}
      {receipt("Claim PAID · 980", INTERACTIVE_V4_EVIDENCE.claim, "wrongly paid claim; payout 980 against a 980 loss.")}
      {receipt("Propose mandate", INTERACTIVE_V4_EVIDENCE.propose, "missing single-payment-drain clause proposed as a dead_branch candidate.")}
      {receipt("Promote · PASSED", INTERACTIVE_V4_EVIDENCE.promote, "v2 promoted; the appended clause is now active.")}
      {receipt("v2 genuine drain", INTERACTIVE_V4_EVIDENCE.v2DrainSeed, "same vault reseeded to balance=0 with one payment after promotion.")}
      {receipt("Review OFF_MANDATE", INTERACTIVE_V4_EVIDENCE.reviewOff, INTERACTIVE_V4_EVIDENCE.reviewOffReason)}
      <div className="proof-receipt proof-receipt-static"><div><strong>Full loop complete</strong><span>All eight receipts are on the same interactive Governor; the final v2 ruling names Rule 2.</span></div><b aria-hidden="true">✓</b></div>
    </div>
  </section>;
}

function PrimaryProofReceipts() {
  const receipts = [
    ["Paid claim", INTERACTIVE_V4_EVIDENCE.claim, "PAID · 980 — the pool pays when the judgment was wrong."],
    ["V2 ruling", INTERACTIVE_V4_EVIDENCE.reviewOff, "OFF_MANDATE — the appended Rule 2 catches a genuine drain."],
    ["Halt-revert", HALT_REVERT_PROOF.hash, "REVERTED — Vault is halted; money cannot move."],
  ];
  return <div className="primary-proof-receipts" aria-label="Primary interactive receipts">
    <div className="eyebrow">CANONICAL RECEIPTS · INTERACTIVE GOVERNOR</div>
    {receipts.map(([label, hash, meaning]) => <a className="proof-receipt" key={hash} href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer"><div><strong>{label}</strong><span>{meaning}</span></div><code>{shortAddress(hash)}</code><b aria-hidden="true">↗</b></a>)}
  </div>;
}

function IntegrationGuard() {
  return <section className="integration-example standalone-integration-example" aria-labelledby="integration-guard-title">
    <strong id="integration-guard-title">How to wire the halt into your own contract</strong>
    <p>Before moving funds, ask the Governor whether this agent is halted.</p>
    <pre>{`function spend(address destination, uint256 amount) external {
  require(msg.sender == agent, "Only the agent can spend");
  require(!governor.is_halted(agent));
  _transfer(destination, amount);
}`}</pre>
  </section>;
}

function ProofAppendix({ live, lineage, retryLiveReads }) {
  return <div className="proof-appendix">
    <details>
      <summary>Optional live reads · current network state</summary>
    <section className="proof-appendix-section" aria-labelledby="proof-lineage-title">
      <div className="eyebrow">LINEAGE</div>
      <h3 id="proof-lineage-title">The mandate grows after a paid claim.</h3>
      {lineage.status === "ready" ? <><div className="lineage-rail"><article className="version-card"><div className="version-label">v1 · {lineage.versionOne.status}</div><p>{lineage.versionOne.text}</p></article><div className="lineage-arrow" aria-hidden="true">→</div><article className="version-card active-version"><div className="version-label">v2 · {lineage.versionTwo.status}</div><p>{renderMandateText(lineage.versionOne.text, lineage.versionTwo.text)}</p></article></div><div className="trigger"><span>CLAIM {lineage.claim.status}</span><b>{String(lineage.claim.payout)} against {String(lineage.claim.loss)} loss</b><span>CLAUSE APPENDED</span></div></> : <LineageFallback onRetry={retryLiveReads} />}
    </section>
    <section className="proof-appendix-section" aria-labelledby="proof-fixtures-title">
      <div className="eyebrow">DEMO FIXTURES</div>
      <h3 id="proof-fixtures-title">Healthy, Burst, Drain, and Strangers</h3>
      <p className="scope-note">Fixed examples; Healthy, Burst, and Drain attempt a current read. Strangers is reference-only. An unavailable live read shows the last recorded receipt.</p>
      <div className="comparison-grid">{renderCase(FIXTURES.healthy, live.fixtures.healthy, retryLiveReads)}{renderCase(FIXTURES.burst, live.fixtures.burst, retryLiveReads)}{renderCase({ ...FIXTURES.drain, className: "healthy" }, live.fixtures.drain, retryLiveReads, "DRAIN FIXTURE")}{renderCase(FIXTURES.strangers, live.fixtures.strangers, retryLiveReads, "STRANGERS VAULT")}</div>
    </section>
    </details>
    <details>
      <summary>Reference archive · historical receipts and chain record</summary>
    <section className="proof-appendix-section" aria-labelledby="proof-references-title">
      <div className="eyebrow">REFERENCE RECEIPTS</div>
      <h3 id="proof-references-title">Historic verification runs</h3>
      <div className="history-list"><ReceiptLinks title="Judgment · healthy fixture" hashes={RECEIPTS.judgmentHealthy} /><ReceiptLinks title="Judgment · burst fixture" hashes={RECEIPTS.judgmentBurst} /><ReceiptLinks title="Judgment · drain v1" hashes={RECEIPTS.drainV1} /><ReceiptLinks title="Judgment · drain v2" hashes={RECEIPTS.drainV2} /><ReceiptLinks title="Lineage · claim, proposal, promotion" hashes={[RECEIPTS.claim, RECEIPTS.propose, RECEIPTS.promote]} /></div>
    </section>
    <section className="proof-appendix-section" aria-labelledby="proof-chain-title">
      <div className="eyebrow">CHAIN RECORD</div>
      <h3 id="proof-chain-title">Proof and interactive deployment</h3>
      <div className="chain-list"><article className="chain-record"><div><strong>Primary proof Governor</strong><small>Agent C · frozen lifecycle</small></div><div className="chain-address">{CANONICAL_DEMO.governor}</div><a href={`${CONFIG.addressExplorer}${CANONICAL_DEMO.governor}`} target="_blank" rel="noreferrer">explorer ↗</a></article><article className="chain-record"><div><strong>Interactive / post-fix Governor</strong><small>v4 actions and live writes</small></div><div className="chain-address">{CONFIG.governor}</div><a href={`${CONFIG.addressExplorer}${CONFIG.governor}`} target="_blank" rel="noreferrer">explorer ↗</a></article></div>
    </section>
    </details>
  </div>;
}

function AlreadyProvedSection({ live, lineage, capital, capitalValue, walletConnected, retryLiveReads }) {
  return <section id="proof" className="already-proved evidence-panel" aria-labelledby="already-proved-title">
    <div className="section-intro compact"><div className="eyebrow">01 / ALREADY PROVED</div><h2 id="already-proved-title">The proof is already on-chain.</h2><p className="scope-note">Read the canonical lifecycle without connecting a wallet. A wallet is only needed to submit a new action.</p></div>
    <HealthyBurstComparison live={live} />
    <PrimaryProofReceipts />
    <article className="proof-status-card">
      <div className="proof-status-heading"><div><div className="eyebrow">PRIMARY · CONSOLIDATED GOVERNOR</div><h3>Agent C · full halt / govern / lifeform loop</h3></div><a href={`${CONFIG.addressExplorer}${CANONICAL_DEMO.governor}`} target="_blank" rel="noreferrer">Open Governor {shortAddress(CANONICAL_DEMO.governor)} ↗</a></div>
      <code className="proof-governor">{shortAddress(CANONICAL_DEMO.governor)}</code>
      <div className="proof-status-grid" aria-label="Canonical proof status">
        <div><span>MANDATE</span><strong>v2 · active</strong><small>promoted on-chain</small></div>
        <div><span>LATEST RECORDED RULING</span><strong className="proof-off">OFF_MANDATE</strong><small>genuine v2 drain</small></div>
        <div><span>HALTED</span><strong>Yes</strong><small>after the final review</small></div>
        <div><span>LAST RECORDED CLAIM</span><strong className="proof-paid">PAID · 980</strong><small>covered drain path</small></div>
      </div>
      <p className="proof-status-context">Canonical proof: Agent C archive · Interactive Governor: Your Run.</p>
      <p className="proof-chain-note"><a href={`${CONFIG.addressExplorer}${CANONICAL_DEMO.governor}`} target="_blank" rel="noreferrer">Agent C archive {shortAddress(CANONICAL_DEMO.governor)}</a> · <a href="#actions" onClick={(event) => { event.preventDefault(); window.history.replaceState(null, "", "#actions"); window.dispatchEvent(new HashChangeEvent("hashchange")); }}>Open interactive Governor in Your Run →</a></p>
      <details className="proof-details"><summary>Evidence notes</summary><p>Agent C is pin-only; C1 is hash-locked. The vault is a Python twin, and the evidence is project-authored rather than third-party.</p></details>
    </article>
    <C1ProofAccessSection />
    <HaltRevertProofCard />
    <ProofAppendix live={live} lineage={lineage} retryLiveReads={retryLiveReads} />
    <div className="proof-receipts" aria-labelledby="proof-receipts-title">
      <div className="eyebrow" id="proof-receipts-title">CANONICAL RECEIPTS · FROZEN ARCHIVE</div>
      {ARCHIVE_PROOF_RECEIPTS.map((receipt) => <a className="proof-receipt" key={receipt.hash} href={`${CONFIG.explorer}${receipt.hash}`} target="_blank" rel="noreferrer"><div><strong>{receipt.label}</strong><span>{receipt.meaning}</span></div><code>{receipt.hash}</code><b aria-hidden="true">↗</b></a>)}
      <p className="scope-note">Frozen Agent C archive only. See <a href="#actions" onClick={(event) => { event.preventDefault(); window.history.replaceState(null, "", "#actions"); window.dispatchEvent(new HashChangeEvent("hashchange")); }}>#actions</a> for the interactive v4 evidence path.</p>
    </div>
    <VerificationStatus />
  </section>;
}

function VerificationStatus() {
  return <section className="verification-status product-status" aria-labelledby="product-status-title"><div className="eyebrow">VERIFICATION STATUS</div><h2 id="product-status-title">What is proven, pending, and untested.</h2><div className="product-status-grid"><div><h3>Bradbury-proven</h3><ul><li>OFF sets halt.</li><li>ON cannot clear halt.</li><li>Evidence conflict denies payout.</li><li>Promotion preserves the mandate prefix.</li><li>Full v4 Lifeform loop.</li><li>Halted spend reverts with <code>Vault is halted</code>.</li></ul></div><div><h3>Studio-verified; Bradbury pending</h3><ul><li><code>REVIEW_STALE</code> rejects stale large spends.</li></ul></div><div><h3>Direct-mode helper-logic verified; review-path and cross-contract EVM interaction unverified</h3><ul><li>Provider-feed <code>_payment_count</code>, <code>_record_feed_conflict</code>, and <code>_record_review_failure</code> helpers.</li></ul></div><div><h3>Implemented, lint-clean, manually audited; zero runtime verification</h3><ul><li>Provider-feed cross-contract EVM read and agreement path.</li></ul></div></div></section>;
}

function ReceiptLinks({ title, hashes }) {
  const list = (Array.isArray(hashes) ? hashes : [hashes]).filter(Boolean);
  return <div className="receipt-trail"><span>{title}</span><div>{list.map((hash) => <a key={hash} href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer">{hash}</a>)}</div></div>;
}

function LineageFallback({ onRetry }) {
  return <div className="lineage-fallback">
    <p className="reason">Live read unavailable — showing last recorded receipt (on-chain)</p>
    <div className="lineage-rail">
      <article className="version-card"><div className="version-label">v1 · promoted</div><p>Thin mandate — no empty-vault clause.</p><EvidenceTag>fixture</EvidenceTag></article>
      <div className="lineage-arrow" aria-hidden="true">→</div>
      <article className="version-card active-version"><div className="version-label">v2 · active</div><p>Clause appended after the paid claim.</p><EvidenceTag>fixture</EvidenceTag></article>
    </div>
    <div className="trigger"><span>CLAIM PAID</span><b>980 <EvidenceTag>fixture</EvidenceTag></b><span>CLAUSE APPENDED</span></div>
    <ReadState message="Live read unavailable — showing last recorded receipt (on-chain)" onRetry={onRetry} />
  </div>;
}

function HaltRevertProofCard() {
  return <article className="halt-revert-proof-card" aria-labelledby="halt-revert-proof-title">
    <div className="eyebrow">HALT PROOF · ALWAYS VISIBLE</div>
    <div className="halt-revert-proof-heading"><div><h3 id="halt-revert-proof-title">V4 halt-revert proof</h3><p>Recorded halted spend.</p></div><strong>REVERTED</strong></div>
    <div className="halt-revert-proof-grid"><div><span>EXECUTION</span><b>{HALT_REVERT_PROOF.execution}</b></div><div><span>REVERT REASON</span><b>{HALT_REVERT_PROOF.reason}</b></div><div><span>AGENT</span><code>{HALT_REVERT_PROOF.agent}</code></div><div><span>VAULT</span><code>{HALT_REVERT_PROOF.vault}</code></div></div>
    <p className="halt-revert-proof-governor">Governor <code>{shortAddress(HALT_REVERT_PROOF.governor)}</code></p>
    <a className="halt-revert-proof-hash" href={`${CONFIG.explorer}${HALT_REVERT_PROOF.hash}`} target="_blank" rel="noreferrer">{HALT_REVERT_PROOF.hash} ↗</a>
    <p className="halt-revert-proof-key-note">Only the enrolled agent key can spend; this receipt is that key hitting the halt.</p>
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
  const fallback = DEMO_FIXTURE_FALLBACKS[item.label];
  const fixtureMessage = item.live === false ? "Reference fixture · no live read attempted" : "Live read unavailable — showing last recorded receipt (on-chain)";
  if (!record || record.status === "loading" || record.status === "error") return <article className={`vault-card ${item.className}`} data-case={labelOverride} key={labelOverride}><div className="vault-kicker"><span>{labelOverride}</span><span>BRADBURY · 4221</span></div><h3>{item.note}</h3><div className={`verdict ${fallback.ruling === "ON_MANDATE" ? "on" : "off"}`}>{fallback.ruling}</div><p className="reason">{fixtureMessage}</p><div className="fields">{fallback.fields.map(([key, fieldValue]) => <div className="field" key={key}><span>{key}</span><strong>{fieldValue}</strong><EvidenceTag>fixture</EvidenceTag></div>)}</div><ReadState message={fixtureMessage} onRetry={item.live === false ? undefined : onRetry} /></article>;
  const fields = record.fields.map(([key, fieldValue]) => <div className={`field ${key === "payments" && String(fieldValue) !== "1" ? "diff" : ""}`} key={key}><span>{key}</span><strong>{String(fieldValue)}</strong><EvidenceTag>live read</EvidenceTag></div>);
  return <article className={`vault-card ${item.className}`} data-case={labelOverride} key={labelOverride}>
    <div className="vault-kicker"><span>{labelOverride}</span><span>BRADBURY · 4221</span></div>
    <h3>{item.note}</h3>
    <div className={`verdict ${record.ruling === "ON_MANDATE" ? "on" : "off"}`}>{record.ruling} <EvidenceTag>live · latest_verdict</EvidenceTag></div>
    <p className="reason">“{record.reason}” <EvidenceTag>live read</EvidenceTag></p>
    <div className="fields">{fields}</div>
    <details className="raw-state"><summary>View raw pinned state</summary><pre className="pinned">{record.pinned_state}</pre></details>
    <EvidenceTag>live agent_state + latest_verdict</EvidenceTag>{record.readAt && <small className="read-meta">Last checked {new Date(record.readAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small>}
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

function YourRunResult({ action, result, onRetryReview }) {
  const title = `YOUR ${action.toUpperCase()} RESULT`;
  const resultTitleId = `your-${action.toLowerCase()}-result-title`;
  if (!result) return <section className="read-status your-result action-result-empty" role="status" aria-labelledby={resultTitleId}><div className="section-intro compact"><div className="eyebrow" id={resultTitleId}>{title}</div></div><strong>No {action} result in this wallet session yet.</strong><span>A wallet is only needed to submit a new action; existing on-chain evidence remains available in the sidebar.</span></section>;
  return <section className={`your-result ${result.status === "pending" ? "result-pending" : "result-resolved"}`} aria-labelledby={resultTitleId}>
    <div className="section-intro compact"><div className="eyebrow" id={resultTitleId}>{title}</div></div>
    <div className="result-meta"><div><span>Target agent</span><strong>{result.targetAgent}</strong></div><div><span>{result.hash ? "Transaction" : "Result"}</span>{result.hash ? (result.localTest ? <strong>{result.hash} <EvidenceTag>local test only</EvidenceTag></strong> : <a href={`${CONFIG.explorer}${result.hash}`} target="_blank" rel="noreferrer">{result.hash}</a>) : <strong>NO TRANSACTION SUBMITTED</strong>}</div></div>
    <div className="result-status-grid"><div><span>Consensus</span><strong>{result.consensus}</strong></div><div><span>Execution</span><strong>{result.execution || "WAITING"}</strong></div></div>
    {result.outcomeMessage ? <div className={`read-status action-outcome ${result.action === "Spend" && result.execution === "FINISHED_WITH_ERROR" ? "halt-reverted" : ""}`} role="status"><strong>{result.outcomeTitle || `${result.action} response`}</strong><span>{result.outcomeMessage}</span></div> : result.action === "Review" && result.status === "resolved" && result.verdict ? <div className="judgment-result result-reveal"><div className={`verdict ${result.ruling === "ON_MANDATE" ? "on" : "off"}`}>{result.ruling} <EvidenceTag>resolved from this Review</EvidenceTag></div><p className="reason">“{result.reason}”</p><div className="fields">{result.fields.map(([key, value]) => <div className="field" key={key}><span>{key}</span><strong>{String(value)}</strong><EvidenceTag>state after Review</EvidenceTag></div>)}</div><pre className="pinned">{result.pinned_state}</pre></div> : <div className="read-status" role="status"><strong>{result.status === "pending" ? "Bradbury is reaching consensus…" : result.verdictError ? "Review resolved; verdict read needs a retry." : `${result.action} completed. This action does not produce a verdict.`}</strong><span>{result.status === "pending" ? "Keep this panel open. The hash above is the source of truth while the receipt is pending." : result.verdictError || "Only a completed Review produces the judgment shown here."}</span>{result.verdictError && onRetryReview ? <button type="button" onClick={onRetryReview}>Retry verdict read</button> : null}</div>}
  </section>;
}

function ActionPanel({ onResultChange, onReviewReadRetryReady }) {
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
  const [existingEnrollment, setExistingEnrollment] = useState({ status: "idle", vault: "", error: "" });
  const [vaultDeployment, setVaultDeployment] = useState({ status: "idle", address: "", hash: "", error: "" });
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

  useEffect(() => {
    let active = true;
    if (!connected) {
      setExistingEnrollment({ status: "idle", vault: "", error: "" });
      setEnrolledAgent(null);
      return () => { active = false; };
    }
    if (localTestWallet) {
      setExistingEnrollment({ status: "clear", vault: "", error: "" });
      return () => { active = false; };
    }
    setExistingEnrollment({ status: "checking", vault: "", error: "" });
    (async () => {
      try {
        const readClient = createClient({ chain: testnetBradbury });
        const existingVault = await readClient.readContract({ address: CONFIG.governor, functionName: "get_vault", args: addressArgs([connectedAddress]) });
        const validation = await validateVault(String(existingVault), connectedAddress, { quiet: true });
        if (!active) return;
        if (validation.ok) {
          setExistingEnrollment({ status: "valid", vault: String(existingVault), error: "" });
          setEnrolledAgent({ existing: true, vault: String(existingVault), agent: connectedAddress, governor: CONFIG.governor, mandate: "Existing Governor enrollment" });
          setEnrollForm((form) => ({ ...form, vault: String(existingVault) }));
        } else {
          setExistingEnrollment({ status: "invalid", vault: String(existingVault), error: "This wallet is enrolled, but its stored VaultTwin failed validation." });
          setEnrolledAgent(null);
        }
      } catch (error) {
        if (!active) return;
        console.info("No existing Governor enrollment returned for wallet", error);
        setExistingEnrollment({ status: "clear", vault: "", error: "" });
      }
    })();
    return () => { active = false; };
  }, [connected, connectedAddress, localTestWallet]);

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

  const enrollNewAgent = async (event) => {
    event.preventDefault();
    if (!requireWallet()) return;
    if (existingEnrollment.status === "checking") {
      setStatus("Enroll: checking whether this wallet is already enrolled…");
      return;
    }
    if (existingEnrollment.status === "valid") {
      setStatus(`Enroll: this wallet is already enrolled with VaultTwin ${existingEnrollment.vault}. Connect a fresh wallet to create another agent.`);
      return;
    }
    if (existingEnrollment.status === "invalid") {
      setStatus("Enroll: this wallet is already enrolled, but its stored VaultTwin is invalid. Connect a fresh wallet to test enrollment.");
      return;
    }
    const vault = enrollForm.vault.trim();
    const mandate = enrollForm.mandate.trim();
    const recordUrl = enrollForm.recordUrl.trim();
    const recordHash = enrollForm.recordHash.trim();
    const agent = connectedAddress;
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
    const vaultValidation = await validateVault(vault, agent);
    if (!vaultValidation.ok) return;
    await runWrite(
      "Enroll",
      "enroll",
      [agent, vault, mandate, [DECLARED_PROVIDER], 1800n, 1800n, recordUrl, recordHash],
      0n,
      agent,
      CONFIG.governor,
      { vault, mandate, recordUrl, recordHash },
      enrollArgs,
    );
  };

  const validateVault = async (vault, agent, { quiet = false } = {}) => {
    if (localTestWallet) return { ok: true };
    try {
      const provider = await connector.getProvider();
      if (!provider) throw new Error("Wallet provider unavailable.");
      const code = await provider.request({ method: "eth_getCode", params: [vault, "latest"] });
      if (!code || code === "0x") {
        if (!quiet) setStatus("Enroll: this is a wallet address, not a deployed VaultTwin. Deploy a VaultTwin with the current Governor first.");
        return { ok: false };
      }
      const readClient = createClient({ chain: testnetBradbury });
      const [state, attachedGovernor] = await Promise.all([
        readClient.readContract({ address: vault, functionName: "agent_state", args: [] }),
        readClient.readContract({ address: vault, functionName: "get_governor", args: [] }),
      ]);
      const vaultAgent = String(state?.agent || "");
      if (vaultAgent.toLowerCase() !== String(agent).toLowerCase()) {
        if (!quiet) setStatus(`Enroll: this VaultTwin's configured agent is ${vaultAgent}, not your connected wallet. Connect that wallet, or deploy a new VaultTwin with your current wallet as the agent.`);
        return { ok: false };
      }
      if (String(attachedGovernor).toLowerCase() !== CONFIG.governor.toLowerCase()) {
        if (!quiet) setStatus("Enroll: this VaultTwin is attached to a different Governor and may not behave as expected on this page. Use a VaultTwin deployed for the current Governor.");
        return { ok: false };
      }
      return { ok: true };
    } catch (error) {
      console.error("VaultTwin validation failed", error);
      if (!quiet) setStatus("Enroll: this address could not be verified as a VaultTwin for the current Governor.");
      return { ok: false };
    }
  };

  const createBradburyWriteClient = async () => {
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
    if (walletChainId !== expectedChainId) throw new Error(`Wallet is on chain ${Number.parseInt(walletChainId, 16)}; switch to GenLayer Bradbury (4221) and try again.`);
    const walletPendingNonce = await tracedProvider.request({ method: "eth_getTransactionCount", params: [walletClient.account.address, "pending"] });
    const client = createClient({ chain: testnetBradbury, account: walletClient.account.address, provider: tracedProvider });
    client.getCurrentNonce = async () => BigInt(walletPendingNonce);
    const balanceHex = await tracedProvider.request({ method: "eth_getBalance", params: [walletClient.account.address, "latest"] });
    if (BigInt(balanceHex) === 0n) throw new Error("Connected wallet has 0 GEN; fund this account before deploying a Bradbury VaultTwin.");
    return { client, provider: tracedProvider };
  };

  const finishVaultDeployment = async (hash, targetAgent) => {
    try {
      const readClient = createClient({ chain: testnetBradbury });
      const transaction = await readClient.getTransaction({ hash });
      const deployedAddress = transaction.txDataDecoded?.contractAddress || transaction.contractAddress || transaction.data?.contractAddress;
      if (!deployedAddress || !/^0x[0-9a-fA-F]{40}$/.test(String(deployedAddress))) throw new Error("Bradbury accepted the deployment, but did not return a readable VaultTwin address.");
      const vaultValidation = await validateVault(String(deployedAddress), targetAgent);
      if (!vaultValidation.ok) throw new Error("The deployed VaultTwin did not match the connected wallet and current Governor.");
      setVaultDeployment({ status: "ready", address: String(deployedAddress), hash, error: "" });
      setEnrollForm((form) => ({ ...form, vault: String(deployedAddress) }));
      setStatus("VaultTwin deployed and verified ✓ Add a mandate, then enroll it.");
    } catch (error) {
      console.error("VaultTwin deployment verification failed", error);
      setVaultDeployment({ status: "error", address: "", hash, error: describeReadError(error) });
      setStatus("VaultTwin deployment needs verification; no address was added to the enrollment form.");
    }
  };

  const deployVaultTwin = async () => {
    if (!requireWallet()) return;
    if (submitting || transactions.some((transaction) => transaction.pending) || uncertainSubmission) {
      setStatus("Finish the current transaction before deploying another VaultTwin.");
      return;
    }
    setSubmitting(true);
    setActiveAction("Deploy VaultTwin");
    setWriteFailure(null);
    setVaultDeployment({ status: "pending", address: "", hash: "", error: "" });
    setStatus("Deploy VaultTwin: preparing the constructor with balance 1000, your wallet, and the current Governor…");
    if (localTestWallet) {
      const hash = LOCAL_TEST_WALLET.hashes["Deploy VaultTwin"];
      const address = "0x0000000000000000000000000000000000000426";
      setTransactions((previous) => [{ label: "Deploy VaultTwin", hash, startedAt: Date.now(), pending: true, localTest: true }, ...previous]);
      setStatus("Deploy VaultTwin: local test simulation · waiting…");
      window.setTimeout(() => {
        setTransactions((previous) => previous.map((transaction) => transaction.hash === hash ? { ...transaction, pending: false, execution: "FINISHED_WITH_RETURN" } : transaction));
        setVaultDeployment({ status: "ready", address, hash, error: "" });
        setEnrollForm((form) => ({ ...form, vault: address }));
        setActiveAction(null);
        setSubmitting(false);
        setStatus("VaultTwin deployed and verified ✓ Add a mandate, then enroll it.");
      }, 1200);
      return;
    }
    try {
      const { client } = await createBradburyWriteClient();
      const args = [1000n, addressArg(connectedAddress), addressArg(CONFIG.governor)];
      const hash = await client.deployContract({ code: vaultTwinSource, args });
      const startedAt = Date.now();
      setTransactions((previous) => [{ label: "Deploy VaultTwin", hash, startedAt, pending: true }, ...previous]);
      onResultChange({ action: "Deploy VaultTwin", hash, targetAgent: connectedAddress, status: "pending", consensus: "Pending", execution: null });
      setStatus("VaultTwin submitted ✓ Waiting for Bradbury consensus…");
      pollReceipt(hash, "Deploy VaultTwin", startedAt, connectedAddress, CONFIG.governor);
    } catch (error) {
      console.error("VaultTwin deployment failed", error);
      const message = describeWriteError(error);
      setVaultDeployment({ status: "error", address: "", hash: "", error: message });
      setActiveAction(null);
      setStatus(`Deploy VaultTwin: ${message}`);
    } finally {
      setSubmitting(false);
    }
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
            setExistingEnrollment({ status: "valid", vault: meta?.vault || "", error: "" });
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

  const loadReviewResult = async (hash, label, targetAgent, targetContract, execution = "FINISHED_WITH_RETURN") => {
    setStatus("Review: reading the verdict from the reviewed agent…");
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
      onReviewReadRetryReady?.(() => null);
      setStatus("Review: resolved verdict loaded from the reviewed agent ✓");
    } catch (error) {
      console.error("Stele resolved Review read failed", error);
      onResultChange({ action: label, hash, targetAgent, status: "resolved", consensus: "Resolved", execution, verdictError: describeReadError(error) });
      setStatus("Review: transaction resolved, but the verdict read needs a retry.");
      onReviewReadRetryReady?.(() => () => loadReviewResult(hash, label, targetAgent, targetContract, execution));
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
          const numericStatus = Number(receipt.status);
          const statusName = receipt.status_name || receipt.statusName || ({ 0: "UNINITIALIZED", 1: "PENDING", 2: "PROPOSING", 3: "COMMITTING", 4: "REVEALING", 5: "ACCEPTED", 6: "UNDETERMINED", 7: "FINALIZED", 8: "CANCELED", 9: "APPEAL_REVEALING", 10: "APPEAL_COMMITTING", 11: "READY_TO_FINALIZE", 12: "VALIDATORS_TIMEOUT", 13: "LEADER_TIMEOUT" }[numericStatus]);
          const created = Number(receipt.timestamps?.Created || 0);
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
          const deploymentFinalized = label !== "Deploy VaultTwin" || statusName === "FINALIZED" || numericStatus === 7;
          if (label === "Deploy VaultTwin" && !deploymentFinalized) {
            setTransactions((previous) => previous.map((transaction) => transaction.hash === hash ? { ...transaction, phase: "finalization", execution } : transaction));
            setStatus(execution === "FINISHED_WITH_ERROR"
              ? "VaultTwin deployment reached a terminal execution error; waiting for final transaction status…"
              : "VaultTwin accepted ✓ Waiting for the finalization window before reading the deployed address…");
            window.setTimeout(poll, 10000);
            return;
          }
          setTransactions((previous) => previous.map((transaction) => transaction.hash === hash ? { ...transaction, pending: false, execution } : transaction));
          setActiveAction(null);
          if (label === "Review" && execution === "FINISHED_WITH_RETURN") {
            setStatus("Review: consensus resolved ✓ Reading the verdict from the reviewed agent…");
            await loadReviewResult(hash, label, targetAgent, targetContract, execution);
          } else if (label === "Deploy VaultTwin") {
            if (execution === "FINISHED_WITH_RETURN") {
              setStatus("VaultTwin: consensus resolved ✓ Reading the deployed address and constructor state…");
              await finishVaultDeployment(hash, targetAgent);
            } else {
              const errorText = receipt.revertReason || receipt.error || receipt.executionError || receipt.txExecutionError || "Deployment reverted before a VaultTwin was created.";
              setVaultDeployment({ status: "error", address: "", hash, error: errorText });
              setStatus("VaultTwin deployment reverted; no address was added to the enrollment form.");
              onResultChange({ action: label, hash, targetAgent, status: "resolved", consensus: "Resolved", execution, outcomeTitle: "VaultTwin deployment failed", outcomeMessage: errorText });
            }
          } else {
            const errorText = receipt.revertReason || receipt.error || receipt.executionError || receipt.txExecutionError || (label === "Spend" && execution === "FINISHED_WITH_ERROR" ? "Vault is halted" : null);
            if (label === "Enroll" && execution === "FINISHED_WITH_RETURN") {
              setEnrolledAgent({ ...meta, agent: targetAgent, governor: targetContract, hash });
      setStatus("Enroll: new agent enrolled on the primary Governor ✓");
            }
            onResultChange({ action: label, hash, targetAgent, status: "resolved", consensus: "Resolved", execution, ...(errorText ? { outcomeTitle: label === "Spend" ? "Spend rejected by halted vault" : `${label} execution error`, outcomeMessage: errorText } : {}) });
            if (label === "Enroll") {
              if (execution === "FINISHED_WITH_ERROR" && errorText?.toLowerCase().includes("already enrolled")) {
                setExistingEnrollment({ status: "valid", vault: "", error: "The wallet is already enrolled on this Governor." });
              }
              setStatus(execution === "FINISHED_WITH_ERROR"
                ? `Enroll: transaction accepted, but enrollment reverted${errorText ? ` — ${errorText}` : "."}`
                : `Enroll: ${execution} ✓`);
            } else {
              setStatus(execution === "FINISHED_WITH_ERROR" ? `${label}: transaction accepted · contract execution reverted.` : `${label}: ${execution} ✓`);
            }
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

  if (!connected) return <div className="write-panel"><p>Connect a wallet to enroll an agent or submit a fixture review.</p><ConnectButton /></div>;
  const hasPendingTransaction = transactions.some((transaction) => transaction.pending);
  const finalizingDeployment = transactions.some((transaction) => transaction.pending && transaction.label === "Deploy VaultTwin" && transaction.phase === "finalization");
  const reviewTargetAgent = enrolledAgent?.agent || INTERACTIVE_V4_AGENT;
  const reviewTargetGovernor = enrolledAgent?.governor || CONFIG.governor;
  return <div className="write-panel">
    {localTestWallet && <div className="local-test-banner">LOCAL TEST MODE · no wallet connection or blockchain transaction</div>}
    {!localTestWallet && <div className="advanced-live-test-note" role="note"><strong>Advanced live test · optional</strong><span>Submit your own Bradbury transactions with a connected wallet. Consensus finalization may take several minutes; use the prepared receipts above for an immediate demo.</span></div>}
    <div className="write-panel-head"><span>{localTestWallet ? "Test signer" : "Signer"}</span><span>{connectedAddress}</span></div>
    <div className="run-target"><strong>{enrolledAgent ? "Newly enrolled review agent" : INTERACTIVE_V4_AGENT ? "Prepared review agent" : "No review agent is enrolled"}</strong>{reviewTargetAgent && <span>{reviewTargetAgent}</span>}<small>Full address retained for verification.</small></div>
    {!localTestWallet && chain?.id !== bradbury.id && <button onClick={() => switchChain({ chainId: bradbury.id })}>Switch to Bradbury</button>}
    <div className="your-run-proof-banner">Writes target current v4 Governor <code>{shortAddress(CONFIG.governor)}</code>. The conflict preset uses C1 Governor <code>{shortAddress(C1_RECORD_EVIDENCE.burstConflict.governor)}</code>.</div>
    <div className="review-presets" aria-labelledby="review-presets-title">
      <div className="review-presets-heading"><strong id="review-presets-title">Quick review presets</strong><span>No manual agent address needed.</span></div>
      <div className="review-preset-grid">
        <button type="button" disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={() => runPresetReview("Review drain fixture", FIXTURES.drain.agent, CONFIG.governor)}><strong>Review drain fixture</strong><small>Prefilled · expected OFF_MANDATE</small></button>
        <button type="button" disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={() => runPresetReview("Review conflict fixture", C1_RECORD_EVIDENCE.burstConflict.agent, C1_RECORD_EVIDENCE.burstConflict.governor)}><strong>Review conflict fixture</strong><small>Prefilled · expected EVIDENCE_CONFLICT</small><span className="review-preset-note">C1 path · uses Governor {shortAddress(C1_RECORD_EVIDENCE.burstConflict.governor)}</span></button>
      </div>
      <p className="review-preset-note">Committee is voting — ~70s. This is normal, not stuck. Results appear in the Review result slot above.</p>
    </div>
    <section className="vault-deploy-panel" aria-labelledby="vault-deploy-title">
      <div className="review-presets-heading"><strong id="vault-deploy-title">Deploy your own VaultTwin</strong><span>Optional live test · current v4 Governor</span></div>
      <p>Use this when you want to submit a live test. The constructor is filled automatically with balance <code>1000</code>, your connected wallet as agent, and Governor <code>{shortAddress(CONFIG.governor)}</code>. After Bradbury accepts the deployment, finalization may take several minutes before the address can be verified and enrolled.</p>
      <button type="button" disabled={hasPendingTransaction || submitting || uncertainSubmission || vaultDeployment.status === "pending"} onClick={deployVaultTwin}>{activeAction === "Deploy VaultTwin" ? <><span className="action-spinner" /> {finalizingDeployment ? "Finalizing VaultTwin…" : "Deploying VaultTwin…"}</> : vaultDeployment.status === "ready" ? "Deploy another test VaultTwin" : "Deploy test VaultTwin"}</button>
      {existingEnrollment.status === "checking" && <span role="status">Checking whether this wallet is already enrolled on the current Governor…</span>}
      {existingEnrollment.status === "valid" && <div className="vault-deploy-warning" role="status"><strong>This wallet is already enrolled</strong><span>Existing VaultTwin: <code>{existingEnrollment.vault}</code></span><span>Use the existing agent for review, or connect a fresh wallet. Deploying another VaultTwin will not replace this enrollment.</span></div>}
      {existingEnrollment.status === "invalid" && <div className="vault-deploy-error" role="alert"><strong>This wallet is enrolled, but its stored VaultTwin is not usable</strong><span>Connect a fresh wallet to test a new enrollment. The existing record cannot be replaced.</span></div>}
      {vaultDeployment.status === "pending" && <span role="status">{finalizingDeployment ? "Deployment accepted; wait for Bradbury finalization before enrolling." : "Deployment submitted; wait for Bradbury consensus before enrolling."}</span>}
      {vaultDeployment.status === "ready" && <div className="vault-deploy-success" role="status"><strong>VaultTwin ready</strong><code>{vaultDeployment.address}</code><span>Agent and Governor were read back and match this page.</span></div>}
      {vaultDeployment.status === "error" && <div className="vault-deploy-error" role="alert"><strong>VaultTwin was not verified</strong><span>{vaultDeployment.error}</span></div>}
    </section>
    <form className="enroll-panel" onSubmit={enrollNewAgent}>
      <div className="review-presets-heading"><strong>Enroll a new agent</strong><span>Connected wallet becomes the agent · interactive v4 Governor</span></div>
      <div className="enroll-form-grid">
        <label>Deployed VaultTwin contract address<input value={enrollForm.vault} onChange={(event) => setEnrollForm((form) => ({ ...form, vault: event.target.value }))} placeholder="0x…" autoComplete="off" /><span>This is not your wallet address. It must be a VaultTwin deployed for the current Governor.</span></label>
        <label>Mandate text<textarea value={enrollForm.mandate} onChange={(event) => setEnrollForm((form) => ({ ...form, mandate: event.target.value }))} placeholder="Plain-language rule for this agent" rows="3" /></label>
        <label>Record URL <span>(optional)</span><input value={enrollForm.recordUrl} onChange={(event) => setEnrollForm((form) => ({ ...form, recordUrl: event.target.value }))} placeholder="https://…" inputMode="url" /></label>
        <label>Record hash <span>(optional)</span><input value={enrollForm.recordHash} onChange={(event) => setEnrollForm((form) => ({ ...form, recordHash: event.target.value }))} placeholder="SHA-256 hex" autoComplete="off" /></label>
      </div>
      <p className="enroll-demo-note">Demo defaults: fixed provider list and 1800s windows.</p>
       <p className="enroll-governor">Current v4 Governor <code>{shortAddress(CONFIG.governor)}</code> · declared provider <code>{DECLARED_PROVIDER}</code> · default halt/claim windows 1800s</p>
      <button type="submit" disabled={hasPendingTransaction || submitting || uncertainSubmission}>{activeAction === "Enroll" ? <><span className="action-spinner" /> Enroll · waiting…</> : "Enroll and sign transaction"}</button>
      {enrolledAgent && <div className="enrolled-agent-card"><div><strong>{enrolledAgent.existing ? "Existing agent loaded" : "Agent enrolled · not yet reviewed"}</strong><span>{enrolledAgent.agent}</span></div><p>{enrolledAgent.existing ? "This wallet is already enrolled on the current Governor." : enrolledAgent.mandate}</p><small>Governor {enrolledAgent.governor} · Vault {enrolledAgent.vault}</small>{enrolledAgent.recordUrl && <small>Record {enrolledAgent.recordUrl} · hash {enrolledAgent.recordHash}</small>}</div>}
    </form>
    <p className={`action-sequence${uncertainSubmission ? " uncertain" : ""}`}><span className="sequence-dot" /> {uncertainSubmission ? `${uncertainSubmission.label}: submission status is uncertain · verify wallet activity before retrying.` : "One action at a time · waiting for Bradbury consensus before the next action."}</p>
    <div className="write-actions">
      <button className={activeAction === "Review" ? "is-active" : activeAction || uncertainSubmission || !reviewTargetAgent ? "is-locked" : ""} aria-busy={activeAction === "Review" ? "true" : undefined} disabled={hasPendingTransaction || submitting || uncertainSubmission || !reviewTargetAgent} onClick={() => reviewTargetAgent && runWrite("Review", "review", [reviewTargetAgent], 0n, reviewTargetAgent, reviewTargetGovernor)}>{activeAction === "Review" ? <><span className="action-spinner" /> validators judging · typically 60–90s</> : !reviewTargetAgent ? "1. Review · no agent enrolled" : enrolledAgent ? "1. Review this enrolled agent" : activeAction || uncertainSubmission ? "1. Review · locked" : "1. Run review"}</button>
    </div>
    <p className="review-target-note">Review agent <code>{reviewTargetAgent}</code> · current v4 Governor <code>{shortAddress(reviewTargetGovernor)}</code>.</p>
    {haltedSpend && <div className="halted-spend-demo"><div><strong>Vault halted by the OFF_MANDATE review.</strong><span>Attempt the same declared-provider spend; VaultTwin should reject it before money moves.</span><small>Only the enrolled agent key can spend; this receipt is that key hitting the halt.</small></div><button type="button" disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={spendWhileHalted}>Attempt spend on halted vault</button></div>}
    {uncertainSubmission && <button className="retry-after-check" onClick={() => { setUncertainSubmission(null); setStatus(`${uncertainSubmission.label}: retry enabled after wallet/explorer verification.`); }}>I verified no transaction — enable retry</button>}
    <p className={`write-status${activeAction ? " is-waiting" : ""}`} role="status">{status || "Writes use genlayer-js; reviews typically take 18–114 seconds (median 73)."}</p>
    {writeFailure && <details className="write-diagnostic"><summary>Why {writeFailure.label} stopped · {writeFailure.category}</summary><p><strong>{writeFailure.guidance}</strong></p><p>Transaction hash returned: <strong>{writeFailure.hashReturned ? "yes" : "no"}</strong></p><pre>{writeFailure.details}</pre></details>}
    {transactions.map(({ label, hash, startedAt, pending, execution, phase, localTest }) => <div className="tx-hash" key={hash}>
      <span>{label}</span>
      {localTest ? <strong>{hash} <EvidenceTag>local test only</EvidenceTag></strong> : <a href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer">{hash}</a>}
      <small>{pending ? `${phase === "finalization" ? "Accepted ✓ · Waiting for Bradbury finalization" : "Submitted ✓ · Waiting for Bradbury consensus"}… ${Math.floor((now - startedAt) / 1000)}s` : `${execution} ${execution === "FINISHED_WITH_ERROR" ? "✕" : "✓"}`}</small>
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
  const [reviewReadRetry, setReviewReadRetry] = useState(null);
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
          if (fixture.live === false) return { status: "error", error: "Historical fixture only" };
          const fixtureGovernor = fixture.governor || CONFIG.governor;
          const vault = await client.readContract({ address: fixtureGovernor, functionName: "get_vault", args: addressArgs([fixture.agent]) });
          const [state, verdict] = await Promise.all([
            client.readContract({ address: vault, functionName: "agent_state", args: [] }),
            client.readContract({ address: fixtureGovernor, functionName: "latest_verdict", args: addressArgs([fixture.agent]) }),
          ]);
          return { status: "ready", readAt: Date.now(), ...liveFixtureRecord(state, verdict) };
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
          setReadStatus(yourSharesError ? "Global Bradbury reads succeeded; your wallet LP-share read is unavailable." : "Live Bradbury reads succeeded from the primary Governor.");
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
    <div className="product-cta wrap"><span>Proof is live on Bradbury · no wallet needed to inspect it.</span><a href="#actions" onClick={(event) => { event.preventDefault(); selectProductSection("actions"); }}>Run an action →</a></div>
    <div className="product-wedges wrap" data-copy-version="stele-only" aria-label="Stele mechanism"><p>A governor cuts an agent&apos;s vault when behaviour leaves a written mandate. If that cut cost money, the pool pays and the mandate grows a clause. No vote.</p></div>
    <div className="product-layout wrap">
      <aside className="product-sidebar" aria-label="Evidence sections">
        <nav>{productSections.map(([id, label, detail, zone], index) => <React.Fragment key={id}>{(index === 0 || productSections[index - 1][3] !== zone) && <div className="zone-divider">{zone}</div>}<button className={`${activeProductSection === id ? "active" : ""} ${id === "cover" || id === "capital" ? "secondary-section" : ""}`} aria-current={activeProductSection === id ? "page" : undefined} onClick={() => selectProductSection(id)}><span>{label}</span><small>{detail}</small></button></React.Fragment>)}</nav>
      </aside>
      <div className="product-main">
        {activeProductSection === "proof" && <AlreadyProvedSection live={live} lineage={lineage} capital={capital} capitalValue={capitalValue} walletConnected={walletConnected} retryLiveReads={retryLiveReads} />}
         {activeProductSection === "actions" && <section id="actions" className="actions evidence-panel" aria-labelledby="actions-title"><div className="section-intro compact"><div className="eyebrow">02 / YOUR RUN</div><h2 id="actions-title">Try the circuit breaker.</h2><p className="scope-note">Writes target Governor <code>{shortAddress(CONFIG.governor)}</code>. Archived proof: <strong>Already Proved</strong> on <code>{shortAddress(CANONICAL_DEMO.governor)}</code>.</p></div><ActionPanel onResultChange={(result) => setYourRun((previous) => ({ ...previous, [result.action]: result }))} onReviewReadRetryReady={setReviewReadRetry} /><div className="your-run-results" aria-label="Your action results">{yourRun.Enroll && <YourRunResult action="Enroll" result={yourRun.Enroll} />}{yourRun.Review && <YourRunResult action="Review" result={yourRun.Review} onRetryReview={reviewReadRetry} />}{yourRun.Spend && <YourRunResult action="Spend" result={yourRun.Spend} />}</div></section>}
        {activeProductSection === "lineage" && <section className="lineage evidence-panel" aria-labelledby="lineage-title"><div className="section-intro compact"><div className="eyebrow">02 / LINEAGE</div><p className="scope-note">Configured demo agent mandate history — not your wallet.</p></div>{lineage.status === "ready" ? <><div className="lineage-rail"><article className="version-card"><div className="version-label">v1 · {lineage.versionOne.status} <EvidenceTag>live · get_mandate_version</EvidenceTag></div><p>{lineage.versionOne.text}</p></article><div className="lineage-arrow" aria-hidden="true">→</div><article className="version-card active-version"><div className="version-label">v2 · {lineage.versionTwo.status} <EvidenceTag>live · get_mandate_version</EvidenceTag></div><p>{renderMandateText(lineage.versionOne.text, lineage.versionTwo.text)}</p></article></div><div className="trigger"><span>CLAIM {lineage.claim.status}</span><b>{String(lineage.claim.payout)} against {String(lineage.claim.loss)} loss <EvidenceTag>live · get_last_claim</EvidenceTag></b><span>CLAUSE APPENDED</span></div></> : <ReadState message={lineage.status === "loading" ? "Loading live mandate and claim reads…" : `Live lineage read failed — ${lineage.error}`} onRetry={retryLiveReads} />}</section>}
        {activeProductSection === "cover" && <section className="cover evidence-panel" aria-labelledby="cover-title"><div className="section-intro compact"><div className="eyebrow">03 / COVER</div><p className="scope-note">Global protocol state for the configured demo agent.</p></div><div className="cover-grid"><div><span>POOL</span><strong>{capitalValue("pool")}</strong><small>claims pool · live read</small></div><div><span>BOND</span><strong>{capitalValue("bond")}</strong><small>loss cover before payout</small></div><div><span>LAST CLAIM</span><strong>{claimValue ? `${String(claimValue.payout)} / ${String(claimValue.loss)}` : capital.status === "ready" ? "No claim record" : capitalValue("lastClaim")}</strong><small>payout / loss · live read</small></div></div></section>}
        {activeProductSection === "capital" && <section className="capital evidence-panel" aria-labelledby="capital-title"><div className="section-intro compact"><div className="eyebrow">04 / CAPITAL AND YIELD</div><p className="scope-note">Global protocol totals plus the connected wallet’s own LP shares.</p></div><div className="pricing-grid capital-grid"><div><span>LP POOL · GLOBAL</span><strong>{capitalValue("lpPool")}</strong></div><div><span>TOTAL LP SHARES · GLOBAL</span><strong>{capitalValue("totalShares")}</strong></div><div><span>YOUR SHARES · WALLET</span><strong>{walletConnected ? capitalValue("yourShares") : "Connect wallet"}</strong></div></div></section>}
        {activeProductSection === "chain" && <section className="chain evidence-panel" aria-labelledby="chain-title"><div className="section-intro compact"><div className="eyebrow">05 / CHAIN RECORD</div><p className="scope-note">Primary frozen proof plus the latest interactive / post-fix v4 deployment.</p></div><div className="chain-list"><article className="chain-record"><div><strong>Primary proof Governor</strong><small>Agent C · full halt / govern / lifeform loop</small></div><div><small>GenLayer Bradbury · chain 4221</small></div><div className="chain-address">{CANONICAL_DEMO.governor}</div><a href={`${CONFIG.addressExplorer}${CANONICAL_DEMO.governor}`} target="_blank" rel="noreferrer">explorer ↗</a></article><article className="chain-record"><div><strong>Interactive / post-fix Governor · v4</strong><small>v3 sticky halt plus access-controlled upgrades, enrollment guard, evidence-conflict safety, trace-based promotion</small></div><div><small>GenLayer Bradbury · chain 4221</small></div><div className="chain-address">{CONFIG.governor}</div><a href={`${CONFIG.addressExplorer}${CONFIG.governor}`} target="_blank" rel="noreferrer">explorer ↗</a></article></div><div className="read-status" role="status"><strong>{readStatus}</strong></div></section>}
        {activeProductSection === "evidence-record" && <EvidenceRecordSection />}
        {activeProductSection === "secondary" && <div className="evidence-panel"><section className="context" aria-labelledby="context-title"><div className="section-intro compact"><div className="eyebrow">07 / SECONDARY EVIDENCE · ALLOWLIST</div><p className="scope-note">Fixed example evidence — not your wallet.</p></div><div className="context-card">{renderCase(FIXTURES.strangers, live.fixtures.strangers, retryLiveReads, "STRANGERS VAULT")}</div></section></div>}
        {activeProductSection === "demo" && <section className="demo-fixtures evidence-panel" aria-labelledby="demo-title"><div className="section-intro compact"><div className="eyebrow">08 / DEMO FIXTURES</div><p className="scope-note">Fixed example agents — not your wallet.</p></div><div className="read-status" role="note"><strong>Healthy, Burst, Drain, and Strangers are fixed examples.</strong><span>These cards attempt a live read; if Bradbury doesn&apos;t respond, known fixture values are shown instead, labeled as such.</span></div><section className="contrast" aria-labelledby="contrast-title"><div className="comparison-grid">{renderCase(FIXTURES.healthy, live.fixtures.healthy, retryLiveReads)}{renderCase(FIXTURES.burst, live.fixtures.burst, retryLiveReads)}{renderCase({ ...FIXTURES.drain, className: "healthy" }, live.fixtures.drain, retryLiveReads, "DRAIN FIXTURE")}{renderCase(FIXTURES.strangers, live.fixtures.strangers, retryLiveReads, "STRANGERS VAULT")}</div></section></section>}
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
       <aside className="docs-nav"><a href="#status">Status</a><a href="#judgment">Judgment</a><a href="#provider-feed">Provider feed</a><a href="#halt">Halt</a><a href="#lineage">Lineage</a><a href="#engineering">Engineering notes</a></aside>
      <article className="docs-content">
        <section id="status" className="verification-status"><div className="eyebrow">VERIFICATION STATUS</div><h2>What is proven, pending, and untested.</h2><h3>Bradbury-proven</h3><ul><li>OFF sets halt.</li><li>ON cannot clear halt.</li><li>Evidence conflict denies payout.</li><li>Promotion preserves the mandate prefix.</li><li>Full v4 Lifeform loop.</li><li>Halted spend reverts with <code>Vault is halted</code>.</li></ul><h3>Studio-verified; Bradbury pending</h3><ul><li><code>REVIEW_STALE</code> rejects stale large spends.</li></ul><h3>Direct-mode helper-logic verified; review-path and cross-contract EVM interaction unverified</h3><ul><li>Provider-feed <code>_payment_count</code>, <code>_record_feed_conflict</code>, and <code>_record_review_failure</code> helpers.</li></ul><h3>Implemented, lint-clean, manually audited; zero runtime verification</h3><ul><li>Provider-feed cross-contract EVM read and agreement path.</li></ul></section>
        <section id="judgment"><div className="eyebrow">01 / JUDGMENT</div><h2>Behavior is judged from pinned state and a hash-locked record.</h2><p>The current C1 review uses two stages. First, the Governor reads and pins the VaultTwin state. For C1-enrolled agents it then fetches the enrolled record, verifies its hash, parses it with <code>strict_eq</code>, and compares the record to the pin before branching to the mandate judgment. A mismatch produces the distinct <code>EVIDENCE_CONFLICT</code> ruling.</p><pre>pin vault state → fetch record → hash check → strict_eq → compare → judgment or EVIDENCE_CONFLICT</pre><p>Agent C is pin-only; C1 is hash-locked. Canonical proof is Agent C.</p><p>The consolidated Agent C demonstration on Governor <code>0x8fb0b2648BF73D292EB1CD7736F6f6624Db9F172</code> proves the pin-only lifecycle path. Agent C has no enrolled record, so <code>RECORD_STATUS=UNAVAILABLE</code> is expected there. When C1 evidence conflicts, <code>claim()</code> rejects payout as <code>DENIED_EVIDENCE_CONFLICT</code>.</p></section>
         <section id="provider-feed"><div className="eyebrow">02 / PROVIDER FEED</div><h2>Feed checks add a governor-fetched evidence source.</h2><p>An agent enrolled via <code>enroll_with_feed</code> stores a <code>ProviderInvoiceFeed</code> address in <code>feed_of</code>. During <code>review(agent)</code>, the vault state is pinned first, then the sealed feed is read. An unavailable or unsealed feed produces <code>REVIEW_FAILED</code> and halts. An exact payment-count mismatch produces <code>EVIDENCE_CONFLICT</code> and halts. If the feed agrees, review continues to the existing C1 record and mandate evaluation.</p><p>Agents enrolled via <code>enroll</code>, <code>enroll_one</code>, or <code>enroll_covered</code> have no feed configured and are unaffected. The current feed is project-controlled, so it demonstrates cross-contract retrieval rather than independent third-party evidence.</p></section>
         <section id="halt"><div className="eyebrow">03 / HALT</div><h2>An OFF ruling changes what the vault can do next.</h2><p>When a review returns OFF_MANDATE, the Governor sets a halt and expiry. VaultTwin checks <code>is_halted(agent)</code> before spending and rejects the payment while the halt is active. Halt is set by an off-mandate or evidence-conflict ruling. It is not cleared by a later ON_MANDATE review. It ends when the enrolled halt window expires.</p><pre>{`function spend(address destination, uint256 amount) external {\n  require(msg.sender == agent, "Only the agent can spend");\n  require(!governor.is_halted(agent));\n  _transfer(destination, amount);\n}`}</pre><p>Halt expiry uses consensus time, not wall-clock time. The window must cover queue delay and review latency, so Bradbury uses a long protection window.</p></section>
        <section id="cover"><div className="eyebrow">04 / COVER</div><h2>A paid loss creates the evidence for a narrower rule.</h2><p>The thin mandate can allow a drain. If the pre-drain review was ON and the later balance falls, <code>claim()</code> pays <code>min(loss, bond, pool)</code> within the claim window. It stores the pre-drain ON trace and the post-loss trace separately.</p><p>A failed <code>get_governor</code> read is not treated as detachment. A permitted activity pattern is not silently reclassified as a thin-mandate denial.</p></section>
        <section id="capital"><div className="eyebrow">05 / CAPITAL</div><h2>Premium yield is separate from claims risk in this version.</h2><p><code>enroll_covered</code> splits premium 70/30 between the claims pool and LP pool. Deposits mint LP shares and withdrawals pay proportional LP pool value including yield. LPs do not back claims directly yet; the claims pool remains the paying pool.</p></section>
        <section id="lineage"><div className="eyebrow">06 / LINEAGE</div><h2>The original mandate remains visible inside the next version.</h2><p><code>propose_mandate</code> reads a paid claim and asks for a behavioral clause describing the missing pattern. The proposal must preserve the parent text as an exact prefix and starts as a dead branch.</p><p><code>promote_mandate</code> scores stored traces: the post-loss trace must become OFF, the pre-drain trace must remain ON, and any stored burst or strangers cases must keep their original rulings. Failed candidates remain stored and inactive. The enrollment envelope cannot widen providers, raise limits, or clear halts.</p></section>
        <section id="engineering"><div className="eyebrow">ENGINEERING NOTES</div><h2>What the receipts mean.</h2><p className="docs-related-links">Related notes: <a href="#cover">Cover</a> · <a href="#capital">Capital &amp; Yield</a></p><ul><li>Evidence stays in deterministic vault state. The canonical destination list is sorted before pinning.</li><li><code>prompt_non_comparative</code> receives a pinned callable, with JSON shape enforced by criteria and a bounded parse retry. Failed parsing stores raw output, marks <code>REVIEW_FAILED</code>, and halts for safety.</li><li>ACCEPTED is the terminal runner state on Bradbury. FINALIZED does not advance reliably, so receipt checks use ACCEPTED plus <code>FINISHED_WITH_RETURN</code>.</li><li>NOT_VOTED is distinct from DETERMINISTIC_VIOLATION and timeout behavior. A first receipt with no votes is repolled before it is recorded as final.</li><li>Consensus-time windows must include queue delay plus review latency. This is why the halt and claim windows are sized conservatively.</li><li>CLI address arguments use <code>addr#</code>, not <code>address#</code>.</li><li>Resolved enrollment finding: the CLI's Address-vs-string encoding was inconsistent across <code>enroll</code>'s provider array, agent address, and halt-window parameters. Direct <code>genlayer-js</code> encoding succeeded with receipt <code>0x1a4846a0…</code>; product-page writes use that direct SDK path.</li><li>Writes use genlayer-js with the connected wallet provider. Reads remain wallet-free, and reviews typically take about 73 seconds.</li><li>Provider-feed feature status: implemented and lint-clean, but not runtime-confirmed. Local testing is blocked by an apparent <code>genlayer-test 0.29.2</code> / <code>genlayer-py 0.16.3</code> schema mismatch in the JSON-RPC <code>web</code> module (<code>missing field session_create_request</code>); no Bradbury deployment was attempted for this feature.</li></ul></section>
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
        <p className="hero-lede">A governor cuts an agent&apos;s vault when behaviour leaves a written mandate. If that cut cost money, the pool pays and the mandate grows a clause. No vote.</p>
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
