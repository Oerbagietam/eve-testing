import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");

const svg = `
<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5a8de0"/>
      <stop offset="100%" stop-color="#0a5cd6"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="24" fill="#ece9d8"/>
  <rect x="16" y="16" width="224" height="48" rx="8" fill="url(#g)"/>
  <rect x="24" y="80" width="208" height="152" rx="6" fill="#fff" stroke="#aca899"/>
  <text x="128" y="52" text-anchor="middle" font-family="Tahoma,sans-serif" font-size="28" font-weight="bold" fill="#fff">EVE</text>
  <text x="128" y="165" text-anchor="middle" font-family="Tahoma,sans-serif" font-size="22" fill="#0831d9">QA</text>
</svg>`;

await fs.promises.mkdir(assets, { recursive: true });

const png1024 = await sharp(Buffer.from(svg)).resize(1024, 1024).png().toBuffer();
const png256 = await sharp(png1024).resize(256, 256).png().toBuffer();
const png32 = await sharp(png1024).resize(32, 32).png().toBuffer();

await fs.promises.writeFile(path.join(assets, "icon-1024.png"), png1024);
await fs.promises.writeFile(path.join(assets, "icon.png"), png256);
await fs.promises.writeFile(path.join(assets, "icon.ico"), await toIco([png32]));

console.log("Icons written to assets/");
