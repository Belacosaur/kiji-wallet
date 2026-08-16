import nacl from "tweetnacl";
import { concatBytes, utf8Bytes } from "./bytes.js";
import { blake2b256 } from "./hash.js";

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return seed;
}

export function deriveKeyPair(seed: Uint8Array): KeyPair {
  if (seed.length !== 32) {
    throw new Error("Gajumaru seeds must be 32 bytes");
  }
  const pair = nacl.sign.keyPair.fromSeed(seed);
  return {
    publicKey: pair.publicKey,
    secretKey: pair.secretKey
  };
}

export function seedFromSecretKey(secretKey: Uint8Array): Uint8Array {
  if (secretKey.length === 32) return secretKey;
  if (secretKey.length === 64) return secretKey.slice(0, 32);
  throw new Error("secret key must be 32 or 64 bytes");
}

export function normalizeSecretKey(secretKey: Uint8Array): Uint8Array {
  if (secretKey.length === 64) return secretKey;
  return deriveKeyPair(secretKey).secretKey;
}

export function signDetached(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, normalizeSecretKey(secretKey));
}

export function verifyDetached(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) return false;
  return nacl.sign.detached.verify(message, signature, publicKey);
}

/**
 * Transaction signing as used by hakuzaru `hz:sign_tx/3`.
 *
 * Payload = NetworkId || blake2b-256(unsigned_tx_bytes)
 */
export function signTransaction(
  tx: Uint8Array,
  secretKey: Uint8Array,
  networkId: string
): Uint8Array {
  const hashed = blake2b256(tx);
  const payload = concatBytes(utf8Bytes(networkId), hashed);
  return signDetached(payload, secretKey);
}

/**
 * Spend-path signing as used by hakuzaru `hz:spend3/10`.
 *
 * Payload = NetworkId || unsigned_tx_bytes
 *
 * These two hakuzaru paths currently differ. Groot node verification is the
 * compatibility authority; both are exposed until QPQ confirms one.
 */
export function signTransactionRaw(
  tx: Uint8Array,
  secretKey: Uint8Array,
  networkId: string
): Uint8Array {
  const payload = concatBytes(utf8Bytes(networkId), tx);
  return signDetached(payload, secretKey);
}

export function verifyTransaction(
  tx: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
  networkId: string
): boolean {
  const hashed = blake2b256(tx);
  const payload = concatBytes(utf8Bytes(networkId), hashed);
  return verifyDetached(payload, signature, publicKey);
}

export function verifyTransactionRaw(
  tx: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
  networkId: string
): boolean {
  const payload = concatBytes(utf8Bytes(networkId), tx);
  return verifyDetached(payload, signature, publicKey);
}

const MESSAGE_PREFIX = "Gajumaru Signed Message:\n";
const BINARY_PREFIX = "Gajumaru Signed Binary:";

function bitcoinVarInt(n: number): Uint8Array {
  if (n <= 0) {
    throw new Error("variable integer must be positive");
  }
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) {
    const out = new Uint8Array(3);
    out[0] = 0xfd;
    out[1] = n & 0xff;
    out[2] = (n >> 8) & 0xff;
    return out;
  }
  if (n <= 0xffffffff) {
    const out = new Uint8Array(5);
    out[0] = 0xfe;
    const view = new DataView(out.buffer);
    view.setUint32(1, n, true);
    return out;
  }
  const out = new Uint8Array(9);
  out[0] = 0xff;
  const view = new DataView(out.buffer);
  view.setBigUint64(1, BigInt(n), true);
  return out;
}

export function messageSigningDigest(message: Uint8Array): Uint8Array {
  const prefix = utf8Bytes(MESSAGE_PREFIX);
  const smashed = concatBytes(
    bitcoinVarInt(prefix.length),
    prefix,
    bitcoinVarInt(message.length),
    message
  );
  return blake2b256(smashed);
}

export function signMessage(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return signDetached(messageSigningDigest(message), secretKey);
}

export function verifyMessage(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return verifyDetached(messageSigningDigest(message), signature, publicKey);
}

export function binarySigningDigest(binary: Uint8Array): Uint8Array {
  return blake2b256(concatBytes(utf8Bytes(BINARY_PREFIX), binary));
}

export function signBinary(binary: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return signDetached(binarySigningDigest(binary), secretKey);
}

export function verifyBinary(
  binary: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return verifyDetached(binarySigningDigest(binary), signature, publicKey);
}
