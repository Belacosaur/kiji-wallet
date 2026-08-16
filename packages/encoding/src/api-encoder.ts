import { concatBytes, doubleSha256 } from "@gajumaru/crypto";
import { decodeBase58, encodeBase58 } from "./base58.js";

export type EncodedType =
  | "key_block_hash"
  | "micro_block_hash"
  | "block_pof_hash"
  | "block_tx_hash"
  | "block_state_hash"
  | "block_witness_hash"
  | "channel"
  | "contract_bytearray"
  | "contract_pubkey"
  | "contract_store_key"
  | "contract_store_value"
  | "contract_source"
  | "transaction"
  | "tx_hash"
  | "account_pubkey"
  | "account_seckey"
  | "associate_chain"
  | "signature"
  | "commitment"
  | "peer_pubkey"
  | "name"
  | "native_token"
  | "state"
  | "poi"
  | "state_trees"
  | "call_state_tree"
  | "mp_tree_hash"
  | "hash"
  | "entry"
  | "bytearray";

const PREFIX: Record<EncodedType, string> = {
  key_block_hash: "kh",
  micro_block_hash: "mh",
  block_pof_hash: "bf",
  block_tx_hash: "bx",
  block_state_hash: "bs",
  block_witness_hash: "ws",
  channel: "ch",
  contract_pubkey: "ct",
  contract_bytearray: "cb",
  contract_store_key: "ck",
  contract_store_value: "cv",
  contract_source: "cx",
  transaction: "tx",
  tx_hash: "th",
  account_pubkey: "ak",
  account_seckey: "sk",
  associate_chain: "ac",
  signature: "sg",
  commitment: "cm",
  peer_pubkey: "pp",
  name: "nm",
  native_token: "nt",
  state: "st",
  poi: "pi",
  state_trees: "ss",
  call_state_tree: "cs",
  mp_tree_hash: "mt",
  hash: "hs",
  entry: "en",
  bytearray: "ba"
};

const PREFIX_TO_TYPE = Object.fromEntries(
  Object.entries(PREFIX).map(([type, prefix]) => [prefix, type])
) as Record<string, EncodedType>;

const BASE64_TYPES = new Set<EncodedType>([
  "contract_bytearray",
  "contract_store_key",
  "contract_store_value",
  "contract_source",
  "transaction",
  "state",
  "poi",
  "state_trees",
  "call_state_tree",
  "entry",
  "bytearray"
]);

const SIZES: Partial<Record<EncodedType, number>> = {
  key_block_hash: 32,
  micro_block_hash: 32,
  block_pof_hash: 32,
  block_tx_hash: 32,
  block_state_hash: 32,
  block_witness_hash: 32,
  channel: 32,
  contract_pubkey: 32,
  tx_hash: 32,
  account_pubkey: 32,
  account_seckey: 32,
  associate_chain: 32,
  signature: 64,
  native_token: 32,
  commitment: 32,
  peer_pubkey: 32,
  state: 32,
  mp_tree_hash: 32,
  hash: 32
};

function checksum(payload: Uint8Array): Uint8Array {
  return doubleSha256(payload).slice(0, 4);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeCheck(type: EncodedType, payload: Uint8Array): string {
  const body = concatBytes(payload, checksum(payload));
  return BASE64_TYPES.has(type) ? toBase64(body) : encodeBase58(body);
}

function decodeCheck(type: EncodedType, encoded: string): Uint8Array {
  const decoded = BASE64_TYPES.has(type) ? fromBase64(encoded) : decodeBase58(encoded);
  if (decoded.length < 4) throw new Error("encoded payload too short");
  const body = decoded.slice(0, decoded.length - 4);
  const check = decoded.slice(decoded.length - 4);
  const expected = checksum(body);
  if (check.length !== expected.length || check.some((b, i) => b !== expected[i])) {
    throw new Error("checksum mismatch");
  }
  return body;
}

export function encode(type: EncodedType, payload: Uint8Array): string {
  const expected = SIZES[type];
  if (expected !== undefined && payload.length !== expected) {
    throw new Error(`${type} must be ${expected} bytes`);
  }
  return `${PREFIX[type]}_${encodeCheck(type, payload)}`;
}

export function decode(encoded: string): { type: EncodedType; payload: Uint8Array } {
  const split = encoded.indexOf("_");
  if (split <= 0) throw new Error("missing prefix");
  const prefix = encoded.slice(0, split);
  const rest = encoded.slice(split + 1);
  const type = PREFIX_TO_TYPE[prefix];
  if (!type) throw new Error(`unknown prefix: ${prefix}`);
  const payload = decodeCheck(type, rest);
  const expected = SIZES[type];
  if (expected !== undefined && payload.length !== expected) {
    throw new Error("incorrect_size");
  }
  return { type, payload };
}

export function encodeAccountAddress(publicKey: Uint8Array): string {
  return encode("account_pubkey", publicKey);
}

export function encodeTx(bytes: Uint8Array): string {
  return encode("transaction", bytes);
}

export function encodeTxHash(hash: Uint8Array): string {
  return encode("tx_hash", hash);
}

export function encodeSignature(signature: Uint8Array): string {
  return encode("signature", signature);
}

export function encodeContractAddress(publicKey: Uint8Array): string {
  return encode("contract_pubkey", publicKey);
}
