# Provider API

Kiji Wallet injects this provider so Groot dApps keep working. The method names are part of the wire protocol.

`window.gajumaru` is EIP-1193-inspired.

## Methods

- `gaju_connect`
- `gaju_disconnect`
- `gaju_accounts`
- `gaju_chainId`
- `gaju_switchChain`
- `gaju_getBalance`
- `gaju_signMessage`
- `gaju_signBinary`
- `gaju_signTransaction`
- `gaju_sendTransaction`
- `gaju_contractCall`

## Events

`connect`, `disconnect`, `accountsChanged`, `chainChanged`, `lockChanged`

## Errors

`4001` user rejected, `4100` unauthorized, `4200` unsupported, `4900` disconnected, `5000` locked.
