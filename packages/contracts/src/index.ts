import { DEFAULT_TTL_DELTA } from "@gajumaru/encoding";
import type { GajumaruRpc } from "@gajumaru/rpc";
import {
  createContractCallTransaction,
  createContractCreateTransaction
} from "@gajumaru/transactions";

export {
  assertAccountId,
  assertContractId,
  parseTokenId,
  encodeAex141Call,
  decodeAex141Result,
  encodeAex141Transfer,
  encodeAex141Owner,
  encodeAex141Metadata,
  encodeAex141MetaInfo,
  encodeAex141Balance,
  encodeAex141TotalSupply
} from "./aex141.js";
export { IAEX141_ACI } from "./aex141-aci.js";
export {
  dryRunCalldata,
  parseDryRunResult,
  NFT_CALL_GAS,
  DRY_RUN_ACCOUNT_PUCKS,
  type DryRunCallResult
} from "./dry-run.js";

export class ContractApi {
  constructor(private readonly rpc: GajumaruRpc) {}

  async prepareCall(params: {
    caller: string;
    contract: string;
    callData: Uint8Array;
    amount?: bigint;
    gas?: bigint;
  }) {
    const nonce = await this.rpc.getNextNonce(params.caller);
    const height = await this.rpc.getHeight();
    return createContractCallTransaction({
      caller: params.caller,
      contract: params.contract,
      nonce,
      ttl: height + DEFAULT_TTL_DELTA,
      callData: params.callData,
      amount: params.amount,
      gas: params.gas
    });
  }

  async prepareCreate(params: {
    owner: string;
    code: Uint8Array;
    callData: Uint8Array;
    source?: string;
    amount?: bigint;
  }) {
    const nonce = await this.rpc.getNextNonce(params.owner);
    const height = await this.rpc.getHeight();
    return createContractCreateTransaction({
      owner: params.owner,
      nonce,
      code: params.code,
      callData: params.callData,
      source: params.source,
      ttl: height + DEFAULT_TTL_DELTA,
      amount: params.amount
    });
  }

  dryRun(body: unknown) {
    return this.rpc.dryRunContractCall(body);
  }
}
