import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, "dist");
const alias = {
  "@gajumaru/crypto": resolve(root, "../../packages/crypto/src/index.ts"),
  "@gajumaru/encoding": resolve(root, "../../packages/encoding/src/index.ts"),
  "@gajumaru/transactions": resolve(root, "../../packages/transactions/src/index.ts"),
  "@gajumaru/rpc": resolve(root, "../../packages/rpc/src/index.ts"),
  "@gajumaru/core": resolve(root, "../../packages/core/src/index.ts"),
  "@gajumaru/provider": resolve(root, "../../packages/provider/src/index.ts"),
  "@gajumaru/assets": resolve(root, "../../packages/assets/src/index.ts"),
  "@gajumaru/contracts": resolve(root, "../../packages/contracts/src/index.ts"),
  buffer: resolve(root, "../../node_modules/buffer/index.js")
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  target: "chrome114",
  alias,
  define: { global: "globalThis" }
};

await esbuild.build({
  ...common,
  entryPoints: {
    background: resolve(root, "src/background/service-worker.ts"),
    popup: resolve(root, "src/popup/main.ts"),
    approval: resolve(root, "src/approval/main.ts")
  },
  format: "esm",
  outdir: dist,
  splitting: false
});

await esbuild.build({
  ...common,
  entryPoints: {
    content: resolve(root, "src/content/content-bridge.ts"),
    inpage: resolve(root, "src/inpage/inpage.ts")
  },
  format: "iife",
  outdir: dist
});

cpSync(resolve(root, "public/manifest.json"), resolve(dist, "manifest.json"));
cpSync(resolve(root, "popup.html"), resolve(dist, "popup.html"));
cpSync(resolve(root, "approval.html"), resolve(dist, "approval.html"));
cpSync(resolve(root, "src/shared/wallet.css"), resolve(dist, "wallet.css"));

console.log("extension packaged in dist/");
