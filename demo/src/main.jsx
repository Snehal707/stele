import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { RainbowKitProvider, ConnectButton, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { createClient } from "genlayer-js";
import { CalldataAddress } from "../../node_modules/genlayer-js/dist/chunk-EY35NPSE.js";
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
  governor: "0xE45a615c076950B5ee3E5265e366945d7e148875",
  explorer: "https://explorer-bradbury.genlayer.com/tx/",
  addressExplorer: "https://explorer-bradbury.genlayer.com/address/",
  rewriteAgent: "0x434f6b35ccde8c02f07d9693958f4890d2954f41",
};

const MANDATE_V1 = "This agent pays recurring infrastructure invoices to a small set of declared providers. Invoices arrive a few times a month in modest amounts. It never pays a provider dozens of times in a short window, and never sends an amount that empties the vault in a single payment.";
const MANDATE_V2 = `${MANDATE_V1} Never sends an amount that empties the vault in a single payment.`;

function addressArg(address) {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid GenLayer address argument: ${address}`);
  }
  return new CalldataAddress(Uint8Array.from(address.slice(2).match(/../g).map((byte) => parseInt(byte, 16))));
}

function addressArgs(args) {
  return args.map((value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? addressArg(value) : value);
}

const RECEIPTS = {
  judgmentHealthy: [
    "0xc31174f27ab6a75f94e6365ef68f2bb0ce85d9687882153fdba56fdcd7555d7f",
    "0x0aecfa062be0365ee670e12f5cf751cd6ed09b57f6fc632aa1addb11a1702ffb",
    "0x56321e57bab4f78bc3f08cc1dea2a4ec39d912115e1b2f68593952e331e1d75f",
  ],
  judgmentBurst: [
    "0xaa15c56391fb863e276594e0df45ea54f53504dc99d3957ef54cfeb215a56441",
    "0x8dd4461976177259964a312df713b6e139af99ccb485c479b993c3474df21596",
    "0xd445ecbffd8e8e60265d62db026130ae4a7dc792afbfac0c4420096af96f2234",
  ],
  drainV1: "0x679a6178eeec580c333dc03a2b228496c251157708db6459f7033ce01c3e8aed",
  drainV2: "0xb36246f9f593220869b42fe724f4179cddce0e5f870ce173a9f193ab69c37bde",
  drainSuite: [
    "0xf635268f8d203140999be0ca014e6976d1a3a676acf12cfebf32900e83e9d31c",
    "0x8c922d57df1542d3dc23ec1a273b18822fdae96f2ec835ddab453d1bb8ef21ed",
    "0xa7f107cae48502a114c8d5d6b8c0ec203d43a6808b0baf924fe6ac46ec4392d3",
  ],
  claim: "0xec0ab688b3f7df37447483b0cb93e2464ba70c7394a519b57648d279225cb6bc",
  propose: "0x79ae8de3d617fb4db0f79f27be7906e9fd34e248f6a60d7f765a28830dfb95a2",
  promote: "0xde9dd5318ddfe85680d113d235e92a6525cc524f8837c62762fbed2b0dbff275",
  haltSeed: "0xcf42f4f500725d61faca7db088dfa549d1264836a516364677fb50be62045f48",
  haltReview: "0x682ecccc99261f3c2e32ee4bd8301759db545d03986e8045c623eb70932cb31e",
  haltSpendRejected: "0xcf580c5918ef5c2a522ca9428668afcd940debe4404a7be332aad671ab010a20",
  haltAdvance: "0x865891e8eeb45f0bd211e195a6fda84a0898b33b545fa85ae86ca2fdaddebb0f",
  haltSpendSuccess: "0x64af7688033ec67d7a4cae3775ea3dd390c58e12cd0266906bb024388e4174c8",
};

function ReceiptLinks({ title, hashes }) {
  const list = Array.isArray(hashes) ? hashes : [hashes];
  return <div className="receipt-trail"><span>{title}</span><div>{list.map((hash) => <a key={hash} href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer">{hash}</a>)}</div></div>;
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

const cases = {
  healthy: { label: "HEALTHY", className: "healthy", verdict: "ON_MANDATE", reason: "Both destinations are declared, each has only one modest payment, and no single payment emptied the vault.", fields: [["spend_total", "220"], ["balance", "780"], ["destination_count", "2"], ["payments", "1 each"], ["declared", "yes"]], pinned: "spend_total=220\ndestination_count=2\nbalance=780\ndestination 0x1111111111111111111111111111111111111111 | declared=yes | payments=1 | total=100\ndestination 0x2222222222222222222222222222222222222222 | declared=yes | payments=1 | total=120", note: "example invoice pattern" },
  burst: { label: "BURST", className: "burst", verdict: "OFF_MANDATE", reason: "The agent made 48 payments to a declared provider in a short window, which violates the mandate rule against paying a provider dozens of times in a short window.", fields: [["spend_total", "220"], ["balance", "780"], ["destination_count", "1"], ["payments", "48"], ["declared", "yes"]], pinned: "spend_total=220\ndestination_count=1\nbalance=780\ndestination 0x1111111111111111111111111111111111111111 | declared=yes | payments=48 | total=220", note: "48 payments · dozens in a short window" },
  drainOn: { label: "V1 / DRAIN", className: "healthy", verdict: "ON_MANDATE", reason: "The payment is to a declared provider and the mandate does not prohibit emptying the vault.", fields: [["spend_total", "20"], ["balance", "0"], ["destination_count", "1"], ["payments", "1"], ["declared", "yes"]], pinned: "spend_total=20\ndestination_count=1\nbalance=0\ndestination 0x1111111111111111111111111111111111111111 | declared=yes | payments=1 | total=20", note: "v1 accepts the declared drain" },
  drainOff: { label: "V2 / DRAIN", className: "drain-off", verdict: "OFF_MANDATE", reason: "The vault is empty after a single payment, which is not allowed according to the mandate.", fields: [["spend_total", "20"], ["balance", "0"], ["destination_count", "1"], ["payments", "1"], ["declared", "yes"]], pinned: "spend_total=20\ndestination_count=1\nbalance=0\ndestination 0x1111111111111111111111111111111111111111 | declared=yes | payments=1 | total=20", note: "the appended clause catches it" },
};

function renderCase(item, liveValue, provenance = "receipt-backed") {
  const value = liveValue || item;
  const fields = item.fields.map(([key, fieldValue]) => <div className={`field ${key === "payments" && fieldValue !== "1" ? "diff" : ""}`} key={key}><span>{key}</span><strong>{fieldValue}{!liveValue && <EvidenceTag />}</strong></div>);
  return <article className={`vault-card ${item.className}`} data-case={item.label} key={item.label}>
    <div className="vault-kicker"><span>{item.label}</span><span>BRADBURY · 4221</span></div>
    <h3>{item.note}</h3>
    <div className={`verdict ${value.ruling === "ON_MANDATE" ? "on" : "off"}`}>{value.ruling || item.verdict} <EvidenceTag>{provenance}</EvidenceTag></div>
    <p className="reason">“{value.reason || item.reason}” {!liveValue && <EvidenceTag />}</p>
    <div className="fields">{fields}</div>
    <pre className="pinned">{value.pinned_state || item.pinned}</pre>
    {!liveValue && <EvidenceTag>receipt-backed pinned state</EvidenceTag>}
  </article>;
}

function ActionPanel() {
  const { address, isConnected, chain, connector } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: bradbury.id });
  const { switchChain } = useSwitchChain();
  const [status, setStatus] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!transactions.some((transaction) => transaction.pending)) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [transactions]);

  const proposeMandate = async () => {
    if (!address || !walletClient || !connector) {
      setStatus("Propose: connect a wallet before submitting.");
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
        setStatus("Propose: requires a paid claim first.");
        return;
      }
      if (!claim || claim.status !== "PAID") {
        setStatus("Propose: requires a paid claim first.");
        return;
      }
      setStatus("Propose: paid-claim precondition passed; submitting…");
      await runWrite("Propose", "propose_mandate", [CONFIG.rewriteAgent]);
    } catch (error) {
      console.error("Stele propose preflight failed", error);
      setStatus(`Propose preflight failed: ${describeWriteError(error)}`);
    }
  };

  const fileClaim = async () => {
    if (!address || !walletClient || !connector) {
      setStatus("Claim: connect a wallet before submitting.");
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
          setStatus("Claim: already settled for this agent.");
          return;
        }
      } catch (error) {
        console.info("Stele claim preflight: no existing claim record", error);
      }
      await runWrite("Claim", "claim", [CONFIG.rewriteAgent]);
    } catch (error) {
      console.error("Stele claim preflight failed", error);
      setStatus(`Claim preflight failed: ${describeWriteError(error)}`);
    }
  };

  const runWrite = async (label, functionName, args, value = 0n) => {
    if (!address || !walletClient || !connector) {
      setStatus(`${label}: connect a wallet before submitting.`);
      return;
    }
    if (chain?.id !== bradbury.id) {
      switchChain({ chainId: bradbury.id });
      return;
    }
    setStatus(`${label}: submitting…`);
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
      const client = createClient({
        chain: testnetBradbury,
        account: walletClient.account.address,
        provider: tracedProvider,
      });
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
      const hash = await client.writeContract({ address: CONFIG.governor, functionName, args: addressArgs(args), value });
      const startedAt = Date.now();
      setTransactions((previous) => [{ label, hash, startedAt, pending: true }, ...previous]);
      setStatus(`${label}: submitted ✓ Waiting for Bradbury consensus…`);
      pollReceipt(hash, label, startedAt);
    } catch (error) {
      console.error("Stele write failed", error, {
        shortMessage: error?.shortMessage,
        details: error?.details,
        cause: error?.cause,
        code: error?.code,
        data: error?.data,
      });
      const message = describeWriteError(error);
      setStatus(message.includes("-32005") || message.toLowerCase().includes("capacity")
        ? `${label}: network at capacity; try again later.`
        : `${label}: ${message}`);
    }
  };

  const pollReceipt = (hash, label, startedAt) => {
    const poll = async () => {
      try {
        const response = await fetch(`https://rpc-bradbury.genlayer.com`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "gen_getTransactionReceipt", params: [{ txId: hash }] }) });
        const payload = await response.json();
        if (payload.result) {
          const execution = payload.result.txExecutionResultName || ({ 0: "NOT_VOTED", 1: "FINISHED_WITH_RETURN", 2: "FINISHED_WITH_ERROR" }[payload.result.txExecutionResult] || "receipt received");
          setTransactions((previous) => previous.map((transaction) => transaction.hash === hash ? { ...transaction, pending: false, execution } : transaction));
          setStatus(execution === "FINISHED_WITH_ERROR" ? `${label}: accepted, but contract execution failed.` : `${label}: ${execution} ✓`);
          return;
        }
      } catch { /* keep background polling quiet */ }
      window.setTimeout(poll, 5000);
    };
    window.setTimeout(poll, 5000);
  };

  if (!isConnected) return <div className="write-panel"><strong>Actions</strong><p>Connect a wallet to submit a review, claim, mandate proposal, or LP deposit.</p><ConnectButton /></div>;
  const hasPendingTransaction = transactions.some((transaction) => transaction.pending);
  return <div className="write-panel">
    <div className="write-panel-head"><strong>Connected actions</strong><span>{address}</span></div>
    {chain?.id !== bradbury.id && <button onClick={() => switchChain({ chainId: bradbury.id })}>Switch to Bradbury</button>}
    <div className="write-actions">
      <button disabled={hasPendingTransaction} onClick={() => runWrite("Review", "review", [CONFIG.rewriteAgent])}>Run review</button>
      <button disabled={hasPendingTransaction} onClick={fileClaim}>File claim</button>
      <button disabled={hasPendingTransaction} onClick={proposeMandate}>Propose mandate</button>
      <button disabled={hasPendingTransaction} onClick={() => runWrite("Deposit", "deposit", [], 1n)}>Deposit 1 GEN</button>
    </div>
    <p className="write-status" role="status">{status || "Writes use genlayer-js; reviews typically take 18–114 seconds (median 73)."}</p>
    {transactions.map(({ label, hash, startedAt, pending, execution }) => <div className="tx-hash" key={hash}>
      <span>{label}</span>
      <a href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer">{hash}</a>
      <small>{pending ? `Submitted ✓ · Waiting for Bradbury consensus… ${Math.floor((now - startedAt) / 1000)}s` : `${execution} ✓`}</small>
    </div>)}
  </div>;
}

