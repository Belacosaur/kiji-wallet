type ApprovalRequest = {
  id: string;
  origin: string;
  kind: string;
  summary: Record<string, string>;
};

type DesktopApi = {
  call: <T>(method: string, params?: unknown[]) => Promise<T>;
  onApproval: (listener: (request: ApprovalRequest) => void) => () => void;
  resolveApproval: (id: string, accepted: boolean) => Promise<unknown>;
  onGridsUrl: (listener: (url: string) => void) => () => void;
};

declare global {
  interface Window {
    gajuDesktop: DesktopApi;
  }
}

const api = window.gajuDesktop;
const app = document.getElementById("app")!;
const overlay = document.getElementById("overlay")!;
const chrome = document.getElementById("chrome")!;
const banner = document.getElementById("banner")!;
const dock = document.getElementById("dock")!;

let pendingGridsUrl: string | undefined;
let currentAccount: SafeAccount | undefined;
let currentNetworkName = "";
let currentExplorerUrl = "";
let homeAssetTab: "tokens" | "collectibles" = "tokens";
let nftCache: NftListResult | undefined;
let homeGen = 0;
let lastNftScanAt = 0;
const NFT_SCAN_TTL_MS = 20_000;

function invalidateNftCache() {
  nftCache = undefined;
  lastNftScanAt = 0;
}

const svg = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const ICONS = {
  send: svg(`<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>`),
  receive: svg(
    `<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>`
  ),
  nfts: svg(
    `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`
  ),
  more: svg(
    `<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>`
  ),
  copy: svg(`<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>`),
  back: svg(`<path d="M15 5 8 12l7 7"/>`),
  pin: svg(`<path d="M15 4.5 9.5 10 8 20l10-1.5 5.5-5.5"/><path d="m14 10 4 4"/>`)
};

function render(html: string) {
  app.innerHTML = html;
}

function showOverlay(html: string) {
  overlay.innerHTML = html;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.innerHTML = "";
  overlay.classList.add("hidden");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char] ?? char;
  });
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

function avatarLetter(name: string) {
  return (name.trim()[0] || "K").toUpperCase();
}

type SafeAccount = { id: string; name: string; address: string };
type DockTab = "home" | "nfts" | "activity" | "settings";
type NftView = {
  contract: string;
  tokenId: string;
  collectionName?: string;
  collectionSymbol?: string;
  name?: string;
  description?: string;
  image?: string;
  owner?: string;
  owned: boolean;
  error?: string;
};
type NftListResult = {
  nfts: NftView[];
  added?: number;
  scanError?: string;
  mdwUrl?: string;
};

function setShell(mode: "lock" | "app", tab?: DockTab) {
  document.body.dataset.mode = mode;
  if (mode === "lock") {
    chrome.classList.add("hidden");
    banner.classList.add("hidden");
    dock.classList.add("hidden");
    return;
  }
  chrome.classList.remove("hidden");
  dock.classList.remove("hidden");
  if (/testnet/i.test(currentNetworkName)) banner.classList.remove("hidden");
  else banner.classList.add("hidden");
  for (const button of dock.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
    button.classList.toggle("active", button.dataset.tab === tab);
  }
}

function paintChrome(account: SafeAccount) {
  currentAccount = account;
  chrome.innerHTML = `
    <button type="button" class="account-chip" id="accounts">
      <span class="avatar">${escapeHtml(avatarLetter(account.name))}</span>
      <span class="account-name">${escapeHtml(account.name)}</span>
    </button>
    <button type="button" class="icon-btn" id="copy-addr" aria-label="Copy address">${ICONS.copy}</button>
  `;
  document.getElementById("accounts")!.onclick = accounts;
  document.getElementById("copy-addr")!.onclick = async (event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(account.address);
    } catch {
      /* ignore */
    }
  };
}

function lockChrome(extra = "") {
  return `
    <div class="lock-top">
      <span class="wordmark">kiji</span>
      <button type="button" class="help-btn" id="help" aria-label="Help">?</button>
    </div>
    <img class="lock-logo" src="logo.png" alt="" />
    ${extra}
  `;
}

function bindHelp() {
  document.getElementById("help")!.onclick = () => {
    showOverlay(`
      <div class="card stack">
        <h2>Kiji Wallet</h2>
        <p class="notice">Non-custodial Groot wallet. Keys stay on this PC. A website can open Kiji with a GRIDS link; you still confirm every signature.</p>
        <button id="ok">OK</button>
      </div>
    `);
    document.getElementById("ok")!.onclick = hideOverlay;
  };
}

function bindSubmit(handler: () => Promise<void>, busyLabel = "Working…") {
  const form = document.getElementById("form") as HTMLFormElement;
  const go = form.querySelector("button[type=submit]") as HTMLButtonElement;
  const idleLabel = go.textContent ?? "OK";
  form.onsubmit = async (event) => {
    event.preventDefault();
    go.disabled = true;
    go.textContent = busyLabel;
    try {
      await handler();
    } catch (error) {
      if ((error as Error).message !== "Cancelled") {
        const box = document.getElementById("error");
        if (box) box.textContent = (error as Error).message;
      }
      go.disabled = false;
      go.textContent = idleLabel;
    }
  };
  const password = form.querySelector<HTMLInputElement>("input[type=password]");
  (password ?? form.querySelector<HTMLInputElement>("input, textarea"))?.focus();
}

