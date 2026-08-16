import { bytesToUnsigned, decodeRlp, encodeRlp, type RlpItem, unsignedToBytes } from "./rlp.js";
import { decodeId, encodeId, type ChainId } from "./id.js";

export type FieldType =
  | "int"
  | "bool"
  | "binary"
  | "id"
  | [FieldType]
  | { items: Template }
  | readonly FieldType[];

export type Template = Array<[string, FieldType]>;
export type FieldValue =
  | bigint
  | boolean
  | Uint8Array
  | ChainId
  | FieldValue[]
  | Record<string, FieldValue>;
export type Fields = Array<[string, FieldValue]>;

function encodeField(type: FieldType, value: FieldValue): RlpItem {
  if (Array.isArray(type) && type.length === 1) {
    if (!Array.isArray(value)) throw new Error("expected list field");
    const inner = type[0];
    if (inner === undefined) throw new Error("empty list type");
    return (value as FieldValue[]).map((item) => encodeField(inner, item));
  }
  if (typeof type === "object" && !Array.isArray(type) && "items" in type) {
    if (typeof value !== "object" || value instanceof Uint8Array || Array.isArray(value)) {
      throw new Error("expected map field");
    }
    const map = value as Record<string, FieldValue>;
    return type.items.map(([key, itemType]) => {
      const item = map[key];
      if (item === undefined) throw new Error(`missing field ${key}`);
      return encodeField(itemType, item);
    });
  }
  if (Array.isArray(type)) {
    if (!Array.isArray(value) || value.length !== type.length) {
      throw new Error("tuple arity mismatch");
    }
    return type.map((itemType, i) => encodeField(itemType, value[i] as FieldValue));
  }
  switch (type) {
    case "int":
      if (typeof value !== "bigint") throw new Error("expected bigint");
      return unsignedToBytes(value);
    case "binary":
      if (!(value instanceof Uint8Array)) throw new Error("expected binary");
      return value;
    case "bool":
      if (typeof value !== "boolean") throw new Error("expected boolean");
      return Uint8Array.of(value ? 1 : 0);
    case "id":
      return encodeId(value as ChainId);
    default:
      throw new Error("illegal field type");
  }
}

function asBytes(item: RlpItem): Uint8Array {
  if (!(item instanceof Uint8Array)) throw new Error("expected RLP binary");
  return item;
}

function decodeField(type: FieldType, item: RlpItem): FieldValue {
  if (Array.isArray(type) && type.length === 1) {
    if (!Array.isArray(item)) throw new Error("expected RLP list");
    const inner = type[0];
    if (inner === undefined) throw new Error("empty list type");
    return item.map((entry) => decodeField(inner, entry));
  }
  if (typeof type === "object" && !Array.isArray(type) && "items" in type) {
    if (!Array.isArray(item) || item.length !== type.items.length) {
      throw new Error("map arity mismatch");
    }
    const out: Record<string, FieldValue> = {};
    type.items.forEach(([key, itemType], i) => {
      out[key] = decodeField(itemType, item[i] as RlpItem);
    });
    return out;
  }
  if (Array.isArray(type)) {
    if (!Array.isArray(item) || item.length !== type.length) {
      throw new Error("tuple arity mismatch");
    }
    return type.map((itemType, i) => decodeField(itemType, item[i] as RlpItem));
  }
  switch (type) {
    case "int":
      return bytesToUnsigned(asBytes(item));
    case "binary":
      return asBytes(item);
    case "bool": {
      const b = asBytes(item);
      if (b.length === 1 && b[0] === 1) return true;
      if (b.length === 1 && b[0] === 0) return false;
      throw new Error("illegal bool");
    }
    case "id":
      return decodeId(asBytes(item));
    default:
      throw new Error("illegal field type");
  }
}

export function serialize(
  tag: number,
  vsn: number,
  template: Template,
  fields: Fields
): Uint8Array {
  const fullTemplate: Template = [["tag", "int"], ["vsn", "int"], ...template];
  const fullFields: Fields = [["tag", BigInt(tag)], ["vsn", BigInt(vsn)], ...fields];
  if (fullTemplate.length !== fullFields.length) {
    throw new Error("template/fields length mismatch");
  }
  const encoded: RlpItem[] = [];
  for (let i = 0; i < fullTemplate.length; i += 1) {
    const fieldType = fullTemplate[i]?.[1];
    const fieldName = fullTemplate[i]?.[0];
    const actualName = fullFields[i]?.[0];
    const value = fullFields[i]?.[1];
    if (!fieldType || !fieldName || value === undefined) {
      throw new Error("incomplete template");
    }
    if (fieldName !== actualName) {
      throw new Error(`field name mismatch: ${fieldName} vs ${actualName}`);
    }
    encoded.push(encodeField(fieldType, value));
  }
  return encodeRlp(encoded);
}

export function deserialize(
  expectedTag: number,
  expectedVsn: number,
  template: Template,
  binary: Uint8Array
): Fields {
  const decoded = decodeRlp(binary);
  if (!Array.isArray(decoded)) throw new Error("expected RLP list");
  const fullTemplate: Template = [["tag", "int"], ["vsn", "int"], ...template];
  if (decoded.length !== fullTemplate.length) {
    throw new Error("serialized field count mismatch");
  }
  const fields: Fields = [];
  for (let i = 0; i < fullTemplate.length; i += 1) {
    const entry = fullTemplate[i];
    if (!entry) throw new Error("missing template entry");
    const [name, type] = entry;
    fields.push([name, decodeField(type, decoded[i] as RlpItem)]);
  }
  const tag = fields[0]?.[1];
  const vsn = fields[1]?.[1];
  if (tag !== BigInt(expectedTag) || vsn !== BigInt(expectedVsn)) {
    throw new Error(`tag/vsn mismatch: got ${tag}/${vsn}`);
  }
  return fields.slice(2);
}
