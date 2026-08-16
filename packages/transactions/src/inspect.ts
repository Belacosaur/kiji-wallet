import {
  OBJECT_TAGS,
  TAG_TO_TYPE,
  bytesToUnsigned,
  decodeRlp,
  deserialize,
  encodeAccountAddress,
  encodeContractAddress,
  formatGaju,
  type ChainId
} from "@gajumaru/encoding";
import { CONTRACT_CALL_TEMPLATE } from "./contract.js";
import { SPEND_TEMPLATE } from "./spend.js";
import type { SigningMode } from "./signed.js";

/** Spends follow hakuzaru `hz:spend3` (NetworkId || raw tx). */
export const SPEND_SIGNING_MODE: SigningMode = "raw";
/** Other txs follow hakuzaru `hz:sign_tx` (NetworkId || blake2b(tx)). */
export const CONTRACT_SIGNING_MODE: SigningMode = "hashed";

export type UnsignedTxSummary = {
  type: string;
  signingMode: SigningMode;
  summary: Record<string, string>;
};

export function peekObjectTag(binary: Uint8Array): number | undefined {
  try {
    const decoded = decodeRlp(binary);
    if (!Array.isArray(decoded) || !(decoded[0] instanceof Uint8Array)) return undefined;
    return Number(bytesToUnsigned(decoded[0]));
  } catch {
    return undefined;
  }
}

function formatId(id: ChainId): string {
  if (id.tag === "account") return encodeAccountAddress(id.value);
  if (id.tag === "contract") return encodeContractAddress(id.value);
  return id.tag;
}

export function inspectUnsignedTx(binary: Uint8Array): UnsignedTxSummary {
  const tag = peekObjectTag(binary);
  if (tag === OBJECT_TAGS.spend_tx) {
    const fields = Object.fromEntries(deserialize(OBJECT_TAGS.spend_tx, 1, SPEND_TEMPLATE, binary));
    return {
      type: "Spend",
      signingMode: SPEND_SIGNING_MODE,
      summary: {
        Type: "Spend",
        To: formatId(fields.recipient_id as ChainId),
        Amount: `${formatGaju(fields.amount as bigint)} GAJU`
      }
    };
  }
  if (tag === OBJECT_TAGS.contract_call_tx) {
    const fields = Object.fromEntries(
      deserialize(OBJECT_TAGS.contract_call_tx, 1, CONTRACT_CALL_TEMPLATE, binary)
    );
    return {
      type: "Contract call",
      signingMode: CONTRACT_SIGNING_MODE,
      summary: {
        Type: "Contract call",
        Contract: formatId(fields.contract_id as ChainId),
        Amount: `${formatGaju(fields.amount as bigint)} GAJU`
      }
    };
  }
  const type = tag !== undefined ? (TAG_TO_TYPE[tag] ?? `tag ${tag}`) : "Unknown";
  return {
    type,
    signingMode: CONTRACT_SIGNING_MODE,
    summary: {
      Type: type.replace(/_/g, " "),
      Size: `${binary.length} bytes`
    }
  };
}