function pageNav(title: string) {
  return `
    <div class="page-nav">
      <button type="button" class="icon-btn" id="back" aria-label="Back">${ICONS.back}</button>
      <h2>${title}</h2>
      <span></span>
    </div>
  `;
}

function explorerHint(hash: string) {
  if (!currentExplorerUrl || !hash) return "";
  const url = `${currentExplorerUrl.replace(/\/$/, "")}/transactions/${encodeURIComponent(hash)}`;
  return `<p class="notice">Explorer: ${escapeHtml(url)}</p>`;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    /* ignore */
  }
}

async function boot() {
  const status = await api.call<{ hasWallet: boolean; unlocked: boolean }>("wallet_status");
  if (!status.hasWallet) return welcome();
  if (!status.unlocked) return unlock();
  if (pendingGridsUrl) return consumeGrids(pendingGridsUrl);
  return home();
}

function welcome() {
  setShell("lock");
  render(`
    <div class="lock">
      ${lockChrome(`
        <form id="form" class="lock-form">
          <p class="notice">A local tree of keys. Seeds stay on this PC.</p>
          <button id="create" type="button" class="btn-wide">Create wallet</button>
          <button id="import" type="button" class="secondary btn-wide">Import recovery phrase</button>
        </form>
      `)}
    </div>
  `);
  bindHelp();
  document.getElementById("create")!.onclick = createWallet;
  document.getElementById("import")!.onclick = importWallet;
}

function createWallet() {
  setShell("lock");
  render(`
    <div class="lock">
      ${lockChrome(`
        <form id="form" class="lock-form">
          <p class="notice">Password encrypts this device vault only.</p>
          <input id="password" type="password" autocomplete="new-password" placeholder="Password (8+ characters)" />
          <button id="go" type="submit">Generate</button>
          <div class="error" id="error"></div>
        </form>
      `)}
    </div>
  `);
  bindHelp();
  bindSubmit(async () => {
    const password = (document.getElementById("password") as HTMLInputElement).value;
    const created = await api.call<{ address: string; mnemonic: string }>("wallet_create", [password]);
    setShell("lock");
    render(`
      <div class="lock">
        ${lockChrome(`
          <div class="lock-form stack">
            <p class="notice">This is the Kiji recovery phrase, not BIP-39. Write it down. It is not copied automatically.</p>
            <textarea readonly>${escapeHtml(created.mnemonic)}</textarea>
            <p class="address">${escapeHtml(created.address)}</p>
            <button id="done" type="button" class="btn-wide">I stored the phrase</button>
          </div>
        `)}
      </div>
    `);
    bindHelp();
    document.getElementById("done")!.onclick = home;
  }, "Generating…");
}

function importWallet() {
  setShell("lock");
  render(`
    <div class="lock">
      ${lockChrome(`
        <form id="form" class="lock-form">
          <textarea id="mnemonic" placeholder="Kiji recovery phrase"></textarea>
          <input id="password" type="password" autocomplete="new-password" placeholder="New vault password" />
          <button id="go" type="submit">Recover</button>
          <div class="error" id="error"></div>
        </form>
      `)}
    </div>
  `);
  bindHelp();
  bindSubmit(async () => {
    const mnemonic = (document.getElementById("mnemonic") as HTMLTextAreaElement).value;
    const password = (document.getElementById("password") as HTMLInputElement).value;
    await api.call("wallet_import", [mnemonic, password]);
    if (pendingGridsUrl) return consumeGrids(pendingGridsUrl);
    await home();
  }, "Recovering…");
}

function unlock() {
  setShell("lock");
  render(`
    <div class="lock">
      ${lockChrome(`
        <form id="form" class="lock-form">
          ${pendingGridsUrl ? `<p class="notice">A website sent a GRIDS request. Unlock to review it.</p>` : ""}
          <input id="password" type="password" autocomplete="current-password" placeholder="Password" />
          <button id="go" type="submit">Unlock</button>
          <div class="error" id="error"></div>
        </form>
        <button type="button" class="link" id="forgot">Forgot password</button>
      `)}
    </div>
  `);
  bindHelp();
  document.getElementById("forgot")!.onclick = forgotPassword;
  bindSubmit(async () => {
    const password = (document.getElementById("password") as HTMLInputElement).value;
    await api.call("wallet_unlock", [password]);
    if (pendingGridsUrl) return consumeGrids(pendingGridsUrl);
    await home();
  }, "Unlocking…");
}

