# Security notes

- Private keys never leave the wallet process (extension service worker or Electron main).
- Encrypted vault: PBKDF2-SHA-256 + AES-GCM. Extension storage is `chrome.storage.local`; desktop uses a local file vault.
- Session unlock material is short-lived. The extension uses `chrome.storage.session` with an idle lock.
- Content scripts are a transport bridge, not an authority.
- Origins come from the browser, never from dApp-supplied strings.
- No auto-approve. Every connect, sign, and send needs an explicit confirmation.
- Mnemonics are revealed only after unlock and an explicit confirm. The clipboard is never filled automatically.
- NFT metadata is untrusted and is not executed.
- Sends do not attach an extra product fee unless you set `KIJI_FEE_FLAT` and `KIJI_FEE_RECIPIENT` in `packages/core/src/fees.ts`.
- Windows installer signing is the publisher’s Authenticode identity. See [windows-code-signing.md](./windows-code-signing.md).
