import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeMnemonic, hexToBytes } from "@gajumaru/crypto";
import { recoverWallet, walletFromSeed } from "@gajumaru/core";

const fixtures = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/keys/golden-keys.json"), "utf8")
) as Array<{ seed: string; address: string; mnemonic: string }>;

describe("golden key fixtures", () => {
  it("contains 100 vectors that round-trip seed, mnemonic, and address", () => {
    expect(fixtures).toHaveLength(100);
    for (const vector of fixtures) {
      const seed = hexToBytes(vector.seed);
      const wallet = walletFromSeed(seed);
      expect(wallet.address).toBe(vector.address);
      expect(wallet.mnemonic).toBe(vector.mnemonic);
      expect(decodeMnemonic(vector.mnemonic)).toEqual(seed);
      expect(recoverWallet(vector.mnemonic).address).toBe(vector.address);
    }
  });
});
