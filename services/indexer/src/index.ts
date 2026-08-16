/**
 * Optional indexer skeleton.
 *
 * The wallet must keep working with node RPC alone. This process would later
 * scan Groot microblocks into PostgreSQL for history and asset discovery.
 */
export const INDEXER_TABLES = [
  "blocks",
  "transactions",
  "accounts",
  "account_transactions",
  "contracts",
  "contract_calls",
  "native_tokens",
  "native_token_balances",
  "entries",
  "entry_ownership",
  "assets",
  "asset_metadata"
] as const;

export function startIndexer(): void {
  console.log("indexer disabled in V1; wallet uses Groot RPC directly");
}

startIndexer();
