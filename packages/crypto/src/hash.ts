import { blake2b } from "@noble/hashes/blake2b.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { sha3_256 } from "@noble/hashes/sha3.js";

export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256(data);
}

export function doubleSha256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

export function sha3_256Bytes(data: Uint8Array): Uint8Array {
  return sha3_256(data);
}

export function blake2b256(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32 });
}
