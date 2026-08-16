export const OBJECT_TAGS = {
  account: 10,
  signed_tx: 11,
  spend_tx: 12,
  data_extend_tx: 13,
  contract: 40,
  contract_call: 41,
  contract_create_tx: 42,
  contract_call_tx: 43,
  contract_source: 44,
  ga_attach_tx: 80,
  ga_meta_tx: 81,
  paying_for_tx: 82,
  associate_chain: 90,
  ac_create_tx: 93,
  ac_deposit_tx: 94,
  ac_rollup_tx: 96,
  nt_native_token: 120,
  nt_create_tx: 121,
  nt_mint_tx: 122,
  nt_finalize_tx: 123,
  nt_trade_tx: 124,
  nt_burn_tx: 125,
  entry: 140,
  entry_create_tx: 141,
  entry_transfer_tx: 142,
  entry_destroy_tx: 143
} as const;

export type ObjectType = keyof typeof OBJECT_TAGS;

export const TAG_TO_TYPE = Object.fromEntries(
  Object.entries(OBJECT_TAGS).map(([type, tag]) => [tag, type])
) as Record<number, ObjectType>;
