import {
  Aex141Portfolio,
  addWatchItem,
  removeWatchItem,
  watchlistKey,
  type NftWatchItem
} from "@gajumaru/assets";
import {
  assertAccountId,
  assertContractId,
  encodeAex141Transfer,
  NFT_CALL_GAS,
  parseTokenId
} from "@gajumaru/contracts";
import { recoverWallet, walletFromSeed, sendWithFee, quoteSpend, quoteSpendDisplay, type WalletAccount } from "@gajumaru/core";
import { bytesToHex, hexToBytes, generateSeed, signBinary, signMessage } from "@gajumaru/crypto";
import { decode, DEFAULT_TTL_DELTA, formatGaju, parseGaju } from "@gajumaru/encoding";
import { DEFAULT_NETWORK, GajumaruRpcClient, NETWORKS, type NetworkConfig } from "@gajumaru/rpc";
import { createContractCallTransaction, inspectUnsignedTx, signAndEncode } from "@gajumaru/transactions";
import { ProviderError, ProviderErrorCode } from "@gajumaru/provider";
import { DEFAULT_LOCK_MS, DAPP_METHODS, WALLET_METHODS } from "./protocol.js";
import {
  decryptVaultWithRawKey,
  encryptVaultWithRawKey,
  sealVault,
  unlockVault,
  type EncryptedVault,
  type VaultPlaintext,
  type WalletAccountRecord
} from "./vault.js";
import type { ApprovalRequest, DappPermission, PendingApproval, WalletStore } from "./types.js";
import {
  fetchDeadDrop,
  parseGridsPaste,
  postDeadDrop,
  toBase64,
  unsignedTxBytes,
  fromBase64,
  type GridsSpend
} from "./grids-run.js";

function gridsPublicId(publicId: unknown, address: string) {
  return typeof publicId === "string" && publicId.length > 0 ? publicId : address;
}

function signingPayloadPreview(payload: string): Record<string, string> {
  return {
    "Payload length": `${payload.length} characters`,
    Preview: payload.length <= 64 ? payload : `${payload.slice(0, 64)}…`,
    Note: "The signature covers the full payload, not only this preview."
  };
}

interface SessionState {
  rawKey: string;
  lastActive: number;
}

export class WalletHost {
  private rpc = new GajumaruRpcClient(DEFAULT_NETWORK);
  private readonly pending = new Map<string, PendingApproval>();

  constructor(
    private readonly local: WalletStore,
    private readonly session: WalletStore,
    private readonly notifyApproval: (request: ApprovalRequest) => void
  ) {}

  async handle(origin: string, method: string, params: unknown[] = [], trusted = false): Promise<unknown> {
    if (WALLET_METHODS.has(method) && !trusted) {
      throw new ProviderError(ProviderErrorCode.UNAUTHORIZED, "This method is not available to websites");
    }
    if (!trusted && !DAPP_METHODS.has(method)) {
      throw new ProviderError(ProviderErrorCode.UNSUPPORTED_METHOD, `Unsupported method: ${method}`);
    }
    return this.dispatch(origin, method, params);
  }