function forgotPassword() {
  setShell("lock");
  render(`
    <div class="lock">
      ${lockChrome(`
        <div class="lock-form stack">
          <p class="notice">Kiji cannot reset this password. The vault is encrypted on this PC. There is no email recovery.</p>
          <button type="button" class="btn-wide" id="back">Back to unlock</button>
        </div>
      `)}
    </div>
  `);
  bindHelp();
  document.getElementById("back")!.onclick = unlock;
}

function actionButton(id: string, icon: string, label: string) {
  return `<button type="button" class="action" id="${id}"><span class="tile">${icon}</span><span>${label}</span></button>`;
}

function tokenRowMarkup(balanceLabel: string) {
  return `<div class="token-row">
    <img class="token-icon" src="logo.png" alt="" />
    <div><strong>GAJU</strong><small>Groot</small></div>
    <div class="token-amt" id="token-amt">${escapeHtml(balanceLabel)} GAJU</div>
  </div>`;
}

function collectiblesLoadingMarkup() {
  return `<div class="assets-loading"><span class="spinner" aria-hidden="true"></span><p class="notice">Looking for collectibles…</p></div>`;
}

function homeOnScreen() {
  return Boolean(document.getElementById("tab-tokens"));
}

function setAssetTabs(tab: "tokens" | "collectibles") {
  document.getElementById("tab-tokens")?.classList.toggle("active", tab === "tokens");
  document.getElementById("tab-nfts")?.classList.toggle("active", tab === "collectibles");
  setShell("app", tab === "collectibles" ? "nfts" : "home");
}

function paintAssetPanel(html: string) {
  const el = document.querySelector(".assets");
  if (!el) return false;
  el.innerHTML = html;
  return true;
}

function switchAssetTab(tab: "tokens" | "collectibles") {
  homeAssetTab = tab;
  if (!homeOnScreen()) {
    void home();
    return;
  }
  const gen = ++homeGen;
  setAssetTabs(tab);
  if (tab === "tokens") {
    const label = (document.getElementById("balance")?.textContent ?? "0").replace(/\s*GAJU\s*$/, "").trim();
    paintAssetPanel(tokenRowMarkup(label || "0"));
    return;
  }
  paintAssetPanel(nftCache ? collectiblesMarkup(nftCache) : collectiblesLoadingMarkup());
  bindNftTiles();
  void loadCollectibles(gen);
}

async function home() {
  const gen = ++homeGen;
  const tab = homeAssetTab;
  const state = await api.call<{
    account: SafeAccount;
    accounts: SafeAccount[];
    balanceLabel: string;
    network: { name: string; explorerUrl?: string };
  }>("wallet_state");
  if (gen !== homeGen) return;
  currentNetworkName = state.network.name;
  currentExplorerUrl = state.network.explorerUrl ?? "";
  paintChrome(state.account);
  setShell("app", tab === "collectibles" ? "nfts" : "home");

  const assets =
    tab === "collectibles"
      ? nftCache
        ? collectiblesMarkup(nftCache)
        : collectiblesLoadingMarkup()
      : tokenRowMarkup(state.balanceLabel);

  render(`
    <div class="hero">
      <div class="balance" id="balance">${escapeHtml(state.balanceLabel)} GAJU</div>
      <p class="error" id="rpc-error"></p>
    </div>
    <div class="actions">
      ${actionButton("send", ICONS.send, "Send")}
      ${actionButton("receive", ICONS.receive, "Receive")}
      ${actionButton("nfts", ICONS.nfts, "Collectibles")}
      ${actionButton("more", ICONS.more, "More")}
    </div>
    <div class="tabs">
      <button type="button" class="tab${tab === "tokens" ? " active" : ""}" id="tab-tokens">Tokens</button>
      <button type="button" class="tab${tab === "collectibles" ? " active" : ""}" id="tab-nfts">Collectibles</button>
      <button type="button" class="icon-btn" id="asset-menu" aria-label="More">${ICONS.more}</button>
    </div>
    <div class="assets">${assets}</div>
  `);
  document.getElementById("send")!.onclick = send;
  document.getElementById("receive")!.onclick = () => receive(state.account.address);
  document.getElementById("nfts")!.onclick = () => switchAssetTab("collectibles");
  document.getElementById("more")!.onclick = moreMenu;
  document.getElementById("tab-tokens")!.onclick = () => switchAssetTab("tokens");
  document.getElementById("tab-nfts")!.onclick = () => switchAssetTab("collectibles");
  document.getElementById("asset-menu")!.onclick = moreMenu;
  if (tab === "collectibles") bindNftTiles();
  void api.call<{ balanceLabel: string; rpcError?: string }>("wallet_balance").then((balance) => {
    const label = document.getElementById("balance");
    const amt = document.getElementById("token-amt");
    const error = document.getElementById("rpc-error");
    if (label) label.textContent = `${balance.balanceLabel} GAJU`;
    if (amt) amt.textContent = `${balance.balanceLabel} GAJU`;
    if (error && balance.rpcError) error.textContent = `Node: ${balance.rpcError}`;
  });
  if (tab === "collectibles") void loadCollectibles(gen);
}

