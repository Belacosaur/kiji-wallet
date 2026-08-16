# Kiji Wallet

Non-custodial wallets for **Groot**: a portrait desktop app (Electron) and a Chrome Manifest V3 extension. Keys are created and encrypted on the device. Websites receive addresses and signatures only.

Kiji is an independent project. It is **not affiliated with, endorsed by, or an official product of Gajumaru**.

## Features

- Create or recover a Groot account (`ak_…`)
- Send and receive **GAJU**
- View AEX-141 tokens the account already holds (no minting)
- Connect websites through `window.gajumaru` (extension) or GRIDS links (desktop)
- Testnet and mainnet, with an explicit network banner
- Encrypted vault, idle lock, and per-origin approval for every signature

## Requirements

- [Node.js](https://nodejs.org/) 22 or newer
- npm 10+ (bundled with Node)
- Windows x64 to build the NSIS installer
- Chrome or Chromium to load the extension unpacked

## Quick start

From the repository root:

```bash
npm install
npm test
```

### Desktop

```bash
npm run dev:desktop
```

Windows installer (unsigned unless you configure Authenticode — see [docs/windows-code-signing.md](docs/windows-code-signing.md)):

```bash
npm run dist:win
```

The artifact is written to `apps/desktop/release/Kiji-Wallet-Setup-<version>.exe` together with `latest.json` (filename + SHA-256). Attach those files to a GitHub Release. Do not commit `.exe` files.

### Chrome extension

```bash
npm run build:extension
```

In Chrome: **Extensions → Developer mode → Load unpacked** and select `apps/extension/dist`.

### Demo dApp

```bash
npm run build:extension
npm run dev:dapp
```

Open the printed localhost URL. The page talks to the extension via `window.gajumaru`, or to the desktop wallet via a GRIDS link.

## Networks

| Network | RPC | Network id |
| --- | --- | --- |
| Groot testnet | `http://groot.testnet.gajumaru.io:3013` | `groot.testnet` |
| Groot mainnet | `http://groot.mainnet.gajumaru.io:3013` | `groot.mainnet` |

These are public Groot nodes. Kiji does not operate them.

## Protocol names

Groot’s wire format predates this product. Internal packages and the in-page provider keep those names on purpose:

| Surface | Why it stays |
| --- | --- |
| npm workspaces `@gajumaru/*` | package identity inside this monorepo |
| `window.gajumaru`, `gaju_*` methods | existing dApp integrations |
| `Gajumaru Signed Message:` / `Gajumaru Signed Binary:` | node-compatible signatures |
| Token ticker **GAJU** | native Groot unit |

Renaming those would break compatibility. The **product** name in the UI, installer, and extension store listing is Kiji Wallet.

Mnemonics are **not BIP-39**. They use hakuzaru’s 4096-word list and a 12-bit XOR checksum. Spend transactions use `gas` + `gas_price` rather than Aeternity’s `fee` field.

## Layout

```text
apps/desktop      Electron wallet
apps/extension    Chrome MV3 extension
apps/demo-dapp    sample page to test connect / sign / send
packages/         shared Groot SDK used by both apps
services/api      optional local GRIDS helper for desktop connect
fixtures/         test vectors only
docs/             protocol and security notes
```

There is no minting contract in this repo. `packages/assets` only lists tokens a wallet already owns.

## Security

- Private keys never leave the wallet process
- Desktop and extension vaults use PBKDF2-SHA-256 and AES-GCM
- Session unlock expires on idle; every dApp signature needs origin-bound approval
- NFT metadata is treated as untrusted and is never executed
- This tree ships **no extra product fee** on sends (`KIJI_FEE_FLAT = 0`). Forks can set a recipient in `packages/core/src/fees.ts`

See [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md).

## License

[MIT](LICENSE) © 2026 Kiji contributors
