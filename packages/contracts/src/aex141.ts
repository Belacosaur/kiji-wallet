import { AciContractCallEncoder } from "@aeternity/aepp-calldata";
import { decode } from "@gajumaru/encoding";
import { IAEX141_ACI } from "./aex141-aci.js";

const encoder = new AciContractCallEncoder(IAEX141_ACI as unknown as any[]);
const CONTRACT = "IAEX141";

export function assertContractId(value: string) {
  const { type } = decode(value.trim());
  if (type !== "contract_pubkey") throw new Error("Collection must be a Groot contract id (ct_…)");
  return value.trim();
}

export function assertAccountId(value: string) {
  const { type } = decode(value.trim());
  if (type !== "account_pubkey") throw new Error("Recipient must be a Groot account id (ak_…)");
  return value.trim();
}

export function parseTokenId(value: string | number | bigint) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new Error("Token id must be a non-negative integer");
  return BigInt(text);
}

export function encodeAex141Call(fn: string, args: unknown[] = []): `cb_${string}` {
  return encoder.encodeCall(CONTRACT, fn, args);
}

export function decodeAex141Result(fn: string, data: string) {
  return encoder.decodeResult(CONTRACT, fn, data as `cb_${string}`);
}

export function encodeAex141Transfer(to: string, tokenId: bigint | number | string, data?: string) {
  return encodeAex141Call("transfer", [to, BigInt(tokenId), data ?? undefined]);
}

export function encodeAex141Owner(tokenId: bigint | number | string) {
  return encodeAex141Call("owner", [BigInt(tokenId)]);
}

export function encodeAex141Metadata(tokenId: bigint | number | string) {
  return encodeAex141Call("metadata", [BigInt(tokenId)]);
}

export function encodeAex141MetaInfo() {
  return encodeAex141Call("meta_info", []);
}

export function encodeAex141Balance(account: string) {
  return encodeAex141Call("balance", [account]);
}

export function encodeAex141TotalSupply() {
  return encodeAex141Call("total_supply", []);
}
