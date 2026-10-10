// Packt den Build aus dist-single in eine einzige HTML-Datei: eos-web.html
import { readFileSync, writeFileSync, readdirSync } from "fs";
const dir = "dist-single";
let html = readFileSync(`${dir}/index.html`, "utf8");
const assets = readdirSync(`${dir}/assets`);
html = html.replace(/<link rel="manifest"[^>]*>\s*/, "").replace(/<link rel="apple-touch-icon"[^>]*>\s*/, "");
const svg = readFileSync("public/eos-icon.svg", "utf8");
html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}">`);
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/, (_, f) => `<style>${readFileSync(`${dir}/assets/${f}`, "utf8")}</style>`);
html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/, (_, f) =>
    `<script>window.EOS_SINGLE_FILE = true;</script><script type="module">${readFileSync(`${dir}/assets/${f}`, "utf8").replace(/<\/script/g, "<\\/script")}</script>`);
writeFileSync("eos-web.html", html);
console.log("eos-web.html", Math.round(html.length / 1024) + " KB", assets);
