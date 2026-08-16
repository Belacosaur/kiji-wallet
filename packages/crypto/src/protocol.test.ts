import { describe, expect, it } from "vitest";
import {
  decodeMnemonic,
  deriveKeyPair,
  encodeMnemonic,
  generateSeed,
  loadWordList,
  signBinary,
  signMessage,
  verifyBinary,
  verifyMessage
} from "@gajumaru/crypto";
import { encodeAccountAddress, decode, formatGaju, parseGaju } from "@gajumaru/encoding";
import { createSpendTransaction, inspectUnsignedTx, signAndEncode } from "@gajumaru/transactions";
import { recoverWallet, walletFromSeed } from "@gajumaru/core";
import { parseGridsUrl, createSpendUrl, createDeadDropUrl } from "@gajumaru/grids";

describe("crypto", () => {
  it("generates 32-byte seeds without Math.random", () => {
    const seed = generateSeed();
    expect(seed).toHaveLength(32);
  });

  it("round-trips Gajumaru mnemonics (not BIP-39)", () => {
    expect(loadWordList()).toHaveLength(4096);
    for (let i = 0; i < 32; i += 1) {
      const seed = generateSeed();
      const phrase = encodeMnemonic(seed);
      expect(phrase.split(" ").length).toBeGreaterThan(0);
      expect(decodeMnemonic(phrase)).toEqual(seed);
    }
  });

  it("rejects tampered mnemonics", () => {
    const seed = generateSeed();
    const words = encodeMnemonic(seed).split(" ");
    words[words.length - 1] = "aardvark";
    expect(() => decodeMnemonic(words.join(" "))).toThrow();
  });

  it("signs and verifies messages with Gajumaru domain separation", () => {
    const seed = generateSeed();
    const { publicKey, secretKey } = deriveKeyPair(seed);
    const message = new TextEncoder().encode("Login to ProofBound");
    const signature = signMessage(message, secretKey);
    expect(signature).toHaveLength(64);
    expect(verifyMessage(message, signature, publicKey)).toBe(true);
    expect(verifyMessage(new TextEncoder().encode("other"), signature, publicKey)).toBe(false);
  });

  it("signs and verifies binary payloads", () => {
    const { publicKey, secretKey } = deriveKeyPair(generateSeed());
    const binary = generateSeed();
    const signature = signBinary(binary, secretKey);
    expect(verifyBinary(binary, signature, publicKey)).toBe(true);
  });
});

describe("encoding", () => {
  it("encodes account addresses as ak_ base58check and round-trips", () => {
    const { publicKey } = deriveKeyPair(generateSeed());
    const address = encodeAccountAddress(publicKey);
    expect(address.startsWith("ak_")).toBe(true);
    const decoded = decode(address);
    expect(decoded.type).toBe("account_pubkey");
    expect(decoded.payload).toEqual(publicKey);
  });

  it("formats pucks as GAJU", () => {
    expect(formatGaju(parseGaju("1"))).toBe("1");
    expect(parseGaju("1.5")).toBe(1500000000000000000n);
    expect(formatGaju(1500000000000000000n)).toBe("1.5");
  });
});

describe("transactions", () => {
  it("serializes a spend and wraps a signed tx", () => {
    const wallet = walletFromSeed(generateSeed());
    const unsigned = createSpendTransaction({
      sender: wallet.address,
      recipient: wallet.address,
      amount: 1n,
      nonce: 1n,
      ttl: 100n,
      payload: "hello"
    });
    expect(unsigned.byteLength).toBeGreaterThan(40);
    const hashed = signAndEncode(unsigned, wallet.keyPair, "groot.testnet", "hashed");
    const raw = signAndEncode(unsigned, wallet.keyPair, "groot.testnet", "raw");
    expect(hashed.encoded.startsWith("tx_")).toBe(true);
    expect(raw.encoded.startsWith("tx_")).toBe(true);
    expect(hashed.hash.startsWith("th_")).toBe(true);
    expect(hashed.encoded).not.toEqual(raw.encoded);
    const inspected = inspectUnsignedTx(unsigned);
    expect(inspected.type).toBe("Spend");
    expect(inspected.signingMode).toBe("raw");
    expect(inspected.summary.To).toBe(wallet.address);
    expect(inspected.summary.Amount).toContain("GAJU");
  });
});

describe("wallet recovery", () => {
  it("recovers the same address from a mnemonic", () => {
    const original = walletFromSeed(generateSeed());
    const recovered = recoverWallet(original.mnemonic);
    expect(recovered.address).toBe(original.address);
  });
});

describe("GRIDS", () => {
  it("parses a chain spend URL with puck amounts", () => {
    const url = createSpendUrl({
      networkId: "groot.testnet",
      recipient: "ak_demo",
      amount: 42n,
      payload: "hi"
    });
    const parsed = parseGridsUrl(url);
    expect(parsed.kind).toBe("spend");
    if (parsed.kind === "spend") {
      expect(parsed.amount).toBe(42n);
      expect(parsed.recipient).toBe("ak_demo");
      expect(parsed.context).toBe("chain");
    }
  });

  it("rebuilds a dead-drop HTTPS URL from grids://", () => {
    const parsed = parseGridsUrl("grids://gajumining.com/1/d/api/grids/login?x=1");
    expect(parsed.kind).toBe("deaddrop");
    if (parsed.kind === "deaddrop") {
      expect(parsed.url).toBe("https://gajumining.com/api/grids/login?x=1");
    }
  });

  it("builds a local HTTP dead-drop that parses back", () => {
    const url = createDeadDropUrl({
      host: "127.0.0.1",
      port: 5174,
      path: "grids/request/abc"
    });
    expect(url).toBe("grid://127.0.0.1:5174/1/d/grids/request/abc");
    const parsed = parseGridsUrl(url);
    expect(parsed.kind).toBe("deaddrop");
    if (parsed.kind === "deaddrop") {
      expect(parsed.url).toBe("http://127.0.0.1:5174/grids/request/abc");
    }
  });
});
