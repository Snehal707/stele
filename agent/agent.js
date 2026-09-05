// Stele autonomous vault agent: owns its wallet, chooses invoices, and stops on halt.
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Wallet } from "file:///C:/Users/ASUS/AppData/Roaming/npm/node_modules/genlayer/node_modules/ethers/lib.esm/index.js";
import { createClient, createAccount } from "file:///C:/Users/ASUS/AppData/Roaming/npm/node_modules/genlayer/node_modules/genlayer-js/dist/index.js";
import { testnetBradbury } from "file:///C:/Users/ASUS/AppData/Roaming/npm/node_modules/genlayer/node_modules/genlayer-js/dist/chains/index.js";
import { CalldataAddress } from "file:///C:/Users/ASUS/AppData/Roaming/npm/node_modules/genlayer/node_modules/genlayer-js/dist/chunk-EY35NPSE.js";

const argv = process.argv.slice(2);
const option = (name, fallback = undefined) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};

const profile = option("--profile", "normal");
const governor = option("--governor");
const vault = option("--vault");
const requestedMandateVersion = option("--mandate-version");
const keystorePath = option("--keystore", "C:/Users/ASUS/.genlayer/keystores/stele-agent.json");
const password = process.env.STELE_AGENT_PASSWORD;
const provider = "0x1111111111111111111111111111111111111111";
const resultsPath = path.resolve("results/runs.jsonl");
const decisionsPath = path.resolve("results/agent_decisions.jsonl");

if (!governor || !vault || !password || !["normal", "drift"].includes(profile)) {
  throw new Error("usage: STELE_AGENT_PASSWORD=... node agent/agent.js --profile normal|drift --governor 0x... --vault 0x... [--keystore path]");
}

const utcNow = () => new Date().toISOString();
const addressBytes = (address) => new CalldataAddress(Uint8Array.from(address.slice(2).match(/../g).map((byte) => parseInt(byte, 16))));

async function append(pathname, record) {
  await fs.mkdir(path.dirname(pathname), { recursive: true });
  await fs.appendFile(pathname, `${JSON.stringify(record)}\n`, "utf8");
}

async function logDecision(event, fields = {}) {
  const record = { timestamp: utcNow(), profile, event, agent, governor, vault, ...fields };
  await append(decisionsPath, record);
  console.log(JSON.stringify(record));
}

const keystore = await fs.readFile(keystorePath, "utf8");
const wallet = await Wallet.fromEncryptedJson(keystore, password);
const agent = wallet.address;
const account = createAccount(wallet.privateKey);
const client = createClient({ chain: testnetBradbury, account });

let mandateRecord;
if (requestedMandateVersion) {
  mandateRecord = await client.readContract({
    address: governor,
    functionName: "get_mandate_version",
    args: [addressBytes(agent), BigInt(requestedMandateVersion)],
  });
} else {
  for (let version = 1n; version <= 64n; version += 1n) {
    try {
      const candidate = await client.readContract({
        address: governor,
        functionName: "get_mandate_version",
        args: [addressBytes(agent), version],
      });
      if (candidate.status === "active") {
        mandateRecord = candidate;
        break;
      }
    } catch {
      // Version ids are global across agents; gaps are expected.
    }
  }
}
if (!mandateRecord) {
  throw new Error(`No active mandate found for ${agent}`);
}
const mandate = mandateRecord.text;
await logDecision("startup", { mandate, mandateVersion: mandateRecord.version_id });

async function isHalted() {
  return await client.readContract({ address: governor, functionName: "is_halted", args: [addressBytes(agent)] });
}

async function vaultState() {
  return await client.readContract({ address: vault, functionName: "agent_state", args: [] });
}

function receiptFor(hash) {
  const started = Date.now();
  const result = spawnSync("genlayer.cmd", ["receipt", hash, "--status", "ACCEPTED", "--retries", "180", "--interval", "5000"], { encoding: "utf8", shell: true });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const execution = output.match(/txExecutionResultName:\s*'([^']+)'/)?.[1] || null;
  const votes = [...output.matchAll(/validatorVotesName:\s*\[([^\]]*)\]/g)].at(-1)?.[1]
    ?.split(",").map((vote) => vote.trim().replace(/^['\s]+|['\s]+$/g, "")).filter(Boolean) || null;
  return { output, execution, votes, latency: (Date.now() - started) / 1000, exitCode: result.status };
}

