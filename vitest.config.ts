import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@gajumaru/crypto": resolve(root, "packages/crypto/src/index.ts"),
      "@gajumaru/encoding": resolve(root, "packages/encoding/src/index.ts"),
      "@gajumaru/transactions": resolve(root, "packages/transactions/src/index.ts"),
      "@gajumaru/rpc": resolve(root, "packages/rpc/src/index.ts"),
      "@gajumaru/core": resolve(root, "packages/core/src/index.ts"),
      "@gajumaru/contracts": resolve(root, "packages/contracts/src/index.ts"),
      "@gajumaru/assets": resolve(root, "packages/assets/src/index.ts"),
      "@gajumaru/provider": resolve(root, "packages/provider/src/index.ts"),
      "@gajumaru/grids": resolve(root, "packages/grids/src/index.ts"),
      "@gajumaru/dapp": resolve(root, "packages/dapp/src/index.ts")
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node"
  }
});
