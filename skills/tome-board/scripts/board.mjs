#!/usr/bin/env node
// tome-board: the drawing board (Excalidraw) as a skill's script. One process
// per vault serves the board page (./editor, built from apps/board) and the
// vault's drawings on 127.0.0.1; an agent starts it with `open` and hands the
// address to the person. No dependencies: Node 20+.
//
// Only three kinds of file are read or written, and only inside the vault's
// board folder: `<name>.excalidraw.md`, a bare `<name>.excalidraw`, and the
// picture beside a drawing (`<name>.png`).

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 4740;
const PORT_TRIES = 30;
const DEFAULT_BOARD_DIR = "Excalidraw";
const PLUGIN_SETTINGS = ".obsidian/plugins/obsidian-excalidraw-plugin/data.json";
const EXT_MD = ".excalidraw.md";
const EXT_BARE = ".excalidraw";
const MAX_NAME = 80;
const MAX_PNG = 32 * 1024 * 1024;
const MAX_BODY = 96 * 1024 * 1024;
const WRITE_HEADER = "x-tome-board";
const WAIT_MS = 25000;
const WAIT_STEP_MS = 200;
const PNG_MAGIC = Buffer.from("\x89PNG\r\n\x1a\n", "latin1");
const here = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));

/** The text of a new, empty drawing (what apps/board/src/format.js `emptyText()` gives; a test holds them equal). */
export const EMPTY_TEXT =
  "---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---\n==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'\n\n%%\n# Excalidraw Data\n\n## Text Elements\n## Drawing\n```json\n" +
  '{\n\t"type": "excalidraw",\n\t"version": 2,\n\t"source": "agent-tome",\n\t"elements": [],\n\t"appState": {},\n\t"files": {}\n}\n```\n%%\n';

class Fail extends Error {
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}
const STATUS = { NotFound: 404, Conflict: 409, AlreadyExists: 409, OutsideVault: 403, InvalidName: 400, Invalid: 400, Io: 500 };

const endsWith = (s, ext) => s.toLowerCase().endsWith(ext);
export const isBoard = (p) => endsWith(p, EXT_MD) || endsWith(p, EXT_BARE);
const stem = (p) => (endsWith(p, EXT_MD) ? p.slice(0, -EXT_MD.length) : endsWith(p, EXT_BARE) ? p.slice(0, -EXT_BARE.length) : p);
/** The picture written beside a drawing (`a/流程.excalidraw.md` → `a/流程.png`). */
export const pngPath = (board) => stem(board) + ".png";
/** The rev of a file's bytes: what a save names as the text it was made from. */
export const revOf = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);

