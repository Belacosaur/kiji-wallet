type RpcResult = { ok: true; result: unknown } | { ok: false; error: { message: string } };

async function call<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = (await chrome.runtime.sendMessage({ method, params })) as RpcResult;
  if (!response?.ok) throw new Error(response?.error?.message ?? "Wallet error");
  return response.result as T;
}

const app = document.getElementById("app")!;

function render(html: string) {
  app.innerHTML = html;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char] ?? char;
  });
}

async function boot() {
  const status = await call<{ hasWallet: boolean; unlocked: boolean }>("wallet_status");
  if (!status.hasWallet) return welcome();
  if (!status.unlocked) return unlock();
  return home();
}

function welcome() {
  render(`
    <div class="card stack">
      <h1>A local tree of keys.</h1>
      <p class="notice">Non-custodial. Seeds stay in this extension. Websites only ever see addresses and signatures.</p>
      <button id="create">Create wallet</button>
      <button id="import" class="secondary">Import recovery phrase</button>
    </div>
  `);
  document.getElementById("create")!.onclick = createWallet;
  document.getElementById("import")!.onclick = importWallet;
}

function createWallet() {
  render(`
    <div class="card">
      <h2>Create wallet</h2>
      <p class="notice">Choose a password used only to encrypt this device vault.</p>
      <input id="password" type="password" placeholder="Password (8+ characters)" />
      <button id="go">Generate</button>
      <div class="error" id="error"></div>
    </div>
  `);
  document.getElementById("go")!.onclick = async () => {
    try {
      const password = (document.getElementById("password") as HTMLInputElement).value;
      const created = await call<{ address: string; mnemonic: string }>("wallet_create", [password]);
      render(`
        <div class="card stack">
          <h2>Write these words down</h2>
          <p class="notice">This is the Kiji recovery phrase, not BIP-39. Confirm it offline. It will not be copied to the clipboard automatically.</p>
          <textarea readonly>${escapeHtml(created.mnemonic)}</textarea>
          <p class="address">${escapeHtml(created.address)}</p>
          <button id="done">I stored the phrase</button>
        </div>
      `);
      document.getElementById("done")!.onclick = home;
    } catch (error) {
      document.getElementById("error")!.textContent = (error as Error).message;
    }
  };
}

function importWallet() {
  render(`
    <div class="card">
      <h2>Import wallet</h2>
      <textarea id="mnemonic" placeholder="Kiji recovery phrase"></textarea>
      <input id="password" type="password" placeholder="New vault password" />
      <button id="go">Recover</button>
      <div class="error" id="error"></div>
    </div>
  `);
  document.getElementById("go")!.onclick = async () => {
    try {
      const mnemonic = (document.getElementById("mnemonic") as HTMLTextAreaElement).value;
      const password = (document.getElementById("password") as HTMLInputElement).value;
      await call("wallet_import", [mnemonic, password]);
      await home();
    } catch (error) {
      document.getElementById("error")!.textContent = (error as Error).message;
    }
  };
}

function unlock() {
  render(`
    <div class="card">
      <h2>Unlock</h2>
      <input id="password" type="password" placeholder="Vault password" />
      <button id="go">Unlock</button>
      <div class="error" id="error"></div>
    </div>
  `);
  document.getElementById("go")!.onclick = async () => {
    try {
      const password = (document.getElementById("password") as HTMLInputElement).value;
      await call("wallet_unlock", [password]);
      await home();
    } catch (error) {
      document.getElementById("error")!.textContent = (error as Error).message;
    }
  };
}

