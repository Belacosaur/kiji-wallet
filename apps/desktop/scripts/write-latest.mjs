import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(root, "..");
const release = resolve(desktop, "release");
const pkg = JSON.parse(readFileSync(resolve(desktop, "package.json"), "utf8"));
const exe = readdirSync(release).find((name) => name.endsWith(".exe") && !name.includes("uninstall"));
if (!exe) {
  throw new Error("No Windows installer found in apps/desktop/release");
}

const file = resolve(release, exe);
const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
const base = (process.env.KIJI_DOWNLOAD_BASE ?? "").replace(/\/$/, "");
const url = base ? `${base}/${exe}` : exe;
const latest = {
  name: "Kiji Wallet",
  version: pkg.version,
  platform: "win32",
  filename: exe,
  sha256,
  url
};

writeFileSync(resolve(release, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);

console.log(`Installer ${exe}`);
console.log(`SHA-256 ${sha256}`);
console.log(`Download URL ${url}`);
