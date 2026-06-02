import { ipcMain, dialog, clipboard, BrowserWindow } from "electron";
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
