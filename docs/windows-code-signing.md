# Windows code signing

The NSIS installer from `npm run dist:win` is **unsigned** unless you attach an Authenticode certificate. Windows SmartScreen will show an unknown publisher until a signed identity builds download reputation.

Kiji Wallet is not an official Gajumaru product. Sign with **your** identity (or your organization’s), not a Gajumaru certificate.

Self-signed or “test” certificates do not fix SmartScreen. Users would have to trust a private CA.

## What signing changes

| State | Properties → Digital Signatures | SmartScreen |
| --- | --- | --- |
| Unsigned | None | Unknown publisher |
| IV / OV in your name | Your legal name | Publisher is you. New files can still warn until that identity builds reputation |
| EV (organization) | Your legal entity | Stronger identity check |

Publish the SHA-256 from `apps/desktop/release/latest.json` on every GitHub Release so users can verify the file.

## 1. Buy a certificate

1. Order an **Individual Validated (IV)** or organization (OV/EV) code signing certificate. [SSL.com IV](https://www.ssl.com/products/software-integrity/code-signing/iv/) is aimed at solo developers.
2. Complete identity check. The **subject / common name** is the string Windows will show.
3. Choose key storage (required since 2023; public CAs do not hand out a loose `.pfx`):
   - **USB token** (SafeNet or similar). Sign on this Windows PC with the token plugged in.
   - **Cloud HSM** (for example SSL.com eSigner) if you later sign from CI.
4. Validity is about one year (CA/B Forum cap is 460 days from March 2026). Budget a renewal.

**Azure Artifact Signing** (formerly Trusted Signing) is a monthly alternative. Public-trust **individual** profiles are US and Canada only.

Do not buy grey-market or “instant PFX” listings.

## 2. Align publisher metadata with the cert

Edit these **before** the signed build. The publisher string must match the certificate subject.

`apps/desktop/electron-builder.yml`

- `copyright` — for example `Copyright © Your Legal Name`
- `win.signtoolOptions.publisherName` — **exactly** the cert subject

`apps/desktop/package.json`

- `author` — same legal name

Leave `productName: Kiji Wallet` and `appId: io.kiji.wallet` unless you rebrand.

Set `forceCodeSigning: true` once signing works so an unsigned `.exe` cannot be published by accident.

## 3. Sign a release

From the repository root:

```bash
npm run dist:win
```

That builds Electron + NSIS, then writes `apps/desktop/release/latest.json`.

### USB token (local)

1. Install the token driver the CA ships.
2. Plug in the token and unlock it with the PIN.
3. Confirm Windows sees the cert:

```powershell
Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.HasPrivateKey } | Format-List Subject, Issuer, NotAfter
```

4. Point electron-builder at that cert. Either:

```yaml
# electron-builder.yml — win.signtoolOptions
certificateSubjectName: "Your Legal Name Exactly As On The Cert"
publisherName: "Your Legal Name Exactly As On The Cert"
```

Or set env vars in the same terminal (PIN is the token password):

```powershell
$env:CSC_LINK = ""          # leave empty; use the token in the cert store
$env:CSC_KEY_PASSWORD = "TOKEN_PIN"
```

5. Rebuild with the token still plugged in:

```bash
npm run dist:win
```

Keep the token in until the command finishes.

### Cloud HSM

Follow the CA’s current `signtool` / CI docs. Put API credentials in GitHub Actions secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`), never in git. `.github/workflows/release-desktop.yml` already forwards those variables.

### Confirm it signed

```powershell
Get-AuthenticodeSignature .\apps\desktop\release\Kiji-Wallet-Setup-0.1.0.exe | Format-List
```

You want `Status: Valid` and `SignerCertificate.Subject` equal to your legal name. `NotSigned` means the build is still unsigned — do not upload it.

## 4. Publish on GitHub Releases

Tag a version and let the Windows workflow upload the installer, or attach the files yourself:

- `apps/desktop/release/Kiji-Wallet-Setup-<version>.exe`
- `apps/desktop/release/latest.json`

Do not commit `*.exe`, token PINs, PFX files, or eSigner secrets.

## Checklist

- [ ] IV (or OV/EV) cert issued to your legal name
- [ ] Token driver installed **or** cloud HSM enrolled
- [ ] `copyright` / `publisherName` / `author` match the cert subject
- [ ] `npm run dist:win` with the token plugged in (or HSM creds set)
- [ ] `Get-AuthenticodeSignature` is `Valid`
- [ ] GitHub Release includes the installer and `latest.json`
- [ ] SHA-256 on the release matches `Get-FileHash -Algorithm SHA256`