function ProductPage() {
  const [live, setLive] = useState({});
  const [capital, setCapital] = useState({});
  const [readStatus, setReadStatus] = useState("Loading live Bradbury reads…");
  const { address, isConnected } = useAccount();
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = createClient({ chain: testnetBradbury });
        const verdict = await client.readContract({ address: CONFIG.governor, functionName: "latest_verdict", args: addressArgs([CONFIG.rewriteAgent]) });
        const matchesDrainFixture = verdict?.pinned_state === cases.drainOff.pinned;
        if (active && matchesDrainFixture) {
          setLive({ drain: verdict });
          setReadStatus("Live Bradbury verdict read succeeded for the current drain fixture.");
        } else if (active) {
          setReadStatus("A live verdict exists for a different pinned state; showing the receipt-backed drain evidence snapshot.");
        }
      } catch { if (active) setReadStatus("The consolidated Governor has no current verdict for the display agent; showing the receipt-backed evidence snapshot."); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = createClient({ chain: testnetBradbury });
        const read = (functionName, args, fallback = null) => client.readContract({ address: CONFIG.governor, functionName, args }).then((value) => ({ value, live: true })).catch(() => ({ value: fallback, live: false }));
        const [pool, lpPool, totalShares, bond, lastClaim, yourShares] = await Promise.all([
          read("get_pool", []),
          read("get_lp_pool", []),
          read("get_total_lp_shares", []),
          read("get_bond_of", addressArgs([CONFIG.rewriteAgent]), "1,000"),
          read("get_last_claim", addressArgs([CONFIG.rewriteAgent]), null),
          isConnected ? read("get_lp_shares", addressArgs([address]), "0") : Promise.resolve({ value: null, live: true }),
        ]);
        if (active) {
          setCapital({ pool, lpPool, totalShares, bond, lastClaim, yourShares });
          const allLive = [pool, lpPool, totalShares, bond, lastClaim, isConnected ? yourShares : { live: true }].every((entry) => entry?.live !== false);
          setReadStatus(allLive ? "Live Bradbury capital reads succeeded from the consolidated Governor." : "Some live reads were unavailable; receipt-backed values are marked individually.");
        }
      } catch {
        if (active) setReadStatus("Recorded economics remain visible; live capital reads are temporarily unavailable.");
      }
    })();
    return () => { active = false; };
  }, [address, isConnected]);

  const display = (entry, fallback) => entry?.value === undefined || entry?.value === null ? fallback : String(entry.value);
  const claimValue = capital.lastClaim?.value && typeof capital.lastClaim.value === "object" ? capital.lastClaim.value : null;
  const valueTag = (entry) => entry?.live === false ? <EvidenceTag /> : null;

  return <main>
    <header className="product-label wrap"><span>STELE / LIVE EVIDENCE · GENLAYER BRADBURY · CHAIN 4221</span><a href="/docs">Read the docs ↗</a></header>
    <div className="product-cta wrap"><a href="#actions">Try it live →</a><span>Connect a wallet to review, claim, propose, or deposit.</span></div>
    <section className="contrast wrap" aria-labelledby="contrast-title"><div className="section-intro compact"><div className="eyebrow">01 / JUDGMENT</div></div><div className="comparison-grid">{renderCase(cases.healthy, live.healthy)}{renderCase(cases.burst, live.burst)}</div><ReceiptLinks title="Historical Bradbury receipts · healthy" hashes={RECEIPTS.judgmentHealthy} /><ReceiptLinks title="Historical Bradbury receipts · burst" hashes={RECEIPTS.judgmentBurst} /></section>
    <section className="drain wrap" aria-labelledby="drain-title"><div className="section-intro compact"><div className="eyebrow">01 / JUDGMENT · DRAIN</div></div><div className="comparison-grid">{renderCase(cases.drainOn, null, "historical · v1 deployment record")}{renderCase(cases.drainOff, live.drain, live.drain ? "live · current v2 verdict" : "receipt-backed · current v2 snapshot")}</div><ReceiptLinks title="Historical Bradbury receipts · v1 drain" hashes={RECEIPTS.drainV1} /><ReceiptLinks title="Historical Bradbury receipts · v2 drain" hashes={RECEIPTS.drainV2} /><ReceiptLinks title="Consolidated drain suite" hashes={RECEIPTS.drainSuite} /></section>
    <section id="actions" className="actions wrap" aria-labelledby="actions-title"><div className="section-intro compact"><div className="eyebrow">02 / CONNECTED ACTIONS</div></div><ActionPanel /></section>
    <section className="halt wrap" aria-labelledby="halt-title"><div className="section-intro compact"><div className="eyebrow">02 / HALT</div></div><ReceiptLinks title="Bradbury halt sequence · seed, OFF review, rejected spend, expiry, successful spend" hashes={[RECEIPTS.haltSeed, RECEIPTS.haltReview, RECEIPTS.haltSpendRejected, RECEIPTS.haltAdvance, RECEIPTS.haltSpendSuccess]} /></section>
    <section className="lineage wrap" aria-labelledby="lineage-title"><div className="section-intro compact"><div className="eyebrow">03 / LINEAGE</div></div><div className="lineage-rail"><article className="version-card"><div className="version-label">v1 · superseded <EvidenceTag /></div><p>{MANDATE_V1}</p></article><div className="lineage-arrow" aria-hidden="true">→</div><article className="version-card active-version"><div className="version-label">v2 · active <EvidenceTag /></div><p>{MANDATE_V2}</p></article></div><div className="trigger"><span>CLAIM PAID</span><b>700 against 980 loss <EvidenceTag /></b><span>CLAUSE APPENDED</span></div><p className="consequence"><strong>ON_MANDATE under v1</strong> → <strong>OFF_MANDATE under v2</strong> <EvidenceTag /></p><ReceiptLinks title="Lineage receipts · claim, proposal, promotion" hashes={[RECEIPTS.claim, RECEIPTS.propose, RECEIPTS.promote]} /></section>
    <section className="cover wrap" aria-labelledby="cover-title"><div className="section-intro compact"><div className="eyebrow">04 / COVER</div></div><div className="cover-grid"><div><span>POOL</span><strong>{display(capital.pool, "700")} {valueTag(capital.pool)}</strong><small>claims pool · live read</small></div><div><span>BOND</span><strong>{display(capital.bond, "1,000")} {valueTag(capital.bond)}</strong><small>loss cover before payout</small></div><div><span>LAST CLAIM</span><strong>{claimValue ? `${display({ value: claimValue.payout, live: capital.lastClaim.live }, "700")} / ${display({ value: claimValue.loss, live: capital.lastClaim.live }, "980")}` : <>700 / 980 <EvidenceTag /></>}</strong><small>payout / loss · PAID</small></div></div></section>
    <section className="capital wrap" aria-labelledby="capital-title"><div className="section-intro compact"><div className="eyebrow">05 / CAPITAL AND YIELD</div></div><div className="pricing-grid capital-grid"><div><span>LP POOL</span><strong>{display(capital.lpPool, "1,800")} {valueTag(capital.lpPool)}</strong></div><div><span>TOTAL LP SHARES</span><strong>{display(capital.totalShares, "1,500")} {valueTag(capital.totalShares)}</strong></div><div><span>YOUR SHARES</span><strong>{isConnected ? <>{display(capital.yourShares, "0")} {valueTag(capital.yourShares)}</> : "Connect wallet"}</strong></div></div></section>
    <section className="chain wrap" aria-labelledby="chain-title"><div className="section-intro compact"><div className="eyebrow">06 / CHAIN RECORD</div></div><div className="chain-list"><article className="chain-record"><div><strong>Consolidated Governor</strong><small>judgment · halt · cover/lifeform · economics</small></div><div><small>GenLayer Bradbury · chain 4221</small></div><div className="chain-address">{CONFIG.governor}</div><a href={`${CONFIG.addressExplorer}${CONFIG.governor}`} target="_blank" rel="noreferrer">explorer ↗</a></article></div><div className="read-status" role="status"><strong>{readStatus}</strong></div></section>
    <section className="context wrap" aria-labelledby="context-title"><div className="section-intro compact"><div className="eyebrow">07 / SECONDARY EVIDENCE · ALLOWLIST</div></div><div className="context-card"><div className="context-verdict">OFF_MANDATE <EvidenceTag /></div><p>Strangers vault — same shape as the contrast above, undeclared destinations, caught by a simple allowlist.</p><pre>spend_total=220{"\n"}destination_count=2{"\n"}balance=780{"\n"}destination 0x3333333333333333333333333333333333333333 | declared=no | payments=1 | total=100{"\n"}destination 0x4444444444444444444444444444444444444444 | declared=no | payments=1 | total=120</pre><EvidenceTag>receipt-backed pinned state</EvidenceTag></div></section>
    <section className="pricing wrap" aria-labelledby="pricing-title"><div className="section-intro compact"><div className="eyebrow">08 / SECONDARY EVIDENCE · PRICING</div></div><div className="pricing-grid"><div><span>FILTERED EVENTS</span><strong>380</strong></div><div><span>MEDIAN LOSS</span><strong>$1.6M</strong></div><div><span>P95 LOSS</span><strong>$90.1M</strong></div><div><span>DEMO CAP</span><strong>$1.0M</strong></div><div><span>ILLUSTRATIVE PREMIUM</span><strong>250 bps</strong></div></div><p className="footnote">Source: <code>data/pricing.json</code>.</p></section>
    <footer className="wrap footer"><span>STELE</span><span>live evidence page · chain 4221</span></footer>
  </main>;
}

