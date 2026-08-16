import { createSpendUrl, createSignatureRequest } from "@gajumaru/grids";
import { parseGaju } from "@gajumaru/encoding";
import {
  ProviderError,
  ProviderErrorCode,
  type ConnectResult,
  type GajumaruProvider
} from "@gajumaru/provider";

export interface ConnectedWallet {
  account: string;
  networkId: string;
  transport: "extension" | "grids";
}

export interface WalletTransport {
  connect(): Promise<ConnectedWallet>;
  disconnect(): Promise<void>;
  signMessage(message: string): Promise<string>;
  sendTransaction(request: {
    to: string;
    amount: string;
    payload?: string;
  }): Promise<{ txHash: string }>;
}

function getInjectedProvider(): GajumaruProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.gajumaru;
}

export class ExtensionTransport implements WalletTransport {
  private connected: ConnectedWallet | undefined;

  async connect(): Promise<ConnectedWallet> {
    const provider = getInjectedProvider();
    if (!provider) {
      throw new ProviderError(ProviderErrorCode.DISCONNECTED, "Gajumaru wallet not found");
    }
    const result = await provider.request<ConnectResult>({ method: "gaju_connect" });
    this.connected = {
      account: result.accounts[0] ?? "",
      networkId: result.networkId,
      transport: "extension"
    };
    return this.connected;
  }

  async disconnect(): Promise<void> {
    const provider = getInjectedProvider();
    await provider?.request({ method: "gaju_disconnect" });
    this.connected = undefined;
  }

  async signMessage(message: string): Promise<string> {
    const provider = getInjectedProvider();
    if (!provider) throw new ProviderError(ProviderErrorCode.DISCONNECTED, "not connected");
    return provider.request<string>({ method: "gaju_signMessage", params: [message] });
  }

  async sendTransaction(request: {
    to: string;
    amount: string;
    payload?: string;
  }): Promise<{ txHash: string }> {
    const provider = getInjectedProvider();
    if (!provider) throw new ProviderError(ProviderErrorCode.DISCONNECTED, "not connected");
    return provider.request<{ txHash: string }>({
      method: "gaju_sendTransaction",
      params: [request]
    });
  }
}

export class GridsTransport implements WalletTransport {
  constructor(
    private readonly options: {
      networkId: string;
      pollUrl?: string;
      callbackUrl?: string;
    }
  ) {}

  async connect(): Promise<ConnectedWallet> {
    return {
      account: "",
      networkId: this.options.networkId,
      transport: "grids"
    };
  }

  async disconnect(): Promise<void> {
    return;
  }

  async signMessage(message: string): Promise<string> {
    return JSON.stringify(createSignatureRequest({
      type: "message",
      networkId: this.options.networkId,
      payload: message
    }));
  }

  async sendTransaction(request: {
    to: string;
    amount: string;
    payload?: string;
  }): Promise<{ txHash: string }> {
    const url = createSpendUrl({
      networkId: this.options.networkId,
      recipient: request.to,
      amount: parseGaju(request.amount),
      payload: request.payload
    });
    return { txHash: url };
  }
}

export class GajumaruDappClient {
  account?: string;
  networkId?: string;
  readonly transport: WalletTransport;

  constructor(transport?: WalletTransport, networkId = "groot.testnet") {
    this.transport =
      transport ??
      (getInjectedProvider()
        ? new ExtensionTransport()
        : new GridsTransport({ networkId }));
  }

  async connect() {
    const connected = await this.transport.connect();
    this.account = connected.account;
    this.networkId = connected.networkId;
    return connected;
  }

  send(request: { to: string; amount: string; payload?: string }) {
    return this.transport.sendTransaction(request);
  }

  signMessage(message: string) {
    return this.transport.signMessage(message);
  }

  readonly contract = {
    call: async (params: { contract: string; method: string; args?: unknown[] }) => {
      const provider = getInjectedProvider();
      if (!provider) {
        throw new ProviderError(ProviderErrorCode.UNSUPPORTED_METHOD, "contract calls need the extension");
      }
      return provider.request({ method: "gaju_contractCall", params: [params] });
    }
  };
}

export function createGajumaruClient(networkId = "groot.testnet") {
  return new GajumaruDappClient(undefined, networkId);
}

export function openDesktopWithGrids(gridsUrl: string): void {
  window.location.assign(gridsUrl);
}

export const Gajumaru = {
  connect: async () => {
    const client = createGajumaruClient();
    await client.connect();
    return client;
  },
  openDesktop: openDesktopWithGrids
};
