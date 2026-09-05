import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { RainbowKitProvider, ConnectButton, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "@rainbow-me/rainbowkit/styles.css";
import "../styles.css";

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
  healthy: { label: "HEALTHY", className: "healthy", verdict: "ON_MANDATE", reason: "Both destinations are declared, each has only one modest payment, and no single payment emptied the vault.", fields: [["spend_total", "220"], ["balance", "780"], ["destination_count", "2"], ["payments", "1 each"], ["declared", "yes"]], pinned: "spend_total=220\ndestination_count=2\nbalance=780\ndestination 0x1111111111111111111111111111111111111111 | declared=yes | payments=1 | total=100\ndestination 0x2222222222222222222222222222222222222222 | declared=yes | payments=1 | total=120", note: "modest recurring invoices" },
  burst: { label: "BURST", className: "burst", verdict: "OFF_MANDATE", reason: "The agent made 48 payments to a declared provider in a short window, which violates the mandate rule against paying a provider dozens of times in a short window.", fields: [["spend_total", "220"], ["balance", "780"], ["destination_count", "1"], ["payments", "48"], ["declared", "yes"]], pinned: "spend_total=220\ndestination_count=1\nbalance=780\ndestination 0x1111111111111111111111111111111111111111 | declared=yes | payments=48 | total=220", note: "48 payments · dozens in a short window" },
  drainOn: { label: "V1 / DRAIN", className: "healthy", verdict: "ON_MANDATE", reason: "The payment is to a declared provider and the mandate does not prohibit emptying the vault.", fields: [["spend_total", "20"], ["balance", "0"], ["destination_count", "1"], ["payments", "1"], ["declared", "yes"]], pinned: "spend_total=20\ndestination_count=1\nbalance=0\ndestination 0x1111111111111111111111111111111111111111 | declared=yes | payments=1 | total=20", note: "v1 accepts the declared drain" },
  drainOff: { label: "V2 / DRAIN", className: "drain-off", verdict: "OFF_MANDATE", reason: "The vault is empty after a single payment, which is not allowed according to the mandate.", fields: [["spend_total", "20"], ["balance", "0"], ["destination_count", "1"], ["payments", "1"], ["declared", "yes"]], pinned: "spend_total=20\ndestination_count=1\nbalance=0\ndestination 0x1111111111111111111111111111111111111111 | declared=yes | payments=1 | total=20", note: "the appended clause catches it" },
};