  resolveApproval(id: string, accepted: boolean): void {
    const item = this.pending.get(id);
    if (!item) throw new Error("Unknown approval");
    this.pending.delete(id);
    if (accepted) item.resolve(true);
    else item.reject(new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected"));
  }

  getApproval(id: string): ApprovalRequest | undefined {
    return this.pending.get(id)?.request;
  }

  private async dispatch(origin: string, method: string, params: unknown[]): Promise<unknown> {
    const network = await this.getNetwork();
    this.rpc = new GajumaruRpcClient(network);

    switch (method) {
      case "wallet_status": {
        const encrypted = await this.local.get<EncryptedVault>("vault");
        const session = await this.peekSession();
        return {
          hasWallet: Boolean(encrypted),
          unlocked: Boolean(session),
          network
        };
      }
      case "wallet_create": {
        if (await this.local.get<EncryptedVault>("vault")) {
          throw new Error("A vault already exists. Add another account from the Accounts screen.");
        }
        const password = String(params[0] ?? "");
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        const wallet = walletFromSeed(generateSeed());
        await this.persistNewWallet(wallet, password);
        return { address: wallet.address, mnemonic: wallet.mnemonic };
      }
      case "wallet_import": {
        if (await this.local.get<EncryptedVault>("vault")) {
          throw new Error("A vault already exists. Import another account from the Accounts screen.");
        }
        const mnemonic = String(params[0] ?? "");
        const password = String(params[1] ?? "");
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        const wallet = recoverWallet(mnemonic);
        await this.persistNewWallet(wallet, password);
        return { address: wallet.address };
      }
      case "wallet_unlock": {
        const password = String(params[0] ?? "");
        const encrypted = await this.local.get<EncryptedVault>("vault");
        if (!encrypted) throw new Error("No wallet");
        const unlocked = await unlockVault(encrypted, password);
        await this.session.set({
          session: {
            rawKey: unlocked.rawKey,
            lastActive: Date.now()
          }
        });
        return { ok: true };
      }
      case "wallet_lock": {
        await this.session.remove("session");
        return { ok: true };
      }
      case "wallet_state": {
        const vault = await this.readVault();
        const selected = vault.accounts.find((a) => a.id === vault.selectedAccountId) ?? vault.accounts[0];
        if (!selected) throw new Error("No account");
        const { seed: _seed, ...safeAccount } = selected;
        return {
          account: safeAccount,
          accounts: vault.accounts.map(({ seed: _ignored, ...rest }) => rest),
          balance: null,
          balanceLabel: "…",
          network
        };
      }
      case "wallet_balance": {
        const vault = await this.readVault();
        const selected = vault.accounts.find((a) => a.id === vault.selectedAccountId) ?? vault.accounts[0];
        if (!selected) throw new Error("No account");
        try {
          const balance = await this.rpc.getBalance(selected.address);
          return { balance: balance.toString(), balanceLabel: formatGaju(balance) };
        } catch (error) {
          return {
            balance: "0",
            balanceLabel: "0",
            rpcError: error instanceof Error ? error.message : "Could not reach Groot"
          };
        }
      }
      case "wallet_add_account": {
        const vault = await this.readVault();
        const wallet = walletFromSeed(generateSeed());
        const record = this.accountRecord(wallet, String(params[0] ?? "") || `Account ${vault.accounts.length + 1}`);
        if (vault.accounts.some((account) => account.address === record.address)) {
          throw new Error("That account is already in this vault");
        }
        vault.accounts.push(record);
        vault.selectedAccountId = record.id;
        await this.writeVault(vault);
        return { id: record.id, name: record.name, address: record.address, mnemonic: wallet.mnemonic };
      }
      case "wallet_import_account": {
        const mnemonic = String(params[0] ?? "");
        const vault = await this.readVault();
        const wallet = recoverWallet(mnemonic);
        if (vault.accounts.some((account) => account.address === wallet.address)) {
          throw new Error("That account is already in this vault");
        }
        const record = this.accountRecord(wallet, String(params[1] ?? "") || `Account ${vault.accounts.length + 1}`);
        vault.accounts.push(record);
        vault.selectedAccountId = record.id;
        await this.writeVault(vault);
        return { id: record.id, name: record.name, address: record.address };
      }
      case "wallet_select_account": {
        const id = String(params[0] ?? "");
        const vault = await this.readVault();
        const match = vault.accounts.find((account) => account.id === id);
        if (!match) throw new Error("Unknown account");
        vault.selectedAccountId = match.id;
        await this.writeVault(vault);
        return { ok: true, id: match.id, address: match.address };
      }
      case "wallet_rename_account": {
        const id = String(params[0] ?? "");
        const name = String(params[1] ?? "").trim();
        if (!name) throw new Error("Name is required");
        const vault = await this.readVault();
        const match = vault.accounts.find((account) => account.id === id);
        if (!match) throw new Error("Unknown account");
        match.name = name;
        await this.writeVault(vault);
        return { ok: true, id: match.id, name: match.name };
      }
      case "wallet_reveal_mnemonic": {
        if (!params[0]) throw new Error("explicit reveal required");
        const password = String(params[1] ?? "");
        if (!password) throw new Error("Password required");
        const encrypted = await this.local.get<EncryptedVault>("vault");
        if (!encrypted) throw new Error("No wallet");
        await unlockVault(encrypted, password);
        const wallet = await this.selectedWallet();
        return { mnemonic: wallet.mnemonic };
      }
      case "wallet_fee_quote": {
        const raw = String(params[0] ?? "").trim();
        const amount = raw ? parseGaju(raw) : 0n;
        const quote = quoteSpendDisplay(amount);
        return {
          amountLabel: quote.amountLabel,
          gasLabel: quote.gasLabel,
          totalLabel: quote.totalLabel
        };
      }
      case "wallet_send": {
        const to = String(params[0] ?? "");
        const amount = parseGaju(String(params[1] ?? "0"));
        const payload = String(params[2] ?? "");
        const wallet = await this.selectedWallet();
        const result = await sendWithFee({
          rpc: this.rpc,
          wallet,
          networkId: network.networkId,
          to,
          amount,
          payload,
          signingMode: "raw"
        });
        return {
          txHash: result.txHash,
          feeTxHash: result.feeTxHash,
          feeError: result.feeError,
          fee: result.quote.gasLabel,
          total: result.quote.totalLabel
        };
      }
      case "wallet_grids":
        return this.handleGridsUrl(String(params[0] ?? ""));
      case "nft_list": {
        const wallet = await this.selectedWallet();
        const watchlist = await this.getNftWatchlist(wallet.address, network.networkId);
        return { ...(await new Aex141Portfolio(this.rpc, network).list(wallet.address, watchlist)), added: 0 };
      }
      case "nft_watch": {
        const wallet = await this.selectedWallet();
        const watchlist = await this.getNftWatchlist(wallet.address, network.networkId);
        const portfolio = new Aex141Portfolio(this.rpc, network);
        const contract = String(params[0] ?? "");
        const tokenId = String(params[1] ?? "").trim();
        let next = watchlist;
        if (tokenId) {
          next = addWatchItem(watchlist, contract, tokenId);
        } else {
          const found = await portfolio.discoverOwned(wallet.address, [contract]);
          if (found.length === 0) {
            throw new Error("No tokens in that collection are owned by this account.");
          }
          for (const token of found) next = addWatchItem(next, token.contract, token.tokenId);
        }
        await this.setNftWatchlist(wallet.address, network.networkId, next);
        return new Aex141Portfolio(this.rpc, network).list(wallet.address, next);
      }
      case "nft_unwatch": {
        const wallet = await this.selectedWallet();
        const watchlist = await this.getNftWatchlist(wallet.address, network.networkId);
        const next = removeWatchItem(watchlist, String(params[0] ?? ""), String(params[1] ?? ""));
        await this.setNftWatchlist(wallet.address, network.networkId, next);
        return new Aex141Portfolio(this.rpc, network).list(wallet.address, next);
      }
      case "nft_scan": {
        const wallet = await this.selectedWallet();
        const watchlist = await this.getNftWatchlist(wallet.address, network.networkId);
        const scanned = await new Aex141Portfolio(this.rpc, network).scan(wallet.address, watchlist);
        await this.setNftWatchlist(wallet.address, network.networkId, scanned.items);
        if (scanned.mdwUrl && scanned.mdwUrl !== network.mdwUrl) {
          await this.setNetwork({ ...network, mdwUrl: scanned.mdwUrl });
        }
        const listed = await new Aex141Portfolio(
          this.rpc,
          scanned.mdwUrl ? { ...network, mdwUrl: scanned.mdwUrl } : network
        ).list(wallet.address, scanned.items);
        return { ...listed, added: scanned.added, scanError: scanned.error, mdwUrl: scanned.mdwUrl };
      }
      case "nft_transfer": {
        const contract = assertContractId(String(params[0] ?? ""));
        const tokenId = parseTokenId(String(params[1] ?? "")).toString();
        const to = assertAccountId(String(params[2] ?? ""));
        const wallet = await this.selectedWallet();
        const approved = await this.openApproval({
          id: crypto.randomUUID(),
          origin: "gaju://wallet",
          kind: "transferNft",
          summary: {
            From: wallet.address,
            To: to,
            Collection: contract,
            Token: `#${tokenId}`,
            Network: network.name
          },
          payload: { contract, tokenId, to }
        });
        if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
        const nonce = await this.rpc.getNextNonce(wallet.address);
        const height = await this.rpc.getHeight();
        const unsigned = createContractCallTransaction({
          caller: wallet.address,
          contract,
          nonce,
          ttl: height + DEFAULT_TTL_DELTA,
          gas: NFT_CALL_GAS,
          callData: decode(encodeAex141Transfer(to, tokenId)).payload
        });
        const signed = signAndEncode(unsigned, wallet.keyPair, network.networkId, "hashed");
        return this.rpc.broadcastTransaction(signed.encoded);
      }
      case "gaju_connect": {
        const permissions = await this.getPermissions();
        const existing = permissions.find((p) => p.origin === origin);
        if (existing) {
          existing.lastUsedAt = Date.now();
          existing.accounts = [(await this.selectedWallet()).address];
          await this.savePermissions(permissions);
          return { accounts: existing.accounts, networkId: network.networkId };
        }
        const wallet = await this.selectedWallet();
        const approved = await this.openApproval({
          id: crypto.randomUUID(),
          origin,
          kind: "connect",
          summary: {
            Origin: origin,
            Account: wallet.address,
            Network: network.name
          },
          payload: { address: wallet.address }
        });
        if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
        const permission: DappPermission = {
          origin,
          accounts: [wallet.address],
          permissions: ["readAccount"],
          createdAt: Date.now(),
          lastUsedAt: Date.now()
        };
        permissions.push(permission);
        await this.savePermissions(permissions);
        return { accounts: permission.accounts, networkId: network.networkId };
      }
      case "gaju_disconnect": {
        await this.savePermissions((await this.getPermissions()).filter((p) => p.origin !== origin));
        return { ok: true };
      }
      case "gaju_accounts": {
        await this.requireOriginPermission(origin);
        return [(await this.selectedWallet()).address];
      }
      case "gaju_chainId":
        return network.networkId;
      case "wallet_switch_network": {
        const id = String(params[0] ?? "");
        const next = Object.values(NETWORKS).find((n) => n.networkId === id || n.name === id);
        if (!next) throw new Error("Unknown network");
        await this.setNetwork(next);
        try {
          await this.rpc.getStatus();
          return { ...next, reachable: true };
        } catch (error) {
          return {
            ...next,
            reachable: false,
            rpcError: error instanceof Error ? error.message : "Could not reach Groot"
          };
        }
      }
      case "gaju_switchChain": {
        const id = String(params[0] ?? "");
        const next = Object.values(NETWORKS).find((n) => n.networkId === id || n.name === id);
        if (!next) throw new ProviderError(ProviderErrorCode.WRONG_NETWORK, "Unknown network");
        const approved = await this.openApproval({
          id: crypto.randomUUID(),
          origin,
          kind: "switchChain",
          summary: { Origin: origin, Network: next.name, "Network ID": next.networkId },
          payload: next
        });
        if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
        await this.setNetwork(next);
        return next.networkId;
      }
      case "gaju_getBalance": {
        await this.requireOriginPermission(origin);
        const address = String(params[0] ?? (await this.selectedWallet()).address);
        return (await this.rpc.getBalance(address)).toString();
      }
      case "gaju_signMessage": {
        await this.requireOriginPermission(origin);
        const message = String(params[0] ?? "");
        const wallet = await this.selectedWallet();
        const approved = await this.openApproval({
          id: crypto.randomUUID(),
          origin,
          kind: "signMessage",
          summary: { Origin: origin, Account: wallet.address, Message: message },
          payload: message
        });
        if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
        return bytesToHex(signMessage(new TextEncoder().encode(message), wallet.keyPair.secretKey));
      }
      case "gaju_signBinary": {
        await this.requireOriginPermission(origin);
        const payload = String(params[0] ?? "");
        const wallet = await this.selectedWallet();
        const approved = await this.openApproval({
          id: crypto.randomUUID(),
          origin,
          kind: "signBinary",
          summary: {
            Origin: origin,
            Account: wallet.address,
            ...signingPayloadPreview(payload)
          },
          payload
        });
        if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
        return bytesToHex(signBinary(hexToBytes(payload), wallet.keyPair.secretKey));
      }
      case "gaju_sendTransaction": {
        await this.requireOriginPermission(origin);
        const request = (params[0] ?? {}) as { to?: string; amount?: string; payload?: string };
        const wallet = await this.selectedWallet();
        const amount = parseGaju(String(request.amount ?? "0"));
        const quote = quoteSpend(amount, wallet.address);
        const approved = await this.openApproval({
          id: crypto.randomUUID(),
          origin,
          kind: "sendTransaction",
          summary: {
            Origin: origin,
            From: wallet.address,
            To: String(request.to ?? ""),
            Amount: `${quote.amountLabel} GAJU`,
            Gas: `${quote.gasLabel} GAJU`,
            "You pay": `${quote.totalLabel} GAJU`
          },
          payload: request
        });
        if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
        const result = await sendWithFee({
          rpc: this.rpc,
          wallet,
          networkId: network.networkId,
          to: String(request.to ?? ""),
          amount,
          payload: request.payload,
          signingMode: "raw"
        });
        return { txHash: result.txHash, feeTxHash: result.feeTxHash };
      }
      case "permissions_list":
        return this.getPermissions();
      case "permissions_revoke": {
        const target = String(params[0] ?? "");
        await this.savePermissions((await this.getPermissions()).filter((p) => p.origin !== target));
        return { ok: true };
      }
      case "approval_get":
        return this.getApproval(String(params[0] ?? ""));
      case "approval_resolve": {
        this.resolveApproval(String(params[0] ?? ""), Boolean(params[1]));
        return { ok: true };
      }
      default:
        throw new ProviderError(ProviderErrorCode.UNSUPPORTED_METHOD, `Unsupported method: ${method}`);
    }
  }

  private accountRecord(wallet: WalletAccount, name: string): WalletAccountRecord {
    return {
      id: crypto.randomUUID(),
      name,
      seed: bytesToHex(wallet.seed),
      address: wallet.address,
      publicKey: bytesToHex(wallet.publicKey),
      createdAt: Date.now()
    };
  }

  private async persistNewWallet(wallet: WalletAccount, password: string): Promise<void> {
    const record = this.accountRecord(wallet, "Account 1");
    const vault: VaultPlaintext = {
      version: 1,
      accounts: [record],
      selectedAccountId: record.id,
      createdAt: Date.now()
    };
    const sealed = await sealVault(vault, password);
    await this.local.set({ vault: sealed.encrypted });
    await this.session.set({
      session: {
        rawKey: sealed.rawKey,
        lastActive: Date.now()
      }
    });
  }

  private async writeVault(vault: VaultPlaintext): Promise<void> {
    const session = await this.touchSession();
    const encrypted = await this.local.get<EncryptedVault>("vault");
    if (!encrypted) throw new Error("No wallet");
    await this.local.set({ vault: await encryptVaultWithRawKey(vault, session.rawKey, encrypted) });
  }

  private resolveNetwork(stored?: NetworkConfig): NetworkConfig {
    if (!stored) return DEFAULT_NETWORK;
    if (stored.networkId === "groot") {
      return { ...NETWORKS["groot-mainnet"]!, mdwUrl: stored.mdwUrl };
    }
    const known = Object.values(NETWORKS).find(
      (n) => n.networkId === stored.networkId || n.name === stored.name
    );
    if (!known) return stored;
    return { ...known, mdwUrl: stored.mdwUrl ?? known.mdwUrl };
  }

  private async getNetwork(): Promise<NetworkConfig> {
    const stored = await this.local.get<NetworkConfig>("network");
    const resolved = this.resolveNetwork(stored);
    if (
      !stored ||
      stored.rpcUrl !== resolved.rpcUrl ||
      stored.explorerUrl !== resolved.explorerUrl ||
      stored.networkId !== resolved.networkId
    ) {
      await this.local.set({ network: resolved });
    }
    return resolved;
  }

  private async setNetwork(network: NetworkConfig): Promise<void> {
    const resolved = this.resolveNetwork(network);
    await this.local.set({ network: resolved });
    this.rpc = new GajumaruRpcClient(resolved);
  }

  private async getPermissions(): Promise<DappPermission[]> {
    return (await this.local.get<DappPermission[]>("permissions")) ?? [];
  }

  private async savePermissions(permissions: DappPermission[]): Promise<void> {
    await this.local.set({ permissions });
  }

  private async getNftWatchlist(account: string, networkId: string): Promise<NftWatchItem[]> {
    const all = (await this.local.get<Record<string, NftWatchItem[]>>("nftWatchlist")) ?? {};
    return all[watchlistKey(networkId, account)] ?? [];
  }

  private async setNftWatchlist(
    account: string,
    networkId: string,
    items: NftWatchItem[]
  ): Promise<void> {
    const all = (await this.local.get<Record<string, NftWatchItem[]>>("nftWatchlist")) ?? {};
    all[watchlistKey(networkId, account)] = items;
    await this.local.set({ nftWatchlist: all });
  }

  private async peekSession(): Promise<SessionState | undefined> {
    const session = await this.session.get<SessionState>("session");
    if (!session) return undefined;
    if (Date.now() - session.lastActive > DEFAULT_LOCK_MS) {
      await this.session.remove("session");
      return undefined;
    }
    return session;
  }

  private async touchSession(): Promise<SessionState> {
    const session = await this.peekSession();
    if (!session) {
      throw new ProviderError(ProviderErrorCode.WALLET_LOCKED, "Wallet is locked");
    }
    const next = { ...session, lastActive: Date.now() };
    await this.session.set({ session: next });
    return next;
  }

  private async readVault(): Promise<VaultPlaintext> {
    const encrypted = await this.local.get<EncryptedVault>("vault");
    const session = await this.touchSession();
    if (!encrypted) throw new Error("No wallet");
    return decryptVaultWithRawKey(encrypted, session.rawKey);
  }

  private async selectedWallet(): Promise<WalletAccount> {
    const vault = await this.readVault();
    const record = vault.accounts.find((a) => a.id === vault.selectedAccountId) ?? vault.accounts[0];
    if (!record) throw new Error("No account");
    return walletFromSeed(hexToBytes(record.seed));
  }

  private async walletForPublicId(publicId: unknown): Promise<WalletAccount> {
    if (!publicId || publicId === false || publicId === "false") {
      return this.selectedWallet();
    }
    const address = String(publicId);
    const vault = await this.readVault();
    const record = vault.accounts.find((a) => a.address === address);
    if (!record) throw new Error(`No local account matches ${address}`);
    return walletFromSeed(hexToBytes(record.seed));
  }

  private async handleGridsUrl(raw: string): Promise<unknown> {
    const instruction = parseGridsPaste(raw);
    if (instruction.kind === "spend") return this.handleGridsSpend(instruction);
    const blob = await fetchDeadDrop(instruction.url);
    const origin = blob.url;
    const wallet = await this.walletForPublicId(blob.public_id);

    if (blob.type === "message") {
      const message = String(blob.payload ?? "");
      const approved = await this.openApproval({
        id: crypto.randomUUID(),
        origin,
        kind: "signMessage",
        summary: {
          Origin: origin,
          Account: wallet.address,
          Type: "GRIDS message",
          Message: message
        },
        payload: blob
      });
      if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
      const signature = toBase64(signMessage(new TextEncoder().encode(message), wallet.keyPair.secretKey));
      await postDeadDrop(origin, {
        grids: 1,
        chain: blob.chain ?? "gajumaru",
        network_id: blob.network_id,
        type: "message",
        public_id: gridsPublicId(blob.public_id, wallet.address),
        payload: message,
        signature
      });
      return { ok: true, type: "message" };
    }

    if (blob.type === "binary") {
      const payload = String(blob.payload ?? "");
      const approved = await this.openApproval({
        id: crypto.randomUUID(),
        origin,
        kind: "signBinary",
        summary: {
          Origin: origin,
          Account: wallet.address,
          Type: "GRIDS binary",
          ...signingPayloadPreview(payload)
        },
        payload: blob
      });
      if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
      const signature = toBase64(signBinary(fromBase64(payload), wallet.keyPair.secretKey));
      await postDeadDrop(origin, {
        grids: 1,
        chain: blob.chain ?? "gajumaru",
        network_id: blob.network_id,
        type: "binary",
        public_id: gridsPublicId(blob.public_id, wallet.address),
        payload,
        signature
      });
      return { ok: true, type: "binary" };
    }

    if (blob.type === "tx") {
      const payload = String(blob.payload ?? "");
      const walletNetwork = (await this.getNetwork()).networkId;
      if (blob.network_id && blob.network_id !== walletNetwork) {
        throw new Error(
          `This GRIDS request is for ${blob.network_id}. Switch the wallet to that network first (currently ${walletNetwork}).`
        );
      }
      const unsigned = unsignedTxBytes(payload);
      const inspected = inspectUnsignedTx(unsigned);
      const approved = await this.openApproval({
        id: crypto.randomUUID(),
        origin,
        kind: "signTransaction",
        summary: {
          Origin: origin,
          Account: wallet.address,
          Network: walletNetwork,
          ...inspected.summary
        },
        payload: blob
      });
      if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
      const signed = signAndEncode(unsigned, wallet.keyPair, walletNetwork, inspected.signingMode);
      await postDeadDrop(origin, {
        grids: 1,
        chain: blob.chain ?? "gajumaru",
        network_id: walletNetwork,
        type: "tx",
        public_id: gridsPublicId(blob.public_id, wallet.address),
        payload: signed.encoded,
        signed: true
      });
      return { ok: true, type: "tx", tx: signed.encoded };
    }

    throw new Error(`Unsupported GRIDS type: ${String(blob.type)}`);
  }

  private async handleGridsSpend(instruction: GridsSpend): Promise<unknown> {
    const network = await this.getNetwork();
    const wallet = await this.selectedWallet();
    const quote = quoteSpend(instruction.amount, wallet.address);
    const approved = await this.openApproval({
      id: crypto.randomUUID(),
      origin: `grids://${instruction.location}`,
      kind: "sendTransaction",
      summary: {
        Origin: `grids://${instruction.location}`,
        From: wallet.address,
        To: instruction.recipient,
        Amount: `${quote.amountLabel} GAJU`,
        Gas: `${quote.gasLabel} GAJU`,
        "You pay": `${quote.totalLabel} GAJU`
      },
      payload: instruction
    });
    if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
    const rpc =
      instruction.context === "node"
        ? new GajumaruRpcClient({
            ...network,
            rpcUrl: `http://${instruction.location.replace(/^(https?:\/\/)/, "")}`
          })
        : this.rpc;
    const result = await sendWithFee({
      rpc,
      wallet,
      networkId: network.networkId,
      to: instruction.recipient,
      amount: instruction.amount,
      payload: instruction.payload,
      signingMode: "raw"
    });
    return { txHash: result.txHash, feeTxHash: result.feeTxHash };
  }

  private openApproval(request: ApprovalRequest): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, {
        request,
        resolve: (value) => resolve(Boolean(value)),
        reject
      });
      this.notifyApproval(request);
    });
  }

  private async requireOriginPermission(origin: string): Promise<DappPermission> {
    const permissions = await this.getPermissions();
    const found = permissions.find((p) => p.origin === origin);
    if (!found) {
      throw new ProviderError(ProviderErrorCode.UNAUTHORIZED, "Not connected");
    }
    found.lastUsedAt = Date.now();
    await this.savePermissions(permissions);
    return found;
  }
}
