export type GridsSpendContext = "chain" | "node";

export interface GridsSpend {
  kind: "spend";
  context: GridsSpendContext;
  location: string;
  recipient: string;
  amount: bigint;
  payload: string;
}

export interface GridsDeadDrop {
  kind: "deaddrop";
  scheme: "http" | "https";
  url: string;
}

export type GridsInstruction = GridsSpend | GridsDeadDrop;

export interface GridsRequest {
  id: string;
  type: "message" | "binary" | "tx" | "ack";
  status: "pending" | "signed" | "expired";
  createdAt: number;
  expiresAt: number;
  payload?: unknown;
}

export function createSpendUrl(params: {
  networkId: string;
  recipient: string;
  amount: bigint;
  payload?: string;
}): string {
  const query = new URLSearchParams({ a: params.amount.toString() });
  if (params.payload) query.set("p", params.payload);
  return `grids://${params.networkId}/1/s/${params.recipient}?${query.toString()}`;
}

export function createTransferUrl(params: {
  host: string;
  port?: number;
  recipient: string;
  amount: bigint;
  payload?: string;
}): string {
  const port = params.port ?? 3013;
  const query = new URLSearchParams({ a: params.amount.toString() });
  if (params.payload) query.set("p", params.payload);
  return `grid://${params.host}:${port}/1/t/${params.recipient}?${query.toString()}`;
}

export function parseGridsUrl(value: string): GridsInstruction {
  const url = new URL(value);
  if (url.protocol !== "grids:" && url.protocol !== "grid:") {
    throw new Error("not a GRIDS URL");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "1" || !parts[1]) {
    throw new Error("unsupported GRIDS version");
  }
  const verb = parts[1];
  if (verb === "s" || verb === "t") {
    const recipient = parts.slice(2).join("/");
    const amount = BigInt(url.searchParams.get("a") ?? "0");
    const payload = url.searchParams.get("p") ?? "";
    const host = url.hostname;
    const location =
      verb === "s" ? host : `${host}:${url.port || "3013"}`;
    return {
      kind: "spend",
      context: verb === "s" ? "chain" : "node",
      location,
      recipient,
      amount,
      payload
    };
  }
  if (verb === "d" || verb === "v") {
    const rest = "/" + parts.slice(2).join("/");
    const scheme = url.protocol === "grids:" ? "https" : "http";
    const rebuilt = `${scheme}://${url.host}${rest}${url.search}`;
    return { kind: "deaddrop", scheme, url: rebuilt };
  }
  throw new Error(`unknown GRIDS verb: ${verb}`);
}

export function createDeadDropUrl(params: {
  host: string;
  path: string;
  port?: number;
  https?: boolean;
}): string {
  const scheme = params.https ? "grids" : "grid";
  const path = params.path.replace(/^\/+/, "");
  const includePort =
    params.port !== undefined &&
    !(params.https && params.port === 443) &&
    !(!params.https && params.port === 80);
  const host = includePort ? `${params.host}:${params.port}` : params.host;
  return `${scheme}://${host}/1/d/${path}`;
}

export function createSignatureRequest(params: {
  type: "message" | "tx" | "ack";
  networkId: string;
  publicId?: string;
  payload: string;
}): Record<string, unknown> {
  return {
    grids: 1,
    chain: "gajumaru",
    network_id: params.networkId,
    type: params.type,
    public_id: params.publicId ?? false,
    payload: params.payload
  };
}
