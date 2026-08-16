import { DAPP_METHODS, type BridgeRequest, type BridgeResponse } from "../shared/protocol.js";

const script = document.createElement("script");
script.src = chrome.runtime.getURL("inpage.js");
(document.head ?? document.documentElement).prepend(script);
script.addEventListener("load", () => script.remove());

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as BridgeRequest | undefined;
  if (!data || data.type !== "GAJU_REQUEST") return;
  if (!DAPP_METHODS.has(data.method)) {
    const payload: BridgeResponse = {
      id: data.id,
      type: "GAJU_RESPONSE",
      error: { code: 4200, message: "This method is not available to websites" }
    };
    window.postMessage(payload, window.location.origin);
    return;
  }
  chrome.runtime.sendMessage({ method: data.method, params: data.params }, (response) => {
    const payload: BridgeResponse = {
      id: data.id,
      type: "GAJU_RESPONSE",
      result: response?.result,
      error: response?.ok === false ? response.error : undefined
    };
    window.postMessage(payload, window.location.origin);
  });
});