async function loadCollectibles(gen: number) {
  const stillHere = () => gen === homeGen && homeAssetTab === "collectibles" && homeOnScreen();
  const paint = (html: string) => {
    if (!stillHere()) return false;
    if (!paintAssetPanel(html)) return false;
    bindNftTiles();
    return true;
  };

  if (nftCache && Date.now() - lastNftScanAt < NFT_SCAN_TTL_MS) {
    paint(collectiblesMarkup(nftCache));
    return;
  }

  try {
    if (!nftCache) {
      const listed = await api.call<NftListResult>("nft_list");
      if (!stillHere()) return;
      nftCache = listed;
      if (listed.nfts.length > 0) {
        paint(`${collectiblesMarkup(listed)}<p class="notice">Checking Groot for more…</p>`);
      } else {
        paint(collectiblesLoadingMarkup());
      }
    }

    const scanned = await api.call<NftListResult>("nft_scan");
    if (!stillHere()) return;
    lastNftScanAt = Date.now();
    nftCache = scanned;
    paint(collectiblesMarkup(scanned));
  } catch (error) {
    if (!stillHere()) return;
    if (nftCache?.nfts.length) {
      paint(
        `${collectiblesMarkup(nftCache)}<p class="error">${escapeHtml((error as Error).message)}</p>`
      );
      return;
    }
    paint(`<p class="error">${escapeHtml((error as Error).message)}</p>`);
  }
}

function moreMenu() {
  showOverlay(`
    <div class="card stack">
      <button type="button" id="m-grids">GRIDS URL</button>
      <button type="button" class="secondary" id="m-add">Add NFT</button>
      <button type="button" class="secondary" id="m-accounts">Accounts</button>
      <button type="button" class="secondary" id="m-close">Close</button>
    </div>
  `);
  document.getElementById("m-grids")!.onclick = () => {
    hideOverlay();
    grids();
  };
  document.getElementById("m-add")!.onclick = () => {
    hideOverlay();
    addNft();
  };
  document.getElementById("m-accounts")!.onclick = () => {
    hideOverlay();
    void accounts();
  };
  document.getElementById("m-close")!.onclick = hideOverlay;
}

function collectiblesMarkup(result: NftListResult) {
  if (result.nfts.length === 0) {
    return `<p class="notice">No collectibles yet. Featured AEX-141 collections appear here after a scan.</p>`;
  }
  const scanNote = result.scanError
    ? `<p class="notice">${escapeHtml(result.scanError)}</p>`
    : result.added
      ? `<p class="notice">Found ${result.added} token${result.added === 1 ? "" : "s"} on Groot.</p>`
      : "";
  const tiles = result.nfts
    .map((nft, index) => {
      const title = escapeHtml(nft.name || `#${nft.tokenId}`);
      const image = nft.image
        ? `<img alt="" src="${escapeHtml(nft.image)}" />`
        : `<div class="nft-placeholder"></div>`;
      return `<button type="button" class="nft-tile" data-nft="${index}">
        <div class="nft-art">${image}<span class="nft-caption">${title} ${escapeHtml(nft.tokenId)}</span></div>
      </button>`;
    })
    .join("");
  return `${scanNote}<div class="nft-grid">${tiles}</div>`;
}

function bindNftTiles() {
  for (const img of app.querySelectorAll<HTMLImageElement>(".nft-art img")) {
    img.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "nft-placeholder";
      img.replaceWith(ph);
    };
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-nft]")) {
    button.onclick = () => {
      const nft = nftCache?.nfts[Number(button.dataset.nft)];
      if (nft) nftDetail(nft);
    };
  }
}

async function accounts() {
  setShell("app");
  const state = await api.call<{
    account: SafeAccount;
    accounts: SafeAccount[];
  }>("wallet_state");
  paintChrome(state.account);
  render(`
    <div class="page">
      ${pageNav("Accounts")}
      <p class="notice">Same vault, separate Groot keys. Switching does not need the password again.</p>
      <div class="list">
        ${state.accounts
          .map((account) => {
            const current = account.id === state.account.id;
            return `<button type="button" class="account-pick${current ? " current" : ""}" data-select="${escapeHtml(account.id)}">
              <strong>${escapeHtml(account.name)}${current ? " · current" : ""}</strong>
              <small>${escapeHtml(shortAddress(account.address))}</small>
            </button>`;
          })
          .join("")}
      </div>
      <div class="row">
        <button id="add">Add account</button>
        <button id="import-account" class="secondary">Import</button>
      </div>
    </div>
  `);
  document.getElementById("back")!.onclick = home;
  document.getElementById("add")!.onclick = addAccount;
  document.getElementById("import-account")!.onclick = importAccount;
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-select]")) {
    button.onclick = async () => {
      await api.call("wallet_select_account", [button.dataset.select]);
      invalidateNftCache();
      await home();
    };
  }
}

