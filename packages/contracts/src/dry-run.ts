import { decode, encodeTx, DEFAULT_TTL_DELTA } from "@gajumaru/encoding";
import type { GajumaruRpc } from "@gajumaru/rpc";
import { createContractCallTransaction } from "@gajumaru/transactions";

export const NFT_CALL_GAS = 1_000_000n;
export const DRY_RUN_ACCOUNT_PUCKS = 10n ** 30n;

export interface DryRunCallResult {
  ok: boolean;
  returnValue?: string;
  reason?: string;
  raw: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

export function parseDryRunResult(raw: unknown): DryRunCallResult {
  const root = asRecord(raw);
  const results = root?.results;
  const first = Array.isArray(results) ? asRecord(results[0]) : undefined;
  if (!first) return { ok: false, reason: "No dry-run result", raw };
  const callObj = asRecord(first.call_obj);
  const returnType = callObj ? String(callObj.return_type ?? "") : "";
  const returnValue =
    callObj && typeof callObj.return_value === "string" ? callObj.return_value : undefined;
  const result = String(first.result ?? "");
  const reason = typeof first.reason === "string" ? first.reason.trim() : undefined;
  const ok = result === "ok" && (returnType === "ok" || returnType === "" || !callObj);
  return {
    ok,
    returnValue,
    reason: ok ? undefined : reason || returnType || result || "Dry-run failed",
    raw
  };
}

export async function dryRunCalldata(
  rpc: GajumaruRpc,
  params: { caller: string; contract: string; calldata: string }
): Promise<DryRunCallResult> {
  let nonce = 1n;
  let ttl = 1_000_000n;
  try {
    nonce = await rpc.getNextNonce(params.caller);
  } catch {
    nonce = 1n;
  }
  try {
    ttl = (await rpc.getHeight()) + DEFAULT_TTL_DELTA;
  } catch {
    ttl = 1_000_000n;
  }
  const unsigned = createContractCallTransaction({
    caller: params.caller,
    contract: params.contract,
    nonce,
    ttl,
    gas: NFT_CALL_GAS,
    callData: decode(params.calldata).payload
  });
  const { raw } = await rpc.dryRunContractCall({
    accounts: [{ pub_key: params.caller, amount: DRY_RUN_ACCOUNT_PUCKS.toString() }],
    txs: [{ tx: encodeTx(unsigned) }]
  });
  return parseDryRunResult(raw);
}
