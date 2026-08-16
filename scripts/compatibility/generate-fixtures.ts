import {
  blake2b256,
  bytesToHex,
  decodeMnemonic,
  deriveKeyPair,
  signBinary,
  signMessage,
  verifyBinary,
  verifyMessage
} from "@gajumaru/crypto";
import { walletFromSeed } from "@gajumaru/core";
import { decode, encodeTx } from "@gajumaru/encoding";
import { createSpendTransaction, signAndEncode, wrapSignedTransaction } from "@gajumaru/transactions";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "..", "fixtures");

function seedFromIndex(i: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed[31] = i & 0xff;
  seed[30] = (i >> 8) & 0xff;
  seed[0] = 0xa5;
  seed[1] = 0x5a;
  return seed;
}

const vectors = Array.from({ length: 100 }, (_, i) => {
  const seed = seedFromIndex(i);
  const wallet = walletFromSeed(seed);
  const recovered = decodeMnemonic(wallet.mnemonic);
  const spend = createSpendTransaction({
    sender: wallet.address,
    recipient: wallet.address,
    amount: BigInt(i + 1) * 1_000_000_000_000_000n,
    nonce: BigInt(i + 1),
    ttl: 100_000n + BigInt(i),
    payload: `fixture-${i}`
  });
  const signed = signAndEncode(spend, deriveKeyPair(seed), "groot.testnet", "hashed");
  const signedRaw = signAndEncode(spend, deriveKeyPair(seed), "groot.testnet", "raw");
  const message = new TextEncoder().encode(`Login to fixture ${i}`);
  const messageSig = signMessage(message, wallet.keyPair.secretKey);
  const binary = spend.slice(0, 32);
  const binarySig = signBinary(binary, wallet.keyPair.secretKey);
  return {
    index: i,
    seed: bytesToHex(seed),
    publicKey: bytesToHex(wallet.publicKey),
    address: wallet.address,
    mnemonic: wallet.mnemonic,
    mnemonicRoundtrip: bytesToHex(recovered) === bytesToHex(seed),
    unsignedSpendHex: bytesToHex(spend),
    unsignedSpendTx: encodeTx(spend),
    signedHashed: signed.encoded,
    signedHashedHash: signed.hash,
    signedRaw: signedRaw.encoded,
    txBlake2b: bytesToHex(blake2b256(spend)),
    messageSignature: bytesToHex(messageSig),
    messageVerified: verifyMessage(message, messageSig, wallet.publicKey),
    binarySignature: bytesToHex(binarySig),
    binaryVerified: verifyBinary(binary, binarySig, wallet.publicKey),
    wrappedNoSig: encodeTx(wrapSignedTransaction(spend, [])),
    decodedAddressType: decode(wallet.address).type
  };
});

writeFileSync(
  join(fixturesDir, "keys", "golden-keys.json"),
  JSON.stringify(
    vectors.map(({ seed, publicKey, address, mnemonic }) => ({ seed, publicKey, address, mnemonic })),
    null,
    2
  )
);
writeFileSync(join(fixturesDir, "transactions", "golden-spends.json"), JSON.stringify(vectors, null, 2));
writeFileSync(
  join(fixturesDir, "signatures", "golden-signatures.json"),
  JSON.stringify(
    vectors.map((v) => ({
      index: v.index,
      address: v.address,
      messageSignature: v.messageSignature,
      binarySignature: v.binarySignature,
      signedHashedHash: v.signedHashedHash
    })),
    null,
    2
  )
);

console.log(`wrote ${vectors.length} golden fixtures`);
