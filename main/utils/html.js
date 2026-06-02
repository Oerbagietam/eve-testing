import fs from "node:fs";
import path from "node:path";

export function escapeHtml(s) {
  return String(s).replaceAll(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[ch])
  );
}

export function fileToDataUri(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let mime;
    if (ext === ".png") mime = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
    else if (ext === ".gif") mime = "image/gif";
    else if (ext === ".webp") mime = "image/webp";
    else mime = "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.error("Erro ao converter imagem para base64:", e);
    return "";
  }
}
