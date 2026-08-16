import { defineConfig, type Plugin } from "vite";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

type Drop = {
  id: string;
  grids: 1;
  chain: "gajumaru";
  network_id: string;
  type: "message" | "binary" | "tx";
  public_id: false;
  payload: string;
  status: "pending" | "signed";
  signature?: unknown;
};

function readJson(req: { on: Function }): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolveBody(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function gridsDropPlugin(): Plugin {
  const drops = new Map<string, Drop>();
  return {
    name: "gajumaru-grids-drop",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/grids/request")) return next();
        res.setHeader("access-control-allow-origin", "*");
        res.setHeader("access-control-allow-headers", "content-type");
        res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method === "POST" && url === "/grids/request") {
          const body = await readJson(req);
          const record: Drop = {
            id: randomUUID(),
            grids: 1,
            chain: "gajumaru",
            network_id: "groot.testnet",
            type: (body.type as Drop["type"]) ?? "message",
            public_id: false,
            payload: String(body.payload ?? ""),
            status: "pending"
          };
          drops.set(record.id, record);
          send(200, record);
          return;
        }
        const match = /^\/grids\/request\/([^/]+)$/.exec(url);
        if (!match) return next();
        const record = drops.get(match[1] ?? "");
        if (!record) return send(404, { error: "not found" });
        if (req.method === "GET") return send(200, record);
        if (req.method === "POST") {
          const body = await readJson(req);
          record.status = "signed";
          record.signature = body;
          send(200, { ok: true });
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [gridsDropPlugin()],
  resolve: {
    alias: {
      "@gajumaru/dapp": resolve(__dirname, "../../packages/dapp/src/index.ts"),
      "@gajumaru/provider": resolve(__dirname, "../../packages/provider/src/index.ts"),
      "@gajumaru/grids": resolve(__dirname, "../../packages/grids/src/index.ts")
    }
  },
  server: { port: 5174, host: "127.0.0.1" }
});