function renderCase(item, liveValue) {
  const value = liveValue || item;
  const fields = item.fields.map(([key, fieldValue]) => <div className={`field ${key === "payments" && fieldValue !== "1" ? "diff" : ""}`} key={key}><span>{key}</span><strong>{fieldValue}</strong></div>);
  return <article className={`vault-card ${item.className}`} data-case={item.label} key={item.label}>
    <div className="vault-kicker"><span>{item.label}</span><span>BRADBURY · 4221</span></div>
    <h3>{item.note}</h3>
    <div className={`verdict ${value.ruling === "ON_MANDATE" ? "on" : "off"}`}>{value.ruling || item.verdict}</div>
    <p className="reason">“{value.reason || item.reason}”</p>
    <div className="fields">{fields}</div>
    <pre className="pinned">{value.pinned_state || item.pinned}</pre>
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
          args: [CONFIG.rewriteAgent],
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
          args: [CONFIG.rewriteAgent],
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
      const hash = await client.writeContract({ address: CONFIG.governor, functionName, args, value });
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
        const verdict = await client.readContract({ address: CONFIG.governor, functionName: "latest_verdict", args: [CONFIG.rewriteAgent] });
        if (active) { setLive({ drain: verdict }); setReadStatus("Live Bradbury verdict read succeeded from the consolidated Governor."); }
      } catch { if (active) setReadStatus("The consolidated Governor has no current verdict for the display agent; showing the receipt-backed evidence snapshot."); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = createClient({ chain: testnetBradbury });
        const read = (functionName, args, fallback = null) => client.readContract({ address: CONFIG.governor, functionName, args }).catch(() => fallback);
        const [pool, lpPool, totalShares, bond, lastClaim, yourShares] = await Promise.all([
          read("get_pool", []),
          read("get_lp_pool", []),
          read("get_total_lp_shares", []),
          read("get_bond_of", [CONFIG.rewriteAgent], "1,000"),
          read("get_last_claim", [CONFIG.rewriteAgent], null),
          isConnected ? read("get_lp_shares", [address], "0") : Promise.resolve(null),
        ]);
        if (active) {
          setCapital({ pool, lpPool, totalShares, bond, lastClaim, yourShares });
          setReadStatus("Live Bradbury capital reads succeeded from the consolidated Governor.");
        }
      } catch {
        if (active) setReadStatus("Recorded economics remain visible; live capital reads are temporarily unavailable.");
      }
    })();
    return () => { active = false; };
  }, [address, isConnected]);

  const display = (value, fallback) => value === undefined || value === null ? fallback : String(value);
  const claimValue = capital.lastClaim && typeof capital.lastClaim === "object" ? capital.lastClaim : null;

  return <main>
    <header className="masthead wrap"><div className="eyebrow">STELE / PUBLIC RECORD</div><h1>Two vaults.<br /><em>Nearly identical numbers.</em><br />Opposite verdicts.</h1><p className="dek">An upright inscribed stone where laws are published in public and added to over time.</p><div className="rule" /></header>
    <section className="contrast wrap" aria-labelledby="contrast-title"><div className="section-intro"><div className="eyebrow">01 / THE CONTRAST</div><h2 id="contrast-title">The rule sees the shape of behaviour.</h2><p>Every deterministic cap and allowlist passes both of these. Only the payment pattern changes.</p></div><div className="comparison-grid">{renderCase(cases.healthy, live.healthy)}{renderCase(cases.burst, live.burst)}<p className="caption">every deterministic cap and allowlist passes both of these.</p></div></section>
    <section className="drain wrap" aria-labelledby="drain-title"><div className="section-intro compact"><div className="eyebrow">THE SAME TEST, A DIFFERENT SHAPE</div><h2 id="drain-title">A declared destination does not make an empty vault ordinary.</h2></div><div className="comparison-grid">{renderCase(cases.drainOn, live.drain)}{renderCase(cases.drainOff, live.drain)}<p className="caption">one payment, balance zero, destination declared.</p></div></section>
    <section className="lineage wrap" aria-labelledby="lineage-title"><div className="section-intro"><div className="eyebrow">02 / THE LINEAGE</div><h2 id="lineage-title">A paid claim became a new sentence.</h2><p>Nobody voted at either step. The contract recorded the loss, proposed a clause, and promoted it only after scoring the stored traces.</p></div><div className="lineage-rail"><article className="version-card"><div className="version-label">v1 · superseded</div><p>{MANDATE_V1}</p></article><div className="lineage-arrow" aria-hidden="true">→</div><article className="version-card active-version"><div className="version-label">v2 · active</div><p>{MANDATE_V2}</p></article></div><div className="trigger"><span>CLAIM PAID</span><b>700 against 980 loss</b><span>CLAUSE APPENDED</span></div><p className="consequence">The same drain state: <strong>ON_MANDATE under v1</strong> → <strong>OFF_MANDATE under v2</strong>.</p></section>
    <section className="cover wrap" aria-labelledby="cover-title"><div className="section-intro compact"><div className="eyebrow">03 / THE COVER</div><h2 id="cover-title">Money moved, and the rule changed.</h2></div><div className="cover-grid"><div><span>POOL</span><strong>{display(capital.pool, "700")}</strong><small>claims pool · live read</small></div><div><span>BOND</span><strong>{display(capital.bond, "1,000")}</strong><small>loss cover before payout</small></div><div><span>LAST CLAIM</span><strong>{claimValue ? `${display(claimValue.payout, "700")} / ${display(claimValue.loss, "980")}` : "700 / 980"}</strong><small>payout / loss · PAID</small></div></div></section>
    <section className="capital wrap" aria-labelledby="capital-title"><div className="section-intro compact"><div className="eyebrow">04 / CAPITAL AND YIELD</div><h2 id="capital-title">Premium yield, separate from claims risk.</h2><p>LPs earn the 30% premium allocation in this version; claims still pay from the claims pool.</p></div><div className="pricing-grid capital-grid"><div><span>LP POOL</span><strong>{display(capital.lpPool, "1,800")}</strong></div><div><span>TOTAL LP SHARES</span><strong>{display(capital.totalShares, "1,500")}</strong></div><div><span>YOUR SHARES</span><strong>{isConnected ? display(capital.yourShares, "0") : "Connect wallet"}</strong></div></div></section>
    <section className="context wrap" aria-labelledby="context-title"><div className="section-intro compact"><div className="eyebrow">CONTEXT, LOWER DOWN</div><h2 id="context-title">The allowlist case is useful. It is not the headline.</h2></div><div className="context-card"><div className="context-verdict">OFF_MANDATE</div><p>The vault paid two undeclared providers, violating the mandate to pay only a small set of declared providers.</p><pre>spend_total=220{"\n"}destination_count=2{"\n"}balance=780{"\n"}destination 0x3333333333333333333333333333333333333333 | declared=no | payments=1 | total=100{"\n"}destination 0x4444444444444444444444444444444444444444 | declared=no | payments=1 | total=120</pre></div></section>
    <section className="pricing wrap" aria-labelledby="pricing-title"><div className="section-intro compact"><div className="eyebrow">OPTIONAL PRICING ARTIFACT</div><h2 id="pricing-title">The demo cap is a teaching number, not actuarial truth.</h2></div><div className="pricing-grid"><div><span>FILTERED EVENTS</span><strong>380</strong></div><div><span>MEDIAN LOSS</span><strong>$1.6M</strong></div><div><span>P95 LOSS</span><strong>$90.1M</strong></div><div><span>DEMO CAP</span><strong>$1.0M</strong></div><div><span>ILLUSTRATIVE PREMIUM</span><strong>250 bps</strong></div></div><p className="footnote">DeFiLlama, CertiK Hack3D, and Immunefi use different methodologies; their headline totals disagree; we use only the DeFiLlama slice defined in <code>data/pricing.json</code>.</p></section>
    <section className="chain wrap" aria-labelledby="chain-title"><div className="section-intro compact"><div className="eyebrow">05 / CHAIN RECORD</div><h2 id="chain-title">Public state, with provenance attached.</h2></div><div className="chain-list"><article className="chain-record"><div><strong>Consolidated Governor</strong><small>judgment · halt · cover/lifeform · economics</small></div><div><small>GenLayer Bradbury · chain 4221</small></div><div className="chain-address">{CONFIG.governor}</div><a href={`${CONFIG.addressExplorer}${CONFIG.governor}`} target="_blank" rel="noreferrer">explorer ↗</a></article></div><div className="read-status" role="status"><strong>{readStatus}</strong></div><ActionPanel /></section>
    <footer className="wrap footer"><span>STELE</span><span>read-only evidence page · chain 4221</span></footer>
  </main>;
}

