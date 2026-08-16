export type BridgeRequest = {
  id: string;
  type: "GAJU_REQUEST";
  method: string;
  params?: unknown[];
};

export type BridgeResponse = {
  id: string;
  type: "GAJU_RESPONSE";
  result?: unknown;
  error?: { code: number; message: string };
};

export type BridgeEvent = {
  type: "GAJU_EVENT";
  event: string;
  data: unknown;
};

export const DEFAULT_LOCK_MS = 15 * 60 * 1000;

export const DAPP_METHODS = new Set([
  "gaju_connect",
  "gaju_disconnect",
  "gaju_accounts",
  "gaju_chainId",
  "gaju_switchChain",
  "gaju_getBalance",
  "gaju_signMessage",
  "gaju_signBinary",
  "gaju_signTransaction",
  "gaju_sendTransaction",
  "gaju_contractCall"
]);

export const EXTENSION_ONLY_METHODS = new Set([
  "wallet_status",
  "wallet_create",
  "wallet_import",
  "wallet_unlock",
  "wallet_lock",
  "wallet_state",
  "wallet_reveal_mnemonic",
  "wallet_send",
  "wallet_fee_quote",
  "wallet_switch_network",
  "nft_list",
  "nft_watch",
  "nft_unwatch",
  "nft_scan",
  "nft_transfer",
  "permissions_list",
  "permissions_revoke",
  "approval_get",
  "approval_resolve"
]);
