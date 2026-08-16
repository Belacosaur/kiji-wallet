import { bigIntToBytes, bytesToBigInt } from "./bytes.js";
import { WORDS_4096 } from "./words.js";

const WIDTH = 12;
const DICT_SIZE = 4096n;

export function loadWordList(): readonly string[] {
  return WORDS_4096;
}

function chunkCount(n: bigint, c: bigint): number {
  let a = 0;
  let value = n;
  while (value !== 0n) {
    value = value / c;
    a += 1;
  }
  return a;
}

function checksum(width: number, bits: bigint, bitLength: number): number {
  let sum = 0n;
  let remaining = bits;
  let left = bitLength;
  const mask = (1n << BigInt(width)) - 1n;
  const chunks: bigint[] = [];
  while (left > 0) {
    const shift = BigInt(left - width);
    const n = (remaining >> shift) & mask;
    chunks.push(n);
    remaining &= (1n << shift) - 1n;
    left -= width;
  }
  for (const n of chunks) sum ^= n;
  return Number(sum);
}

function bitsToWords(width: number, bits: bigint, bitLength: number, words: readonly string[]): string[] {
  const out: string[] = [];
  let remaining = bits;
  let left = bitLength;
  const mask = (1n << BigInt(width)) - 1n;
  while (left > 0) {
    const shift = BigInt(left - width);
    const index = Number((remaining >> shift) & mask);
    const word = words[index];
    if (word === undefined) {
      throw new Error(`mnemonic dictionary missing index ${index}`);
    }
    out.push(word);
    remaining &= (1n << shift) - 1n;
    left -= width;
  }
  return out;
}

/**
 * Gajumaru mnemonic codec from hakuzaru `hz_key_master`.
 *
 * This is NOT BIP-39. A 32-byte seed is split into 12-bit dictionary
 * indexes over a 4096-word list, with a 12-bit XOR checksum prepended.
 */
export function encodeMnemonic(seed: Uint8Array): string {
  if (seed.length !== 32) {
    throw new Error("mnemonic seed must be 32 bytes");
  }
  const words = loadWordList();
  const number = bytesToBigInt(seed);
  if (number === 0n) {
    const check = 0;
    const word = words[check];
    if (!word) throw new Error("empty dictionary");
    return word;
  }
  const chunks = chunkCount(number, DICT_SIZE);
  const bitLength = chunks * WIDTH;
  const check = checksum(WIDTH, number, bitLength);
  const totalBits = bitLength + WIDTH;
  const withChecksum = (BigInt(check) << BigInt(bitLength)) | number;
  return bitsToWords(WIDTH, withChecksum, totalBits, words).join(" ");
}

export function decodeMnemonic(phrase: string): Uint8Array {
  const words = loadWordList();
  const index = new Map(words.map((word, i) => [word, i]));
  const tokens = phrase.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error("empty mnemonic");
  }
  let bits = 0n;
  for (const token of tokens) {
    const n = index.get(token);
    if (n === undefined) {
      throw new Error(`bad mnemonic word: ${token}`);
    }
    bits = (bits << BigInt(WIDTH)) | BigInt(n);
  }
  const totalBits = tokens.length * WIDTH;
  if (totalBits < WIDTH) {
    throw new Error("mnemonic too short");
  }
  const dataBits = totalBits - WIDTH;
  const check = Number(bits >> BigInt(dataBits));
  const number = bits & ((1n << BigInt(dataBits)) - 1n);
  if (checksum(WIDTH, number, dataBits) !== check) {
    throw new Error("bad mnemonic checksum");
  }
  return bigIntToBytes(number, 32);
}
