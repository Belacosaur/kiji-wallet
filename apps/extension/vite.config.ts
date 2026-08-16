import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        approval: resolve(__dirname, "src/approval/index.html"),
        background: resolve(__dirname, "src/background/service-worker.ts"),
        content: resolve(__dirname, "src/content/content-bridge.ts"),
        inpage: resolve(__dirname, "src/inpage/inpage.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  resolve: {
    alias: {
      "@gajumaru/crypto": resolve(__dirname, "../../packages/crypto/src/index.ts"),
      "@gajumaru/encoding": resolve(__dirname, "../../packages/encoding/src/index.ts"),
      "@gajumaru/transactions": resolve(__dirname, "../../packages/transactions/src/index.ts"),
      "@gajumaru/rpc": resolve(__dirname, "../../packages/rpc/src/index.ts"),
      "@gajumaru/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@gajumaru/provider": resolve(__dirname, "../../packages/provider/src/index.ts")
    }
  }
});