/** A file name for a new drawing called `title`: what files and Obsidian links cannot take becomes a space. */
export function boardFileStem(title) {
  const cleaned = [...String(title)].map((c) => (/[\p{Cc}/\\:*?"<>|#^[\]]/u.test(c) ? " " : c)).join("");
  const trimmed = cleaned.split(/\s+/).filter(Boolean).join(" ").replace(/^[._ ]+/, "");
  if (!trimmed) throw new Fail("InvalidName", "empty board name");
  return [...trimmed].slice(0, MAX_NAME).join("").trimEnd();
}

function atomicWrite(file, bytes) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(tmp, bytes, { flag: "wx" });
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

const exists = (p) => fs.lstatSync(p, { throwIfNoEntry: false }) !== undefined;
const isFile = (p) => fs.statSync(p, { throwIfNoEntry: false })?.isFile() === true;

/** The drawings of one vault. */
export class Boards {
  constructor(vault) {
    this.root = fs.realpathSync(vault);
  }

  /** The folder the drawings are in: the Obsidian Excalidraw plugin's `folder` setting, else `Excalidraw`. */
  dirName() {
    try {
      const folder = String(JSON.parse(fs.readFileSync(path.join(this.root, PLUGIN_SETTINGS), "utf8")).folder ?? "").replace(/^[/ ]+|[/ ]+$/g, "");
      if (folder && !folder.split("/").some((s) => s === ".." || s.startsWith("."))) return folder;
    } catch {
      // no plugin, or settings that do not parse
    }
    return DEFAULT_BOARD_DIR;
  }

  /** The board folder as it really is on disk; null: not there (or a link out of the vault). */
  dir() {
    try {
      const real = fs.realpathSync(path.join(this.root, this.dirName()));
      return real.startsWith(this.root + path.sep) && fs.statSync(real).isDirectory() ? real : null;
    } catch {
      return null;
    }
  }

  /** A vault-relative path of the board folder → {rel, abs}: a drawing (`png` false) or a drawing's picture. */
  resolve(rel, png) {
    const no = () => new Fail("OutsideVault", `not a board file: ${rel}`);
    if (typeof rel !== "string" || rel.includes("\0") || rel.includes("\\") || path.isAbsolute(rel)) throw no();
    const parts = rel.split("/");
    if (parts.some((s) => s === "" || s === ".." || s.startsWith("."))) throw no();
    if (!(png ? endsWith(rel, ".png") : isBoard(rel))) throw no();
    const dir = this.dir();
    if (!dir) throw no();
    const abs = path.join(this.root, rel);
    // Through links: the file when it exists, else the folder it would be in.
    let real;
    try {
      real = fs.realpathSync(abs);
    } catch {
      try {
        real = path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs));
      } catch {
        throw new Fail("NotFound", rel);
      }
    }
    if (!real.startsWith(dir + path.sep)) throw no();
    return { rel, abs: real };
  }

  /** The drawings (any depth), the last changed first: [{path, name, mtime, png}]. */
  list() {
    const top = this.dir();
    if (!top) return [];
    const dirName = this.dirName();
    const out = [];
    const walk = (dir) => {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && isBoard(e.name)) {
          const inner = path.relative(top, p).split(path.sep).join("/");
          const st = fs.statSync(p, { throwIfNoEntry: false });
          if (st) out.push({ path: `${dirName}/${inner}`, name: stem(inner), mtime: Math.floor(st.mtimeMs), png: isFile(path.join(dir, stem(e.name) + ".png")) });
        }
      }
    };
    walk(top);
    return out.sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** The drawing a name (its path in the board folder, no extension) says; null: no such file. */
  find(name) {
    if (!this.dir()) return null;
    for (const ext of [EXT_MD, EXT_BARE]) {
      try {
        const r = this.resolve(`${this.dirName()}/${name}${ext}`, false);
        if (isFile(r.abs)) return r.rel;
      } catch (e) {
        if (e.code !== "NotFound") throw e;
      }
    }
    return null;
  }

  read(rel) {
    const r = this.resolve(rel, false);
    let bytes;
    try {
      bytes = fs.readFileSync(r.abs);
    } catch (e) {
      throw new Fail(e.code === "ENOENT" ? "NotFound" : "Io", rel);
    }
    return { text: bytes.toString("utf8"), rev: revOf(bytes) };
  }

  /** The rev the drawing has now; null: no such file. */
  rev(rel) {
    const r = this.resolve(rel, false);
    try {
      return revOf(fs.readFileSync(r.abs));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw new Fail("Io", rel);
    }
  }

  /** Writes a drawing that exists. `base`: the rev the text was made from; another rev on disk is a Conflict. */
  write(rel, text, base) {
    const r = this.resolve(rel, false);
    if (!isFile(r.abs)) throw new Fail("NotFound", rel);
    if (base != null && revOf(fs.readFileSync(r.abs)) !== base) throw new Fail("Conflict", rel);
    const bytes = Buffer.from(text, "utf8");
    atomicWrite(r.abs, bytes);
    return revOf(bytes);
  }

  /** Makes a new drawing called `title` (` 2`, ` 3`… when the name is taken by a drawing or a picture). Returns its path. */
  create(title, text = EMPTY_TEXT) {
    const base = boardFileStem(title);
    const dirName = this.dirName();
    fs.mkdirSync(path.join(this.root, dirName), { recursive: true });
    for (let n = 1; n < 1000; n++) {
      const name = n === 1 ? base : `${base} ${n}`;
      const r = this.resolve(`${dirName}/${name}${EXT_MD}`, false);
      const beside = (ext) => path.join(path.dirname(r.abs), name + ext);
      if (exists(r.abs) || exists(beside(EXT_BARE)) || exists(beside(".png"))) continue;
      atomicWrite(r.abs, Buffer.from(text, "utf8"));
      return r.rel;
    }
    throw new Fail("AlreadyExists", base);
  }

  writePng(board, bytes) {
    const b = this.resolve(board, false);
    if (bytes.length > MAX_PNG || !bytes.subarray(0, 8).equals(PNG_MAGIC)) throw new Fail("Invalid", "not a png, or too large");
    atomicWrite(this.resolve(pngPath(b.rel), true).abs, bytes);
  }

  readPng(board) {
    const b = this.resolve(board, false);
    try {
      return fs.readFileSync(this.resolve(pngPath(b.rel), true).abs);
    } catch (e) {
      throw e instanceof Fail ? e : new Fail("NotFound", pngPath(b.rel));
    }
  }
}