function addAccount() {
  setShell("app");
  render(`
    <div class="page">
      ${pageNav("Add account")}
      <form id="form">
        <p class="notice">Creates a new Groot key inside this vault. Write down the new recovery phrase.</p>
        <input id="name" placeholder="Name (optional)" />
        <button id="go" type="submit">Generate</button>
        <div class="error" id="error"></div>
      </form>
    </div>
  `);
  document.getElementById("back")!.onclick = accounts;
  bindSubmit(async () => {
    const name = (document.getElementById("name") as HTMLInputElement).value;
    const created = await api.call<{ address: string; mnemonic: string; name: string }>(
      "wallet_add_account",
      [name]
    );
    render(`
      <div class="page stack">
        ${pageNav("Recovery phrase")}
        <p class="notice">${escapeHtml(created.name)} is now the selected account. This phrase is not BIP-39.</p>
        <textarea readonly>${escapeHtml(created.mnemonic)}</textarea>
        <p class="address">${escapeHtml(created.address)}</p>
        <button id="done">I stored the phrase</button>
      </div>
    `);
    document.getElementById("back")!.onclick = home;
    document.getElementById("done")!.onclick = home;
  }, "Generating…");
}

function importAccount() {
  setShell("app");
  render(`
    <div class="page">
      ${pageNav("Import account")}
      <form id="form">
        <p class="notice">Paste a Kiji recovery phrase. It is added to this vault, not a second password.</p>
        <textarea id="mnemonic" placeholder="Kiji recovery phrase"></textarea>
        <input id="name" placeholder="Name (optional)" />
        <button id="go" type="submit">Import</button>
        <div class="error" id="error"></div>
      </form>
    </div>
  `);
  document.getElementById("back")!.onclick = accounts;
  bindSubmit(async () => {
    const mnemonic = (document.getElementById("mnemonic") as HTMLTextAreaElement).value;
    const name = (document.getElementById("name") as HTMLInputElement).value;
    await api.call("wallet_import_account", [mnemonic, name]);
    await home();
  }, "Importing…");
}

function receive(address: string) {
  setShell("app");
  render(`
    <div class="page stack">
      ${pageNav("Receive")}
      <p class="notice">Share this account id. Never share the recovery phrase.</p>
      <div class="address">${escapeHtml(address)}</div>
      <button type="button" id="copy-recv">Copy address</button>
    </div>
  `);
  document.getElementById("back")!.onclick = home;
  document.getElementById("copy-recv")!.onclick = () => copyText(address);
}

async function nfts() {
  homeAssetTab = "collectibles";
  await home();
}

function nftDetail(nft: NftView) {
  setShell("app", "nfts");
  const title = escapeHtml(nft.name || `#${nft.tokenId}`);
  const image = nft.image
    ? `<img alt="" src="${escapeHtml(nft.image)}" />`
    : `<div class="nft-placeholder"></div>`;
  render(`
    <div class="page">
      ${pageNav(title)}
      <div class="detail-art"><div class="nft-art">${image}</div></div>
      <div class="actions">
        ${nft.owned ? actionButton("send-nft", ICONS.send, "Send") : ""}
        ${actionButton("more-nft", ICONS.more, "More")}
      </div>
      <div class="meta">
        <span class="meta-label">Description</span>
        <strong>${escapeHtml(nft.description || `${nft.name ?? "NFT"} — ${nft.tokenId}`)}</strong>
      </div>
      <div class="meta">
        <div class="item"><span>Collection</span><strong>${escapeHtml(nft.collectionName || shortAddress(nft.contract))}</strong></div>
        <div class="item"><span>Token</span><strong>#${escapeHtml(nft.tokenId)}</strong></div>
        <div class="item"><span>Network</span><strong>${escapeHtml(currentNetworkName || "Groot")}</strong></div>
      </div>
      ${nft.error ? `<p class="error">${escapeHtml(nft.error)}</p>` : ""}
    </div>
  `);
  document.getElementById("back")!.onclick = () => {
    homeAssetTab = "collectibles";
    void home();
  };
  const sendNft = document.getElementById("send-nft");
  if (sendNft) sendNft.onclick = () => transferNft(nft.contract, nft.tokenId);
  document.getElementById("more-nft")!.onclick = () => {
    showOverlay(`
      <div class="card stack">
        ${nft.owned ? `<button type="button" id="m-transfer">Transfer</button>` : ""}
        <button type="button" class="secondary" id="m-remove">Remove</button>
        <button type="button" class="secondary" id="m-close">Close</button>
      </div>
    `);
    document.getElementById("m-transfer")?.addEventListener("click", () => {
      hideOverlay();
      transferNft(nft.contract, nft.tokenId);
    });
    document.getElementById("m-remove")!.onclick = async () => {
      hideOverlay();
      nftCache = await api.call<NftListResult>("nft_unwatch", [nft.contract, nft.tokenId]);
      lastNftScanAt = Date.now();
      homeAssetTab = "collectibles";
      await home();
    };
    document.getElementById("m-close")!.onclick = hideOverlay;
  };
  bindNftTiles();
}