async function home() {
  const state = await call<{
    account: { name: string; address: string };
    balanceLabel: string;
    network: { name: string; networkId: string };
    rpcError?: string;
  }>("wallet_state");
  const testnet = /testnet/i.test(state.network.networkId);
  render(`
    <div class="card">
      <div class="eyebrow">${escapeHtml(state.network.name)}</div>
      <h2>${escapeHtml(state.account.name)}</h2>
      <div class="balance">${escapeHtml(state.balanceLabel)} GAJU</div>
      ${state.rpcError ? `<p class="error">Node: ${escapeHtml(state.rpcError)}</p>` : ""}
      <div class="address">${escapeHtml(state.account.address)}</div>
      <div class="row">
        <button type="button" class="${testnet ? "" : "secondary"}" id="net-testnet">Testnet</button>
        <button type="button" class="${testnet ? "secondary" : ""}" id="net-mainnet">Mainnet</button>
      </div>
      <div class="row">
        <button id="receive">Receive</button>
        <button id="send" class="secondary">Send</button>
        <button id="nfts" class="secondary">NFTs</button>
        <button id="lock" class="secondary">Lock</button>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="item"><span>Connected apps</span><button id="apps" class="secondary">Manage</button></div>
      <div class="item"><span>Recovery phrase</span><button id="reveal" class="secondary">Reveal</button></div>
    </div>
  `);
  document.getElementById("receive")!.onclick = () => receive(state.account.address);
  document.getElementById("send")!.onclick = send;
  document.getElementById("nfts")!.onclick = nfts;
  document.getElementById("lock")!.onclick = async () => {
    await call("wallet_lock");
    unlock();
  };
  document.getElementById("apps")!.onclick = connectedApps;
  document.getElementById("reveal")!.onclick = reveal;
  const switchNet = async (id: string) => {
    try {
      await call("wallet_switch_network", [id]);
      await home();
    } catch (error) {
      /* stay */
    }
  };
  document.getElementById("net-testnet")!.onclick = () => switchNet("groot.testnet");
  document.getElementById("net-mainnet")!.onclick = () => switchNet("groot.mainnet");
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

type NftView = {
  contract: string;
  tokenId: string;
  collectionName?: string;
  name?: string;
  image?: string;
  owned?: boolean;
  error?: string;
};

type NftListResult = {
  nfts: NftView[];
  added?: number;
  scanError?: string;
};

async function nfts() {
  render(`<div class="card"><h2>NFTs</h2><p class="notice">Reading AEX-141 collections on Groot…</p></div>`);
  try {
    renderNftGallery(await call<NftListResult>("nft_list"));
  } catch (error) {
    render(`<div class="card"><h2>NFTs</h2><p class="error">${escapeHtml((error as Error).message)}</p><button id="back" class="secondary">Back</button></div>`);
    document.getElementById("back")!.onclick = home;
  }
}

function renderNftGallery(result: NftListResult) {
  const cards =
    result.nfts.length === 0
      ? `<p class="notice">No collectibles yet. AEX-141 tokens on featured collections show up here after a scan.</p>`
      : result.nfts
          .map((nft) => {
            const image = nft.image
              ? `<img alt="" src="${escapeHtml(nft.image)}" />`
              : `<div class="nft-placeholder"></div>`;
            return `<article class="nft-card">
              <div class="nft-art">${image}</div>
              <strong>${escapeHtml(nft.name || `#${nft.tokenId}`)}</strong>
              <small>${escapeHtml(nft.collectionName || shortAddress(nft.contract))} · #${escapeHtml(nft.tokenId)}</small>
              ${nft.error ? `<p class="error">${escapeHtml(nft.error)}</p>` : ""}
              <div class="row">
                ${
                  nft.owned !== false
                    ? `<button type="button" data-transfer-ct="${escapeHtml(nft.contract)}" data-transfer-id="${escapeHtml(nft.tokenId)}">Transfer</button>`
                    : ""
                }
                <button type="button" class="secondary" data-remove-ct="${escapeHtml(nft.contract)}" data-remove-id="${escapeHtml(nft.tokenId)}">Remove</button>
              </div>
            </article>`;
          })
          .join("");
  const scanNote = result.scanError
    ? `<p class="notice">${escapeHtml(result.scanError)}</p>`
    : result.added
      ? `<p class="notice">Indexer added ${result.added} token${result.added === 1 ? "" : "s"}.</p>`
      : "";
  render(`
    <div class="card">
      <h2>NFTs</h2>
      <p class="notice">AEX-141 collectibles on this network appear here after a scan.</p>
      ${scanNote}
      <div class="nft-list">${cards}</div>
      <div class="row">
        <button id="add-nft">Add token</button>
        <button id="scan-nft" class="secondary">Scan indexer</button>
      </div>
      <button id="back" class="secondary">Back</button>
      <div class="error" id="error"></div>
    </div>
  `);
  document.getElementById("back")!.onclick = home;
  document.getElementById("add-nft")!.onclick = addNft;
  document.getElementById("scan-nft")!.onclick = async () => {
    try {
      renderNftGallery(await call<NftListResult>("nft_scan"));
    } catch (error) {
      document.getElementById("error")!.textContent = (error as Error).message;
    }
  };
  for (const img of app.querySelectorAll<HTMLImageElement>(".nft-art img")) {
    img.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "nft-placeholder";
      img.replaceWith(ph);
    };
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-transfer-ct]")) {
    button.onclick = () => transferNft(button.dataset.transferCt ?? "", button.dataset.transferId ?? "");
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-remove-ct]")) {
    button.onclick = async () => {
      try {
        renderNftGallery(await call<NftListResult>("nft_unwatch", [button.dataset.removeCt, button.dataset.removeId]));
      } catch (error) {
        document.getElementById("error")!.textContent = (error as Error).message;
      }
    };
  }
}

function addNft() {
  render(`
    <div class="card">
      <h2>Add NFT</h2>
      <p class="notice">Leave token id blank to find tokens this account owns in the collection.</p>
      <input id="contract" placeholder="ct_…" spellcheck="false" />
      <input id="token-id" placeholder="Token id (optional, e.g. 1)" inputmode="numeric" />
      <button id="go">Watch</button>
      <button id="back" class="secondary">Cancel</button>
      <div class="error" id="error"></div>
    </div>
  `);
  document.getElementById("back")!.onclick = nfts;
  document.getElementById("go")!.onclick = async () => {
    try {
      const contract = (document.getElementById("contract") as HTMLInputElement).value;
      const tokenId = (document.getElementById("token-id") as HTMLInputElement).value;
      renderNftGallery(await call<NftListResult>("nft_watch", [contract, tokenId]));
    } catch (error) {
      document.getElementById("error")!.textContent = (error as Error).message;
    }
  };
}

function transferNft(contract: string, tokenId: string) {
  render(`
    <div class="card">
      <h2>Transfer NFT</h2>
      <p class="notice">Confirm the approval popup before the AEX-141 transfer is signed.</p>
      <p class="address">${escapeHtml(contract)}</p>
      <p class="notice">Token #${escapeHtml(tokenId)}</p>
      <input id="to" placeholder="ak_…" spellcheck="false" />
      <button id="go">Review and transfer</button>
      <button id="back" class="secondary">Cancel</button>
      <div class="error" id="error"></div>
    </div>
  `);
  document.getElementById("back")!.onclick = nfts;
  document.getElementById("go")!.onclick = async () => {
    try {
      const to = (document.getElementById("to") as HTMLInputElement).value;
      const result = await call<{ txHash: string }>("nft_transfer", [contract, tokenId, to]);
      render(`<div class="card"><h2>Submitted</h2><div class="address">${escapeHtml(result.txHash)}</div><button id="back">Done</button></div>`);
      document.getElementById("back")!.onclick = nfts;
    } catch (error) {
      document.getElementById("error")!.textContent = (error as Error).message;
    }
  };
}

function receive(address: string) {
  render(`
    <div class="card stack">
      <h2>Receive GAJU</h2>
      <p class="notice">Share this account id. Never share the recovery phrase.</p>
      <div class="address">${escapeHtml(address)}</div>
      <button id="copy">Copy address</button>
      <button id="back" class="secondary">Back</button>
    </div>
  `);
  document.getElementById("copy")!.onclick = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      /* ignore */
    }
  };
  document.getElementById("back")!.onclick = home;
}

function send() {
  render(`
    <div class="card">
      <h2>Send GAJU</h2>
      <input id="to" placeholder="ak_..." />
      <input id="amount" placeholder="Amount in GAJU" />
      <input id="payload" placeholder="Payload (optional)" />
      <div class="item"><span>Recipient gets</span><strong id="q-amount">0 GAJU</strong></div>
      <div class="item"><span>Gas</span><strong id="q-gas">…</strong></div>
      <div class="item"><span>You pay</span><strong id="q-total">…</strong></div>
      <button id="go">Review</button>
      <button id="back" class="secondary">Back</button>
      <div class="error" id="error"></div>
    </div>
  `);
  document.getElementById("back")!.onclick = home;
  const amountInput = document.getElementById("amount") as HTMLInputElement;
  const refreshQuote = async () => {
    try {
      const quote = await call<{ amountLabel: string; gasLabel: string; totalLabel: string }>(
        "wallet_fee_quote",
        [amountInput.value.trim()]
      );
      document.getElementById("q-amount")!.textContent = `${quote.amountLabel} GAJU`;
      document.getElementById("q-gas")!.textContent = `${quote.gasLabel} GAJU`;
      document.getElementById("q-total")!.textContent = `${quote.totalLabel} GAJU`;
    } catch {
      /* keep last quote */
    }
  };
  amountInput.oninput = () => {
    void refreshQuote();
  };
  void refreshQuote();
  document.getElementById("go")!.onclick = async () => {
    const to = (document.getElementById("to") as HTMLInputElement).value.trim();
    const amount = amountInput.value.trim();
    const payload = (document.getElementById("payload") as HTMLInputElement).value;
    const error = document.getElementById("error")!;
    if (!to || !amount) {
      error.textContent = "Enter a recipient and amount.";
      return;
    }
    let quote: { amountLabel: string; gasLabel: string; totalLabel: string };
    try {
      quote = await call("wallet_fee_quote", [amount]);
    } catch (err) {
      error.textContent = (err as Error).message;
      return;
    }
    render(`
      <div class="card">
        <h2>Confirm send</h2>
        <div class="item"><span>To</span><strong>${escapeHtml(to)}</strong></div>
        <div class="item"><span>Recipient gets</span><strong>${escapeHtml(quote.amountLabel)} GAJU</strong></div>
        <div class="item"><span>Gas</span><strong>${escapeHtml(quote.gasLabel)} GAJU</strong></div>
        <div class="item"><span>You pay</span><strong>${escapeHtml(quote.totalLabel)} GAJU</strong></div>
        <button id="confirm">Send now</button>
        <button id="back" class="secondary">Back</button>
        <div class="error" id="error"></div>
      </div>
    `);
    document.getElementById("back")!.onclick = send;
    document.getElementById("confirm")!.onclick = async () => {
      try {
        const result = await call<{ txHash: string; feeError?: string }>("wallet_send", [to, amount, payload]);
        render(`
          <div class="card">
            <h2>Submitted</h2>
            <div class="address">${escapeHtml(result.txHash)}</div>
            ${result.feeError ? `<p class="error">${escapeHtml(result.feeError)}</p>` : ""}
            <button id="back">Done</button>
          </div>
        `);
        document.getElementById("back")!.onclick = home;
      } catch (err) {
        document.getElementById("error")!.textContent = (err as Error).message;
      }
    };
  };
}

async function connectedApps() {
  const permissions = await call<Array<{ origin: string; lastUsedAt: number }>>("permissions_list");
  render(`
    <div class="card">
      <h2>Connected apps</h2>
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
      <button id="back" class="secondary">Back</button>
    </div>
  `);
  document.getElementById("back")!.onclick = home;
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-origin]")) {
    button.onclick = async () => {
      await call("permissions_revoke", [button.dataset.origin]);
      await connectedApps();
    };
  }
}

function reveal() {
  render(`
    <div class="card">
      <h2>Reveal recovery phrase</h2>
      <p class="notice">Enter the vault password again. The phrase is not copied automatically.</p>
      <input id="password" type="password" placeholder="Vault password" />
      <button id="go">Reveal</button>
      <button id="back" class="secondary">Back</button>
      <div class="error" id="error"></div>
    </div>
  `);
  document.getElementById("back")!.onclick = home;
  document.getElementById("go")!.onclick = async () => {
    try {
      const password = (document.getElementById("password") as HTMLInputElement).value;
      const result = await call<{ mnemonic: string }>("wallet_reveal_mnemonic", [true, password]);
      render(`<div class="card"><textarea readonly>${escapeHtml(result.mnemonic)}</textarea><button id="back">Hide</button></div>`);
      document.getElementById("back")!.onclick = home;
    } catch (error) {
      document.getElementById("error")!.textContent = (error as Error).message;
    }
  };
}

void boot();
