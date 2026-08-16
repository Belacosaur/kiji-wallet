import {
  decodeMnemonic,
  deriveKeyPair,
  encodeMnemonic,
  generateSeed,
  signBinary,
  signMessage,
  signTransaction,
  type KeyPair
} from "@gajumaru/crypto";
import { DEFAULT_TTL_DELTA, encodeAccountAddress } from "@gajumaru/encoding";
import { GajumaruRpcClient, type NetworkConfig } from "@gajumaru/rpc";
import {
  createSpendTransaction,
  signAndEncode,
  type SigningMode
} from "@gajumaru/transactions";

export interface Account {
  address: string;
  publicKey: Uint8Array;
}

export interface WalletAccount extends Account {
  seed: Uint8Array;
  keyPair: KeyPair;
  mnemonic: string;
}

export function generateWallet(): WalletAccount {
  return walletFromSeed(generateSeed());
}

export function walletFromSeed(seed: Uint8Array): WalletAccount {
  const keyPair = deriveKeyPair(seed);
  return {
    seed,
    keyPair,
    publicKey: keyPair.publicKey,
    address: encodeAccountAddress(keyPair.publicKey),
    mnemonic: encodeMnemonic(seed)
  };
}

export function recoverWallet(mnemonic: string): WalletAccount {
  return walletFromSeed(decodeMnemonic(mnemonic));
}

export class GajumaruClient {
  readonly rpc: GajumaruRpcClient;
  readonly signingMode: SigningMode;

  constructor(network?: NetworkConfig, signingMode: SigningMode = "raw") {
    this.rpc = new GajumaruRpcClient(network);
    this.signingMode = signingMode;
  }

  get networkId(): string {
    return this.rpc.network.networkId;
  }

  getBalance(address: string) {
    return this.rpc.getBalance(address);
  }

  async spend(params: {
    from: WalletAccount;
    to: string;
    amount: bigint;
    payload?: string;
    ttl?: bigint;
  }) {
    const nonce = await this.rpc.getNextNonce(params.from.address);
    const height = await this.rpc.getHeight();
    const unsigned = createSpendTransaction({
      sender: params.from.address,
      recipient: params.to,
      amount: params.amount,
      nonce,
      ttl: params.ttl ?? height + DEFAULT_TTL_DELTA,
      payload: params.payload
    });
    const signed = signAndEncode(
      unsigned,
      params.from.keyPair,
      this.networkId,
      this.signingMode
    );
    const broadcast = await this.rpc.broadcastTransaction(signed.encoded);
    return { ...signed, nonce, broadcast };
  }
}

export {
  sendWithFee,
  quoteSpend,
  quoteSpendDisplay,
  kijiFeePucks,
  networkGasPucks,
  KIJI_FEE_RECIPIENT,
  KIJI_FEE_FLAT,
  type SpendQuote
} from "./fees.js";

export const Gajumaru = {
  wallet: {
    generate: generateWallet,
    recover: recoverWallet,
    fromSeed: walletFromSeed
  },
  Client: GajumaruClient,
  signMessage,
  signBinary,
  signTransaction
};