// ---- the server ----

const TYPES = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  map: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain; charset=utf-8",
};
// What the page may load: itself, and what Excalidraw makes in the browser.
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self' data:; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-ancestors 'none'";

/** The file a path names under the page's folder. `/` and `/b/…` (a drawing's address) are the page itself. */
function pageFile(root, urlPath) {
  const rel = urlPath.replace(/^\/+/, "");
  if (rel === "" || rel === "b" || rel.startsWith("b/")) return path.join(root, "index.html");
  const parts = rel.split("/");
  if (parts.some((s) => s === "" || s === ".." || s.startsWith(".") || s.includes("\\"))) return null;
  return path.join(root, ...parts);
}

/** Answers one request: {status, type, body}. `req`: {method, path, query (URLSearchParams), headers, body (Buffer)}. */
export async function handle(ctx, req) {
  const json = (status, value) => ({ status, type: TYPES.json, body: Buffer.from(JSON.stringify(value)) });
  const text = (status, s) => ({ status, type: TYPES.txt, body: Buffer.from(s) });
  const bad = (detail) => json(400, { code: "Invalid", detail });
  const h = (name) => req.headers[name];
  // Only a page this process served may ask (or no page: a command line).
  // This machine by name, at any port: a forwarded port (a container's) may
  // not be this process's. The origin has to be that same address.
  if (!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(h("host") ?? "")) return text(403, "Host not allowed");
  if (h("origin") !== undefined && h("origin") !== `http://${h("host")}`) return text(403, "Origin not allowed");
  const site = h("sec-fetch-site");
  if (req.path.startsWith("/api/") && site !== undefined && site !== "same-origin" && site !== "none") return text(403, "not from the board page");
  if (req.method !== "GET" && req.method !== "HEAD" && h(WRITE_HEADER) === undefined) return text(403, "not from the board page");

  const { boards } = ctx;
  const abs = (rel) => path.join(boards.root, rel);
  const body = () => {
    try {
      const v = JSON.parse(req.body.toString("utf8"));
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  try {
    const route = `${req.method} ${req.path}`;
    if (route === "GET /api/ping") return json(200, { ok: true, pid: process.pid, build: ctx.build, vault: boards.root });
    if (route === "GET /api/boards") return json(200, { dir: boards.dirName(), boards: boards.list() });
    if (route === "POST /api/boards") {
      const b = body();
      if (!b) return bad("the body is not a JSON object");
      if (typeof b.title !== "string" || typeof b.text !== "string") return bad("title and text");
      const made = boards.create(b.title, b.text);
      return json(200, { path: made, name: boards.list().find((x) => x.path === made)?.name ?? null });
    }
    if (route === "GET /api/board") {
      let rel = req.query.get("path");
      if (rel === null) {
        const name = req.query.get("name");
        if (name === null) return bad("path or name");
        rel = boards.find(name);
        if (rel === null) throw new Fail("NotFound", name);
      }
      const { text: t, rev } = boards.read(rel);
      return json(200, { path: rel, text: t, rev, file: abs(rel), png: abs(pngPath(rel)) });
    }
    if (route === "PUT /api/board") {
      const rel = req.query.get("path");
      if (rel === null) return bad("path");
      const b = body();
      if (!b) return bad("the body is not a JSON object");
      if (typeof b.text !== "string") return bad("text");
      let png = null;
      if (typeof b.png === "string" && b.png !== "") {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b.png)) return bad("png is not base64");
        png = Buffer.from(b.png, "base64");
      }
      const rev = boards.write(rel, b.text, typeof b.base === "string" ? b.base : null);
      if (png) boards.writePng(rel, png);
      return json(200, { rev });
    }
    if (route === "GET /api/png") {
      const rel = req.query.get("path");
      if (rel === null) return bad("path");
      return { status: 200, type: TYPES.png, body: boards.readPng(rel) };
    }
    if (route === "GET /api/wait") {
      // Answers when the drawing is no longer at `rev` (with its text; `rev: null`: gone), or after a while with the same rev.
      const rel = req.query.get("path");
      const seen = req.query.get("rev");
      if (rel === null || seen === null) return bad("path and rev");
      const ms = Number(req.query.get("ms"));
      const until = Date.now() + (Number.isFinite(ms) && req.query.get("ms") !== null ? Math.min(WAIT_MS, Math.max(0, ms)) : WAIT_MS);
      const file = boards.resolve(rel, false).abs;
      let last;
      for (;;) {
        const st = fs.statSync(file, { throwIfNoEntry: false });
        const now = st ? `${st.size}:${st.mtimeMs}` : "";
        if (now !== last) {
          // Read only when the file's size or time moved.
          const rev = boards.rev(rel);
          if (rev === null) return json(200, { rev: null });
          if (rev !== seen) return json(200, { rev, text: boards.read(rel).text });
          last = now;
        }
        if (Date.now() >= until || req.gone?.()) return json(200, { rev: seen });
        await new Promise((r) => setTimeout(r, WAIT_STEP_MS));
      }
    }
    if (req.path.startsWith("/api/")) return text(404, "no such call");
    if (req.method !== "GET" && req.method !== "HEAD") return text(405, "GET only");
    const f = ctx.web ? pageFile(ctx.web, req.path) : null;
    if (!ctx.web) return text(404, "The board page is not built: run `npm ci --ignore-scripts && node build.mjs` in apps/board.\n");
    if (!f || !isFile(f)) return text(404, "not found\n");
    return { status: 200, type: TYPES[path.extname(f).slice(1)] ?? "application/octet-stream", body: fs.readFileSync(f) };
  } catch (e) {
    if (e instanceof Fail) return json(STATUS[e.code] ?? 500, { code: e.code, detail: e.message });
    return json(500, { code: "Io", detail: String(e?.message ?? e) });
  }
}

