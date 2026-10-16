const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Deliberately kept as the app's old name ("quota-local"), not renamed to
// AI Quota Meter — this is the literal localStorage key every user's
// encrypted vault is already stored under. Renaming it would not touch their
// real data at all; it would just make the app look under a different key,
// find nothing, and appear to have deleted every account they've added. See
// app.js for the same reasoning applied to the vault's sibling keys.
export const VAULT_STORAGE_KEY = "quota-local:encrypted-vault:v1";
export const PBKDF2_ITERATIONS = 600_000;
// A "just me on this device" vault has no passphrase at all: it is encrypted
// with a random AES key that the caller keeps in this browser's storage (the
// same slot "Stay signed in" uses). Nothing is derived, so there is no salt
// and no work factor, and the record cannot be opened anywhere else.
export const DEVICE_KEY_KDF = "device-key";

function bytesToBase64(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS, extractable = false) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

async function encryptWithKey(value, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

async function decryptWithKey(record, key) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.iv) },
    key,
    base64ToBytes(record.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext));
}

export async function encryptVaultData(value, passphrase, options = {}) {
  if (typeof passphrase !== "string" || passphrase.length < 4) {
    throw new Error("Use a password of at least 4 characters.");
  }
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, iterations);
  const encrypted = await encryptWithKey(value, key);
  return {
    version: 1,
    kdf: "PBKDF2-HMAC-SHA256",
    iterations,
    salt: bytesToBase64(salt),
    ...encrypted,
  };
}

export async function decryptVaultData(record, passphrase) {
  if (!record || record.version !== 1 || record.kdf !== "PBKDF2-HMAC-SHA256") {
    throw new Error("Unsupported encrypted vault format.");
  }
  try {
    const key = await deriveKey(passphrase, base64ToBytes(record.salt), record.iterations);
    return await decryptWithKey(record, key);
  } catch {
    throw new Error("Incorrect password or damaged vault.");
  }
}

export class LocalEncryptedVault {
  constructor(storage = localStorage) {
    this.storage = storage;
    this.key = null;
    this.record = null;
    this.data = null;
  }

  exists() {
    return this.storage.getItem(VAULT_STORAGE_KEY) !== null;
  }

  isUnlocked() {
    return this.key !== null;
  }

  // Readable while locked, so the lock screen can tell a passphrase vault
  // from one whose only key lives on this device.
  usesDeviceKey() {
    try {
      return JSON.parse(this.storage.getItem(VAULT_STORAGE_KEY))?.kdf === DEVICE_KEY_KDF;
    } catch {
      return false;
    }
  }

  // Creates a passphrase-free vault and returns its raw key (base64) for the
  // caller to keep. Losing that stored key makes the vault unreadable.
  async createWithDeviceKey(initialData = { accounts: [], preferences: {} }) {
    const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", generated));
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    const record = { version: 1, kdf: DEVICE_KEY_KDF, ...(await encryptWithKey(initialData, key)) };
    this.storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(record));
    this.record = record;
    this.key = key;
    this.data = structuredClone(initialData);
    return bytesToBase64(raw);
  }

  // Re-encrypts the unlocked vault under a passphrase (new salt), turning a
  // device-key vault into a normal one. Any stored device or remember key no
  // longer matches afterwards; the caller decides whether to store a new one.
  async setPassphrase(passphrase, options = {}) {
    if (!this.key || !this.data) throw new Error("Unlock the encrypted vault first.");
    const record = await encryptVaultData(this.data, passphrase, options);
    this.storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(record));
    this.record = record;
    this.key = await deriveKey(passphrase, base64ToBytes(record.salt), record.iterations);
  }

  async create(passphrase, initialData = { accounts: [], preferences: {} }) {
    const record = await encryptVaultData(initialData, passphrase);
    this.storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(record));
    this.record = record;
    this.key = await deriveKey(passphrase, base64ToBytes(record.salt), record.iterations);
    this.data = structuredClone(initialData);
    return structuredClone(this.data);
  }

  async unlock(passphrase) {
    const serialized = this.storage.getItem(VAULT_STORAGE_KEY);
    if (!serialized) throw new Error("No encrypted vault exists on this browser.");
    const record = JSON.parse(serialized);
    const data = await decryptVaultData(record, passphrase);
    this.record = record;
    this.key = await deriveKey(passphrase, base64ToBytes(record.salt), record.iterations);
    this.data = data;
    return structuredClone(data);
  }

  async save(data) {
    if (!this.key || !this.record) throw new Error("Unlock the encrypted vault first.");
    const encrypted = await encryptWithKey(data, this.key);
    this.record = { ...this.record, ...encrypted };
    this.storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(this.record));
    this.data = structuredClone(data);
    return structuredClone(this.data);
  }

  lock() {
    this.key = null;
    this.record = null;
    this.data = null;
  }

  // Exports a raw AES key derived from the given passphrase, for an opt-in
  // "remember this device" flow. This never touches this.key (which stays
  // non-extractable for normal operation) and never stores the passphrase
  // itself — only a one-way-derived, vault-scoped key.
  async exportRememberKey(passphrase) {
    if (!this.record) throw new Error("Unlock the vault first.");
    const extractableKey = await deriveKey(passphrase, base64ToBytes(this.record.salt), this.record.iterations, true);
    const raw = await crypto.subtle.exportKey("raw", extractableKey);
    return bytesToBase64(new Uint8Array(raw));
  }

  async unlockWithRememberKey(base64Key) {
    const serialized = this.storage.getItem(VAULT_STORAGE_KEY);
    if (!serialized) throw new Error("No encrypted vault exists on this browser.");
    const record = JSON.parse(serialized);
    let key;
    try {
      key = await crypto.subtle.importKey("raw", base64ToBytes(base64Key), "AES-GCM", false, ["encrypt", "decrypt"]);
    } catch {
      throw new Error("Invalid remembered key.");
    }
    const data = await decryptWithKey(record, key);
    this.record = record;
    this.key = key;
    this.data = data;
    return structuredClone(data);
  }

  exportEncrypted() {
    const serialized = this.storage.getItem(VAULT_STORAGE_KEY);
    if (!serialized) throw new Error("No encrypted vault to export.");
    if (this.usesDeviceKey()) throw new Error("Add a password first. This vault opens with a key kept only on this device, so a backup of it could not be opened anywhere else.");
    return serialized;
  }

  importEncrypted(serialized) {
    const record = JSON.parse(serialized);
    if (!record || record.version !== 1 || !record.salt || !record.iv || !record.ciphertext) {
      throw new Error("This is not a valid AI Quota Meter encrypted vault.");
    }
    this.storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(record));
    this.lock();
  }

  clear() {
    this.storage.removeItem(VAULT_STORAGE_KEY);
    this.lock();
  }
}
