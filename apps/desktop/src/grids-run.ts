import { parseGridsUrl, type GridsDeadDrop, type GridsSpend } from "@gajumaru/grids";
import { decode } from "@gajumaru/encoding";

export type GridsBlob = {
  grids: number;
  type: "message" | "binary" | "tx";
  public_id?: string | boolean;
  payload?: string;
  network_id?: string;
  chain?: string;
  url: string;
};

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

export function unsignedTxBytes(payload: string): Uint8Array {
  const trimmed = payload.trim();
  if (trimmed.startsWith("tx_")) {
    return decode(trimmed).payload;
  }
  try {
    return fromBase64(trimmed);
  } catch {
    return new TextEncoder().encode(payload);
  }
}

export async function fetchDeadDrop(url: string): Promise<GridsBlob> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`GRIDS dead-drop failed (${response.status})`);
  }
  const body = (await response.json()) as GridsBlob;
  if (body?.grids !== 1 || !body.type) {
    throw new Error("Not a GRIDS v1 signature request");
  }
  return { ...body, url };
}

export async function postDeadDrop(url: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`GRIDS callback failed (${response.status})`);
  }
}

export function parseGridsPaste(value: string): ReturnType<typeof parseGridsUrl> {
  return parseGridsUrl(value.trim());
}

export type { GridsDeadDrop, GridsSpend };
