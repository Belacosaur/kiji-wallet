import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { WalletStore } from "./types.js";

export class JsonFileStore implements WalletStore {
  private data: Record<string, unknown> = {};

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, unknown>;
    } catch {
      this.data = {};
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data[key] as T | undefined;
  }

  async set(value: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, value);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  async remove(key: string): Promise<void> {
    delete this.data[key];
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }
}

export class MemoryStore implements WalletStore {
  private data: Record<string, unknown> = {};

  async get<T>(key: string): Promise<T | undefined> {
    return this.data[key] as T | undefined;
  }

  async set(value: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, value);
  }

  async remove(key: string): Promise<void> {
    delete this.data[key];
  }
}
