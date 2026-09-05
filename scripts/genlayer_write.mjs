import fs from "node:fs/promises";
import { createClient, createAccount } from "file:///C:/Users/ASUS/AppData/Roaming/npm/node_modules/genlayer/node_modules/genlayer-js/dist/index.js";
import { testnetBradbury } from "file:///C:/Users/ASUS/AppData/Roaming/npm/node_modules/genlayer/node_modules/genlayer-js/dist/chains/index.js";
import { CalldataAddress } from "file:///C:/Users/ASUS/AppData/Roaming/npm/node_modules/genlayer/node_modules/genlayer-js/dist/chunk-EY35NPSE.js";
import { Wallet } from "file:///C:/Users/ASUS/AppData/Roaming/npm/node_modules/genlayer/node_modules/ethers/lib.esm/index.js";

const [keystorePath, password, requestJson] = process.argv.slice(2);
if (!keystorePath || password === undefined || !requestJson) {
  throw new Error("usage: genlayer_write.mjs <keystore> <password> <request-json>");
}

const keystore = await fs.readFile(keystorePath, "utf8");
const wallet = await Wallet.fromEncryptedJson(keystore, password);
const account = createAccount(wallet.privateKey);
const request = JSON.parse(requestJson);
const encodeAddresses = (value) => {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) {
    return new CalldataAddress(Uint8Array.from(value.slice(2).match(/../g).map((byte) => parseInt(byte, 16))));
  }
  if (Array.isArray(value)) return value.map(encodeAddresses);
  return value;
};
const addressIndexes = new Set(request.addressArgIndexes || []);
const encodedArgs = (request.args || []).map((value, index) => addressIndexes.has(index) ? encodeAddresses(value) : value);
const client = createClient({ chain: testnetBradbury, account });
const hash = await client.writeContract({
  address: request.address,
  functionName: request.functionName,
  args: encodedArgs,
  value: BigInt(request.value ?? "0"),
});
process.stdout.write(`${hash}\n`);
