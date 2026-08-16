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
  "@gajumaru/grids": resolve(root, "../../packages/grids/src/index.ts"),
  "@gajumaru/assets": resolve(root, "../../packages/assets/src/index.ts"),
  "@gajumaru/contracts": resolve(root, "../../packages/contracts/src/index.ts")
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  alias
};

await esbuild.build({
  ...common,
  entryPoints: [resolve(root, "src/main.ts")],
  outfile: resolve(dist, "main.cjs"),
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"]
});

await esbuild.build({
  ...common,
  entryPoints: {
    "preload-wallet": resolve(root, "src/preload-wallet.ts")
  },
  outdir: dist,
  platform: "node",
  format: "cjs",
  target: "node22",
  outExtension: { ".js": ".cjs" },
  external: ["electron"]
});

await esbuild.build({
  ...common,
  entryPoints: [resolve(root, "src/renderer/main.ts")],
  outfile: resolve(dist, "renderer.js"),
  platform: "browser",
  format: "iife",
  target: "chrome128"
});

cpSync(resolve(root, "src/renderer/index.html"), resolve(dist, "index.html"));
cpSync(resolve(root, "src/renderer/styles.css"), resolve(dist, "styles.css"));
cpSync(resolve(root, "src/renderer/logo.png"), resolve(dist, "logo.png"));
cpSync(resolve(root, "src/renderer/icon.png"), resolve(dist, "icon.png"));
cpSync(resolve(root, "src/renderer/icon.ico"), resolve(dist, "icon.ico"));

console.log("desktop packaged in dist/");
