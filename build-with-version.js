#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));
const version = packageJson.version;

const args = process.argv.slice(2);
const platform = args[0] || "all";
const customVersion = args[1];
const buildVersion = customVersion || version;
const outputDir = `dist/v${buildVersion}`;

console.log(`\nBuilding versao ${buildVersion}...`);
console.log(`Output: ${outputDir}\n`);

let command = `cross-env NODE_ENV=production electron-builder --config.directories.output=${outputDir}`;

if (platform === "win") command += " --win";
else if (platform === "mac") command += " --mac";
else if (platform === "linux") command += " --linux";

try {
  execSync(command, { stdio: "inherit", cwd: __dirname });
  console.log(`\nBuild concluido! Versao ${buildVersion} em ${outputDir}\n`);
} catch (error) {
  console.error(`\nErro no build: ${error.message}\n`);
  process.exit(1);
}
