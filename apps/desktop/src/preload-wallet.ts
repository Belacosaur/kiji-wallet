import { contextBridge, ipcRenderer } from "electron";

type RpcResult = { ok: true; result: unknown } | { ok: false; error: { message: string } };

contextBridge.exposeInMainWorld("gajuDesktop", {
  call: async (method: string, params: unknown[] = []) => {
    const response = (await ipcRenderer.invoke("wallet:call", { method, params })) as RpcResult;
    if (!response?.ok) throw new Error(response?.error?.message ?? "Wallet error");
    return response.result;
  },
  onApproval: (listener: (request: unknown) => void) => {
    const handler = (_event: unknown, request: unknown) => listener(request);
    ipcRenderer.on("approval:show", handler);
    return () => ipcRenderer.removeListener("approval:show", handler);
  },
  resolveApproval: (id: string, accepted: boolean) =>
    ipcRenderer.invoke("approval:resolve", { id, accepted }),
  onGridsUrl: (listener: (url: string) => void) => {
    const handler = (_event: unknown, url: string) => listener(url);
    ipcRenderer.on("grids:open", handler);
    return () => ipcRenderer.removeListener("grids:open", handler);
  }
});
