# Protocol notes

Compatibility authority: Groot / hakuzaru, not Aeternity folklore.

Confirmed:

- Ed25519 from a 32-byte seed via `ecu_eddsa:sign_seed_keypair`
- Account encoding `ak_` + Base58Check(SHA256d)
- Mnemonic: 4096-word list, 12-bit chunks, XOR checksum (not BIP-39)
- Spend template uses `gas` / `gas_price`
- Message prefix `Gajumaru Signed Message:\n` with Bitcoin varint lengths, then blake2b
- Binary prefix `Gajumaru Signed Binary:`
- Testnet RPC `http://groot.testnet.gajumaru.io:3013`, network id `groot.testnet`
- Mainnet RPC `http://groot.mainnet.gajumaru.io:3013`, network id `groot.mainnet`

Transaction signing has two hakuzaru paths:

- `hz:sign_tx` signs `NetworkId || blake2b(tx)`
- `hz:spend` signs `NetworkId || tx`

Kiji’s send path uses the spend/raw variant because that is what Groot nodes accept for value transfers.

Amounts are integer **pucks**. The UI formats 18 decimal GAJU.
