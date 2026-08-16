import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { GridsRequest } from "@gajumaru/grids";

const app = Fastify({ logger: true });
const requests = new Map<
  string,
  GridsRequest & {
    grids: 1;
    chain: string;
    network_id: string;
    public_id: false;
    payload?: unknown;
    signature?: unknown;
  }
>();
const TTL_MS = 5 * 60 * 1000;

app.addHook("onRequest", async (_request, reply) => {
  reply.header("access-control-allow-origin", "*");
  reply.header("access-control-allow-headers", "content-type");
  reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
});

app.options("/*", async (_request, reply) => reply.code(204).send());

app.get("/health", async () => ({ ok: true }));

function asBlob(record: NonNullable<ReturnType<typeof requests.get>>) {
  return {
    id: record.id,
    grids: 1,
    chain: record.chain,
    network_id: record.network_id,
    type: record.type,
    public_id: record.public_id,
    payload: record.payload,
    status: record.status,
    signature: record.signature
  };
}

app.post("/grids/request", async (request) => {
  const body = request.body as { type?: GridsRequest["type"]; payload?: unknown; networkId?: string };
  const now = Date.now();
  const record = {
    id: randomUUID(),
    grids: 1 as const,
    chain: "gajumaru",
    network_id: body.networkId ?? "groot.testnet",
    public_id: false as const,
    type: body.type ?? "message",
    status: "pending" as const,
    createdAt: now,
    expiresAt: now + TTL_MS,
    payload: body.payload
  };
  requests.set(record.id, record);
  return asBlob(record);
});

app.get("/grids/request/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const record = requests.get(id);
  if (!record) return reply.code(404).send({ error: "not found" });
  if (record.expiresAt < Date.now() && record.status === "pending") {
    record.status = "expired";
  }
  return asBlob(record);
});

app.post("/grids/request/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const record = requests.get(id);
  if (!record) return reply.code(404).send({ error: "not found" });
  if (record.expiresAt < Date.now()) {
    record.status = "expired";
    return reply.code(410).send({ error: "expired" });
  }
  record.status = "signed";
  record.signature = request.body;
  return { ok: true };
});

app.post("/grids/callback/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const record = requests.get(id);
  if (!record) return reply.code(404).send({ error: "not found" });
  if (record.expiresAt < Date.now()) {
    record.status = "expired";
    return reply.code(410).send({ error: "expired" });
  }
  record.status = "signed";
  record.signature = request.body;
  return { ok: true };
});

app.get("/accounts/:address/history", async () => ({ items: [], note: "indexer optional" }));
app.get("/accounts/:address/assets", async () => ({ items: [] }));
app.get("/transactions/:hash", async () => ({ note: "use node RPC for canonical state" }));

await app.listen({ port: 8787, host: "127.0.0.1" });
