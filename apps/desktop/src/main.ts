import { app, BrowserWindow, ipcMain, screen } from "electron";
import { join, resolve } from "node:path";
import { ProviderErrorCode } from "@gajumaru/provider";
import { WalletHost } from "./host.js";
import { JsonFileStore, MemoryStore } from "./store.js";
import type { ApprovalRequest } from "./types.js";

function errorPayload(error: unknown): { code: number; message: string } {
  const err = error as { code?: number; message?: string };
  return {
    code: err.code ?? ProviderErrorCode.SIGNING_ERROR,
    message: err.message ?? "Wallet error"
  };
}

function gridsUrlFromArgv(argv: string[]): string | undefined {
  for (const arg of argv) {
    const value = arg.replace(/^"+|"+$/g, "");
    if (value.startsWith("grids:") || value.startsWith("grid:")) return value;
  }
  return undefined;
}

let mainWindow: BrowserWindow | undefined;

function deliverGridsUrl(url: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("grids:open", url);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = gridsUrlFromArgv(argv);
    if (url) deliverGridsUrl(url);
    else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  if (process.defaultApp) {
    const appPath = resolve(process.argv[1] ?? ".");
    app.setAsDefaultProtocolClient("grids", process.execPath, [appPath]);
    app.setAsDefaultProtocolClient("grid", process.execPath, [appPath]);
  } else {
    app.setAsDefaultProtocolClient("grids");
    app.setAsDefaultProtocolClient("grid");
  }

  app.whenReady().then(() => {
    if (process.platform === "win32") app.setAppUserModelId("io.kiji.wallet");
    void createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (url.startsWith("grids:") || url.startsWith("grid:")) deliverGridsUrl(url);
  });
}

async function createWindow(): Promise<void> {
  const local = new JsonFileStore(join(app.getPath("userData"), "wallet.json"));
  await local.load();
  const session = new MemoryStore();

  const icon = join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png");
  const width = 400;
  const height = 720;
  const margin = 16;
  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.round(workArea.x + workArea.width - width - margin);
  const y = Math.round(workArea.y + Math.max(0, workArea.height - height - margin));
  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 380,
    maxWidth: 440,
    minHeight: 640,
    backgroundColor: "#0e1a14",
    autoHideMenuBar: true,
    maximizable: false,
    title: "Kiji Wallet",
    icon,
    webPreferences: {
      preload: join(__dirname, "preload-wallet.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const host = new WalletHost(local, session, (request: ApprovalRequest) => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send("approval:show", request);
  });

  ipcMain.handle("wallet:call", async (_event, payload: { method?: string; params?: unknown[] }) => {
    try {
      const result = await host.handle(
        "gaju://wallet",
        String(payload?.method ?? ""),
        Array.isArray(payload?.params) ? payload.params : [],
        true
      );
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: errorPayload(error) };
    }
  });

  ipcMain.handle("approval:resolve", async (_event, payload: { id?: string; accepted?: boolean }) => {
    try {
      host.resolveApproval(String(payload?.id ?? ""), Boolean(payload?.accepted));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorPayload(error) };
    }
  });

  win.on("closed", () => {
    ipcMain.removeHandler("wallet:call");
    ipcMain.removeHandler("approval:resolve");
    if (mainWindow === win) mainWindow = undefined;
  });

  await win.loadFile(join(__dirname, "index.html"));
  mainWindow = win;
  const queued = gridsUrlFromArgv(process.argv);
  if (queued) deliverGridsUrl(queued);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