function addNft() {
  setShell("app", "nfts");
  render(`
    <div class="page">
      ${pageNav("Add NFT")}
      <form id="form">
        <p class="notice">Optional: paste a <code>ct_</code> collection. Leave token id blank and the wallet finds tokens this account owns.</p>
        <input id="contract" placeholder="ct_…" spellcheck="false" />
        <input id="token-id" placeholder="Token id (optional, e.g. 1)" inputmode="numeric" />
        <button id="go" type="submit">Watch</button>
        <div class="error" id="error"></div>
      </form>
    </div>
  `);
  document.getElementById("back")!.onclick = nfts;
  bindSubmit(async () => {
    const contract = (document.getElementById("contract") as HTMLInputElement).value;
    const tokenId = (document.getElementById("token-id") as HTMLInputElement).value;
    nftCache = await api.call<NftListResult>("nft_watch", [contract, tokenId]);
    lastNftScanAt = Date.now();
    homeAssetTab = "collectibles";
    await home();
  }, "Reading…");
}

function transferNft(contract: string, tokenId: string) {
  setShell("app", "nfts");
  render(`
    <div class="page">
      ${pageNav("Transfer NFT")}
      <form id="form">
        <p class="notice">AEX-141 <code>transfer</code> on Groot. Confirm the next prompt before it is signed.</p>
        <p class="address">${escapeHtml(contract)}</p>
        <p class="notice">Token #${escapeHtml(tokenId)}</p>
        <input id="to" placeholder="ak_…" spellcheck="false" />
        <button id="go" type="submit">Review and transfer</button>
        <div class="error" id="error"></div>
      </form>
    </div>
  `);
  document.getElementById("back")!.onclick = nfts;
  bindSubmit(async () => {
    const to = (document.getElementById("to") as HTMLInputElement).value;
    const result = await api.call<{ txHash: string }>("nft_transfer", [contract, tokenId, to]);
    render(`
      <div class="page">
        ${pageNav("Submitted")}
        <div class="address">${escapeHtml(result.txHash)}</div>
        <button type="button" class="secondary" id="copy-hash">Copy hash</button>
        ${explorerHint(result.txHash)}
      </div>
    `);
    document.getElementById("back")!.onclick = nfts;
    document.getElementById("copy-hash")!.onclick = () => copyText(result.txHash);
  }, "Waiting…");
}

function send() {
  setShell("app");
  render(`
    <div class="page">
      ${pageNav("Send")}
      <form id="form">
        <input id="to" placeholder="ak_..." />
        <input id="amount" placeholder="Amount in GAJU" />
        <input id="payload" placeholder="Payload (optional)" />
        <div class="quote" id="quote">
          <div class="item"><span>Recipient gets</span><strong id="q-amount">0 GAJU</strong></div>
          <div class="item"><span>Gas</span><strong id="q-gas">…</strong></div>
          <div class="item"><span>You pay</span><strong id="q-total">…</strong></div>
          <p class="notice">Recipient gets the full amount. Gas is taken from your balance.</p>
        </div>
        <button id="go" type="submit">Review</button>
        <div class="error" id="error"></div>
      </form>
    </div>
  `);
  document.getElementById("back")!.onclick = home;
  const amountInput = document.getElementById("amount") as HTMLInputElement;
  const paintQuote = (quote: {
    amountLabel: string;
    gasLabel: string;
    totalLabel: string;
  }) => {
    document.getElementById("q-amount")!.textContent = `${quote.amountLabel} GAJU`;
    document.getElementById("q-gas")!.textContent = `${quote.gasLabel} GAJU`;
    document.getElementById("q-total")!.textContent = `${quote.totalLabel} GAJU`;
  };
  const refreshQuote = async () => {
    try {
      paintQuote(
        await api.call("wallet_fee_quote", [amountInput.value.trim()])
      );
    } catch {
      /* keep last quote */
    }
  };
  amountInput.oninput = () => {
    void refreshQuote();
  };
  void refreshQuote();
  bindSubmit(async () => {
    const to = (document.getElementById("to") as HTMLInputElement).value.trim();
    const amount = amountInput.value.trim();
    const payload = (document.getElementById("payload") as HTMLInputElement).value;
    if (!to || !amount) throw new Error("Enter a recipient and amount.");
    const quote = await api.call<{ amountLabel: string; gasLabel: string; totalLabel: string }>(
      "wallet_fee_quote",
      [amount]
    );
    const confirmed = await new Promise<boolean>((resolve) => {
      showOverlay(`
        <div class="card">
          <h1>Confirm send</h1>
          <div class="item"><span>To</span><strong>${escapeHtml(to)}</strong></div>
          <div class="item"><span>Recipient gets</span><strong>${escapeHtml(quote.amountLabel)} GAJU</strong></div>
          <div class="item"><span>Gas</span><strong>${escapeHtml(quote.gasLabel)} GAJU</strong></div>
          <div class="item"><span>You pay</span><strong>${escapeHtml(quote.totalLabel)} GAJU</strong></div>
          <div class="row">
            <button type="button" id="confirm-send">Send now</button>
            <button type="button" class="secondary" id="cancel-send">Cancel</button>
          </div>
        </div>
      `);
      document.getElementById("confirm-send")!.onclick = () => {
        hideOverlay();
        resolve(true);
      };
      document.getElementById("cancel-send")!.onclick = () => {
        hideOverlay();
        resolve(false);
      };
    });
    if (!confirmed) throw new Error("Cancelled");
    const result = await api.call<{
      txHash: string;
      fee?: string;
      total?: string;
      feeError?: string;
    }>("wallet_send", [to, amount, payload]);
    render(`
      <div class="page">
        ${pageNav("Submitted")}
        <div class="address">${escapeHtml(result.txHash)}</div>
        <button type="button" class="secondary" id="copy-hash">Copy hash</button>
        ${result.fee ? `<p class="notice">Gas ${escapeHtml(result.fee)} GAJU. You paid ${escapeHtml(result.total ?? "")} GAJU.</p>` : ""}
        ${result.feeError ? `<p class="error">${escapeHtml(result.feeError)}</p>` : ""}
        ${explorerHint(result.txHash)}
      </div>
    `);
    document.getElementById("back")!.onclick = home;
    document.getElementById("copy-hash")!.onclick = () => copyText(result.txHash);
  }, "Review…");
}