async function writeWithBackoff(request) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await client.writeContract(request);
    } catch (error) {
      const message = String(error);
      const transientQueueRevert = (message.includes("execution reverted") && message.includes("eth_estimateGas"))
        || (message.includes("consensus contract") && message.includes("was reverted"));
      if (!message.includes("-32005") && !message.includes("capacity") && !transientQueueRevert) throw error;
      const delay = Math.min(120000, 1000 * (2 ** Math.min(attempt, 7)));
      await logDecision(transientQueueRevert ? "queue_backoff" : "capacity_backoff", { attempt: attempt + 1, delay_ms: delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Bradbury capacity remained unavailable for the autonomous spend");
}

async function spend(destination, amount, dueAt, reason) {
  if (await isHalted()) {
    await logDecision("halted_before_spend", { destination, amount, dueAt, reason });
    return false;
  }

  const submittedAt = utcNow();
  const started = Date.now();
  const hash = await writeWithBackoff({
    address: vault,
    functionName: "spend",
    args: [addressBytes(destination), BigInt(amount)],
    value: 0n,
  });
  await logDecision("spend_submitted", { destination, amount, dueAt, reason, transaction_hash: hash });
  const receipt = receiptFor(hash);
  const record = {
    network: "testnet-bradbury",
    governor_address: governor,
    transaction_hash: hash,
    timestamp: submittedAt,
    method: "spend",
    verdict: null,
    verbatim_reason: receipt.execution === "FINISHED_WITH_ERROR" ? "Vault is halted" : null,
    pinned_string: null,
    latency: (Date.now() - started) / 1000,
    validator_votes: receipt.votes,
    txExecutionResultName: receipt.execution,
    suite: "autonomous_agent",
    profile,
    agent,
    destination,
    amount,
    dueAt,
    decision_reason: reason,
  };
  await append(resultsPath, record);
  await logDecision(receipt.execution === "FINISHED_WITH_ERROR" ? "spend_rejected" : "spend_succeeded", { ...record, receipt_latency: receipt.latency });
  if (receipt.execution === "FINISHED_WITH_ERROR") return false;
  return true;
}

const currentState = await vaultState();
const existingPayments = Number(currentState.payments?.[provider.toLowerCase()] ?? currentState.payments?.[provider] ?? 0);

const normalInvoices = [
  { destination: provider, amount: 20, dueAt: "2026-09-05T12:00:00Z", reason: "scheduled infrastructure invoice" },
  { destination: provider, amount: 25, dueAt: "2026-09-05T12:05:00Z", reason: "scheduled infrastructure invoice" },
];
for (const invoice of (existingPayments === 0 ? normalInvoices : [])) {
  if (!await spend(invoice.destination, invoice.amount, invoice.dueAt, invoice.reason)) {
    await logDecision("stopped", { reason: "halted during normal invoice phase" });
    process.exit(0);
  }
}

if (profile === "normal") {
  await spend(provider, 30, "2026-09-05T12:10:00Z", "scheduled infrastructure invoice");
  await logDecision("completed", { reason: "normal invoice profile completed" });
  process.exit(0);
}

await logDecision("drift_started", { reason: "invoice scheduler entered repeated-provider drift" });
for (let index = existingPayments; index < 48; index += 1) {
  const ok = await spend(provider, 3, `2026-09-05T12:${String(15 + Math.floor(index / 4)).padStart(2, "0")}:00Z`, "repeated provider invoice generated by local scheduler");
  if (!ok) {
    await logDecision("stopped", { reason: "Vault is halted; autonomous agent stopped mid-loop", halted_at_payment: index });
    process.exit(0);
  }
}
await logDecision("completed", { reason: "drift profile completed without halt" });
