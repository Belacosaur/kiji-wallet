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
import { createContractCallTransaction, signAndEncode } from "@gajumaru/transactions";
import { ProviderError, ProviderErrorCode } from "@gajumaru/provider";
import { DEFAULT_LOCK_MS, DAPP_METHODS, EXTENSION_ONLY_METHODS } from "../shared/protocol.js";
import {
  decryptVault,
  decryptVaultWithRawKey,
  encryptVault,
  exportRawKey,
  type EncryptedVault,
  type VaultPlaintext,
  type WalletAccountRecord
} from "../shared/vault.js";
import type { ApprovalRequest, DappPermission, PendingApproval } from "../shared/types.js";

const pending = new Map<string, PendingApproval>();
let rpc = new GajumaruRpcClient(DEFAULT_NETWORK);

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

async function localGet<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function localSet(value: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set(value);
}

async function sessionGet<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.session.get(key);
  return result[key] as T | undefined;
}

async function sessionSet(value: Record<string, unknown>): Promise<void> {
  await chrome.storage.session.set(value);
}

function resolveNetwork(stored?: NetworkConfig): NetworkConfig {
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

async function getNetwork(): Promise<NetworkConfig> {
  const stored = await localGet<NetworkConfig>("network");
  const resolved = resolveNetwork(stored);
  if (
    !stored ||
    stored.rpcUrl !== resolved.rpcUrl ||
    stored.explorerUrl !== resolved.explorerUrl ||
    stored.networkId !== resolved.networkId
  ) {
    await localSet({ network: resolved });
  }
  return resolved;
}

async function setNetwork(network: NetworkConfig): Promise<void> {
  const resolved = resolveNetwork(network);
  await localSet({ network: resolved });
  rpc = new GajumaruRpcClient(resolved);
}

async function getPermissions(): Promise<DappPermission[]> {
  return (await localGet<DappPermission[]>("permissions")) ?? [];
}

async function savePermissions(permissions: DappPermission[]): Promise<void> {
  await localSet({ permissions });
}

async function getNftWatchlist(account: string, networkId: string): Promise<NftWatchItem[]> {
  const all = (await localGet<Record<string, NftWatchItem[]>>("nftWatchlist")) ?? {};
  return all[watchlistKey(networkId, account)] ?? [];
}

async function setNftWatchlist(
  account: string,
  networkId: string,
  items: NftWatchItem[]
): Promise<void> {
  const all = (await localGet<Record<string, NftWatchItem[]>>("nftWatchlist")) ?? {};
  all[watchlistKey(networkId, account)] = items;
  await localSet({ nftWatchlist: all });
}

async function getEncryptedVault(): Promise<EncryptedVault | undefined> {
  return localGet<EncryptedVault>("vault");
}

async function peekSession(): Promise<SessionState | undefined> {
  const session = await sessionGet<SessionState>("session");
  if (!session) return undefined;
  if (Date.now() - session.lastActive > DEFAULT_LOCK_MS) {
    await chrome.storage.session.remove("session");
    return undefined;
  }
  return session;
}

async function touchSession(): Promise<SessionState> {
  const session = await peekSession();
  if (!session) {
    throw new ProviderError(ProviderErrorCode.WALLET_LOCKED, "Wallet is locked");
  }
  const next = { ...session, lastActive: Date.now() };
  await sessionSet({ session: next });
  return next;
}

async function readVault(): Promise<VaultPlaintext> {
  const encrypted = await getEncryptedVault();
  const session = await touchSession();
  if (!encrypted) throw new Error("No wallet");
  return decryptVaultWithRawKey(encrypted, session.rawKey);
}

function recordToWallet(record: WalletAccountRecord): WalletAccount {
  return walletFromSeed(hexToBytes(record.seed));
}

async function selectedWallet(): Promise<WalletAccount> {
  const vault = await readVault();
  const record = vault.accounts.find((a) => a.id === vault.selectedAccountId) ?? vault.accounts[0];
  if (!record) throw new Error("No account");
  return recordToWallet(record);
}

function openApproval(request: ApprovalRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    pending.set(request.id, { request, resolve, reject });
    chrome.windows.create({
      url: chrome.runtime.getURL(`approval.html?id=${request.id}`),
      type: "popup",
      width: 380,
      height: 640,
      focused: true
    });
  });
}