function grids(preset = "") {
  setShell("app");
  render(`
    <div class="page">
      ${pageNav("GRIDS")}
      <p class="notice">Paste the <code>grids://</code> code from the website. The site never sees your keys.</p>
      <textarea id="grids-url" placeholder="grids://…" spellcheck="false">${escapeHtml(preset)}</textarea>
      <button id="go">OK</button>
      <div class="error" id="error"></div>
    </div>
  `);
  const input = document.getElementById("grids-url") as HTMLTextAreaElement;
  document.getElementById("back")!.onclick = home;
  document.getElementById("go")!.onclick = () => consumeGrids(input.value);
}

async function consumeGrids(url: string) {
  pendingGridsUrl = url.trim();
  if (!pendingGridsUrl) return;
  const status = await api.call<{ hasWallet: boolean; unlocked: boolean }>("wallet_status");
  if (!status.hasWallet) return welcome();
  if (!status.unlocked) return unlock();
  const submitted = pendingGridsUrl;
  setShell("app");
  render(`
    <div class="page stack">
      ${pageNav("GRIDS request")}
      <p class="notice">Fetched from the website. Confirm the origin in the next prompt.</p>
      <div class="address">${escapeHtml(submitted)}</div>
      <div class="error" id="error"></div>
    </div>
  `);
  document.getElementById("back")!.onclick = () => {
    pendingGridsUrl = undefined;
    void home();
  };
  try {
    const result = await api.call<{ ok?: boolean; type?: string; txHash?: string }>("wallet_grids", [
      submitted
    ]);
    pendingGridsUrl = undefined;
    render(`
      <div class="page stack">
        ${pageNav("Posted back")}
        <p class="notice">${
          result?.txHash
            ? `Submitted ${result.txHash}`
            : result?.type
              ? `Signed ${result.type}. Return to the website.`
              : "Done. Return to the website."
        }</p>
      </div>
    `);
    document.getElementById("back")!.onclick = home;
  } catch (err) {
    const message = (err as Error).message;
    if (/locked/i.test(message)) return unlock();
    render(`
      <div class="page stack">
        ${pageNav("GRIDS request")}
        <p class="error">${escapeHtml(message)}</p>
        <button id="unlock">Unlock</button>
      </div>
    `);
    document.getElementById("back")!.onclick = () => {
      pendingGridsUrl = undefined;
      void boot();
    };
    document.getElementById("unlock")!.onclick = () => unlock();
  }
}

async function connectedApps() {
  setShell("app", "activity");
  const permissions = await api.call<Array<{ origin: string; lastUsedAt: number }>>("permissions_list");
  render(`
    <div class="page">
      ${pageNav("Apps")}
      <div class="list">
        ${
          permissions.length === 0
            ? `<p class="notice">No websites connected.</p>`
            : permissions
                .map(
                  (p) =>
                    `<div class="item"><span>${escapeHtml(p.origin)}</span><button data-origin="${escapeHtml(p.origin)}" class="secondary">Disconnect</button></div>`
                )
                .join("")
        }
      </div>
    </div>
  `);
  document.getElementById("back")!.onclick = home;
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-origin]")) {
    button.onclick = async () => {
      await api.call("permissions_revoke", [button.dataset.origin]);
      await connectedApps();
    };
  }
}

