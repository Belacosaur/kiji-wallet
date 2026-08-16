import { Gajumaru } from "@gajumaru/core";
import { parseGaju } from "@gajumaru/encoding";
import { NETWORKS } from "@gajumaru/rpc";

const mnemonic = process.env.GAJU_MNEMONIC;
const to = process.argv[2];
const amount = process.argv[3] ?? "1";

if (!mnemonic || !to) {
  console.error("Usage: GAJU_MNEMONIC='...' npm run send:demo -- ak_recipient 1");
  process.exit(1);
}

const wallet = Gajumaru.wallet.recover(mnemonic);
const client = new Gajumaru.Client(NETWORKS["groot-testnet"], "raw");
const balance = await client.getBalance(wallet.address);
console.log("from", wallet.address);
console.log("balance", balance.toString(), "pucks");
const result = await client.spend({
  from: wallet,
  to,
  amount: parseGaju(amount)
});
console.log("nonce", result.nonce.toString());
console.log("hash", result.hash);
console.log("broadcast", result.broadcast);
