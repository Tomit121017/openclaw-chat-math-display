#!/usr/bin/env node
// texpage.mjs — turn a small markdown+LaTeX file into a book-styled page (HTML -> PDF -> PNG)
// Usage: node texpage.mjs input.md [--out basename] [--dpi 200]
// Markdown support:
//   # Heading                 -> section heading (bold, serif)
//   $$ ... $$                 -> display equation (may span several lines)
//   $$ ... $$ (#1.1)          -> display equation with right-aligned number
//   $ ... $                   -> inline math
//   blank-line separated text -> paragraph
//   - item                    -> bullet list item
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const KATEX_DIST = process.env.KATEX_DIST || "/home/john/tmp/texrender/node_modules/katex/dist";
const KATEX_ROOT = process.env.KATEX_ROOT || path.resolve(KATEX_DIST, "../..");
const require = createRequire(path.join(KATEX_ROOT, "resolve.js"));
const katex = require("katex");

const args = process.argv.slice(2);
const input = args[0];
if (!input) {
  console.error("usage: node texpage.mjs input.md [--out basename] [--dpi 200]");
  process.exit(2);
}
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const outBase = opt("--out", path.basename(input).replace(/\.md$/, ""));
const dpi = opt("--dpi", "200");
const workDir = path.dirname(path.resolve(input));

const math = (tex, display) =>
  katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html", strict: "ignore" });

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// inline: escape html but keep $...$ math
function inlineMd(text) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return parts
    .map((p) => {
      if (/^\$[^$]+\$$/.test(p)) return math(p.slice(1, -1), false);
      return esc(p).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    })
    .join("");
}

const src = fs.readFileSync(input, "utf8").replace(/\r\n/g, "\n");
const lines = src.split("\n");
let body = [];
let para = [];
let i = 0;
const flushPara = () => {
  if (para.length) {
    body.push(`<p>${inlineMd(para.join(" "))}</p>`);
    para = [];
  }
};
while (i < lines.length) {
  const line = lines[i];
  if (line.trim().startsWith("$$")) {
    flushPara();
    const first = line.trim().slice(2);
    let tex;
    let tail;
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
    const numMatch = tail.match(/\(#([^)]*)\)/);
    const number = numMatch ? numMatch[1] : "";
    const eqCls = number ? "eq eqnum" : "eq";
    body.push(
      `<div class="${eqCls}"><div class="eqbody">${math(tex.trim(), true)}</div>${
        number ? `<div class="eqtag">(${esc(number)})</div>` : ""
      }</div>`
    );
    i++;
    continue;
  }
  if (/^#{1,6}\s+/.test(line)) {
    flushPara();
    body.push(`<h2>${inlineMd(line.replace(/^#{1,6}\s+/, ""))}</h2>`);
    i++;
    continue;
  }
  if (/^\s*[-*]\s+/.test(line)) {
    flushPara();
    const items = [];
    while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
      items.push(`<li>${inlineMd(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
      i++;
    }
    body.push(`<ul>${items.join("")}</ul>`);
    continue;
  }
  if (!line.trim()) {
    flushPara();
    i++;
    continue;
  }
  para.push(line.trim());
  i++;
}
flushPara();

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${KATEX_DIST}/katex.min.css">
<style>
@page { size: A4; margin: 18mm 18mm 12mm 18mm; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  font-family: "Noto Serif CJK SC", "Source Han Serif SC", serif;
  font-size: 10pt; line-height: 1.74; color: #111;
  text-align: justify; text-justify: inter-ideograph;
  -webkit-font-smoothing: antialiased;
}
h2 { font-size: 12.2pt; font-weight: 700; margin: 1.15em 0 0.5em; line-height: 1.5; }
p { margin: 0.55em 0; text-indent: 0; }
ul { margin: 0.5em 0 0.5em 1.4em; padding: 0; }
li { margin: 0.25em 0; }
.eq { display: flex; align-items: center; justify-content: center;
      margin: 0.95em 0; position: relative; }
.eq .eqbody { flex: 0 1 auto; }
.eq.eqnum .eqbody { margin: 0 auto; }
.eq .eqtag { position: absolute; right: 0; font-size: 10.5pt; }
.katex { font-size: 1.16em; }
.katex-display { margin: 0 !important; }
</style></head>
<body>
${body.join("\n")}
</body></html>`;

const htmlPath = path.join(workDir, `${outBase}.html`);
const pdfPath = path.join(workDir, `${outBase}.pdf`);
fs.writeFileSync(htmlPath, html);

execFileSync(
  process.env.CHROME_BIN || "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    "--virtual-time-budget=4000",
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
);

execFileSync("pdftoppm", ["-png", "-r", dpi, "-singlefile", pdfPath, path.join(workDir, outBase)], {
  stdio: "inherit",
});
console.log(JSON.stringify({ html: htmlPath, pdf: pdfPath, png: path.join(workDir, `${outBase}.png`) }));
