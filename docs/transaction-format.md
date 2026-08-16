# Transaction format

Static RLP objects from `gmserialization`.

Spend v1 fields:

```text
sender_id, recipient_id, amount, gas_price, gas, ttl, nonce, payload
```

Signed tx v1:

```text
signatures, transaction
```

Contract call v1:

```text
caller_id, nonce, contract_id, abi_version, ttl, amount, gas_price, gas, call_data
```

Amounts are integer **pucks**. Display conversion happens in the UI.
