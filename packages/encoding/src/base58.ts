const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const size = Math.ceil(((bytes.length - zeros) * 138) / 100) + 1;
  const b58 = new Uint8Array(size);
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i] ?? 0;
    for (let j = size - 1; j >= 0; j -= 1) {
      carry += 256 * (b58[j] ?? 0);
      b58[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
  }
  let skip = 0;
  while (skip < b58.length && b58[skip] === 0) skip += 1;
  let out = "1".repeat(zeros);
  for (let i = skip; i < b58.length; i += 1) {
    out += ALPHABET[b58[i] ?? 0];
  }
  return out;
}

export function decodeBase58(value: string): Uint8Array {
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros += 1;
  const size = Math.ceil((value.length * 733) / 1000) + 1;
  const bytes = new Uint8Array(size);
  for (let i = zeros; i < value.length; i += 1) {
    const ch = value[i] ?? "";
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) {
      throw new Error(`invalid base58 character: ${ch}`);
    }
    let carry = digit;
    for (let j = size - 1; j >= 0; j -= 1) {
      carry += 58 * (bytes[j] ?? 0);
      bytes[j] = carry % 256;
      carry = Math.floor(carry / 256);
    }
  }
  let skip = 0;
  while (skip < bytes.length && bytes[skip] === 0) skip += 1;
  const out = new Uint8Array(zeros + (bytes.length - skip));
  out.set(bytes.slice(skip), zeros);
  return out;
}
