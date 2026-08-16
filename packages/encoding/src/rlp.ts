/**
 * Ethereum-style RLP as used by gmser_rlp.
 * Integers are encoded by the static serializer as unsigned binaries first.
 */
export type RlpItem = Uint8Array | RlpItem[];

const UNTAGGED_LIMIT = 127;
const UNTAGGED_SIZE_LIMIT = 55;
const BYTE_ARRAY_OFFSET = 128;
const LIST_OFFSET = 192;

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function encodeLength(offset: number, payload: Uint8Array): Uint8Array {
  if (payload.length <= UNTAGGED_SIZE_LIMIT) {
    return concat([Uint8Array.of(offset + payload.length), payload]);
  }
  const sizeBytes = unsignedToBytes(BigInt(payload.length));
  const tagged = UNTAGGED_SIZE_LIMIT + offset + sizeBytes.length;
  if (tagged >= 256) {
    throw new Error("RLP payload too large");
  }
  return concat([Uint8Array.of(tagged), sizeBytes, payload]);
}

export function unsignedToBytes(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("RLP integers must be non-negative");
  if (value === 0n) return Uint8Array.of(0);
  const bytes: number[] = [];
  let n = value;
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return Uint8Array.from(bytes);
}

export function bytesToUnsigned(bytes: Uint8Array): bigint {
  if (bytes.length > 1 && bytes[0] === 0) {
    throw new Error("leading zeroes in integer encoding");
  }
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}

export function encodeRlp(item: RlpItem): Uint8Array {
  if (item instanceof Uint8Array) {
    if (item.length === 1 && (item[0] ?? 0) <= UNTAGGED_LIMIT) {
      return item;
    }
    return encodeLength(BYTE_ARRAY_OFFSET, item);
  }
  const encoded = concat(item.map(encodeRlp));
  return encodeLength(LIST_OFFSET, encoded);
}

function decodeSize(bytes: Uint8Array, offset: number): { size: number; rest: Uint8Array } {
  const first = bytes[0];
  if (first === undefined) throw new Error("empty RLP");
  if (first <= offset + UNTAGGED_SIZE_LIMIT) {
    return { size: first - offset, rest: bytes.slice(1) };
  }
  if (bytes[1] === 0) {
    throw new Error("leading zeroes in RLP size");
  }
  const sizeLen = first - offset - UNTAGGED_SIZE_LIMIT;
  const sizeBytes = bytes.slice(1, 1 + sizeLen);
  const rest = bytes.slice(1 + sizeLen);
  let size = 0;
  for (const b of sizeBytes) size = (size << 8) + b;
  return { size, rest };
}

function decodeOne(bytes: Uint8Array): { value: RlpItem; rest: Uint8Array } {
  const first = bytes[0];
  if (first === undefined) throw new Error("empty RLP");
  if (first <= UNTAGGED_LIMIT) {
    return { value: bytes.slice(0, 1), rest: bytes.slice(1) };
  }
  if (first < LIST_OFFSET) {
    const { size, rest } = decodeSize(bytes, BYTE_ARRAY_OFFSET);
    return { value: rest.slice(0, size), rest: rest.slice(size) };
  }
  const { size, rest } = decodeSize(bytes, LIST_OFFSET);
  const payload = rest.slice(0, size);
  const tail = rest.slice(size);
  const list: RlpItem[] = [];
  let cursor = payload;
  while (cursor.length > 0) {
    const decoded = decodeOne(cursor);
    list.push(decoded.value);
    cursor = decoded.rest;
  }
  return { value: list, rest: tail };
}

export function decodeRlp(bytes: Uint8Array): RlpItem {
  const { value, rest } = decodeOne(bytes);
  if (rest.length !== 0) {
    throw new Error("trailing RLP bytes");
  }
  return value;
}