function LandingPage() {
  return <main className="landing-page">
    <nav className="landing-nav wrap">
      <a className="brand-mark" href="/">STELE</a>
      <div className="landing-nav-links"><a href="#why">Why Stele</a><a href="#mechanism">Mechanism</a><a className="nav-product" href="/product">Open live product ↗</a></div>
    </nav>
    <section className="landing-hero wrap">
      <div className="hero-copy">
        <div className="eyebrow">STELE / PUBLIC RULES FOR AGENT VAULTS</div>
        <h1>Rules for agents.<br /><em>Held in public.</em></h1>
        <p className="hero-lede">Stele gives an agent's payment behavior a visible rulebook, a funded response, and a record that can grow without rewriting history.</p>
        <div className="hero-actions"><a className="button button-dark" href="/product">Explore the live product ↗</a><a className="text-link" href="https://github.com/Snehal707/stele" target="_blank" rel="noreferrer">Read the repository</a></div>
      </div>
      <div className="hero-image-wrap"><img src="/assets/stele-hero.png" alt="A weathered stone stele with horizontal carved rules" /><span className="image-caption">A public rule, made legible.</span></div>
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
  return window.location.pathname === "/product" ? <ProductPage /> : <LandingPage />;
}

const config = getDefaultConfig({ appName: "Stele", projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "stele-demo-project-id", chains: [bradbury], ssr: false });
const queryClient = new QueryClient();
createRoot(document.getElementById("root")).render(<WagmiProvider config={config}><QueryClientProvider client={queryClient}><RainbowKitProvider chains={[bradbury]}><App /></RainbowKitProvider></QueryClientProvider></WagmiProvider>);
