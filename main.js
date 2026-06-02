import { app, BrowserWindow, Menu, globalShortcut, ipcMain } from "electron";
import path from "node:path";
import dotenv from "dotenv";

import { getAppPath } from "./main/utils/paths.js";
import {
  setActiveWindow as setStorageActiveWindow,
  registerStorageHandlers,
} from "./main/handlers/storage.handler.js";
import {
  setActiveWindow as setDialogActiveWindow,
  registerDialogHandlers,
} from "./main/handlers/dialog.handler.js";
import {
  setActiveWindow as setReportActiveWindow,
  registerReportHandlers,
} from "./main/handlers/report.handler.js";

dotenv.config({ quiet: true });

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";
let mainWindow = null;

function registerWindowControlHandlers() {
  ipcMain.handle("window:minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
  ipcMain.handle("window:toggle-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  ipcMain.handle("window:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });
  ipcMain.handle("window:is-maximized", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });
}

function registerAllIpcHandlers() {
  registerStorageHandlers();
  registerDialogHandlers();
  registerReportHandlers();
  registerWindowControlHandlers();
}

function registerDevShortcuts() {
  if (!isDev) return;
  const toggleDevTools = () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (win && !win.isDestroyed()) win.webContents.toggleDevTools();
  };
  globalShortcut.register("F12", toggleDevTools);
  globalShortcut.register("CommandOrControl+Shift+I", toggleDevTools);
}

function createWindow() {
  const appPath = getAppPath();
  const preloadPath = path.join(appPath, "preload.js");
  const htmlPath = path.join(appPath, "src", "index.html");

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#d8c3ff",
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximize-changed", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximize-changed", false);
  });

  Menu.setApplicationMenu(null);

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const tag = ["LOG", "WARN", "ERROR"][Math.min(level, 2)] || "LOG";
    if (tag === "ERROR" || tag === "WARN") {
      console.log(`[renderer:${tag}] ${sourceId}:${line} ${message}`);
    }
  });

  mainWindow.loadFile(htmlPath);

  setStorageActiveWindow(mainWindow, isDev);
  setDialogActiveWindow(mainWindow);
  setReportActiveWindow(mainWindow);

  mainWindow.on("closed", () => {
    mainWindow = null;
    setStorageActiveWindow(null, isDev);
    setDialogActiveWindow(null);
    setReportActiveWindow(null);
  });
}

app.whenReady().then(() => {
  registerAllIpcHandlers();
  createWindow();
  registerDevShortcuts();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
