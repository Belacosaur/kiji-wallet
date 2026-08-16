import {
  DEFAULT_SPEND_GAS,
  MIN_GAS_PRICE,
  OBJECT_TAGS,
  serialize,
  type Fields,
  type Template
} from "@gajumaru/encoding";
import { accountIdFromAddress, payloadBytes } from "./ids.js";

export const SPEND_TEMPLATE: Template = [
  ["sender_id", "id"],
  ["recipient_id", "id"],
  ["amount", "int"],
  ["gas_price", "int"],
  ["gas", "int"],
  ["ttl", "int"],
  ["nonce", "int"],
  ["payload", "binary"]
];

export interface SpendParams {
  sender: string;
  recipient: string;
  amount: bigint;
  nonce: bigint;
  ttl: bigint;
  gasPrice?: bigint;
  gas?: bigint;
  payload?: string | Uint8Array;
}

export function createSpendTransaction(params: SpendParams): Uint8Array {
  const fields: Fields = [
    ["sender_id", accountIdFromAddress(params.sender)],
    ["recipient_id", accountIdFromAddress(params.recipient)],
    ["amount", params.amount],
    ["gas_price", params.gasPrice ?? MIN_GAS_PRICE],
    ["gas", params.gas ?? DEFAULT_SPEND_GAS],
    ["ttl", params.ttl],
    ["nonce", params.nonce],
    ["payload", payloadBytes(params.payload)]
  ];
  return serialize(OBJECT_TAGS.spend_tx, 1, SPEND_TEMPLATE, fields);
}