async function settings() {
  const state = await api.call<{
    network: { name: string; networkId: string; explorerUrl?: string };
  }>("wallet_state");
  currentNetworkName = state.network.name;
  currentExplorerUrl = state.network.explorerUrl ?? "";
  setShell("app", "settings");
  const testnet = /testnet/i.test(state.network.networkId) || /testnet/i.test(state.network.name);
  render(`
    <div class="page">
      ${pageNav("Settings")}
      <div class="net-block">
        <span class="meta-label">Network</span>
        <div class="net-toggle">
          <button type="button" class="${testnet ? "active" : ""}" id="net-testnet">Testnet</button>
          <button type="button" class="${testnet ? "" : "active"}" id="net-mainnet">Mainnet</button>
        </div>
        <p class="notice">${escapeHtml(state.network.name)}. Same keys on both; balances and collectibles are per network.</p>
        <p class="error" id="net-error"></p>
      </div>
      <div class="settings-list">
        <button type="button" class="row-btn" id="lock"><span>Lock wallet</span></button>
        <button type="button" class="row-btn" id="reveal"><span>Recovery phrase</span></button>
        <button type="button" class="row-btn" id="grids"><span>GRIDS URL</span></button>
        <button type="button" class="row-btn" id="apps"><span>Connected apps</span></button>
        <button type="button" class="row-btn" id="accounts-btn"><span>Accounts</span></button>
      </div>
    </div>
  `);
  document.getElementById("back")!.onclick = home;
  const switchTo = async (id: string) => {
    const testBtn = document.getElementById("net-testnet") as HTMLButtonElement;
    const mainBtn = document.getElementById("net-mainnet") as HTMLButtonElement;
    testBtn.disabled = true;
    mainBtn.disabled = true;
    try {
      const next = await api.call<{ reachable?: boolean; rpcError?: string }>("wallet_switch_network", [id]);
      invalidateNftCache();
      await settings();
      if (next.reachable === false && next.rpcError) {
        const box = document.getElementById("net-error");
        if (box) box.textContent = next.rpcError;
      }
    } catch (error) {
      const box = document.getElementById("net-error");
      if (box) box.textContent = (error as Error).message;
      testBtn.disabled = false;
      mainBtn.disabled = false;
    }
  };
  document.getElementById("net-testnet")!.onclick = () => switchTo("groot.testnet");
  document.getElementById("net-mainnet")!.onclick = () => switchTo("groot.mainnet");
  document.getElementById("lock")!.onclick = async () => {
    await api.call("wallet_lock");
    unlock();
  };
  document.getElementById("reveal")!.onclick = reveal;
  document.getElementById("grids")!.onclick = () => grids();
  document.getElementById("apps")!.onclick = connectedApps;
  document.getElementById("accounts-btn")!.onclick = accounts;
}

function reveal() {
  setShell("app", "settings");
  render(`
    <div class="page">
      ${pageNav("Recovery phrase")}
      <p class="notice">Enter the vault password again. The phrase is not copied automatically.</p>
      <form id="form">
        <input id="password" type="password" placeholder="Vault password" />
        <button id="go" type="submit">Reveal</button>
        <div class="error" id="error"></div>
      </form>
    </div>
  `);
  document.getElementById("back")!.onclick = settings;
  bindSubmit(async () => {
    const password = (document.getElementById("password") as HTMLInputElement).value;
    const result = await api.call<{ mnemonic: string }>("wallet_reveal_mnemonic", [true, password]);
    render(
      `<div class="page">${pageNav("Recovery phrase")}<textarea readonly>${escapeHtml(result.mnemonic)}</textarea></div>`
    );
    document.getElementById("back")!.onclick = settings;
  }, "Checking…");
}

const titles: Record<string, string> = {
  connect: "Connect",
  signMessage: "Sign message",
  signBinary: "Sign binary",
  sendTransaction: "Send GAJU",
  transferNft: "Transfer NFT",
  signTransaction: "Sign transaction",
  switchChain: "Switch network"
};

dock.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
  if (!button?.dataset.tab) return;
  const tab = button.dataset.tab as DockTab;
  if (tab === "home") {
    switchAssetTab("tokens");
  } else if (tab === "nfts") {
    switchAssetTab("collectibles");
  } else if (tab === "activity") {
    void connectedApps();
  } else if (tab === "settings") {
    void settings();
  }
});

api.onApproval((request) => {
  const rows = Object.entries(request.summary)
    .map(([key, value]) => `<div class="item"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  showOverlay(`
    <div class="card">
      <div class="notice">${escapeHtml(request.origin)}</div>
      <h1>${escapeHtml(titles[request.kind] ?? request.kind)}</h1>
      <p class="notice">Decoded by the desktop wallet. Check the origin before you confirm.</p>
      ${rows}
      <div class="row">
        <button id="reject" class="secondary">Reject</button>
        <button id="approve">Confirm</button>
      </div>
    </div>
  `);
  document.getElementById("reject")!.onclick = async () => {
    await api.resolveApproval(request.id, false);
    hideOverlay();
  };
  document.getElementById("approve")!.onclick = async () => {
    await api.resolveApproval(request.id, true);
    hideOverlay();
  };
  document.getElementById("approve")?.focus();
});

api.onGridsUrl((url) => {
  void consumeGrids(url);
});

void boot();
