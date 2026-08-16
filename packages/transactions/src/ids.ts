import { decode } from "@gajumaru/encoding";
import { createId, type ChainId } from "@gajumaru/encoding";

export function accountIdFromAddress(address: string): ChainId {
  const { type, payload } = decode(address);
  if (type === "account_pubkey") return createId("account", payload);
  if (type === "name") return createId("name", payload);
  throw new Error(`expected account address, got ${type}`);
}

export function contractIdFromAddress(address: string): ChainId {
  const { type, payload } = decode(address);
  if (type !== "contract_pubkey") {
    throw new Error(`expected contract address, got ${type}`);
  }
  return createId("contract", payload);
}

export function payloadBytes(payload: string | Uint8Array | undefined): Uint8Array {
  if (!payload) return new Uint8Array();
  if (payload instanceof Uint8Array) return payload;
  return new TextEncoder().encode(payload);
}