async function requireOriginPermission(origin: string): Promise<DappPermission> {
  const permissions = await getPermissions();
  const found = permissions.find((p) => p.origin === origin);
  if (!found) {
    throw new ProviderError(ProviderErrorCode.UNAUTHORIZED, "Not connected");
  }
  found.lastUsedAt = Date.now();
  await savePermissions(permissions);
  return found;
}

async function handleProviderMethod(
  origin: string,
  method: string,
  params: unknown[] = []
): Promise<unknown> {
  const network = await getNetwork();
  rpc = new GajumaruRpcClient(network);

  switch (method) {
    case "wallet_status": {
      const encrypted = await getEncryptedVault();
      const session = await peekSession();
      return {
        hasWallet: Boolean(encrypted),
        unlocked: Boolean(session),
        network
      };
    }
    case "wallet_create": {
      if (await getEncryptedVault()) {
        throw new Error("A vault already exists. Unlock this wallet instead.");
      }
      const password = String(params[0] ?? "");
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      const wallet = walletFromSeed(generateSeed());
      const record: WalletAccountRecord = {
        id: crypto.randomUUID(),
        name: "Account 1",
        seed: bytesToHex(wallet.seed),
        address: wallet.address,
        publicKey: bytesToHex(wallet.publicKey),
        createdAt: Date.now()
      };
      const vault: VaultPlaintext = {
        version: 1,
        accounts: [record],
        selectedAccountId: record.id,
        createdAt: Date.now()
      };
      const encrypted = await encryptVault(vault, password);
      await localSet({ vault: encrypted });
      await sessionSet({
        session: {
          rawKey: await exportRawKey(password, encrypted.kdf.salt),
          lastActive: Date.now()
        }
      });
      return { address: wallet.address, mnemonic: wallet.mnemonic };
    }
    case "wallet_import": {
      if (await getEncryptedVault()) {
        throw new Error("A vault already exists. Unlock this wallet instead.");
      }
      const mnemonic = String(params[0] ?? "");
      const password = String(params[1] ?? "");
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      const wallet = recoverWallet(mnemonic);
      const record: WalletAccountRecord = {
        id: crypto.randomUUID(),
        name: "Account 1",
        seed: bytesToHex(wallet.seed),
        address: wallet.address,
        publicKey: bytesToHex(wallet.publicKey),
        createdAt: Date.now()
      };
      const vault: VaultPlaintext = {
        version: 1,
        accounts: [record],
        selectedAccountId: record.id,
        createdAt: Date.now()
      };
      const encrypted = await encryptVault(vault, password);
      await localSet({ vault: encrypted });
      await sessionSet({
        session: {
          rawKey: await exportRawKey(password, encrypted.kdf.salt),
          lastActive: Date.now()
        }
      });
      return { address: wallet.address };
    }
    case "wallet_unlock": {
      const password = String(params[0] ?? "");
      const encrypted = await getEncryptedVault();
      if (!encrypted) throw new Error("No wallet");
      await decryptVault(encrypted, password);
      await sessionSet({
        session: {
          rawKey: await exportRawKey(password, encrypted.kdf.salt),
          lastActive: Date.now()
        }
      });
      return { ok: true };
    }
    case "wallet_lock": {
      await chrome.storage.session.remove("session");
      return { ok: true };
    }
    case "wallet_state": {
      const vault = await readVault();
      const selected = vault.accounts.find((a) => a.id === vault.selectedAccountId) ?? vault.accounts[0];
      if (!selected) throw new Error("No account");
      let balance = 0n;
      let rpcError: string | undefined;
      try {
        balance = await rpc.getBalance(selected.address);
      } catch (error) {
        rpcError = error instanceof Error ? error.message : "Could not reach Groot";
        balance = 0n;
      }
      const { seed: _seed, ...safeAccount } = selected;
      return {
        account: safeAccount,
        accounts: vault.accounts.map(({ seed: _ignored, ...rest }) => rest),
        balance: balance.toString(),
        balanceLabel: formatGaju(balance),
        network,
        rpcError
      };
    }
    case "wallet_reveal_mnemonic": {
      const confirmed = Boolean(params[0]);
      if (!confirmed) throw new Error("explicit reveal required");
      const password = String(params[1] ?? "");
      if (!password) throw new Error("Password required");
      const encrypted = await getEncryptedVault();
      if (!encrypted) throw new Error("No wallet");
      await decryptVault(encrypted, password);
      const wallet = await selectedWallet();
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
      const wallet = await selectedWallet();
      const result = await sendWithFee({
        rpc,
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
    case "nft_list": {
      const wallet = await selectedWallet();
      const watchlist = await getNftWatchlist(wallet.address, network.networkId);
      const portfolio = new Aex141Portfolio(rpc, network);
      const synced = await portfolio.syncOwned(wallet.address, watchlist);
      if (synced.added) await setNftWatchlist(wallet.address, network.networkId, synced.items);
      return { ...(await portfolio.list(wallet.address, synced.items)), added: synced.added };
    }
    case "nft_watch": {
      const wallet = await selectedWallet();
      const watchlist = await getNftWatchlist(wallet.address, network.networkId);
      const portfolio = new Aex141Portfolio(rpc, network);
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
      await setNftWatchlist(wallet.address, network.networkId, next);
      return new Aex141Portfolio(rpc, network).list(wallet.address, next);
    }
    case "nft_unwatch": {
      const wallet = await selectedWallet();
      const watchlist = await getNftWatchlist(wallet.address, network.networkId);
      const next = removeWatchItem(watchlist, String(params[0] ?? ""), String(params[1] ?? ""));
      await setNftWatchlist(wallet.address, network.networkId, next);
      return new Aex141Portfolio(rpc, network).list(wallet.address, next);
    }
    case "nft_scan": {
      const wallet = await selectedWallet();
      const watchlist = await getNftWatchlist(wallet.address, network.networkId);
      const scanned = await new Aex141Portfolio(rpc, network).scan(wallet.address, watchlist);
      await setNftWatchlist(wallet.address, network.networkId, scanned.items);
      if (scanned.mdwUrl && scanned.mdwUrl !== network.mdwUrl) {
        await setNetwork({ ...network, mdwUrl: scanned.mdwUrl });
      }
      const listed = await new Aex141Portfolio(
        rpc,
        scanned.mdwUrl ? { ...network, mdwUrl: scanned.mdwUrl } : network
      ).list(wallet.address, scanned.items);
      return { ...listed, added: scanned.added, scanError: scanned.error, mdwUrl: scanned.mdwUrl };
    }
    case "nft_transfer": {
      const contract = assertContractId(String(params[0] ?? ""));
      const tokenId = parseTokenId(String(params[1] ?? "")).toString();
      const to = assertAccountId(String(params[2] ?? ""));
      const wallet = await selectedWallet();
      const approved = await openApproval({
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
      const nonce = await rpc.getNextNonce(wallet.address);
      const height = await rpc.getHeight();
      const unsigned = createContractCallTransaction({
        caller: wallet.address,
        contract,
        nonce,
        ttl: height + DEFAULT_TTL_DELTA,
        gas: NFT_CALL_GAS,
        callData: decode(encodeAex141Transfer(to, tokenId)).payload
      });
      const signed = signAndEncode(unsigned, wallet.keyPair, network.networkId, "hashed");
      return rpc.broadcastTransaction(signed.encoded);
    }
    case "gaju_connect": {
      const permissions = await getPermissions();
      const existing = permissions.find((p) => p.origin === origin);
      if (existing) {
        existing.lastUsedAt = Date.now();
        existing.accounts = [(await selectedWallet()).address];
        await savePermissions(permissions);
        return { accounts: existing.accounts, networkId: network.networkId };
      }
      const wallet = await selectedWallet();
      const approved = await openApproval({
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
      if (!approved) {
        throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
      }
      const permission: DappPermission = {
        origin,
        accounts: [wallet.address],
        permissions: ["readAccount"],
        createdAt: Date.now(),
        lastUsedAt: Date.now()
      };
      permissions.push(permission);
      await savePermissions(permissions);
      return { accounts: permission.accounts, networkId: network.networkId };
    }
    case "gaju_disconnect": {
      const permissions = (await getPermissions()).filter((p) => p.origin !== origin);
      await savePermissions(permissions);
      return { ok: true };
    }
    case "gaju_accounts": {
      await requireOriginPermission(origin);
      return [(await selectedWallet()).address];
    }
    case "gaju_chainId":
      return network.networkId;
    case "wallet_switch_network": {
      const id = String(params[0] ?? "");
      const next = Object.values(NETWORKS).find((n) => n.networkId === id || n.name === id);
      if (!next) throw new Error("Unknown network");
      await setNetwork(next);
      try {
        await rpc.getStatus();
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
      const approved = await openApproval({
        id: crypto.randomUUID(),
        origin,
        kind: "switchChain",
        summary: { Origin: origin, Network: next.name, "Network ID": next.networkId },
        payload: next
      });
      if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
      await setNetwork(next);
      return next.networkId;
    }
    case "gaju_getBalance": {
      await requireOriginPermission(origin);
      const address = String(params[0] ?? (await selectedWallet()).address);
      return (await rpc.getBalance(address)).toString();
    }
    case "gaju_signMessage": {
      await requireOriginPermission(origin);
      const message = String(params[0] ?? "");
      const wallet = await selectedWallet();
      const approved = await openApproval({
        id: crypto.randomUUID(),
        origin,
        kind: "signMessage",
        summary: { Origin: origin, Account: wallet.address, Message: message },
        payload: message
      });
      if (!approved) throw new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected");
      const signature = signMessage(new TextEncoder().encode(message), wallet.keyPair.secretKey);
      return bytesToHex(signature);
    }
    case "gaju_signBinary": {
      await requireOriginPermission(origin);
      const payload = String(params[0] ?? "");
      const wallet = await selectedWallet();
      const approved = await openApproval({
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
      await requireOriginPermission(origin);
      const request = (params[0] ?? {}) as { to?: string; amount?: string; payload?: string };
      const wallet = await selectedWallet();
      const amount = parseGaju(String(request.amount ?? "0"));
      const quote = quoteSpend(amount, wallet.address);
      const approved = await openApproval({
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
        rpc,
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
      return getPermissions();
    case "permissions_revoke": {
      const target = String(params[0] ?? "");
      await savePermissions((await getPermissions()).filter((p) => p.origin !== target));
      return { ok: true };
    }
    case "approval_get": {
      const id = String(params[0] ?? "");
      return pending.get(id)?.request;
    }
    case "approval_resolve": {
      const id = String(params[0] ?? "");
      const accepted = Boolean(params[1]);
      const item = pending.get(id);
      if (!item) throw new Error("Unknown approval");
      pending.delete(id);
      if (accepted) item.resolve(true);
      else item.reject(new ProviderError(ProviderErrorCode.USER_REJECTED, "User rejected"));
      return { ok: true };
    }
    default:
      throw new ProviderError(ProviderErrorCode.UNSUPPORTED_METHOD, `Unsupported method: ${method}`);
  }
}

function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.url ?? "";
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const origin = sender.origin ?? sender.tab?.url ?? "extension://wallet";
  const trustedOrigin = (() => {
    try {
      return new URL(origin).origin;
    } catch {
      return origin;
    }
  })();
  const method = String(message?.method ?? "");
  const params = Array.isArray(message?.params) ? message.params : [];
  const fromExtension = isExtensionPage(sender);
  if (EXTENSION_ONLY_METHODS.has(method) && !fromExtension) {
    sendResponse({
      ok: false,
      error: {
        code: ProviderErrorCode.UNAUTHORIZED,
        message: "This method is not available to websites"
      }
    });
    return false;
  }
  if (!fromExtension && !DAPP_METHODS.has(method)) {
    sendResponse({
      ok: false,
      error: {
        code: ProviderErrorCode.UNSUPPORTED_METHOD,
        message: `Unsupported method: ${method}`
      }
    });
    return false;
  }
  handleProviderMethod(trustedOrigin, method, params)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error: unknown) => {
      const err = error as { code?: number; message?: string };
      sendResponse({
        ok: false,
        error: {
          code: err.code ?? ProviderErrorCode.SIGNING_ERROR,
          message: err.message ?? "Wallet error"
        }
      });
    });
  return true;
});
