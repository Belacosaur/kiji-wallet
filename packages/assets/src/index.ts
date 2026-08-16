export interface AssetId {
  kind: "native-token" | "entry" | "sophia-nft";
  id: string;
}

export interface Asset {
  id: AssetId;
  owner: string;
  symbol?: string;
  name?: string;
}

export interface AssetMetadata {
  name: string;
  description?: string;
  image?: string;
  contentUri?: string;
  attributes?: Record<string, string>;
}

export interface UnsignedTransaction {
  type: string;
  encoded: string;
}

export interface AssetAdapter {
  detect(address: string): Promise<Asset[]>;
  getMetadata(asset: AssetId): Promise<AssetMetadata>;
  buildTransfer(asset: AssetId, destination: string): Promise<UnsignedTransaction>;
}

export class UnimplementedAdapter implements AssetAdapter {
  constructor(private readonly kind: AssetId["kind"]) {}

  async detect(): Promise<Asset[]> {
    return [];
  }

  async getMetadata(): Promise<AssetMetadata> {
    throw new Error(`${this.kind} metadata requires confirmed Groot semantics`);
  }

  async buildTransfer(): Promise<UnsignedTransaction> {
    throw new Error(`${this.kind} transfers are not exposed until native semantics are confirmed`);
  }
}

export const nativeTokenAdapter = new UnimplementedAdapter("native-token");
export const entryAdapter = new UnimplementedAdapter("entry");
export const sophiaNftAdapter = new UnimplementedAdapter("sophia-nft");

export {
  Aex141Portfolio,
  addWatchItem,
  middlewareCandidates,
  removeWatchItem,
  toHttpsMediaUrl,
  watchlistKey,
  type NftListResult,
  type NftScanResult,
  type NftView,
  type NftWatchItem
} from "./nft.js";
