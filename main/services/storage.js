import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { app, dialog } from "electron";
import { getDataDir, dataFile, backupsDir } from "../utils/paths.js";

let mainWindow = null;
let isDev = false;

const BACKUP_INTERVAL_MS = 60 * 1000;
let backupTimer = null;
let backupDirty = false;

export function setStorageContext(window, dev) {
  mainWindow = window;
  isDev = dev;
}

export function readStore() {
  const f = dataFile();
  if (!fs.existsSync(f)) return { tests: [], settings: {} };
  try {
    const data = JSON.parse(fs.readFileSync(f, "utf8"));
    if (!data.tests) data.tests = [];
    if (!data.settings) data.settings = {};
    return data;
  } catch (err) {
    const bad = f + ".corrupt." + Date.now();
    try {
      fs.copyFileSync(f, bad);
    } catch {
      /* ignore */
    }
    console.error("[storage] Corrupted data, backed up to", bad, err);
    return { tests: [], settings: {} };
  }
}

function isProductionBuild() {
  try {
    return Boolean(app && app.isPackaged);
  } catch {
    return false;
  }
}

function serializeStore(store) {
  return isProductionBuild()
    ? JSON.stringify(store)
    : JSON.stringify(store, null, 2);
}

export async function writeStore(store) {
  const filePath = dataFile();
  const dir = getDataDir();
  await fsp.mkdir(dir, { recursive: true });

  try {
    const tmp = filePath + ".tmp";
    await fsp.writeFile(tmp, serializeStore(store));
    await fsp.rename(tmp, filePath);
    backupDirty = true;
    ensureBackupTimer();
  } catch (error) {
    console.error("Erro ao salvar dados:", error);
    if (mainWindow && !isDev) {
      dialog.showErrorBox(
        "Erro ao Salvar",
        `Não foi possível salvar os dados: ${error.message}`
      );
    }
    throw error;
  }
}

function ensureBackupTimer() {
  if (backupTimer) return;
  backupTimer = setInterval(() => {
    if (!backupDirty) return;
    backupDirty = false;
    saveBackup(dataFile()).catch((err) => {
      console.error("[storage] Backup failed (non-fatal):", err.message);
    });
  }, BACKUP_INTERVAL_MS);
  if (typeof backupTimer.unref === "function") backupTimer.unref();
}

async function saveBackup(sourceFile) {
  try {
    const bDir = backupsDir();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await fsp.copyFile(sourceFile, path.join(bDir, `data.${ts}.json`));
    const entries = await fsp.readdir(bDir);
    const files = entries
      .filter((f) => f.startsWith("data.") && f.endsWith(".json"))
      .sort()
      .reverse();
    await Promise.all(
      files.slice(10).map((f) => fsp.unlink(path.join(bDir, f)).catch(() => {}))
    );
  } catch (err) {
    console.error("[storage] Backup failed (non-fatal):", err.message);
  }
}
