# Architecture

Kiji Wallet is a TypeScript monorepo. Both apps consume the same SDK. Neither embeds a second Groot implementation.

```text
packages/crypto, encoding, transactions, rpc, contracts, assets
        │
        ├── @gajumaru/core          vault helpers, spend quotes, send
        ├── apps/extension          Chrome MV3 (popup, approval, inpage provider)
        ├── apps/desktop            Electron (renderer + host + GRIDS)
        └── apps/demo-dapp          sample website
```

Websites talk to the extension through `window.gajumaru`. Desktop handles the same request types over GRIDS (`grids:` / `grid:` links) with an optional local callback API in `services/api`.

Groot HTTP RPC is the chain authority. The indexer in `services/indexer` is a stub; history and balances come from the node.
