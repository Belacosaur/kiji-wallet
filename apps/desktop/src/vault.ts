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
  return Buffer.from(bytes).toString("base64");
}

function fromB64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

async function deriveKey(password: string, salt: Uint8Array, iterations = ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function exportRaw(key: CryptoKey): Promise<string> {
  return toB64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

function kdfIterations(encrypted: EncryptedVault) {
  return encrypted.kdf.parameters.iterations || ITERATIONS;
}

export async function encryptVault(vault: VaultPlaintext, password: string): Promise<EncryptedVault> {
  return (await sealVault(vault, password)).encrypted;
}

export async function sealVault(
  vault: VaultPlaintext,
  password: string
): Promise<{ encrypted: EncryptedVault; rawKey: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(vault));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, encoded)
  );
  return {
    encrypted: {
      version: 1,
      kdf: {
        algorithm: "PBKDF2",
        salt: toB64(salt),
        parameters: { iterations: ITERATIONS, hash: "SHA-256" }
      },
      cipher: { algorithm: "AES-GCM", iv: toB64(iv) },
      ciphertext: toB64(ciphertext)
    },
    rawKey: await exportRaw(key)
  };
}

export async function decryptVault(encrypted: EncryptedVault, password: string): Promise<VaultPlaintext> {
  return (await unlockVault(encrypted, password)).vault;
}

export async function unlockVault(
  encrypted: EncryptedVault,
  password: string
): Promise<{ vault: VaultPlaintext; rawKey: string }> {
  const salt = fromB64(encrypted.kdf.salt);
  const iv = fromB64(encrypted.cipher.iv);
  const key = await deriveKey(password, salt, kdfIterations(encrypted));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    fromB64(encrypted.ciphertext) as BufferSource
  );
  return {
    vault: JSON.parse(new TextDecoder().decode(plaintext)) as VaultPlaintext,
    rawKey: await exportRaw(key)
  };
}

export async function exportRawKey(password: string, saltB64: string, iterations = ITERATIONS): Promise<string> {
  const key = await deriveKey(password, fromB64(saltB64), iterations);
  return exportRaw(key);
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

export async function encryptVaultWithRawKey(
  vault: VaultPlaintext,
  rawKeyB64: string,
  previous: EncryptedVault
): Promise<EncryptedVault> {
  const key = await crypto.subtle.importKey(
    "raw",
    fromB64(rawKeyB64) as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      new TextEncoder().encode(JSON.stringify(vault))
    )
  );
  return {
    ...previous,
    cipher: { algorithm: "AES-GCM", iv: toB64(iv) },
    ciphertext: toB64(ciphertext)
  };
}
