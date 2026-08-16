import type { KeyPair } from "@gajumaru/crypto";
import {
  DEFAULT_SPEND_GAS,
  DEFAULT_TTL_DELTA,
  MIN_GAS_PRICE,
  formatGaju
} from "@gajumaru/encoding";
import type { GajumaruRpc } from "@gajumaru/rpc";
import { createSpendTransaction, signAndEncode, type SigningMode } from "@gajumaru/transactions";

type FeeWallet = {
  address: string;
  keyPair: KeyPair;
};

/** Optional extra spend on send. Leave 0 for a vanilla OSS wallet. */
export const KIJI_FEE_RECIPIENT = "";
export const KIJI_FEE_FLAT = 0n;

export type SpendQuote = {
  amount: bigint;
  kijiFee: bigint;
  networkFee: bigint;
  total: bigint;
  recipientGets: bigint;
  feeRecipient: string;
  txCount: number;
  amountLabel: string;
  kijiFeeLabel: string;
  networkFeeLabel: string;
  gasLabel: string;
  totalLabel: string;
};

export function networkGasPucks(txCount = 1n): bigint {
  return MIN_GAS_PRICE * DEFAULT_SPEND_GAS * txCount;
}

export function kijiFeePucks(amount: bigint, sender: string): bigint {
  if (KIJI_FEE_FLAT <= 0n || !KIJI_FEE_RECIPIENT) return 0n;
  if (amount <= 0n) return 0n;
  if (sender === KIJI_FEE_RECIPIENT) return 0n;
  return KIJI_FEE_FLAT;
}

function packQuote(amount: bigint, kijiFee: bigint): SpendQuote {
  const txCount = kijiFee > 0n ? 2n : 1n;
  const protocolGas = networkGasPucks(txCount);
  const gas = kijiFee + protocolGas;
  return {
    amount,
    kijiFee,
    networkFee: protocolGas,
    total: amount + gas,
    recipientGets: amount,
    feeRecipient: kijiFee > 0n ? KIJI_FEE_RECIPIENT : "",
    txCount: Number(txCount),
    amountLabel: formatGaju(amount),
    kijiFeeLabel: formatGaju(kijiFee),
    networkFeeLabel: formatGaju(gas),
    gasLabel: formatGaju(gas),
    totalLabel: formatGaju(amount + gas)
  };
}

export function quoteSpend(amount: bigint, sender: string): SpendQuote {
  return packQuote(amount, kijiFeePucks(amount, sender));
}

/** Send-screen quote. Extra product fee is 0 unless KIJI_FEE_FLAT is set. */
export function quoteSpendDisplay(amount: bigint): SpendQuote {
  return packQuote(amount > 0n ? amount : 0n, KIJI_FEE_FLAT);
}

export async function sendWithFee(opts: {
  rpc: GajumaruRpc;
  wallet: FeeWallet;
  networkId: string;
  to: string;
  amount: bigint;
  payload?: string;
  signingMode?: SigningMode;
}): Promise<{ txHash: string; feeTxHash?: string; feeError?: string; quote: SpendQuote }> {
  const quote = quoteSpend(opts.amount, opts.wallet.address);
  const balance = await opts.rpc.getBalance(opts.wallet.address);
  if (balance < quote.total) {
    throw new Error(
      `Insufficient balance. Need ${quote.totalLabel} GAJU including gas`
    );
  }
  const nonce = await opts.rpc.getNextNonce(opts.wallet.address);
  const height = await opts.rpc.getHeight();
  const ttl = height + DEFAULT_TTL_DELTA;
  const mode = opts.signingMode ?? "raw";

  const userSigned = signAndEncode(
    createSpendTransaction({
      sender: opts.wallet.address,
      recipient: opts.to,
      amount: opts.amount,
      nonce,
      ttl,
      payload: opts.payload
    }),
    opts.wallet.keyPair,
    opts.networkId,
    mode
  );
  const user = await opts.rpc.broadcastTransaction(userSigned.encoded);

  if (quote.kijiFee <= 0n) {
    return { txHash: user.txHash, quote };
  }

  try {
    const feeSigned = signAndEncode(
      createSpendTransaction({
        sender: opts.wallet.address,
        recipient: KIJI_FEE_RECIPIENT,
        amount: quote.kijiFee,
        nonce: nonce + 1n,
        ttl,
        payload: ""
      }),
      opts.wallet.keyPair,
      opts.networkId,
      mode
    );
    const fee = await opts.rpc.broadcastTransaction(feeSigned.encoded);
    return { txHash: user.txHash, feeTxHash: fee.txHash, quote };
  } catch (error) {
    return {
      txHash: user.txHash,
      feeError: error instanceof Error ? error.message : "Gas could not be posted",
      quote
    };
  }
}
