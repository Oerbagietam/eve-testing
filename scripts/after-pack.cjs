const path = require("node:path");

/** Embute o ícone no .exe (necessário pois o `signAndEditExecutable` está desabilitado!). */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const { rcedit } = await import("rcedit");
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(context.packager.projectDir, "assets", "icon.ico");

  await rcedit(exePath, { icon: iconPath });
};
