import {
  assertAccountId,
  assertContractId,
  decodeAex141Result,
  dryRunCalldata,
  encodeAex141MetaInfo,
  encodeAex141Metadata,
  encodeAex141Owner,
  encodeAex141TotalSupply,
  parseTokenId
} from "@gajumaru/contracts";
import type { GajumaruRpc, NetworkConfig } from "@gajumaru/rpc";

export interface NftWatchItem {
  contract: string;
  tokenId: string;
  addedAt: number;
}

export interface NftView {
  contract: string;
  tokenId: string;
  collectionName?: string;
  collectionSymbol?: string;
  name?: string;
  description?: string;
  image?: string;
  metadataUri?: string;
  owner?: string;
  owned: boolean;
  source: "watchlist" | "middleware";
  error?: string;
}

export interface NftListResult {
  nfts: NftView[];
  mdwUrl?: string;
  scanError?: string;
}

export interface NftScanResult {
  items: NftWatchItem[];
  added: number;
  mdwUrl?: string;
  error?: string;
}

interface MetaInfo {
  name?: string;
  symbol?: string;
  baseUrl?: string;
  metadataType?: string;
}

export function watchlistKey(networkId: string, account: string) {
  return `${networkId}:${account}`;
}

export function addWatchItem(list: NftWatchItem[], contract: string, tokenId: string): NftWatchItem[] {
  const ct = assertContractId(contract);
  const id = parseTokenId(tokenId).toString();
  if (list.some((item) => item.contract === ct && item.tokenId === id)) return list;
  return [...list, { contract: ct, tokenId: id, addedAt: Date.now() }];
}

export function removeWatchItem(list: NftWatchItem[], contract: string, tokenId: string): NftWatchItem[] {
  const ct = assertContractId(contract);
  const id = parseTokenId(tokenId).toString();
  return list.filter((item) => !(item.contract === ct && item.tokenId === id));
}

export function middlewareCandidates(network: NetworkConfig): string[] {
  const out: string[] = [];
  if (network.mdwUrl) out.push(trimSlash(network.mdwUrl));
  if (network.explorerUrl) out.push(`${trimSlash(network.explorerUrl)}/mdw`);
  try {
    const rpc = new URL(network.rpcUrl);
    out.push(`${rpc.protocol}//${rpc.hostname}/mdw`);
    if (rpc.port === "3013") out.push(`${rpc.protocol}//${rpc.hostname}:4000`);
  } catch {
    /* ignore */
  }
  return [...new Set(out)];
}

export function toHttpsMediaUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice("ipfs://".length).replace(/^ipfs\//, "")}`;
  }
  if (trimmed.startsWith("ar://")) return `https://arweave.net/${trimmed.slice("ar://".length)}`;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}

export class Aex141Portfolio {
  constructor(
    private readonly rpc: GajumaruRpc,
    private readonly network: NetworkConfig
  ) {}

  async list(account: string, watchlist: NftWatchItem[]): Promise<NftListResult> {
    const nfts = await mapPool(watchlist, 4, (item) => this.resolve(account, item, "watchlist"));
    return { nfts, mdwUrl: this.network.mdwUrl };
  }

  async syncOwned(
    account: string,
    watchlist: NftWatchItem[],
    extraCollections: string[] = []
  ): Promise<NftScanResult> {
    const contracts = uniqueContracts([
      ...extraCollections,
      ...(this.network.featuredNftCollections ?? []),
      ...watchlist.map((item) => item.contract)
    ]);
    const found = await this.discoverOwned(account, contracts, watchlist);
    let next = watchlist;
    let added = 0;
    for (const token of found) {
      const before = next.length;
      next = addWatchItem(next, token.contract, token.tokenId);
      if (next.length > before) added += 1;
    }
    return { items: next, added };
  }

  async discoverOwned(
    account: string,
    contracts: string[],
    watchlist: NftWatchItem[] = []
  ): Promise<Array<{ contract: string; tokenId: string }>> {
    const owned: Array<{ contract: string; tokenId: string }> = [];
    await mapPool(uniqueContracts(contracts), 3, async (contract) => {
      try {
        assertContractId(contract);
        const supply = await this.totalSupply(contract, account);
        if (supply <= 0n) return;
        const max = supply > 64n ? 64 : Number(supply);
        const known = new Set(
          watchlist.filter((item) => item.contract === contract).map((item) => item.tokenId)
        );
        for (const tokenId of known) {
          const id = Number(tokenId);
          if (id >= 1 && id <= max) owned.push({ contract, tokenId });
        }
        const ids = await mapPool(
          Array.from({ length: max }, (_, i) => i + 1).filter((id) => !known.has(String(id))),
          8,
          async (id) => {
            const owner = await this.ownerOf(contract, String(id), account).catch(() => undefined);
            return owner === account ? { contract, tokenId: String(id) } : undefined;
          }
        );
        owned.push(...ids.filter((row): row is { contract: string; tokenId: string } => Boolean(row)));
      } catch {
        /* not an AEX-141 collection we can read */
      }
    });
    return owned;
  }

