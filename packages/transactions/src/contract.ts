import {
  DEFAULT_CALL_GAS,
  DEFAULT_CREATE_GAS,
  MIN_GAS_PRICE,
  OBJECT_TAGS,
  serialize,
  type Fields,
  type Template
} from "@gajumaru/encoding";
import { accountIdFromAddress, contractIdFromAddress, payloadBytes } from "./ids.js";

export const CONTRACT_CREATE_TEMPLATE: Template = [
  ["owner_id", "id"],
  ["nonce", "int"],
  ["code", "binary"],
  ["source", "binary"],
  ["ct_version", "int"],
  ["ttl", "int"],
  ["deposit", "int"],
  ["amount", "int"],
  ["gas_price", "int"],
  ["gas", "int"],
  ["call_data", "binary"]
];

export const CONTRACT_CALL_TEMPLATE: Template = [
  ["caller_id", "id"],
  ["nonce", "int"],
  ["contract_id", "id"],
  ["abi_version", "int"],
  ["ttl", "int"],
  ["amount", "int"],
  ["gas_price", "int"],
  ["gas", "int"],
  ["call_data", "binary"]
];

export interface ContractCreateParams {
  owner: string;
  nonce: bigint;
  code: Uint8Array;
  source?: string | Uint8Array;
  ctVersion?: bigint;
  ttl: bigint;
  deposit?: bigint;
  amount?: bigint;
  gasPrice?: bigint;
  gas?: bigint;
  callData: Uint8Array;
}

export interface ContractCallParams {
  caller: string;
  nonce: bigint;
  contract: string;
  abiVersion?: bigint;
  ttl: bigint;
  amount?: bigint;
  gasPrice?: bigint;
  gas?: bigint;
  callData: Uint8Array;
}

export function packCtVersion(vm = 1, abi = 1): bigint {
  return (BigInt(vm) << 16n) | BigInt(abi);
}

export function createContractCreateTransaction(params: ContractCreateParams): Uint8Array {
  const fields: Fields = [
    ["owner_id", accountIdFromAddress(params.owner)],
    ["nonce", params.nonce],
    ["code", params.code],
    ["source", payloadBytes(params.source)],
    ["ct_version", params.ctVersion ?? packCtVersion()],
    ["ttl", params.ttl],
    ["deposit", params.deposit ?? 0n],
    ["amount", params.amount ?? 0n],
    ["gas_price", params.gasPrice ?? MIN_GAS_PRICE],
    ["gas", params.gas ?? DEFAULT_CREATE_GAS],
    ["call_data", params.callData]
  ];
  return serialize(OBJECT_TAGS.contract_create_tx, 1, CONTRACT_CREATE_TEMPLATE, fields);
}

export function createContractCallTransaction(params: ContractCallParams): Uint8Array {
  const fields: Fields = [
    ["caller_id", accountIdFromAddress(params.caller)],
    ["nonce", params.nonce],
    ["contract_id", contractIdFromAddress(params.contract)],
    ["abi_version", params.abiVersion ?? 1n],
    ["ttl", params.ttl],
    ["amount", params.amount ?? 0n],
    ["gas_price", params.gasPrice ?? MIN_GAS_PRICE],
    ["gas", params.gas ?? DEFAULT_CALL_GAS],
    ["call_data", params.callData]
  ];
  return serialize(OBJECT_TAGS.contract_call_tx, 1, CONTRACT_CALL_TEMPLATE, fields);
}
