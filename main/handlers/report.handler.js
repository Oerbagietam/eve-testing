import { ipcMain, BrowserWindow, shell, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../utils/paths.js";
import { exportQADocument, exportQADocumentDocx } from "../../qa-doc-generator.js";
import { buildReportHtml, buildSimpleReportHtml, buildUserReportHtml } from "../services/reports.js";

let activeWindow = null;

/**
 * Define a janela ativa para relatórios (fallback quando event.sender não resolve).
 * @param {import('electron').BrowserWindow|null} window
 */
export function setActiveWindow(window) {
  activeWindow = window;
}

/** @deprecated Use setActiveWindow */
export function initReportHandlers(window) {
  setActiveWindow(window);
}

function getDialogParent(event) {
  if (event?.sender) {
    const fromSender = BrowserWindow.fromWebContents(event.sender);
    if (fromSender) return fromSender;
  }
  return activeWindow;
}

/**
 * Registra os handlers IPC de relatórios (uma vez por processo).
 */
export function registerReportHandlers() {
  ipcMain.handle("report:export", async (_evt, test) => {
    const reportsDir = path.join(getDataDir(), "reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filename = path.join(
      reportsDir,
      `relatorio-${test.title.replaceAll(/[^a-z0-9-_]+/gi, "_")}-${Date.now()}.html`
    );

    const html = buildReportHtml(test, true);
    fs.writeFileSync(filename, html, "utf8");
    await shell.openPath(filename);
    return filename;
  });

  ipcMain.handle("report:exportPdf", async (_evt, test) => {
    const reportsDir = path.join(getDataDir(), "reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filename = path.join(
      reportsDir,
      `relatorio-${test.title.replaceAll(/[^a-z0-9-_]+/gi, "_")}-${Date.now()}.pdf`
    );

    const html = buildReportHtml(test, true);

    // Criar arquivo HTML temporário para garantir carregamento correto
    const tempHtmlPath = path.join(reportsDir, `temp-${Date.now()}.html`);
    fs.writeFileSync(tempHtmlPath, html, "utf8");
    const fileUrl = `file://${tempHtmlPath}`;

    // Janela invisível para renderizar HTML e gerar PDF
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        v8CacheOptions: "bypassHeatCheck",
      },
    });

    try {
      // Aguardar o carregamento completo da página e das imagens
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout ao carregar página para PDF"));
        }, 30000);

        win.webContents.once("did-finish-load", async () => {
          try {
            // Aguardar que todas as imagens sejam carregadas
            await win.webContents.executeJavaScript(`
              new Promise((resolve) => {
                const images = document.querySelectorAll('img');
                if (images.length === 0) {
                  resolve();
                  return;
                }
                let loaded = 0;
                const checkComplete = () => {
                  loaded++;
                  if (loaded === images.length) {
                    setTimeout(resolve, 500);
                  }
                };
                images.forEach(img => {
                  if (img.complete) {
                    checkComplete();
                  } else {
                    img.onload = checkComplete;
                    img.onerror = checkComplete;
                  }
                });
              });
            `);
            clearTimeout(timeout);
            resolve();
          } catch (err) {
            clearTimeout(timeout);
            reject(err);
          }
        });

        win.webContents.once(
          "did-fail-load",
          (event, errorCode, errorDescription) => {
            clearTimeout(timeout);
            reject(
              new Error(`Falha ao carregar: ${errorDescription} (${errorCode})`)
            );
          }
        );

        win.loadURL(fileUrl);
      });

      // Gerar PDF
      const pdfData = await win.webContents.printToPDF({
        marginsType: 1,
        printBackground: true,
        landscape: false,
        pageSize: "A4",
        displayHeaderFooter: false,
      });

      // Salvar PDF
      fs.writeFileSync(filename, pdfData);

      // Limpar arquivo temporário
      try {
        fs.unlinkSync(tempHtmlPath);
      } catch (e) {
        console.error("Erro ao deletar arquivo temporario:", e);
      }

      win.destroy();
      await shell.openPath(filename);
      return filename;
    } catch (error) {
      // Limpar em caso de erro
      try {
        if (fs.existsSync(tempHtmlPath)) {
          fs.unlinkSync(tempHtmlPath);
        }
      } catch (e) {
        console.error("Erro ao deletar arquivo temporario:", e);
      }
      win.destroy();
      console.error("Erro ao gerar PDF:", error);
      throw error;
    }
  });

  ipcMain.handle("report:exportMarkdown", async (event, test) => {
    const filePath = await exportQADocument(test, dialog, getDialogParent(event), getDataDir);
    if (filePath) {
      await shell.openPath(filePath);
    }
    return filePath;
  });

  ipcMain.handle("report:exportDocx", async (event, test) => {
    const filePath = await exportQADocumentDocx(test, dialog, getDialogParent(event));
    if (filePath) {
      await shell.openPath(filePath);
    }
    return filePath;
  });

  ipcMain.handle("report:exportSimple", async (_evt, test) => {
    const reportsDir = path.join(getDataDir(), "reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filename = path.join(
      reportsDir,
      `relatorio-simples-${test.title.replaceAll(
        /[^a-z0-9-_]+/gi,
        "_"
      )}-${Date.now()}.html`
    );

    const html = buildSimpleReportHtml(test);
    fs.writeFileSync(filename, html, "utf8");
    await shell.openPath(filename);
    return filename;
  });

  ipcMain.handle("report:exportUser", async (_evt, test) => {
    const reportsDir = path.join(getDataDir(), "reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const filename = path.join(
      reportsDir,
      `relatorio-usuario-${test.title.replaceAll(
        /[^a-z0-9-_]+/gi,
        "_"
      )}-${Date.now()}.html`
    );

    const html = buildUserReportHtml(test, false);
    fs.writeFileSync(filename, html, "utf8");
    await shell.openPath(filename);
    return filename;
  });
}

