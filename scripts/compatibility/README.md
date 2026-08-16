# Compatibility harness

`npm run fixtures` writes 100 deterministic vectors under `fixtures/`.

These are self-consistent TypeScript vectors. Before mainnet wallet creation:

1. Create a wallet here, recover the mnemonic in GajuDesk, confirm the address.
2. Create a wallet in GajuDesk, recover that mnemonic here, confirm the address.
3. Broadcast a signed spend to Groot testnet and confirm the hash.

`npm run send:demo` performs step 3 once the account is funded.
