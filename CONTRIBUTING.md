# Contributing

Thanks for helping with Kiji Wallet.

## Setup

Node.js 22+, then from this repository root:

```bash
npm install
npm test
npm run typecheck
```

## Guidelines

- Keep private keys and mnemonics out of git, issues, and screenshots. Use the fixtures in `fixtures/` for tests.
- Do not rename `@gajumaru/*`, `window.gajumaru`, or signed-message prefixes unless you are deliberately breaking Groot compatibility.
- User-facing copy should say **Kiji Wallet**. Protocol names stay as they are.
- Prefer small, reviewable pull requests. Include `npm test` output for protocol changes.
- Do not commit `node_modules`, `dist`, `release/`, or `*.exe`.

## Pull requests

1. Branch from `main`.
2. Add or update tests when you change crypto, encoding, or spend quoting.
3. Describe the why, not only the diff.