  async resolve(account: string, item: NftWatchItem, source: NftView["source"]): Promise<NftView> {
    const view: NftView = {
      contract: item.contract,
      tokenId: item.tokenId,
      name: `#${item.tokenId}`,
      owned: false,
      source
    };
    try {
      assertContractId(item.contract);
      parseTokenId(item.tokenId);
      const [meta, owner, metadata] = await Promise.all([
        this.metaInfo(item.contract, account),
        this.ownerOf(item.contract, item.tokenId, account),
        this.tokenMetadata(item.contract, item.tokenId, account)
      ]);
      view.collectionName = meta?.name;
      view.collectionSymbol = meta?.symbol;
      if (owner) {
        view.owner = owner;
        view.owned = owner === account;
      } else {
        view.error = "No owner — this token id may not exist";
      }
      const resolved = await this.interpretMetadata(metadata, meta);
      if (resolved.name) view.name = resolved.name;
      view.description = resolved.description;
      view.image = resolved.image;
      view.metadataUri = resolved.uri;
      if (!view.owned && owner) view.error = "Not owned by this account";
    } catch (error) {
      view.error = error instanceof Error ? compactReason(error.message) : "Could not read this NFT";
    }
    return view;
  }

  async scan(account: string, watchlist: NftWatchItem[]): Promise<NftScanResult> {
    const chain = await this.syncOwned(account, watchlist);
    const candidates = middlewareCandidates(this.network);
    if (candidates.length === 0) {
      return {
        items: chain.items,
        added: chain.added,
        error: chain.added ? undefined : "No NFT indexer URL is configured for this network."
      };
    }
    let lastError = "No NFT indexer answered.";
    let next = chain.items;
    let added = chain.added;
    for (const base of candidates) {
      try {
        const owned = await fetchOwnedNfts(base, account);
        for (const token of owned) {
          const before = next.length;
          next = addWatchItem(next, token.contract, token.tokenId);
          if (next.length > before) added += 1;
        }
        return { items: next, added, mdwUrl: base };
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
    }
    return {
      items: next,
      added,
      error: added ? undefined : `${lastError} Featured collections are still scanned on-chain when you open NFTs.`
    };
  }

  private async metaInfo(contract: string, caller: string): Promise<MetaInfo | undefined> {
    const result = await dryRunCalldata(this.rpc, {
      caller,
      contract,
      calldata: encodeAex141MetaInfo()
    });
    if (!result.ok || !result.returnValue) return undefined;
    const decoded = decodeAex141Result("meta_info", result.returnValue);
    const rec = asRecord(decoded);
    return {
      name: asString(rec?.name),
      symbol: asString(rec?.symbol),
      baseUrl: asString(unwrapOption(rec?.base_url)),
      metadataType: variantTag(rec?.metadata_type)
    };
  }

  private async ownerOf(contract: string, tokenId: string, caller: string): Promise<string | undefined> {
    const result = await dryRunCalldata(this.rpc, {
      caller,
      contract,
      calldata: encodeAex141Owner(tokenId)
    });
    if (!result.ok || !result.returnValue) {
      throw new Error(result.reason ?? "Owner lookup failed");
    }
    return asString(unwrapOption(decodeAex141Result("owner", result.returnValue)));
  }

  private async totalSupply(contract: string, caller: string): Promise<bigint> {
    const result = await dryRunCalldata(this.rpc, {
      caller,
      contract,
      calldata: encodeAex141TotalSupply()
    });
    if (!result.ok || !result.returnValue) {
      throw new Error(result.reason ?? "total_supply lookup failed");
    }
    const decoded = decodeAex141Result("total_supply", result.returnValue);
    if (typeof decoded === "bigint") return decoded;
    if (typeof decoded === "number") return BigInt(decoded);
    if (typeof decoded === "string" && /^-?\d+$/.test(decoded)) return BigInt(decoded);
    throw new Error("total_supply was not an integer");
  }

  private async tokenMetadata(contract: string, tokenId: string, caller: string) {
    const result = await dryRunCalldata(this.rpc, {
      caller,
      contract,
      calldata: encodeAex141Metadata(tokenId)
    });
    if (!result.ok || !result.returnValue) return undefined;
    return unwrapOption(decodeAex141Result("metadata", result.returnValue));
  }

  private async interpretMetadata(
    metadata: unknown,
    meta?: MetaInfo
  ): Promise<{ name?: string; description?: string; image?: string; uri?: string }> {
    const variant = unwrapVariant(metadata);
    if (!variant) return {};
    if (variant.tag === "MetadataMap") {
      const map = flattenMap(variant.args[0]);
      return {
        name: map.name ?? map.title,
        description: map.description,
        image: toHttpsMediaUrl(map.image ?? map.image_url ?? map.media),
        uri: map.uri ?? map.url
      };
    }
    const identifier = asString(variant.args[0]);
    if (!identifier) return {};
    const joined = joinUri(meta?.baseUrl, identifier);
    const uri = toHttpsMediaUrl(joined) ?? joined;
    if (looksLikeImage(uri)) return { image: toHttpsMediaUrl(uri), uri };
    const json = uri ? await fetchJsonMetadata(uri) : undefined;
    return {
      name: json?.name,
      description: json?.description,
      image: toHttpsMediaUrl(json?.image) ?? (looksLikeImage(uri) ? toHttpsMediaUrl(uri) : undefined),
      uri
    };
  }
}

async function fetchOwnedNfts(
  mdwBase: string,
  account: string
): Promise<Array<{ contract: string; tokenId: string }>> {
  const bases = [trimSlash(mdwBase)];
  const paths = [
    `/v3/aex141/owned-nfts/${account}?limit=100`,
    `/v3/accounts/${account}/aex141/tokens?limit=100`
  ];
  let lastError = "Indexer did not return NFTs";
  for (const base of bases) {
    for (const path of paths) {
      try {
        const response = await fetch(`${base}${path}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(4000)
        });
        if (!response.ok) {
          lastError = `Indexer ${response.status}`;
          continue;
        }
        const body: unknown = await response.json();
        const data = Array.isArray(body) ? body : asRecord(body)?.data;
        if (!Array.isArray(data)) {
          lastError = "Indexer response was not a token list";
          continue;
        }
        return data.flatMap((row) => {
          const rec = asRecord(row);
          const contract = asString(rec?.contract_id ?? rec?.contract);
          const tokenId = rec?.token_id ?? rec?.tokenId;
          if (!contract || tokenId == null) return [];
          return [{ contract, tokenId: String(tokenId) }];
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
    }
  }
  throw new Error(lastError);
}

async function fetchJsonMetadata(uri: string): Promise<{ name?: string; description?: string; image?: string } | undefined> {
  const url = toHttpsMediaUrl(uri);
  if (!url || !url.startsWith("https://")) return undefined;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json,text/plain,*/*" },
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) return undefined;
    const text = await response.text();
    if (text.length > 256_000) return undefined;
    const body = JSON.parse(text) as unknown;
    const rec = asRecord(body);
    if (!rec) return undefined;
    return {
      name: asString(rec.name),
      description: asString(rec.description),
      image: asString(rec.image ?? rec.image_url)
    };
  } catch {
    return undefined;
  }
}

function looksLikeImage(value: string | undefined) {
  return Boolean(value && /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value));
}

function joinUri(base: string | undefined, path: string) {
  if (/^(https?:\/\/|ipfs:\/\/|ar:\/\/|data:)/i.test(path) || !base) return path;
  return `${trimSlash(base)}/${path.replace(/^\//, "")}`;
}

function uniqueContracts(values: string[]) {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed.startsWith("ct_")) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

function flattenMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value instanceof Map) {
    for (const [key, entry] of value.entries()) {
      if (typeof key === "string" && typeof entry === "string") out[key] = entry;
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const pair of value) {
      if (Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string") {
        out[pair[0]] = pair[1];
      }
    }
    return out;
  }
  const rec = asRecord(value);
  if (!rec) return out;
  for (const [key, entry] of Object.entries(rec)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function unwrapOption(value: unknown): unknown {
  if (value == null) return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  const rec = asRecord(value);
  if (!rec) return value;
  if ("None" in rec) return undefined;
  if ("Some" in rec) {
    const inner = rec.Some;
    return Array.isArray(inner) ? inner[0] : inner;
  }
  return value;
}

function unwrapVariant(value: unknown): { tag: string; args: unknown[] } | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  const entries = Object.entries(rec);
  if (entries.length !== 1) return undefined;
  const [tag, args] = entries[0]!;
  return { tag, args: Array.isArray(args) ? args : [args] };
}

function variantTag(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return unwrapVariant(value)?.tag;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function compactReason(reason: string) {
  if (/contract_does_not_exist/i.test(reason)) return "No contract at this ct_ id on Groot";
  if (/account_not_found/i.test(reason)) return "Account not found on Groot";
  return reason.replace(/\s+/g, " ").slice(0, 180);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

export { assertAccountId, assertContractId, parseTokenId };
