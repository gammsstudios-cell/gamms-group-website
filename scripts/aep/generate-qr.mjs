import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateQrToken, hashQrToken } from "../../functions/aep/_lib/crypto.js";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "../..");
const qrcode = require("qrcode-generator");

function readOption(name, fallback) {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return arg.slice(name.length + 3);
}

function readIntegerOption(name, fallback) {
  const value = Number(readOption(name, fallback));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

// QR SVG rendering adapted from Quoda's MIT-licensed renderSvg approach:
// deterministic standalone SVG, white quiet zone, escaped attributes.
// Attribution: Quoda, Copyright (c) 2026 Can Erdogan, MIT License.
function renderQrSvg(value) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  const margin = 4;
  const total = count + margin * 2;
  const parts = [
    `<rect x="0" y="0" width="${total}" height="${total}" fill="#FFFFFF"/>`
  ];

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      parts.push(`<rect x="${col + margin}" y="${row + margin}" width="1" height="1" fill="#1D1D1F"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">${parts.join("")}</svg>`;
}

const count = readIntegerOption("count", 3);
const start = readIntegerOption("start", 1);
const tokenLength = readIntegerOption("length", 12);
const baseUrl = readOption("base-url", "https://gammsgroup.pages.dev").replace(/\/+$/, "");
const outDir = resolve(projectRoot, readOption("out", "output/aep-qr"));

await mkdir(outDir, { recursive: true });

const manifest = [
  ["public_number", "token", "token_hash", "url", "svg_file"].join(",")
];

for (let i = 0; i < count; i += 1) {
  const publicNumber = start + i;
  const token = generateQrToken(tokenLength);
  const tokenHash = await hashQrToken(token);
  const url = `${baseUrl}/aep/promo/r/${token}`;
  const fileName = `${String(publicNumber).padStart(3, "0")}.svg`;
  const svg = renderQrSvg(url);

  await writeFile(resolve(outDir, fileName), svg, "utf8");
  manifest.push([publicNumber, token, tokenHash, url, fileName].map(csvEscape).join(","));
}

await writeFile(resolve(outDir, "manifest.csv"), `${manifest.join("\n")}\n`, "utf8");

console.log(`Generated ${count} QR artifact(s) in ${outDir}`);
console.log("Keep manifest.csv local; it contains secret QR tokens.");
