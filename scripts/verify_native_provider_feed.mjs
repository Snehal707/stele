// Isolated Studio-dev integration test. Does not change the frontend or use saved keys.
// STELE_TEST_SDK_DIR must point to a directory with a v0.6-compatible SDK installed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(resolve(process.env.STELE_TEST_SDK_DIR || root, 'package.json'));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const { createClient } = await load('genlayer-js');
const { studioDevnet } = await load('genlayer-js/chains');
const { CalldataAddress } = await load('genlayer-js/types');
const { generatePrivateKey, privateKeyToAccount } = await load('viem/accounts');
const { hexToBytes } = await load('viem');
const rpc = 'https://studio-dev.genlayer.com/api';
const runner = 'py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng';
const addr = (value) => new CalldataAddress(hexToBytes(value));
const json = (value) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const account = privateKeyToAccount(generatePrivateKey()); // In memory only, never persisted/logged.
const client = createClient({ chain: { ...studioDevnet, id: 61997, rpcUrls: { default: { http: [rpc] } } }, account });
const report = { rpc, chain: 61997, runner, account: account.address, started: new Date().toISOString(), sources: {}, transactions: [], cases: [] };
const resultDir = resolve(root, 'results');
mkdirSync(resultDir, { recursive: true });
const output = resolve(resultDir, `native-provider-feed-${Date.now()}.json`);
const save = () => writeFileSync(output, json(report));
async function request(method, params) {
  const response = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json({ jsonrpc: '2.0', id: 1, method, params }) });
  const data = await response.json();
  if (data.error) throw new Error(`${method}: ${json(data.error)}`);
  return data.result;
}
async function fees() {
  const quote = await client.estimateTransactionFees({});
  return { distribution: quote.distribution, feeValue: quote.feeValue };
}
async function receipt(label, hash, expected = 'FINISHED_WITH_RETURN') {
  const row = { label, hash, submitted: new Date().toISOString() };
  report.transactions.push(row); save();
  console.log(json({ label, hash }));
  const result = await client.waitForTransactionReceipt({ hash, waitUntil: 'finalized', interval: 5000, retries: 100 });
  const resultText = json(result);
  row.receipt = {
    execution: result.txExecutionResultName,
    status: result.status_name,
    consensus: result.result_name,
    rounds: result.num_of_rounds,
    error: resultText.includes('Vault is halted') ? 'Vault is halted' : undefined,
  };
  save();
  assert.equal(result.txExecutionResultName, expected, `${label}: unexpected execution result`);
  return result;
}
async function deploy(file, args = []) {
  const source = readFileSync(resolve(root, 'contracts', file), 'utf8');
  const deployed = source.replace(/^# \{ "Depends": "[^"]+" \}/, `# { "Depends": "${runner}" }`);
  report.sources[file] = { sourceSha256: createHash('sha256').update(source).digest('hex'), deployedSha256: createHash('sha256').update(deployed).digest('hex') };
  const hash = await client.deployContract({ account, code: new TextEncoder().encode(deployed), args, fees: await fees() });
  const result = await receipt(`deploy:${file}`, hash);
  const address = result.data?.contract_address;
  assert.ok(address, 'Successful deployment must have an address');
  await client.getContractSchema(address);
  return address;
}
const read = (address, functionName, args = []) => client.readContract({ address, functionName, args, jsonSafeReturn: true });
async function write(address, functionName, args = [], value = 0n, expected) {
  const hash = await client.writeContract({ account, address, functionName, args, value, fees: await fees() });
  return receipt(functionName, hash, expected);
}
try {
  assert.equal(await client.getChainId(), 61997);
  assert.equal(await client.getTransactionCount({ address: account.address, blockTag: 'latest' }), 0);
  assert.equal(await client.getTransactionCount({ address: account.address, blockTag: 'pending' }), 0);
  // Studio's documented simulator funding, not funds transferred from real wallets.
  report.funding = await request('sim_fundAccount', [account.address, 1000000]);
  report.balance = await request('eth_getBalance', [account.address, 'latest']);
  assert.ok(BigInt(report.balance) >= 3n);
  report.governor = await deploy('governor.py'); save();
  const mandate = 'Pay the declared provider for infrastructure. Never pay one provider 24 or more times in the short-window fixture; never drain the vault in one payment.';
  const caseSpecs = [
    { name: 'matching', count: 3, sealed: true, expected: 'ON_MANDATE', halted: false },
    { name: 'conflict', count: 2, sealed: true, expected: 'EVIDENCE_CONFLICT', halted: true },
    { name: 'unsealed', count: 3, sealed: false, expected: 'REVIEW_FAILED', halted: true },
  ];
  const selectedCase = process.env.STELE_FEED_CASE;
  const selectedSpecs = selectedCase ? caseSpecs.filter(({ name }) => name === selectedCase) : caseSpecs;
  assert.ok(selectedSpecs.length, `Unknown STELE_FEED_CASE: ${selectedCase}`);
  const fixtureWindow = 86400n;
  for (const spec of selectedSpecs) {
    // Separate Governors preserve independent halt/enrollment state for the same signer.
    const governor = spec.name === 'matching' ? report.governor : await deploy('governor.py');
    const feed = await deploy('provider_invoice_feed.py');
    const caseVault = await deploy('vault_twin.py', [1000n, addr(account.address), addr(governor)]);
    const row = { ...spec, agent: account.address, governor, feed, vault: caseVault };
    report.cases.push(row); save();
    await write(feed, 'update_feed', ['0'.repeat(64), BigInt(spec.count), 1n]);
    if (spec.sealed) await write(feed, 'seal');
    row.snapshot = await read(feed, 'snapshot');
    await write(governor, 'enroll_with_feed', [addr(account.address), addr(caseVault), mandate, [addr(account.address)], fixtureWindow, fixtureWindow, addr(feed), '', '', fixtureWindow, 'native'], 1n);
    await write(caseVault, 'seed_state', [30n, 1n, 970n, account.address, '3', '30']);
    await write(governor, 'review', [addr(account.address)]);
    row.ruling = await read(governor, 'get_governed', [addr(account.address)]);
    row.actualHalted = await read(governor, 'is_halted', [addr(account.address)]);
    save();
    assert.equal(row.ruling, spec.expected);
    assert.equal(row.actualHalted, spec.halted);
    if (spec.halted) {
      const before = await read(caseVault, 'agent_state');
      const rejection = await write(caseVault, 'spend', [addr(account.address), 1n], 0n, 'FINISHED_WITH_ERROR');
      assert.match(json(rejection), /Vault is halted/);
      assert.deepEqual(await read(caseVault, 'agent_state'), before);
      row.spendRejected = true;
    }
    row.passed = true; save();
    console.log(json({ case: row.name, ruling: row.ruling, passed: true }));
  }
  report.passed = true; save();
  console.log(json({ passed: true, report: output, governor: report.governor }));
} catch (error) {
  // Avoid serializing SDK error objects, which can contain signed payloads/account data.
  report.passed = false;
  report.error = String(error.shortMessage || error.message).slice(0, 1500);
  save();
  console.error(json({ passed: false, error: report.error, report: output }));
  process.exitCode = 1;
}
