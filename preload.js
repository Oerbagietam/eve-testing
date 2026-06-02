import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getStore: () => ipcRenderer.invoke("store:get"),
  setStore: (store) => ipcRenderer.invoke("store:set", store),
  openImages: () => ipcRenderer.invoke("dialog:openImages"),
  importCypressJson: () => ipcRenderer.invoke("import:pickCypressJson"),
  getClipboardImage: () => ipcRenderer.invoke("clipboard:getImage"),
  exportReport: (test) => ipcRenderer.invoke("report:export", test),
  exportReportPdf: (test) => ipcRenderer.invoke("report:exportPdf", test),
  exportReportMarkdown: (test) => ipcRenderer.invoke("report:exportMarkdown", test),
  exportReportSimple: (test) => ipcRenderer.invoke("report:exportSimple", test),
  exportReportDocx: (test) => ipcRenderer.invoke("report:exportDocx", test),
  exportReportUser: (test) => ipcRenderer.invoke("report:exportUser", test),
  isDev: process.env.NODE_ENV !== "production",
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizeChanged: (callback) => {
      const handler = (_event, isMaximized) => callback(isMaximized);
      ipcRenderer.on("window:maximize-changed", handler);
      return () => ipcRenderer.removeListener("window:maximize-changed", handler);
    },
  },
});