function DocsPage() {
  return <main className="docs-page">
    <nav className="docs-topbar wrap" aria-label="Primary navigation">
      <a className="brand-mark" href="/">STELE</a>
      <div className="docs-topbar-links"><a href="/product">Product</a><a className="active" href="/docs">Docs</a></div>
    </nav>
    <header className="docs-header wrap">
      <div><div className="eyebrow">STELE / DOCUMENTATION</div><h1>How the record becomes a response.</h1></div>
    </header>
    <div className="docs-layout wrap">
      <aside className="docs-nav"><a href="#judgment">Judgment</a><a href="#halt">Halt</a><a href="#cover">Cover</a><a href="#capital">Capital</a><a href="#lineage">Lineage</a><a href="#engineering">Engineering notes</a></aside>
      <article className="docs-content">
        <section id="judgment"><div className="eyebrow">01 / JUDGMENT</div><h2>Behavior is judged from pinned vault state.</h2><p>The Governor reads the VaultTwin in deterministic context, canonicalizes spend total, destination count, balance, payment counts, and destination totals, then pins that fixed string before asking validators for a ruling. The review does not fetch URLs or nest nondeterministic calls.</p><pre>vault state → canonical pinned string → validator ruling → stored verdict</pre><p>The healthy and burst fixtures keep the totals similar while changing the pattern. The point is to expose behavior that caps and allowlists cannot express by themselves.</p></section>
        <section id="halt"><div className="eyebrow">02 / HALT</div><h2>An OFF ruling changes what the vault can do next.</h2><p>When a review returns OFF_MANDATE, the Governor sets a halt and expiry. VaultTwin checks <code>is_halted(agent)</code> before spending and rejects the payment while the halt is active. An ON review clears the halt immediately.</p><p>Halt expiry uses consensus time, not wall-clock time. The window must cover queue delay and review latency, so Bradbury uses a long protection window.</p></section>
        <section id="cover"><div className="eyebrow">03 / COVER</div><h2>A paid loss creates the evidence for a narrower rule.</h2><p>The thin mandate can allow a drain. If the pre-drain review was ON and the later balance falls, <code>claim()</code> pays <code>min(loss, bond, pool)</code> within the claim window. It stores the pre-drain ON trace and the post-loss trace separately.</p><p>A failed <code>get_governor</code> read is not treated as detachment. A permitted activity pattern is not silently reclassified as a thin-mandate denial.</p></section>
        <section id="capital"><div className="eyebrow">04 / CAPITAL</div><h2>Premium yield is separate from claims risk in this version.</h2><p><code>enroll_covered</code> splits premium 70/30 between the claims pool and LP pool. Deposits mint LP shares and withdrawals pay proportional LP pool value including yield. LPs do not back claims directly yet; the claims pool remains the paying pool.</p></section>
        <section id="lineage"><div className="eyebrow">05 / LINEAGE</div><h2>The original mandate remains visible inside the next version.</h2><p><code>propose_mandate</code> reads a paid claim and asks for a behavioral clause describing the missing pattern. The proposal must preserve the parent text as an exact prefix and starts as a dead branch.</p><p><code>promote_mandate</code> scores stored traces: the post-loss trace must become OFF, the pre-drain trace must remain ON, and any stored burst or strangers cases must keep their original rulings. Failed candidates remain stored and inactive. The enrollment envelope cannot widen providers, raise limits, or clear halts.</p></section>
        <section id="engineering"><div className="eyebrow">ENGINEERING NOTES</div><h2>What the receipts mean.</h2><ul><li>Evidence stays in deterministic vault state. The canonical destination list is sorted before pinning.</li><li><code>prompt_non_comparative</code> receives a pinned callable, with JSON shape enforced by criteria and a bounded parse retry. Failed parsing stores raw output and does not halt.</li><li>ACCEPTED is the terminal runner state on Bradbury. FINALIZED does not advance reliably, so receipt checks use ACCEPTED plus <code>FINISHED_WITH_RETURN</code>.</li><li>NOT_VOTED is distinct from DETERMINISTIC_VIOLATION and timeout behavior. A first receipt with no votes is repolled before it is recorded as final.</li><li>Consensus-time windows must include queue delay plus review latency. This is why the halt and claim windows are sized conservatively.</li><li>CLI address arguments use <code>addr#</code>, not <code>address#</code>.</li><li>Writes use genlayer-js with the connected wallet provider. Reads remain wallet-free, and reviews typically take about 73 seconds.</li></ul></section>
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
        <h1>Rules for agents.<br /><em>Held in public.</em></h1>
        <p className="hero-lede">Stele gives an agent's payment behavior a visible rulebook, a funded response, and a record that can grow without rewriting history.</p>
        <div className="hero-actions"><a className="button button-dark" href="/product">Explore the live product ↗</a><a className="text-link" href="https://github.com/Snehal707/stele" target="_blank" rel="noreferrer">Read the repository</a></div>
      </div>
      <span className="image-caption">A public rule, made legible.</span>
    </section>
    <section id="why" className="landing-section wrap">
      <div className="landing-section-heading"><div className="eyebrow">THE PROBLEM</div><h2>The difficult part is not knowing there should be a circuit breaker.</h2><p>The difficult part is custody of the switch. Stele makes the judgment public, deterministic inputs visible, and the response executable.</p></div>
      <div className="landing-statements"><article><span>01</span><h3>See the shape</h3><p>Two vaults can have nearly identical totals and still deserve opposite verdicts.</p></article><article><span>02</span><h3>Hold the switch</h3><p>An OFF mandate can halt the next spend before the pattern compounds.</p></article><article><span>03</span><h3>Add to the law</h3><p>A paid loss can produce a narrower clause without erasing the original rule.</p></article></div>
    </section>
    <section id="mechanism" className="landing-mechanism">
      <div className="wrap mechanism-grid"><div><div className="eyebrow">THE MECHANISM</div><h2>From observed state to public consequence.</h2><p>Evidence stays in the vault state. The Governor pins that state, asks validators for a ruling, records the result, and can stop the next payment.</p><a className="button button-outline" href="/product">See the chain record ↗</a></div><div className="flow-card"><div className="flow-step"><b>01</b><span>Vault state</span><small>payments · destinations · balance</small></div><div className="flow-line" /><div className="flow-step"><b>02</b><span>Validator ruling</span><small>ON_MANDATE or OFF_MANDATE</small></div><div className="flow-line" /><div className="flow-step"><b>03</b><span>Recorded response</span><small>halt · claim · next clause</small></div></div></div>
    </section>
    <section className="landing-proof wrap"><div className="proof-top"><div className="eyebrow">LIVE ON GENLAYER BRADBURY</div><span>CHAIN 4221</span></div><div className="proof-row"><strong>0xE45a615c076950B5ee3E5265e366945d7e148875</strong><a href="/product">Open public record ↗</a></div></section>
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