/** The built page beside this script; null: not built. */
function editorDir() {
  const dir = path.join(here, "editor");
  return isFile(path.join(dir, "index.html")) ? dir : null;
}

/** Which copy of the script and page this is: a process of another build is replaced by `open`. */
function ownBuild() {
  const parts = [fs.statSync(path.join(here, "board.mjs")).mtimeMs];
  const page = path.join(here, "editor", "board.js");
  if (isFile(page)) parts.push(fs.statSync(page).mtimeMs);
  return parts.map((n) => Math.floor(n).toString(36)).join("-");
}

function listen(first) {
  return new Promise((resolve, reject) => {
    const attempt = (port) => {
      const server = http.createServer();
      server.once("error", (e) => (port < first + PORT_TRIES ? attempt(port + 1) : reject(e)));
      server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port }));
    };
    attempt(first);
  });
}

// ---- where the running process is written down ----
//
// `<home>/servers/<id>.json` holds {pid, url, port, root, kind: "board",
// startedAt}: the same fields claude-slides and claude-design write beside
// their folders (`.artifact-server.json`), so one list can show them all.

function homeDir() {
  return process.env.TOME_BOARD_HOME || path.join(os.homedir(), ".tome-board");
}
const stateFile = (vault) => path.join(homeDir(), "servers", crypto.createHash("sha256").update(vault).digest("hex").slice(0, 16) + ".json");
const logFile = (vault) => stateFile(vault).replace(/\.json$/, ".log");
function readState(vault) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(vault), "utf8"));
  } catch {
    return null;
  }
}

