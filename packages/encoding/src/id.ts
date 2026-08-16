export type IdTag =
  | "account"
  | "name"
  | "commitment"
  | "contract"
  | "channel"
  | "associate_chain"
  | "native_token"
  | "entry";

export interface ChainId {
  tag: IdTag;
  value: Uint8Array;
}

const TAG_TO_CODE: Record<IdTag, number> = {
  account: 1,
  name: 2,
  commitment: 3,
  contract: 5,
  channel: 6,
  associate_chain: 7,
  native_token: 8,
  entry: 9
};

const CODE_TO_TAG: Record<number, IdTag> = {
  1: "account",
  2: "name",
  3: "commitment",
  5: "contract",
  6: "channel",
  7: "associate_chain",
  8: "native_token",
  9: "entry"
};

export function createId(tag: IdTag, value: Uint8Array): ChainId {
  if (value.length !== 32) {
    throw new Error("id payload must be 32 bytes");
  }
  return { tag, value };
}

export function encodeId(id: ChainId): Uint8Array {
  const out = new Uint8Array(33);
  out[0] = TAG_TO_CODE[id.tag];
  out.set(id.value, 1);
  return out;
}

export function decodeId(bytes: Uint8Array): ChainId {
  if (bytes.length !== 33) {
    throw new Error("serialized id must be 33 bytes");
  }
  const tag = CODE_TO_TAG[bytes[0] ?? -1];
  if (!tag) throw new Error(`illegal id tag: ${bytes[0]}`);
  return { tag, value: bytes.slice(1) };
}
