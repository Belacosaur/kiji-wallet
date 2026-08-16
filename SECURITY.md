# Security Policy

Kiji Wallet is non-custodial. A bug in key handling, vault encryption, or approval UI can put user funds at risk.

## Reporting

Do **not** open a public GitHub issue for vulnerabilities that could leak keys, mnemonics, or unlock a vault.

Once this repository is on GitHub, use **Security → Report a vulnerability** (private advisories). If that is not enabled yet, email the maintainer listed on the GitHub profile that owns the repo.

Include:

- Affected app (desktop, extension, or SDK package)
- Version or commit
- Steps to reproduce, with no live mnemonics or funded keys
- Impact (key extraction, approval bypass, XSS, supply-chain, and so on)

Please allow time for a fix and coordinated disclosure before posting a write-up.

## Scope

In scope: this repository’s wallets, SDK packages, and the optional local GRIDS helper.

Out of scope: Groot node operators, third-party RPC hosts, phishing sites that impersonate Kiji, and issues that only appear after you load untrusted Electron or Chrome developer patches.

## What we will not accept as a “secret”

`fixtures/keys/golden-keys.json` contains synthetic test vectors. They are not funded accounts.
