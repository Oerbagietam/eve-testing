import { ipcMain } from "electron";
import { readStore, writeStore, setStorageContext } from "../services/storage.js";
import { combineBranches, normalizeValue } from "../utils/format.js";

export function setActiveWindow(window, dev) {
  setStorageContext(window, dev);
}

export function registerStorageHandlers() {
  ipcMain.handle("store:get", () => readStore());

  ipcMain.handle("store:set", async (_evt, newStore) => {
    try {
      if (newStore && Array.isArray(newStore.tests)) {
        newStore.tests = newStore.tests.map((test) => {
          const branchFront =
            test.branchFront === undefined
              ? normalizeValue(test.branch)
              : normalizeValue(test.branchFront);
          const branchBack =
            test.branchBack === undefined ? "" : normalizeValue(test.branchBack);
          const sanitized = { ...test };
          sanitized.branchFront = branchFront || "";
          sanitized.branchBack = branchBack || "";
          sanitized.branch = combineBranches(
            sanitized.branchFront,
            sanitized.branchBack
          );
          return sanitized;
        });
      }
      await writeStore(newStore);
      return { ok: true };
    } catch (error) {
      console.error("Erro ao salvar store via IPC:", error);
      return { ok: false, error: error.message };
    }
  });
}
