#!/usr/bin/env node
// eqstrip.mjs — render each display equation of a md file as its own tight PNG strip.
// Usage: node eqstrip.mjs input.md [--outdir DIR] [--prefix eq] [--size 24] [--bg white|transparent]
// md syntax: "$$ ... $$" display math (same rules as texpage.mjs); other lines ignored.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const KATEX_DIST = process.env.KATEX_DIST || "/home/john/tmp/texrender/node_modules/katex/dist";
const KATEX_ROOT = process.env.KATEX_ROOT || path.resolve(KATEX_DIST, "../..");
const require = createRequire(path.join(KATEX_ROOT, "resolve.js"));
const katex = require("katex");
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";

const args = process.argv.slice(2);
const input = args[0];
if (!input) {
  console.error("usage: node eqstrip.mjs input.md [--outdir DIR] [--prefix eq] [--size 24] [--bg white|transparent]");
  process.exit(2);
}
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const inPath = path.resolve(input);
const outDir = path.resolve(opt("--outdir", path.dirname(inPath)));
const prefix = opt("--prefix", "eq");
const fontSize = Number(opt("--size", "24"));
const bg = opt("--bg", "white");
fs.mkdirSync(outDir, { recursive: true });

// ---- collect display equations (same parser rules as texpage.mjs) ----
const lines = fs.readFileSync(inPath, "utf8").replace(/\r\n/g, "\n").split("\n");
const eqs = [];
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (!t.startsWith("$$")) continue;
  const first = t.slice(2);
  let tex, tail;
  if (first.includes("$$")) {
    tex = first.slice(0, first.indexOf("$$"));
    tail = first.slice(first.indexOf("$$") + 2);
  } else {
    const buf = [first];
    i++;
    while (i < lines.length && !lines[i].includes("$$")) {
      buf.push(lines[i]);
      i++;
    }
    const last = i < lines.length ? lines[i] : "";
    const k = last.indexOf("$$");
    buf.push(k >= 0 ? last.slice(0, k) : last);
    tex = buf.join("\n");
    tail = k >= 0 ? last.slice(k + 2) : "";
  }
  tex = tex.trim();
  if (tex) eqs.push({ tex, number: (tail.match(/\(#([^)]*)\)/) || [])[1] || "" });
}
if (!eqs.length) {
  console.error("no display equations found");
  process.exit(1);
}

const chrome = (argv) =>
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", ...argv], {
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 1 << 26,
  }).toString();

const page = (inner) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${KATEX_DIST}/katex.min.css">
<style>
  html,body{margin:0;padding:0;overflow:hidden;background:${bg === "transparent" ? "transparent" : "#fff"};}
  #box{display:inline-block;padding:${Math.round(fontSize * 0.55)}px ${Math.round(fontSize * 0.9)}px;}
  .katex{font-size:${fontSize}px;}
  .katex-display{margin:0;}
</style></head><body><div id="box">${inner}</div>
<script>
window.addEventListener("load", () => {
  const r = document.getElementById("box").getBoundingClientRect();
  document.title = "SZ=" + Math.ceil(r.width) + "x" + Math.ceil(r.height);
  const d = document.createElement("div"); d.id = "sz";
  d.style.cssText = "position:absolute;left:-99999px;top:0";
  d.textContent = document.title; document.body.appendChild(d);
});
</script></body></html>`;

const tmpHtml = path.join(outDir, `.${prefix}-measure.html`);
const results = [];

for (let n = 0; n < eqs.length; n++) {
  const { tex, number } = eqs[n];
  const inner = katex.renderToString(tex, { displayMode: true, throwOnError: false, strict: "ignore" });
  fs.writeFileSync(tmpHtml, page(inner));

  // pass 1: measure
  const dom = chrome(["--virtual-time-budget=4000", "--dump-dom", `file://${tmpHtml}`]);
  const m = dom.match(/SZ=(\d+)x(\d+)/);
  if (!m) throw new Error(`measure failed for equation ${n + 1}`);
  const w = Number(m[1]) + 8;
  const h = Number(m[2]) + 8;

  // pass 2: screenshot at 2x for crisp glyphs
  const rawPng = path.join(outDir, `.${prefix}-raw-${n + 1}.png`);
  chrome([
    `--screenshot=${rawPng}`,
    `--window-size=${w},${h}`,
    "--force-device-scale-factor=2",
    "--hide-scrollbars",
    "--default-background-color=00000000",
    "--virtual-time-budget=4000",
    `file://${tmpHtml}`,
  ]);

  // pass 3: autocrop with small margin (drops window rounding slack)
  const outPng = path.join(outDir, `${prefix}-${String(n + 1).padStart(2, "0")}.png`);
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(rawPng)}).convert("RGBA")
bbox = im.convert("RGB").point(lambda v: 0 if v > 250 else 255).getbbox()
if bbox is None: bbox = (0, 0, im.width, im.height)
pad = 10
l, t, r, b = bbox
l = max(0, l - pad); t = max(0, t - pad); r = min(im.width, r + pad); b = min(im.height, b + pad)
im.crop((l, t, r, b)).save(${JSON.stringify(outPng)})
print(im.crop((l, t, r, b)).size)
`;
  execFileSync("python3", ["-c", py], { stdio: ["ignore", "pipe", "inherit"] });
  fs.unlinkSync(rawPng);
  results.push({ n: n + 1, file: outPng, tex, number });
}
fs.unlinkSync(tmpHtml);
console.log(JSON.stringify(results, null, 2));
