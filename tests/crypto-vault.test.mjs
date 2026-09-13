import assert from "node:assert/strict";
import test from "node:test";
import { decryptVaultData, encryptVaultData } from "../crypto-vault.js";

test("encrypted vault round-trips without plaintext credentials", async () => {
  const value = { accounts: [{ provider: "deepseek", apiKey: "sk-private-example" }] };
  const record = await encryptVaultData(value, "this is a long test passphrase", { iterations: 1_000 });
  assert.doesNotMatch(JSON.stringify(record), /sk-private-example/);
  assert.deepEqual(await decryptVaultData(record, "this is a long test passphrase"), value);
});

test("encrypted vault rejects the wrong passphrase", async () => {
  const record = await encryptVaultData({ accounts: [] }, "correct horse battery", { iterations: 1_000 });
  await assert.rejects(() => decryptVaultData(record, "incorrect horse key"), /Incorrect passphrase/);
});

test("encrypted vault requires a meaningful passphrase", async () => {
  await assert.rejects(() => encryptVaultData({}, "short"), /at least 12 characters/);
});
