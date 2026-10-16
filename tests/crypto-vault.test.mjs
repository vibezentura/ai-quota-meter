import assert from "node:assert/strict";
import test from "node:test";
import { decryptVaultData, encryptVaultData, LocalEncryptedVault, VAULT_STORAGE_KEY } from "../crypto-vault.js";

test("encrypted vault round-trips without plaintext credentials", async () => {
  const value = { accounts: [{ provider: "deepseek", apiKey: "sk-private-example" }] };
  const record = await encryptVaultData(value, "this is a long test passphrase", { iterations: 1_000 });
  assert.doesNotMatch(JSON.stringify(record), /sk-private-example/);
  assert.deepEqual(await decryptVaultData(record, "this is a long test passphrase"), value);
});

test("encrypted vault rejects the wrong passphrase", async () => {
  const record = await encryptVaultData({ accounts: [] }, "correct horse battery", { iterations: 1_000 });
  await assert.rejects(() => decryptVaultData(record, "incorrect horse key"), /Incorrect password/);
});

test("encrypted vault requires a password of at least 4 characters", async () => {
  await assert.rejects(() => encryptVaultData({}, "abc"), /at least 4 characters/);
});

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

test("device-key vault opens with its stored key and needs no passphrase", async () => {
  const storage = memoryStorage();
  const vault = new LocalEncryptedVault(storage);
  const deviceKey = await vault.createWithDeviceKey({ accounts: [{ apiKey: "sk-device-example" }], preferences: {} });
  assert.equal(vault.usesDeviceKey(), true);
  assert.doesNotMatch(storage.getItem(VAULT_STORAGE_KEY), /sk-device-example/);
  await vault.save({ accounts: [{ apiKey: "sk-device-example" }, { apiKey: "second" }], preferences: {} });

  const reopened = new LocalEncryptedVault(storage);
  const data = await reopened.unlockWithRememberKey(deviceKey);
  assert.equal(data.accounts.length, 2);
  assert.throws(() => reopened.exportEncrypted(), /Add a password first/);
  await assert.rejects(() => reopened.unlock("any long passphrase here"), /Unsupported encrypted vault format/);
});

test("adding a passphrase converts a device-key vault into a normal one", async () => {
  const storage = memoryStorage();
  const vault = new LocalEncryptedVault(storage);
  const deviceKey = await vault.createWithDeviceKey({ accounts: [{ label: "kept" }], preferences: {} });
  await vault.setPassphrase("a brand new long passphrase", { iterations: 1_000 });
  assert.equal(vault.usesDeviceKey(), false);
  assert.ok(vault.exportEncrypted());

  const reopened = new LocalEncryptedVault(storage);
  await assert.rejects(() => reopened.unlockWithRememberKey(deviceKey));
  assert.deepEqual((await reopened.unlock("a brand new long passphrase")).accounts, [{ label: "kept" }]);
});
