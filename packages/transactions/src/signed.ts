import {
  blake2b256,
  signTransaction,
  signTransactionRaw,
  type KeyPair
} from "@gajumaru/crypto";
import {
  encodeTx,
  encodeTxHash,
  OBJECT_TAGS,
  serialize,
  type Fields,
  type Template
} from "@gajumaru/encoding";

export const SIGNED_TX_TEMPLATE: Template = [
  ["signatures", ["binary"]],
  ["transaction", "binary"]
];

export type SigningMode = "hashed" | "raw";

export function wrapSignedTransaction(
  unsignedTx: Uint8Array,
  signatures: Uint8Array[]
): Uint8Array {
  const sorted = [...signatures].sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.length - b.length;
  });
  const fields: Fields = [
    ["signatures", sorted],
    ["transaction", unsignedTx]
  ];
  return serialize(OBJECT_TAGS.signed_tx, 1, SIGNED_TX_TEMPLATE, fields);
}

/** Default is hashed (`hz:sign_tx`). Spend transactions must pass `"raw"`. */
export function signUnsignedTransaction(
  unsignedTx: Uint8Array,
  secretKey: Uint8Array,
  networkId: string,
  mode: SigningMode = "hashed"
): Uint8Array {
  const signature =
    mode === "raw"
      ? signTransactionRaw(unsignedTx, secretKey, networkId)
      : signTransaction(unsignedTx, secretKey, networkId);
  return wrapSignedTransaction(unsignedTx, [signature]);
}

export function encodeSignedTransaction(signedTx: Uint8Array): string {
  return encodeTx(signedTx);
}

export function transactionHash(signedTx: Uint8Array): string {
  return encodeTxHash(blake2b256(signedTx));
}

export function signAndEncode(
  unsignedTx: Uint8Array,
  keyPair: KeyPair,
  networkId: string,
  mode: SigningMode = "hashed"
): { encoded: string; hash: string; signedTx: Uint8Array } {
  const signedTx = signUnsignedTransaction(unsignedTx, keyPair.secretKey, networkId, mode);
  return {
    signedTx,
    encoded: encodeSignedTransaction(signedTx),
    hash: transactionHash(signedTx)
  };
}
