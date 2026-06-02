import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getDataDir() {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "eve");

  if (!fs.existsSync(dir)) {
    const legacySub = path.join(userData, "qa-lite");
    if (fs.existsSync(legacySub)) {
      try {
        fs.renameSync(legacySub, dir);
      } catch {
        fs.mkdirSync(dir, { recursive: true });
        return legacySub;
      }
    } else {
      const legacyApp = path.join(path.dirname(userData), "qa-lite", "qa-lite");
      if (fs.existsSync(legacyApp)) {
        fs.cpSync(legacyApp, dir, { recursive: true });
      }
    }
  }

  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function dataFile() {
  return path.join(getDataDir(), "data.json");
}

export function backupsDir() {
  const dir = path.join(getDataDir(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getAppPath() {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.resolve(__dirname, "..", "..");
}
