import { ipcMain, dialog, clipboard, BrowserWindow } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getDataDir } from "../utils/paths.js";

let activeWindow = null;

function uniqueSuffix() {
  return `${Date.now()}-${randomBytes(3).toString("hex")}`;
}

export function setActiveWindow(window) {
  activeWindow = window;
}

function getDialogParent(event) {
  if (event?.sender) {
    const fromSender = BrowserWindow.fromWebContents(event.sender);
    if (fromSender) return fromSender;
  }
  return activeWindow;
}

export function registerDialogHandlers() {
  ipcMain.handle("dialog:openImages", async (event) => {
    const res = await dialog.showOpenDialog(getDialogParent(event), {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
      ],
    });
    if (res.canceled) return [];

    const targetDir = path.join(getDataDir(), "attachments");
    await fsp.mkdir(targetDir, { recursive: true });

    const copied = await Promise.all(
      res.filePaths.map(async (file) => {
        const base = path.basename(file);
        const dest = path.join(targetDir, `${uniqueSuffix()}-${base}`);
        await fsp.copyFile(file, dest);
        return { localPath: dest };
      })
    );

    return copied;
  });

  ipcMain.handle("import:pickCypressJson", async (event) => {
    const res = await dialog.showOpenDialog(getDialogParent(event), {
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (res.canceled || !res.filePaths?.length) {
      return { canceled: true };
    }

    const jsonPath = res.filePaths[0];
    const jsonDir = path.dirname(jsonPath);
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch (error) {
      return {
        canceled: false,
        error: `Não foi possível ler o JSON: ${error.message}`,
      };
    }

    const screenshotMap = {};
    const warnings = [];
    const tests = Array.isArray(payload?.tests) ? payload.tests : [];

    const resolveScreenshot = (screenshotPath) => {
      if (!screenshotPath || typeof screenshotPath !== "string") return null;
      const normalized = screenshotPath.replace(/\\/g, "/").trim();
      const fileName = path.basename(normalized);
      const candidates = [];
      if (path.isAbsolute(normalized)) candidates.push(normalized);
      if (fileName) candidates.push(path.join(jsonDir, fileName));
      candidates.push(path.join(jsonDir, normalized));
      let dir = jsonDir;
      for (let depth = 0; depth < 8; depth += 1) {
        candidates.push(path.join(dir, normalized));
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      const seen = new Set();
      return candidates.find((p) => {
        const key = path.resolve(p);
        if (seen.has(key)) return false;
        seen.add(key);
        return fs.existsSync(p);
      }) || null;
    };

    const copyToAttachments = (sourcePath) => {
      const targetDir = path.join(getDataDir(), "attachments");
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const base = path.basename(sourcePath);
      const dest = path.join(targetDir, `${uniqueSuffix()}-${base}`);
      fs.copyFileSync(sourcePath, dest);
      return dest;
    };

    for (const test of tests) {
      const points = Array.isArray(test?.test_points) ? test.test_points : [];
      for (const tp of points) {
        const screenshot = String(tp?.screenshot || "").trim();
        if (!screenshot || screenshotMap[screenshot]) continue;
        const resolved = resolveScreenshot(screenshot);
        if (!resolved) {
          warnings.push(`Screenshot não encontrado: ${screenshot}`);
          screenshotMap[screenshot] = null;
          continue;
        }
        try {
          screenshotMap[screenshot] = copyToAttachments(resolved);
        } catch (error) {
          warnings.push(`Falha ao copiar ${screenshot}: ${error.message}`);
          screenshotMap[screenshot] = null;
        }
      }
    }

    return {
      canceled: false,
      jsonPath,
      payload,
      screenshotMap,
      warnings,
    };
  });

  ipcMain.handle("clipboard:getImage", async () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;

    const targetDir = path.join(getDataDir(), "attachments");
    await fsp.mkdir(targetDir, { recursive: true });

    const dest = path.join(targetDir, `paste-${uniqueSuffix()}.png`);
    await fsp.writeFile(dest, image.toPNG());
    return { localPath: dest };
  });
}
