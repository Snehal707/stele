// Full isolated governance lifecycle check for Studio Next (chain 61997).
// Uses a fresh in-memory wallet and simulator funding; never reads or writes saved keys.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const sdkRoot = process.env.STELE_TEST_SDK_DIR;
if (!sdkRoot) throw new Error('Set STELE_TEST_SDK_DIR to the isolated v2-dev SDK directory.');
const require = createRequire(resolve(sdkRoot, 'package.json'));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const [{ createClient }, { studioDevnet }, { CalldataAddress }, { generatePrivateKey, privateKeyToAccount }, viem] = await Promise.all([
  load('genlayer-js'), load('genlayer-js/chains'), load('genlayer-js/types'), load('viem/accounts'), load('viem'),
]);
const { hexToBytes } = viem;

const rpc = 'https://studio-dev.genlayer.com/api';
const chainId = 61997;
const runner = 'py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng';
const chain = { ...studioDevnet, id: chainId, rpcUrls: { default: { http: [rpc] } } };
const account = privateKeyToAccount(generatePrivateKey());
const client = createClient({ chain, account });
const addr = (value) => new CalldataAddress(hexToBytes(value));
const json = (value) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const report = {
  network: 'Studio Next', rpc, chainId, runner, started: new Date().toISOString(),
  account: account.address, sources: {}, transactions: [], checks: [],
};
let currentStage = 'preflight';
const resultDir = resolve(root, 'results');
mkdirSync(resultDir, { recursive: true });
const output = resolve(resultDir, `studio-next-full-lifecycle-${Date.now()}.json`);
const save = () => writeFileSync(output, json(report) + '\n');
const comparable = (value) => {
  if (typeof value === 'bigint' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, comparable(value[key])]));
  }
  return value;
};

async function request(method, params) {
  currentStage = `rpc:${method}`;
  const response = await fetch(rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: json({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`${method}: ${json(data.error)}`);
  return data.result;
}

async function estimateFees() {
  currentStage = 'fee_estimation';
  const quote = await client.estimateTransactionFees({});
  assert.ok(quote?.distribution, 'Fee estimator did not return distribution');
  assert.ok(quote?.feeValue !== undefined, 'Fee estimator did not return feeValue');
  return { distribution: quote.distribution, feeValue: quote.feeValue };
}

async function submit(label, submitter, expectedExecution = 'FINISHED_WITH_RETURN') {
  currentStage = `submit:${label}`;
  const hash = await submitter();
  const row = { label, hash, submitted: new Date().toISOString() };
  report.transactions.push(row);
  save();
  console.log(json({ label, hash }));
  currentStage = `finalize:${label}`;
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: 'finalized', interval: 5000, retries: 100, fullTransaction: true });
  row.receipt = {
    full: JSON.parse(json(receipt)),
    execution: receipt.txExecutionResultName,
    status: receipt.status_name,
    consensus: receipt.result_name,
    rounds: receipt.num_of_rounds,
    contractAddress: receipt.data?.contract_address,
    error: json(receipt).includes('Vault is halted') ? 'Vault is halted' : undefined,
  };
  save();
  assert.equal(receipt.txExecutionResultName, expectedExecution, `${label}: unexpected execution result`);
  assert.equal(receipt.result_name, 'MAJORITY_AGREE', `${label}: consensus did not agree`);
  return receipt;
}

