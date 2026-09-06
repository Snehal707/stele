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
  return args.map((value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? addressArg(value) : value);
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

function ReceiptLinks({ title, hashes }) {
  const list = (Array.isArray(hashes) ? hashes : [hashes]).filter(Boolean);
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

function describeReadError(error) {
  const raw = error?.shortMessage || error?.message || String(error || "Unknown Bradbury read error");
  const message = String(raw).replace(/\s+/g, " ").trim();
  if (/missing or invalid parameters/i.test(message)) return "Bradbury rejected the view parameters.";
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
    <pre className="pinned">{record.pinned_state}</pre>
    <EvidenceTag>live agent_state + latest_verdict</EvidenceTag>
  </article>;
}

function ActionPanel() {
  const { address, isConnected, chain, connector } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: bradbury.id });
  const { switchChain } = useSwitchChain();
  const [status, setStatus] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [uncertainSubmission, setUncertainSubmission] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [now, setNow] = useState(Date.now());
  const autoSwitchAttempted = useRef(false);

  useEffect(() => {
    if (!isConnected) {
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
  }, [isConnected, chain?.id, switchChain]);

  useEffect(() => {
    if (!transactions.some((transaction) => transaction.pending)) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [transactions]);

  const requireWallet = () => {
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

  const proposeMandate = async () => {
    if (!requireWallet()) return;
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
        setStatus("Propose: mandate v2 is already promoted for this agent.");
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
    if (!requireWallet()) return;
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
        console.error("Stele claim preflight failed", error);
        setStatus(`Claim preflight failed: ${describeWriteError(error)}`);
        return;
      }
      await runWrite("Claim", "claim", [CONFIG.rewriteAgent]);
    } catch (error) {
      console.error("Stele claim preflight failed", error);
      setStatus(`Claim preflight failed: ${describeWriteError(error)}`);
    }
  };

  const depositMinimum = async () => {
    if (!requireWallet()) return;
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
      setStatus(`Deposit preflight failed: ${describeWriteError(error)}`);
    }
  };

  const runWrite = async (label, functionName, args, value = 0n) => {
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
          hash = await client.writeContract({ address: CONFIG.governor, functionName, args: addressArgs(args), value });
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
      const lowerMessage = message.toLowerCase();
      const capacity = message.includes("-32005") || lowerMessage.includes("capacity");
      const userRejected = error?.code === 4001 || lowerMessage.includes("user rejected") || lowerMessage.includes("rejected the request");
      const ambiguous = !capacity && !userRejected && (message.includes("-32603") || lowerMessage.includes("transaction failed") || lowerMessage.includes("originalerror"));
      if (ambiguous) {
        setActiveAction(null);
        setUncertainSubmission({ label, functionName, args, value });
        setStatus(`${label}: submission uncertain — the wallet returned no transaction hash. Verify wallet activity and Bradbury before retrying.`);
      } else {
        setActiveAction(null);
        setStatus(capacity
          ? `${label}: network at capacity; try again later.`
          : `${label}: ${message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const pollReceipt = (hash, label, startedAt) => {
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
            || [5, 6, 7, 8, 12, 13].includes(numericStatus);
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
          setStatus(execution === "FINISHED_WITH_ERROR" ? `${label}: accepted, but contract execution failed.` : `${label}: ${execution} ✓`);
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

  if (!isConnected) return <div className="write-panel"><p>Connect a wallet to submit a review, claim, mandate proposal, or LP deposit.</p><ConnectButton /></div>;
  const hasPendingTransaction = transactions.some((transaction) => transaction.pending);
  return <div className="write-panel">
    <div className="write-panel-head"><span>Connected wallet</span><span>{address}</span></div>
    {chain?.id !== bradbury.id && <button onClick={() => switchChain({ chainId: bradbury.id })}>Switch to Bradbury</button>}
    <p className={`action-sequence${uncertainSubmission ? " uncertain" : ""}`}><span className="sequence-dot" /> {uncertainSubmission ? `${uncertainSubmission.label}: submission status is uncertain · verify wallet activity before retrying.` : "One action at a time · waiting for Bradbury consensus before the next action."}</p>
    <div className="write-actions">
      <button className={activeAction === "Review" ? "is-active" : activeAction || uncertainSubmission ? "is-locked" : ""} disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={() => runWrite("Review", "review", [CONFIG.rewriteAgent])}>{activeAction === "Review" ? <><span className="action-spinner" /> Review · waiting…</> : activeAction || uncertainSubmission ? "Run review · locked" : "Run review"}</button>
      <button className={activeAction === "Claim" ? "is-active" : activeAction || uncertainSubmission ? "is-locked" : ""} disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={fileClaim}>{activeAction === "Claim" ? <><span className="action-spinner" /> File claim · waiting…</> : activeAction || uncertainSubmission ? "File claim · locked" : "File claim"}</button>
      <button className={activeAction === "Propose" ? "is-active" : activeAction || uncertainSubmission ? "is-locked" : ""} disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={proposeMandate}>{activeAction === "Propose" ? <><span className="action-spinner" /> Propose mandate · waiting…</> : activeAction || uncertainSubmission ? "Propose mandate · locked" : "Propose mandate"}</button>
      <button className={activeAction === "Deposit" ? "is-active" : activeAction || uncertainSubmission ? "is-locked" : ""} disabled={hasPendingTransaction || submitting || uncertainSubmission} onClick={depositMinimum}>{activeAction === "Deposit" ? <><span className="action-spinner" /> Deposit · waiting…</> : activeAction || uncertainSubmission ? "Deposit minimum GEN · locked" : "Deposit minimum GEN"}</button>
    </div>
    {uncertainSubmission && <button className="retry-after-check" onClick={() => { setUncertainSubmission(null); setStatus(`${uncertainSubmission.label}: retry enabled after wallet/explorer verification.`); }}>I verified no transaction — enable retry</button>}
    <p className="write-status" role="status">{status || "Writes use genlayer-js; reviews typically take 18–114 seconds (median 73)."}</p>
    {transactions.map(({ label, hash, startedAt, pending, execution }) => <div className="tx-hash" key={hash}>
      <span>{label}</span>
      <a href={`${CONFIG.explorer}${hash}`} target="_blank" rel="noreferrer">{hash}</a>
      <small>{pending ? `Submitted ✓ · Waiting for Bradbury consensus… ${Math.floor((now - startedAt) / 1000)}s` : `${execution} ✓`}</small>
    </div>)}
  </div>;
}

function ProductPage() {
  const [live, setLive] = useState({ status: "loading", fixtures: {} });
  const [lineage, setLineage] = useState({ status: "loading" });
  const [capital, setCapital] = useState({ status: "loading" });
  const [readStatus, setReadStatus] = useState("Loading live Bradbury reads…");
  const [readNonce, setReadNonce] = useState(0);
  const { address, isConnected } = useAccount();

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
        const [pool, lpPool, totalShares, bond, lastClaim, yourShares] = await Promise.all([
          client.readContract({ address: CONFIG.governor, functionName: "get_pool", args: [] }),
          client.readContract({ address: CONFIG.governor, functionName: "get_lp_pool", args: [] }),
          client.readContract({ address: CONFIG.governor, functionName: "get_total_lp_shares", args: [] }),
          client.readContract({ address: CONFIG.governor, functionName: "get_bond_of", args: addressArgs([CONFIG.rewriteAgent]) }),
          client.readContract({ address: CONFIG.governor, functionName: "get_last_claim", args: addressArgs([CONFIG.rewriteAgent]) }),
          isConnected ? client.readContract({ address: CONFIG.governor, functionName: "get_lp_shares", args: addressArgs([address]) }) : null,
        ]);
        if (active) {
          setCapital({ status: "ready", values: { pool, lpPool, totalShares, bond, lastClaim, yourShares } });
          setReadStatus("Live Bradbury reads succeeded from the consolidated Governor.");
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
  }, [address, isConnected, readNonce]);

  const capitalValue = (key) => {
    if (capital.status === "loading") return <ReadState onRetry={retryLiveReads} />;
    if (capital.status === "error") return <ReadState message={`Live read failed — ${capital.error}`} onRetry={retryLiveReads} />;
    if (capital.values[key] === null) return "Connect wallet";
    return String(capital.values[key]);
  };
  const claimValue = capital.status === "ready" && capital.values.lastClaim && typeof capital.values.lastClaim === "object" ? capital.values.lastClaim : null;
  const productSections = [
    ["actions", "Connected Actions", "Run the live write sequence"],
    ["judgment", "Judgment", "Healthy vs burst · drain v1/v2"],
    ["halt", "Halt", "OFF review · rejection · expiry"],
    ["lineage", "Lineage", "Claim · mandate · scoring"],
    ["cover", "Cover", "Pool · bond · last claim"],
    ["capital", "Capital & Yield", "LP pool · shares"],
    ["chain", "Chain Record", "Governor · Bradbury 4221"],
    ["secondary", "Secondary Evidence", "Allowlist · pricing"],
    ["history", "Historical Evidence", "Global demo receipts · not live state"],
  ];
  const initialProductSection = productSections.some(([id]) => id === window.location.hash.slice(1)) ? window.location.hash.slice(1) : "actions";
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
    <div className="product-cta wrap"><a href="#actions" onClick={(event) => { event.preventDefault(); selectProductSection("actions"); }}>Try it live →</a></div>
    <div className="product-layout wrap">
      <aside className="product-sidebar" aria-label="Evidence sections">
        <div className="sidebar-label">EVIDENCE INDEX</div>
        <nav>{productSections.map(([id, label, detail]) => <button key={id} className={activeProductSection === id ? "active" : ""} aria-current={activeProductSection === id ? "page" : undefined} onClick={() => selectProductSection(id)}><span>{label}</span><small>{detail}</small></button>)}</nav>
      </aside>
      <div className="product-main">
        {activeProductSection === "actions" && <section id="actions" className="actions evidence-panel" aria-labelledby="actions-title"><div className="section-intro compact"><div className="eyebrow">01 / CONNECTED ACTIONS</div></div><ActionPanel /></section>}
        {activeProductSection === "judgment" && <div className="evidence-panel"><section className="contrast" aria-labelledby="contrast-title"><div className="section-intro compact"><div className="eyebrow">02 / JUDGMENT</div></div><div className="comparison-grid">{renderCase(FIXTURES.healthy, live.fixtures.healthy, retryLiveReads)}{renderCase(FIXTURES.burst, live.fixtures.burst, retryLiveReads)}</div></section><section className="drain" aria-labelledby="drain-title"><div className="section-intro compact"><div className="eyebrow">02 / JUDGMENT · DRAIN</div></div><div className="comparison-grid">{renderCase({ ...FIXTURES.drain, className: "healthy", note: "current drain fixture · live state" }, live.fixtures.drain, retryLiveReads, "CURRENT DRAIN STATE")}</div></section></div>}
        {activeProductSection === "halt" && <section className="halt evidence-panel" aria-labelledby="halt-title"><div className="section-intro compact"><div className="eyebrow">03 / HALT</div></div><p className="section-note">Current live actions are shown in Connected Actions. Historical demo receipts are grouped under Historical Evidence.</p></section>}
        {activeProductSection === "lineage" && <section className="lineage evidence-panel" aria-labelledby="lineage-title"><div className="section-intro compact"><div className="eyebrow">04 / LINEAGE</div></div>{lineage.status === "ready" ? <><div className="lineage-rail"><article className="version-card"><div className="version-label">v1 · {lineage.versionOne.status} <EvidenceTag>live · get_mandate_version</EvidenceTag></div><p>{lineage.versionOne.text}</p></article><div className="lineage-arrow" aria-hidden="true">→</div><article className="version-card active-version"><div className="version-label">v2 · {lineage.versionTwo.status} <EvidenceTag>live · get_mandate_version</EvidenceTag></div><p>{lineage.versionTwo.text}</p></article></div><div className="trigger"><span>CLAIM {lineage.claim.status}</span><b>{String(lineage.claim.payout)} against {String(lineage.claim.loss)} loss <EvidenceTag>live · get_last_claim</EvidenceTag></b><span>CLAUSE APPENDED</span></div></> : <ReadState message={lineage.status === "loading" ? "Loading live mandate and claim reads…" : `Live lineage read failed — ${lineage.error}`} onRetry={retryLiveReads} />}</section>}
        {activeProductSection === "cover" && <section className="cover evidence-panel" aria-labelledby="cover-title"><div className="section-intro compact"><div className="eyebrow">05 / COVER</div></div><div className="cover-grid"><div><span>POOL</span><strong>{capitalValue("pool")}</strong><small>claims pool · live read</small></div><div><span>BOND</span><strong>{capitalValue("bond")}</strong><small>loss cover before payout</small></div><div><span>LAST CLAIM</span><strong>{claimValue ? `${String(claimValue.payout)} / ${String(claimValue.loss)}` : capital.status === "ready" ? "No claim record" : capitalValue("lastClaim")}</strong><small>payout / loss · live read</small></div></div></section>}
        {activeProductSection === "capital" && <section className="capital evidence-panel" aria-labelledby="capital-title"><div className="section-intro compact"><div className="eyebrow">06 / CAPITAL AND YIELD</div></div><div className="pricing-grid capital-grid"><div><span>LP POOL</span><strong>{capitalValue("lpPool")}</strong></div><div><span>TOTAL LP SHARES</span><strong>{capitalValue("totalShares")}</strong></div><div><span>YOUR SHARES</span><strong>{isConnected ? capitalValue("yourShares") : "Connect wallet"}</strong></div></div></section>}
        {activeProductSection === "chain" && <section className="chain evidence-panel" aria-labelledby="chain-title"><div className="section-intro compact"><div className="eyebrow">07 / CHAIN RECORD</div></div><div className="chain-list"><article className="chain-record"><div><strong>Consolidated Governor</strong><small>judgment · halt · cover/lifeform · economics</small></div><div><small>GenLayer Bradbury · chain 4221</small></div><div className="chain-address">{CONFIG.governor}</div><a href={`${CONFIG.addressExplorer}${CONFIG.governor}`} target="_blank" rel="noreferrer">explorer ↗</a></article></div><div className="read-status" role="status"><strong>{readStatus}</strong></div></section>}
        {activeProductSection === "secondary" && <div className="evidence-panel"><section className="context" aria-labelledby="context-title"><div className="section-intro compact"><div className="eyebrow">08 / SECONDARY EVIDENCE · ALLOWLIST</div></div><div className="context-card">{renderCase(FIXTURES.strangers, live.fixtures.strangers, retryLiveReads, "STRANGERS VAULT")}</div></section><section className="pricing" aria-labelledby="pricing-title"><div className="section-intro compact"><div className="eyebrow">09 / SECONDARY EVIDENCE · PRICING</div></div><ReadState message="No Governor pricing view is exposed; static pricing values are intentionally not displayed." /></section></div>}
        {activeProductSection === "history" && <section className="history evidence-panel" aria-labelledby="history-title"><div className="section-intro compact"><div className="eyebrow">09 / HISTORICAL EVIDENCE</div></div><div className="read-status" role="note"><strong>Global demo receipts · not current wallet data</strong><span>These links document earlier fixture runs. They do not change when a new wallet connects and are separate from live reads and new transaction hashes.</span></div><div className="history-list"><ReceiptLinks title="Judgment · healthy fixture" hashes={RECEIPTS.judgmentHealthy} /><ReceiptLinks title="Judgment · burst fixture" hashes={RECEIPTS.judgmentBurst} /><ReceiptLinks title="Judgment · drain v1" hashes={RECEIPTS.drainV1} /><ReceiptLinks title="Judgment · drain v2" hashes={RECEIPTS.drainV2} /><ReceiptLinks title="Judgment · consolidated drain suite" hashes={RECEIPTS.drainSuite} /><ReceiptLinks title="Halt sequence" hashes={[RECEIPTS.haltSeed, RECEIPTS.haltReview, RECEIPTS.haltSpendRejected, RECEIPTS.haltAdvance, RECEIPTS.haltSpendSuccess]} /><ReceiptLinks title="Lineage · claim, proposal, promotion" hashes={[RECEIPTS.claim, RECEIPTS.propose, RECEIPTS.promote]} /></div></section>}
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
    <section className="landing-proof wrap"><div className="proof-top"><div className="eyebrow">LIVE ON GENLAYER BRADBURY</div><span>CHAIN 4221</span></div><div className="proof-row"><strong>0xB31bc62001219E8A9eF4026820A06A6799984D26</strong><a href="/product">Open public record ↗</a></div></section>
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
