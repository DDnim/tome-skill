// Builds the board page into the skill (skills/tome-board/scripts/editor:
// index.html, board.js, board.css, fonts/, THIRD_PARTY_LICENSES.txt), where
// the skill's board.mjs serves it from. Offline: the fonts are Excalidraw's
// own, served with the page.
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "../../skills/tome-board/scripts/editor");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(here, "src/main.jsx")],
  bundle: true,
  format: "iife",
  minify: true,
  target: ["safari17", "chrome120", "firefox121"],
  outfile: path.join(out, "board.js"),
  jsx: "automatic",
  conditions: ["production"],
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
  alias: { "@excalidraw/mermaid-to-excalidraw": path.join(here, "src/no-mermaid.js") },
  loader: { ".woff2": "file", ".png": "dataurl", ".svg": "dataurl" },
  assetNames: "assets/[name]-[hash]",
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
  logOverride: { "empty-import-meta": "silent" },
});

for (const f of ["index.html", "page.css"]) fs.copyFileSync(path.join(here, "src", f), path.join(out, f));
fs.cpSync(path.join(here, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"), path.join(out, "fonts"), { recursive: true });

// Every npm package that went into board.js, with its license text; then the fonts'.
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  if (!m) continue;
  const dir = path.join(here, input.slice(0, input.indexOf(m[0]) + m[0].length));
  if (!packages.has(m[1])) packages.set(m[1], dir);
}
const licenseFile = (dir) => fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)/i.test(f));
let text = "Agent Tome's drawing board is built on Excalidraw and the packages below.\n\n";
const missing = [];
for (const [name, dir] of [...packages].sort()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const lic = typeof pkg.license === "string" ? pkg.license : pkg.license?.type || "see repository";
  text += `${"=".repeat(72)}\n${name} ${pkg.version} — ${lic}\n${"=".repeat(72)}\n`;
  // licenses/<scope__name>.txt, else licenses/<@scope>.txt (one text for a family like @radix-ui), else the package's own.
  const own = [`${name.replace("/", "__")}.txt`, `${name.split("/")[0]}.txt`].map((f) => path.join(here, "licenses", f)).find((f) => fs.existsSync(f));
  const file = licenseFile(dir) ? path.join(dir, licenseFile(dir)) : own ?? null;
  if (file) text += fs.readFileSync(file, "utf8").trim() + "\n\n";
  else missing.push(name);
}
text += fs.readFileSync(path.join(here, "licenses/fonts.txt"), "utf8");
fs.writeFileSync(path.join(out, "THIRD_PARTY_LICENSES.txt"), text);
if (missing.length) {
  console.error(`board-page: no license text for ${missing.join(", ")} (add licenses/<name>.txt)`);
  process.exit(1);
}
const size = (f) => (fs.statSync(path.join(out, f)).size / 1048576).toFixed(1) + " MB";
console.log(`board-page: board.js ${size("board.js")}, ${packages.size} packages`);