async function ping(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(2000) });
    const v = res.ok ? await res.json() : null;
    return v?.ok === true ? v : null;
  } catch {
    return null;
  }
}

/** The process the state file names, when it answers as that pid for this vault. */
async function running(vault) {
  const state = readState(vault);
  if (!state) return null;
  const who = await ping(state.port);
  return who && who.pid === state.pid && who.vault === vault ? { ...state, build: who.build } : null;
}

async function until(ms, done) {
  const end = Date.now() + ms;
  for (;;) {
    if (await done()) return true;
    if (Date.now() >= end) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Serves until the process ends. */
export async function serve(vault, firstPort = DEFAULT_PORT) {
  const boards = new Boards(vault);
  const { server, port } = await listen(firstPort);
  const ctx = { boards, port, web: editorDir(), build: ownBuild() };
  server.on("request", (req, res) => {
    const chunks = [];
    let size = 0;
    let closed = false;
    res.on("close", () => (closed = true));
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(c);
    });
    req.on("end", async () => {
      let out;
      try {
        const url = new URL(req.url, "http://x");
        const pathname = decodeURIComponent(url.pathname);
        if (pathname.includes("\0")) throw new Error("nul");
        out = await handle(ctx, { method: req.method, path: pathname, query: url.searchParams, headers: req.headers, body: Buffer.concat(chunks), gone: () => closed });
      } catch {
        out = { status: 400, type: TYPES.txt, body: Buffer.from("bad request\n") };
      }
      res.writeHead(out.status, {
        "Content-Type": out.type,
        "Content-Length": out.body.length,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": CSP,
      });
      res.end(req.method === "HEAD" ? undefined : out.body);
    });
  });
  const file = stateFile(boards.root);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const url = `http://127.0.0.1:${port}/`;
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, url, port, root: boards.root, kind: "board", startedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  const bye = () => {
    if (readState(boards.root)?.pid === process.pid) fs.rmSync(file, { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
  console.error(`tome-board: ${url} (vault ${boards.root}, page ${ctx.web ?? "not built"})`);
  return { server, port, url };
}

function kill(pid) {
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

async function stop(vault) {
  const state = await running(vault);
  if (!state) {
    fs.rmSync(stateFile(vault), { force: true });
    return { stopped: false, note: "it was not running" };
  }
  kill(state.pid);
  await until(3000, async () => (await ping(state.port))?.pid !== state.pid);
  fs.rmSync(stateFile(vault), { force: true });
  return { stopped: true, pid: state.pid };
}

/** Starts the process when none of this build is running for the vault; returns its state. */
async function ensure(vault, port) {
  let state = await running(vault);
  if (state && state.build === ownBuild()) return { ...state, reused: true };
  if (state) await stop(vault); // an older build: replaced
  fs.mkdirSync(path.dirname(stateFile(vault)), { recursive: true, mode: 0o700 });
  const log = fs.openSync(logFile(vault), "a", 0o600);
  const child = spawn(process.execPath, [path.join(here, "board.mjs"), "serve", "--vault", vault, "--port", String(port)], { detached: true, stdio: ["ignore", log, log] });
  child.unref();
  fs.closeSync(log);
  if (!(await until(8000, async () => (state = await running(vault)) !== null))) throw new Error(`it did not start: see ${logFile(vault)}`);
  return { ...state, reused: false };
}

/** The vault: `--vault`, $TOME_BOARD_VAULT, the one Agent Tome is set to, else the nearest folder above here that Obsidian opened. */
function findVault(given) {
  const real = (p) => {
    try {
      return fs.statSync(p).isDirectory() ? fs.realpathSync(p) : null;
    } catch {
      return null;
    }
  };
  if (given) return real(given) ?? fail(`no such vault folder: ${given}`);
  if (process.env.TOME_BOARD_VAULT) return real(process.env.TOME_BOARD_VAULT) ?? fail(`no such vault folder: ${process.env.TOME_BOARD_VAULT}`);
  const homes = [process.env.TOME_HOME, path.join(os.homedir(), "Library/Application Support/agent-tome"), path.join(os.homedir(), ".local/share/agent-tome")];
  for (const home of homes.filter(Boolean)) {
    try {
      const v = real(JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")).vault);
      if (v) return v;
    } catch {
      // not there
    }
  }
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (exists(path.join(dir, ".obsidian"))) return fs.realpathSync(dir);
    if (dir === path.dirname(dir)) break;
  }
  return fail("no vault: pass --vault <folder>");
}

function fail(message) {
  console.error(`tome-board: ${message}`);
  process.exit(2);
}

const USAGE = `tome-board: the drawing board (Excalidraw), a process of its own

board.mjs open [NAME]   start it if needed; prints {url, …} (NAME: that drawing; none: the list of drawings)
board.mjs new TITLE     make an empty drawing; prints its address, files and the lines that attach it to a card
board.mjs list          the drawings: [{name, path, file, png, mtime}]
board.mjs stop          end it
board.mjs serve         run it here, in the foreground

--vault DIR   the vault (default: $TOME_BOARD_VAULT, the one Agent Tome is set to, or the Obsidian vault above this folder)
--port N      the first port to try (default ${DEFAULT_PORT})
`;

const boardUrl = (base, name) => base + "b/" + name.split("/").map(encodeURIComponent).join("/");

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || ["help", "--help", "-h"].includes(command)) return void process.stdout.write(USAGE);
  let vaultArg = null;
  let port = DEFAULT_PORT;
  const words = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--vault" || a === "--port") {
      const v = rest[++i];
      if (v === undefined) fail(`${a} needs a value`);
      if (a === "--vault") vaultArg = v;
      else if (!/^\d+$/.test(v)) fail("--port is a number");
      else port = Number(v);
    } else if (a.startsWith("--")) fail(`unknown option ${a}`);
    else words.push(a);
  }
  if (words.length > 1) fail("one name at most (quote a name that has spaces)");
  const vault = findVault(vaultArg);
  const print = (v) => console.log(JSON.stringify(v, null, 2));
  /** What a drawing is, for whoever attaches it to a card. */
  const about = (boards, rel, base) => {
    const name = boards.list().find((b) => b.path === rel)?.name ?? stem(rel.slice(boards.dirName().length + 1));
    const png = path.join(boards.root, pngPath(rel));
    return { name, url: boardUrl(base, name), file: path.join(boards.root, rel), png, attach: [`![[${name}.excalidraw]]`, `添付画像: ${png}`] };
  };
  if (command === "serve") return void (await serve(vault, port));
  if (command === "stop") return print(await stop(vault));
  if (command === "list") {
    const boards = new Boards(vault);
    return print(boards.list().map((b) => ({ name: b.name, path: b.path, file: path.join(boards.root, b.path), png: b.png ? path.join(boards.root, pngPath(b.path)) : null, mtime: new Date(b.mtime).toISOString() })));
  }
  if (command === "open" || command === "new") {
    const boards = new Boards(vault);
    if (command === "new" && words.length === 0) fail("new needs a title");
    let state;
    try {
      state = await ensure(vault, port);
    } catch (e) {
      fail(e.message);
    }
    const out = { url: state.url, pid: state.pid, reused: state.reused, vault, stop: `node ${path.join(here, "board.mjs")} stop --vault ${JSON.stringify(vault)}` };
    if (!editorDir()) out.note = "The board page is not built yet: run `npm ci --ignore-scripts && node build.mjs` in the repository's apps/board.";
    if (command === "new") {
      let rel;
      try {
        rel = boards.create(words[0]);
      } catch (e) {
        fail(e.message);
      }
      return print({ ...out, ...about(boards, rel, state.url), created: true });
    }
    if (words.length === 1) {
      const rel = boards.find(words[0]);
      if (rel) return print({ ...out, ...about(boards, rel, state.url) });
      return print({ ...out, url: boardUrl(state.url, words[0]), exists: false, note: "No drawing of that name: the page asks whether to make it. `new` makes it now." });
    }
    return print(out);
  }
  fail(`unknown command ${command}\n\n${USAGE}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === path.join(here, "board.mjs")) {
  main(process.argv.slice(2)).catch((e) => fail(e?.message ?? String(e)));
}
