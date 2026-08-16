import { DEFAULT_NETWORK, type NetworkConfig } from "./networks.js";
import { encodeTx } from "@gajumaru/encoding";

export interface AccountState {
  id: string;
  balance: bigint;
  nonce: bigint;
  payable?: boolean;
}

export interface BroadcastResult {
  txHash: string;
  raw: unknown;
}

export interface DryRunResult {
  raw: unknown;
}

export interface ContractState {
  id: string;
  raw: unknown;
}

export interface GajumaruRpc {
  readonly network: NetworkConfig;
  getStatus(): Promise<Record<string, unknown>>;
  getNetworkId(): Promise<string>;
  getHeight(): Promise<bigint>;
  getAccount(address: string): Promise<AccountState>;
  getBalance(address: string): Promise<bigint>;
  getNonce(address: string): Promise<bigint>;
  getNextNonce(address: string): Promise<bigint>;
  getTransaction(hash: string): Promise<unknown>;
  getTransactionInfo(hash: string): Promise<unknown>;
  broadcastTransaction(signedTransaction: string | Uint8Array): Promise<BroadcastResult>;
  dryRunContractCall(body: unknown): Promise<DryRunResult>;
  getContract(contractId: string): Promise<ContractState>;
}

export class RpcError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "RpcError";
    this.status = status;
    this.body = body;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new RpcError("expected JSON object", 0, value);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback?: string): string {
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  throw new RpcError("expected string", 0, value);
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  throw new RpcError("expected integer", 0, value);
}

function describeNetworkError(error: unknown, network: NetworkConfig): Error {
  const err = error as Error & { cause?: { code?: string; message?: string } };
  const cause = err.cause;
  const code = cause?.code ?? "";
  const detail = cause?.message ?? err.message;
  let message = `Could not reach ${network.name}`;
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID" || /certificate|altname|SSL/i.test(detail)) {
    message = `${network.name} is not reachable — ${network.rpcUrl} is not a Groot node`;
  } else if (code === "ECONNREFUSED") {
    message = `${network.name} refused the connection (${network.rpcUrl})`;
  } else if (err.name === "TimeoutError" || /aborted|timeout/i.test(err.message)) {
    message = `${network.name} timed out (${network.rpcUrl})`;
  } else if (err.message && err.message !== "fetch failed") {
    message = `${network.name}: ${err.message}`;
  }
  const wrapped = new Error(message);
  wrapped.cause = error;
  return wrapped;
}

function isRetryable(error: unknown): boolean {
  const err = error as Error & { cause?: { code?: string } };
  const code = err.cause?.code ?? "";
  return (
    err.message === "fetch failed" ||
    err.name === "TimeoutError" ||
    /ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|ENOTFOUND|EAI_AGAIN/i.test(code)
  );
}

export class GajumaruRpcClient implements GajumaruRpc {
  readonly network: NetworkConfig;

  constructor(network: NetworkConfig = DEFAULT_NETWORK) {
    this.network = network;
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.requestOnce(path, init);
      } catch (error) {
        lastError = error;
        if (error instanceof RpcError || !isRetryable(error) || attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw lastError instanceof RpcError
      ? lastError
      : describeNetworkError(lastError, this.network);
  }

  private async requestOnce(path: string, init?: RequestInit): Promise<unknown> {
    const url = `${this.network.rpcUrl.replace(/\/$/, "")}${path}`;
    const timeoutMs = 20_000;
    const response = await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers
      }
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const reason =
        typeof body === "object" && body !== null && "reason" in body
          ? String((body as { reason: unknown }).reason)
          : response.statusText;
      throw new RpcError(reason, response.status, body);
    }
    return body;
  }

  async getStatus(): Promise<Record<string, unknown>> {
    return asRecord(await this.request("/v3/status"));
  }

  async getNetworkId(): Promise<string> {
    const status = await this.getStatus();
    return asString(status.network_id);
  }

  async getHeight(): Promise<bigint> {
    const status = await this.getStatus();
    return asBigInt(status.top_block_height);
  }

  async getAccount(address: string): Promise<AccountState> {
    try {
      const body = asRecord(await this.request(`/v3/accounts/${address}`));
      return {
        id: asString(body.id, address),
        balance: asBigInt(body.balance ?? 0),
        nonce: asBigInt(body.nonce ?? 0),
        payable: typeof body.payable === "boolean" ? body.payable : undefined
      };
    } catch (error) {
      if (error instanceof RpcError && (error.status === 404 || /not found/i.test(error.message))) {
        return { id: address, balance: 0n, nonce: 0n };
      }
      throw error;
    }
  }

  async getBalance(address: string): Promise<bigint> {
    return (await this.getAccount(address)).balance;
  }

  async getNonce(address: string): Promise<bigint> {
    return (await this.getAccount(address)).nonce;
  }

  async getNextNonce(address: string): Promise<bigint> {
    try {
      const body = asRecord(await this.request(`/v3/accounts/${address}/next-nonce`));
      return asBigInt(body.next_nonce ?? 1);
    } catch (error) {
      if (error instanceof RpcError && error.status === 404) return 1n;
      const account = await this.getAccount(address);
      return account.nonce + 1n;
    }
  }

  async getTransaction(hash: string): Promise<unknown> {
    return this.request(`/v3/transactions/${hash}`);
  }

  async getTransactionInfo(hash: string): Promise<unknown> {
    return this.request(`/v3/transactions/${hash}/info`);
  }

  async broadcastTransaction(signedTransaction: string | Uint8Array): Promise<BroadcastResult> {
    const tx =
      typeof signedTransaction === "string" ? signedTransaction : encodeTx(signedTransaction);
    const body = asRecord(
      await this.request("/v3/transactions", {
        method: "POST",
        body: JSON.stringify({ tx })
      })
    );
    return {
      txHash: asString(body.tx_hash ?? body.hash),
      raw: body
    };
  }

  async dryRunContractCall(body: unknown): Promise<DryRunResult> {
    return { raw: await this.request("/v3/dry_run", { method: "POST", body: JSON.stringify(body) }) };
  }

  async getContract(contractId: string): Promise<ContractState> {
    return {
      id: contractId,
      raw: await this.request(`/v3/contracts/${contractId}`)
    };
  }
}
