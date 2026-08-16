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

export const WALLET_METHODS = new Set([
  "wallet_status",
  "wallet_create",
  "wallet_import",
  "wallet_unlock",
  "wallet_lock",
  "wallet_state",
  "wallet_balance",
  "wallet_add_account",
  "wallet_import_account",
  "wallet_select_account",
  "wallet_rename_account",
  "wallet_reveal_mnemonic",
  "wallet_send",
  "wallet_fee_quote",
  "wallet_grids",
  "nft_list",
  "nft_watch",
  "nft_unwatch",
  "nft_scan",
  "nft_transfer",
  "permissions_list",
  "permissions_revoke",
  "approval_get",
  "approval_resolve",
  "wallet_switch_network"
]);
