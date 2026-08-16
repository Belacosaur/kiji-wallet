import type { BridgeEvent, BridgeRequest, BridgeResponse } from "../shared/protocol.js";
import {
  ProviderError,
  ProviderErrorCode,
  type GajumaruProvider,
  type ProviderEvent,
  type ProviderRequest
} from "@gajumaru/provider";

const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

function emit(event: string, ...args: unknown[]) {
  for (const listener of listeners.get(event) ?? []) listener(...args);
}

function requestFromPage<T>(method: string, params?: unknown[]): Promise<T> {
  if (!method.startsWith("gaju_")) {
    return Promise.reject(
      new ProviderError(ProviderErrorCode.UNSUPPORTED_METHOD, "Websites cannot request wallet secrets")
    );
  }
  const id = crypto.randomUUID();
  const payload: BridgeRequest = { id, type: "GAJU_REQUEST", method, params };
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as BridgeResponse | undefined;
      if (!data || data.type !== "GAJU_RESPONSE" || data.id !== id) return;
      window.removeEventListener("message", onMessage);
      if (data.error) {
        reject(new ProviderError(data.error.code as ProviderErrorCode, data.error.message));
        return;
      }
      resolve(data.result as T);
    };
    window.addEventListener("message", onMessage);
    window.postMessage(payload, window.location.origin);
  });
}

const provider: GajumaruProvider = {
  isGajumaru: true,
  request: <T>(req: ProviderRequest) => requestFromPage<T>(req.method, req.params),
  on(event: ProviderEvent | string, listener: (...args: unknown[]) => void) {
    const set = listeners.get(event) ?? new Set();
    set.add(listener);
    listeners.set(event, set);
  },
  removeListener(event: ProviderEvent | string, listener: (...args: unknown[]) => void) {
    listeners.get(event)?.delete(listener);
  }
};

window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as BridgeEvent | undefined;
  if (event.source !== window || data?.type !== "GAJU_EVENT") return;
  emit(data.event, data.data);
});

Object.defineProperty(window, "gajumaru", {
  value: provider,
  writable: false,
  configurable: false
});

window.dispatchEvent(new Event("gajumaru#initialized"));
