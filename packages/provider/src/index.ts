export enum ProviderErrorCode {
  USER_REJECTED = 4001,
  UNAUTHORIZED = 4100,
  UNSUPPORTED_METHOD = 4200,
  DISCONNECTED = 4900,
  WRONG_NETWORK = 4901,
  WALLET_LOCKED = 5000,
  INVALID_TRANSACTION = 5001,
  RPC_ERROR = 5002,
  SIGNING_ERROR = 5003
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly data?: unknown;

  constructor(code: ProviderErrorCode, message: string, data?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.data = data;
  }
}

export type ProviderMethod =
  | "gaju_connect"
  | "gaju_disconnect"
  | "gaju_accounts"
  | "gaju_chainId"
  | "gaju_switchChain"
  | "gaju_getBalance"
  | "gaju_signMessage"
  | "gaju_signBinary"
  | "gaju_signTransaction"
  | "gaju_sendTransaction"
  | "gaju_contractCall";

export interface ProviderRequest {
  method: ProviderMethod | string;
  params?: unknown[];
}

export type ProviderEvent =
  | "connect"
  | "disconnect"
  | "accountsChanged"
  | "chainChanged"
  | "lockChanged";

export interface GajumaruProvider {
  isGajumaru: true;
  request<T = unknown>(request: ProviderRequest): Promise<T>;
  on(event: ProviderEvent | string, listener: (...args: unknown[]) => void): void;
  removeListener(event: ProviderEvent | string, listener: (...args: unknown[]) => void): void;
}

export interface ConnectResult {
  accounts: string[];
  networkId: string;
}

declare global {
  interface Window {
    gajumaru?: GajumaruProvider;
  }
}