async function deploy(file, args = []) {
  currentStage = `deploy:${file}:prepare`;
  const source = readFileSync(resolve(root, 'contracts', file), 'utf8');
  const deployed = source.replace(/^# \{ "Depends": "[^"]+" \}/, `# { "Depends": "${runner}" }`);
  assert.notEqual(deployed, source, `${file}: expected a runner dependency header to pin`);
  report.sources[file] = {
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    deployedSha256: createHash('sha256').update(deployed).digest('hex'),
  };
  const fees = await estimateFees();
  const receipt = await submit(`deploy:${file}`, () => client.deployContract({
    account, code: new TextEncoder().encode(deployed), args, fees,
  }));
  const address = receipt.data?.contract_address;
  assert.ok(address, `${file}: successful deployment did not return a contract address`);
  await client.getContractSchema(address);
  return address;
}

async function write(address, functionName, args = [], value = 0n, expectedExecution = 'FINISHED_WITH_RETURN') {
  const fees = await estimateFees();
  const before = report.vault ? await read(report.vault, 'agent_state') : undefined;
  const receipt = await submit(functionName, () => client.writeContract({ account, address, functionName, args, value, fees }), expectedExecution);
  const row = report.transactions.at(-1);
  if (before !== undefined) {
    row.vaultStateBefore = before;
    row.vaultStateAfter = await read(report.vault, 'agent_state');
  }
  // `get_governed` is intentionally unset until the first review. Do not make
  // the enrollment write appear to fail by reading that uninitialized map.
  if (report.governor && report.agent && report.transactions.some(({ label }) => label === 'review')) {
    row.governorStateAfter = {
      ruling: await read(report.governor, 'get_governed', [addr(report.agent)]),
      halted: await read(report.governor, 'is_halted', [addr(report.agent)]),
    };
  }
  save();
  return receipt;
}

const read = (address, functionName, args = []) => {
  currentStage = `read:${functionName}`;
  return client.readContract({ address, functionName, args, jsonSafeReturn: true });
};
const recordCheck = (name, actual, expected) => {
  report.checks.push({ name, actual, expected, passed: json(comparable(actual)) === json(comparable(expected)) });
  save();
  assert.deepEqual(comparable(actual), comparable(expected), `${name}: unexpected on-chain value`);
};

function findKey(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  if (Object.hasOwn(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

try {
  currentStage = 'preflight:chain_id';
  recordCheck('chain_id', Number(await client.getChainId()), chainId);
  currentStage = 'preflight:latest_nonce';
  recordCheck('fresh_wallet_latest_nonce', Number(await client.getTransactionCount({ address: account.address, blockTag: 'latest' })), 0);
  currentStage = 'preflight:pending_nonce';
  recordCheck('fresh_wallet_pending_nonce', Number(await client.getTransactionCount({ address: account.address, blockTag: 'pending' })), 0);
  report.agent = account.address;
  report.fundingTransaction = await request('sim_fundAccount', [account.address, 1000000]);
  report.fundedBalance = await request('eth_getBalance', [account.address, 'latest']);
  assert.ok(BigInt(report.fundedBalance) > 0n, 'Simulator funding left the fresh wallet with zero balance');
  save();

  const governor = await deploy('governor.py');
  report.governor = governor;
  save();
  const vault = await deploy('vault_twin.py', [1000n, addr(account.address), addr(governor)]);
  report.vault = vault;
  save();

  const provider = '0x1111111111111111111111111111111111111111';
  const mandate = 'Pay the declared provider for recurring infrastructure invoices in modest amounts.';
  const window = 86400n;
  await write(governor, 'enroll_covered', [
    addr(account.address), addr(vault), mandate, [addr(provider)], window, window, '', '', window,
  ], 2000n);
  currentStage = 'verify:enrolled_vault';
  const enrolledVault = await read(governor, 'get_vault', [addr(account.address)]);
  assert.equal(String(enrolledVault).toLowerCase(), vault.toLowerCase(), 'Enrollment points to the wrong vault');
  report.checks.push({ name: 'enrolled_vault', actual: enrolledVault, expected: vault, passed: true });
  currentStage = 'verify:initial_bond';
  const initialBond = await read(governor, 'get_bond_of', [addr(account.address)]);
  assert.equal(String(initialBond), '2000', 'Unexpected enrollment bond');
  report.checks.push({ name: 'initial_bond', actual: String(initialBond), expected: '2000', passed: true });
  save();

  await write(governor, 'review', [addr(account.address)]);
  recordCheck('initial_ruling', await read(governor, 'get_governed', [addr(account.address)]), 'ON_MANDATE');
  recordCheck('initial_halt', await read(governor, 'is_halted', [addr(account.address)]), false);

  await write(vault, 'spend', [addr(provider), 20n]);
  const normalSpendBalance = (await read(vault, 'agent_state')).balance;
  assert.equal(String(normalSpendBalance), '980', 'Unexpected balance after normal spend');
  report.checks.push({ name: 'post_normal_spend_balance', actual: String(normalSpendBalance), expected: '980', passed: true });
  save();
  await write(governor, 'review', [addr(account.address)]);
  recordCheck('refreshed_ruling', await read(governor, 'get_governed', [addr(account.address)]), 'ON_MANDATE');

  await write(vault, 'spend', [addr(provider), 980n]);
  const drainedState = await read(vault, 'agent_state');
  report.preClaimState = drainedState;
  recordCheck('drained_balance', drainedState.balance, '0');

  const agentBalanceBeforeClaim = await request('eth_getBalance', [account.address, 'latest']);
  const claimReceipt = await write(governor, 'claim', [addr(account.address)]);
  const agentBalanceAfterClaim = await request('eth_getBalance', [account.address, 'latest']);
  const claim = await read(governor, 'get_last_claim', [addr(account.address)]);
  report.claim = claim;
  const payoutMessage = (claimReceipt.messages || []).find((message) =>
    String(message.recipient).toLowerCase() === account.address.toLowerCase()
      && String(message.value) === '980'
  );
  const deliveredMessages = findKey(claimReceipt, 'message_effect_delivered');
  report.claimSettlement = {
    agentBalanceBefore: agentBalanceBeforeClaim,
    agentBalanceAfter: agentBalanceAfterClaim,
    payoutMessage,
    deliveredMessageEffects: deliveredMessages,
  };
  save();
  assert.equal(claim.status, 'PAID', 'Claim was not paid');
  assert.equal(String(claim.loss), '980', 'Unexpected claim loss');
  assert.equal(String(claim.payout), '980', 'Unexpected claim payout');
  assert.ok(payoutMessage, 'Claim receipt did not emit the expected 980-unit payout to the agent');
  assert.ok(
    deliveredMessages && Object.values(deliveredMessages).some((delivered) => delivered === true),
    'Claim receipt did not confirm delivery of its payout message',
  );
  report.checks.push({ name: 'paid_claim', actual: claim, expected: { status: 'PAID', loss: '980', payout: '980' }, passed: true });
  save();

  await write(governor, 'propose_mandate', [addr(account.address)]);
  const candidate = await read(governor, 'get_mandate_version', [addr(account.address), 2n]);
  report.proposedMandate = candidate;
  save();
  assert.equal(candidate.status, 'dead_branch', 'Proposal did not create the expected dead-branch candidate');

  await write(governor, 'promote_mandate', [addr(account.address), 2n]);
  const promotion = await read(governor, 'get_promotion_result', [addr(account.address)]);
  const activeVersion = await read(governor, 'get_mandate_version', [addr(account.address), 2n]);
  report.promotion = { result: promotion, version: activeVersion };
  save();
  assert.equal(promotion, 'PASSED', 'Mandate promotion did not pass');
  assert.equal(activeVersion.status, 'active', 'Promoted mandate is not active');

  await write(governor, 'review', [addr(account.address)]);
  const finalRuling = await read(governor, 'get_governed', [addr(account.address)]);
  const halted = await read(governor, 'is_halted', [addr(account.address)]);
  recordCheck('post_promotion_ruling', finalRuling, 'OFF_MANDATE');
  recordCheck('post_promotion_halt', halted, true);
  const beforeRejectedSpend = await read(vault, 'agent_state');
  const rejected = await write(vault, 'spend', [addr(provider), 1n], 0n, 'FINISHED_WITH_ERROR');
  assert.match(json(rejected), /Vault is halted/, 'Post-halt spend failed for an unexpected reason');
  const afterRejectedSpend = await read(vault, 'agent_state');
  recordCheck('halted_spend_preserves_vault_state', afterRejectedSpend, beforeRejectedSpend);

  report.passed = true;
  report.completed = new Date().toISOString();
  save();
  console.log(json({ passed: true, report: output, governor, vault }));
} catch (error) {
  report.passed = false;
  report.failedAt = currentStage;
  report.error = String(error?.shortMessage || error?.message || error).slice(0, 2000);
  report.stopped = new Date().toISOString();
  save();
  console.error(json({ passed: false, error: report.error, report: output }));
  process.exitCode = 1;
}
