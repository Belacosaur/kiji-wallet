type ApprovalRequest = {
  id: string;
  origin: string;
  kind: string;
  summary: Record<string, string>;
};

async function call<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await chrome.runtime.sendMessage({ method, params });
  if (!response?.ok) throw new Error(response?.error?.message ?? "Wallet error");
  return response.result as T;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char] ?? char;
  });
}

const app = document.getElementById("app")!;
const id = new URLSearchParams(location.search).get("id") ?? "";

const titles: Record<string, string> = {
  connect: "Connect",
  signMessage: "Sign message",
  signBinary: "Sign binary",
  sendTransaction: "Send GAJU",
  transferNft: "Transfer NFT",
  signTransaction: "Sign transaction",
  switchChain: "Switch network"
};

async function boot() {
  const request = await call<ApprovalRequest | undefined>("approval_get", [id]);
  if (!request) {
    app.innerHTML = `<div class="card"><h2>Request expired</h2></div>`;
    return;
  }
  const rows = Object.entries(request.summary)
    .map(
      ([key, value]) =>
        `<div class="item"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`
    )
    .join("");
  app.innerHTML = `
    <div class="card">
      <div class="eyebrow">${escapeHtml(request.origin)}</div>
      <h1>${escapeHtml(titles[request.kind] ?? request.kind)}</h1>
      <p class="notice">The wallet decoded this request. The website cannot change the origin shown here.</p>
      ${rows}
      <div class="row">
        <button id="reject" class="secondary">Reject</button>
        <button id="approve">Confirm</button>
      </div>
    </div>
  `;
  document.getElementById("reject")!.onclick = async () => {
    await call("approval_resolve", [id, false]);
    window.close();
  };
  document.getElementById("approve")!.onclick = async () => {
    await call("approval_resolve", [id, true]);
    window.close();
  };
}

void boot();
