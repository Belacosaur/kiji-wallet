export interface NetworkConfig {
  name: string;
  networkId: string;
  rpcUrl: string;
  explorerUrl?: string;
  /** Optional Aeternity-style middleware base, e.g. https://host/mdw */
  mdwUrl?: string;
  /** Optional well-known AEX-141 collections to auto-detect */
  featuredNftCollections?: string[];
  chainType: "groot" | "associate-chain";
}

export const NETWORKS: Record<string, NetworkConfig> = {
  "groot-testnet": {
    name: "Groot Testnet",
    networkId: "groot.testnet",
    rpcUrl: "http://groot.testnet.gajumaru.io:3013",
    explorerUrl: "https://groot.testnet.gajumaru.io",
    featuredNftCollections: ["ct_91HPbHQPV4AF2EQc4Vpxw4ANYVzehPnHtJe8NooFbLhFSxPKg"],
    chainType: "groot"
  },
  "groot-mainnet": {
    name: "Groot Mainnet",
    networkId: "groot.mainnet",
    rpcUrl: "http://groot.mainnet.gajumaru.io:3013",
    explorerUrl: "https://groot.mainnet.gajumaru.io",
    chainType: "groot"
  }
};

export const DEFAULT_NETWORK = NETWORKS["groot-testnet"]!;
