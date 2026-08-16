export interface WalletAccountRecord {
  id: string;
  name: string;
  seed: string;
  address: string;
  publicKey: string;
  createdAt: number;
}

export interface VaultPlaintext {
  version: 1;
  accounts: WalletAccountRecord[];
  selectedAccountId: string;
  createdAt: number;
}

export interface EncryptedVault {
  version: 1;
  kdf: {
    algorithm: "PBKDF2";
    salt: string;
    parameters: { iterations: number; hash: "SHA-256" };
  };
  cipher: {
    algorithm: "AES-GCM";
    iv: string;
  };
  ciphertext: string;
}

const ITERATIONS = 600_000;

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVault(vault: VaultPlaintext, password: string): Promise<EncryptedVault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(vault));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, encoded)
  );
  return {
    version: 1,
    kdf: {
      algorithm: "PBKDF2",
      salt: toB64(salt),
      parameters: { iterations: ITERATIONS, hash: "SHA-256" }
    },
    cipher: { algorithm: "AES-GCM", iv: toB64(iv) },
    ciphertext: toB64(ciphertext)
  };
}

export async function decryptVault(encrypted: EncryptedVault, password: string): Promise<VaultPlaintext> {
  const salt = fromB64(encrypted.kdf.salt);
  const iv = fromB64(encrypted.cipher.iv);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    fromB64(encrypted.ciphertext) as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as VaultPlaintext;
}

export async function exportRawKey(password: string, saltB64: string): Promise<string> {
  const key = await deriveKey(password, fromB64(saltB64));
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return toB64(raw);
}

export async function decryptVaultWithRawKey(
  encrypted: EncryptedVault,
  rawKeyB64: string
): Promise<VaultPlaintext> {
  const key = await crypto.subtle.importKey(
    "raw",
    fromB64(rawKeyB64) as BufferSource,
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(encrypted.cipher.iv) as BufferSource },
    key,
    fromB64(encrypted.ciphertext) as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as VaultPlaintext;
}
