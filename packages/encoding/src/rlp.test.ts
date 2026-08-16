import { describe, expect, it } from "vitest";
import { hexToBytes } from "@gajumaru/crypto";
import {
  decodeRlp,
  encodeRlp,
  serialize,
  deserialize,
  OBJECT_TAGS,
  encodeBase58,
  createId
} from "@gajumaru/encoding";
import { SPEND_TEMPLATE } from "@gajumaru/transactions";

describe("RLP", () => {
  it("encodes untagged single bytes", () => {
    expect(encodeRlp(Uint8Array.of(0))).toEqual(Uint8Array.of(0));
    expect(encodeRlp(Uint8Array.of(127))).toEqual(Uint8Array.of(127));
  });

  it("round-trips nested lists", () => {
    const item = [Uint8Array.of(1), [Uint8Array.of(2), Uint8Array.of(3)]];
    expect(decodeRlp(encodeRlp(item))).toEqual(item);
  });

  it("round-trips a spend template object", () => {
    const pubkey = hexToBytes("11".repeat(32));
    const fields: Array<[string, unknown]> = [
      ["sender_id", createId("account", pubkey)],
      ["recipient_id", createId("account", pubkey)],
      ["amount", 25n],
      ["gas_price", 1_000_000_000n],
      ["gas", 20_000n],
      ["ttl", 1000n],
      ["nonce", 1n],
      ["payload", new TextEncoder().encode("hi")]
    ];
    const binary = serialize(OBJECT_TAGS.spend_tx, 1, SPEND_TEMPLATE, fields as never);
    const decoded = deserialize(OBJECT_TAGS.spend_tx, 1, SPEND_TEMPLATE, binary);
    expect(decoded[2]?.[1]).toBe(25n);
  });
});

describe("base58", () => {
  it("encodes the canonical Hello World vector", () => {
    expect(encodeBase58(new TextEncoder().encode("Hello World"))).toBe("JxF12TrwUP45BMd");
  });
});
