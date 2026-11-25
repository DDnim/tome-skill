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
const MAX_COMMENT = 8000;
const MAX_COMMENT_ELEMENTS = 300;
const TAKE_STEP_MS = 400;
/** How long the page still shows an agent as listening after its wait ended (it asks again right away). */
const LISTEN_GRACE_MS = 3000;
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

// ---- comments ----
//
// A comment is the person's words about a region of a drawing, made in the
// page. They are not the vault's: `<home>/comments/<vault id>/<drawing id>/`
// holds `comments.json` ({path, next, threads}) and a picture of each
// region (`<thread id>.png`). A thread: {id, n, at, rect, elements,
// region, messages: [{from: "user" | "agent", text, at}], sent, taken,
// resolved}. `sent`: the person handed it to an agent; `taken`: a waiting
// agent got it.

const shortHash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const now = () => new Date().toISOString();

function commentText(v) {
  const text = typeof v === "string" ? v.trim() : "";
  if (!text) throw new Fail("Invalid", "the comment has no text");
  if (text.length > MAX_COMMENT) throw new Fail("Invalid", "the comment is too long");
  return text;
}

/** The comments on one vault's drawings. */
export class Comments {
  constructor(vault) {
    this.root = path.join(homeDir(), "comments", shortHash(vault));
  }

  dir(rel) {
    return path.join(this.root, shortHash(rel));
  }

  /** A drawing's comments; none yet: an empty list. */
  load(rel) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(this.dir(rel), "comments.json"), "utf8"));
      if (v && Array.isArray(v.threads)) return { path: rel, next: Number(v.next) || v.threads.length + 1, threads: v.threads };
    } catch {
      // none
    }
    return { path: rel, next: 1, threads: [] };
  }

  store(data) {
    const dir = this.dir(data.path);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    atomicWrite(path.join(dir, "comments.json"), Buffer.from(JSON.stringify(data, null, 2)));
  }

  /** Every drawing's comments. */
  all() {
    let names = [];
    try {
      names = fs.readdirSync(this.root);
    } catch {
      return [];
    }
    const out = [];
    for (const name of names.sort()) {
      try {
        const v = JSON.parse(fs.readFileSync(path.join(this.root, name, "comments.json"), "utf8"));
        if (v && typeof v.path === "string" && Array.isArray(v.threads) && name === shortHash(v.path)) out.push(v);
      } catch {
        // not a drawing's comments
      }
    }
    return out;
  }

  /** The thread of that id, in its drawing's comments: {data, thread}. */
  find(id) {
    for (const data of this.all()) {
      const thread = data.threads.find((t) => t.id === id);
      if (thread) return { data, thread };
    }
    throw new Fail("NotFound", `no comment ${id}`);
  }

  /** The picture of a thread's region; null: none was made. */
  regionPng(rel, thread) {
    return thread.region ? path.join(this.dir(rel), `${thread.id}.png`) : null;
  }

  /** A new thread on `rel`. `png`: a picture of the region (a Buffer) or null. */
  add(rel, { rect, elements, text, png, send }) {
    const body = commentText(text);
    const r = rect && typeof rect === "object" ? [rect.x, rect.y, rect.width, rect.height] : [];
    if (r.length !== 4 || !r.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Fail("Invalid", "rect");
    if (png && (png.length > MAX_PNG || !png.subarray(0, 8).equals(PNG_MAGIC))) throw new Fail("Invalid", "not a png, or too large");
    const els = (Array.isArray(elements) ? elements : [])
      .filter((e) => e && typeof e.id === "string" && typeof e.type === "string")
      .slice(0, MAX_COMMENT_ELEMENTS)
      .map((e) => ({ id: e.id.slice(0, 80), type: e.type.slice(0, 40), ...(typeof e.text === "string" && e.text ? { text: e.text.slice(0, 400) } : {}) }));
    const data = this.load(rel);
    const at = now();
    const thread = {
      id: crypto.randomBytes(5).toString("hex"),
      n: data.next,
      at,
      rect: { x: r[0], y: r[1], width: r[2], height: r[3] },
      elements: els,
      region: Boolean(png),
      messages: [{ from: "user", text: body, at }],
      sent: send ? at : null,
      taken: null,
      resolved: false,
    };
    data.next += 1;
    data.threads.push(thread);
    if (png) {
      fs.mkdirSync(this.dir(rel), { recursive: true, mode: 0o700 });
      atomicWrite(path.join(this.dir(rel), `${thread.id}.png`), png);
    }
    this.store(data);
    return thread;
  }

  /** One more message in a thread. The person's opens it again and may send it; an agent's may resolve it. */
  say(id, from, text, { send = false, resolve = false } = {}) {
    const { data, thread } = this.find(id);
    const at = now();
    thread.messages.push({ from, text: commentText(text), at });
    if (from === "user") {
      thread.sent = send ? at : null;
      thread.taken = null;
      thread.resolved = false;
    } else if (resolve) thread.resolved = true;
    this.store(data);
    return { data, thread };
  }

  /** Hands a thread to the agent that waits (or will). */
  send(id) {
    const { data, thread } = this.find(id);
    thread.sent = now();
    thread.taken = null;
    thread.resolved = false;
    this.store(data);
    return { data, thread };
  }

  resolve(id, resolved) {
    const { data, thread } = this.find(id);
    thread.resolved = Boolean(resolved);
    this.store(data);
    return { data, thread };
  }

  /** The oldest thread sent and not yet taken (of `rel`; null: of any drawing), marked taken; null: none. */
  take(rel) {
    let first = null;
    for (const data of rel === null ? this.all() : [this.load(rel)]) {
      for (const thread of data.threads) {
        if (thread.sent && !thread.taken && !thread.resolved && (!first || thread.sent < first.thread.sent)) first = { data, thread };
      }
    }
    if (!first) return null;
    first.thread.taken = now();
    this.store(first.data);
    return first;
  }
}

/** A thread as an agent reads it: where it is, what it holds, what was said. */
function describeThread(boards, comments, rel, thread) {
  const file = path.join(boards.root, rel);
  return {
    id: thread.id,
    n: thread.n,
    board: stem(rel.slice(boards.dirName().length + 1)),
    file,
    png: path.join(boards.root, pngPath(rel)),
    region: comments.regionPng(rel, thread),
    rect: thread.rect,
    elements: thread.elements,
    messages: thread.messages,
    sent: Boolean(thread.sent),
    resolved: thread.resolved,
    ...(isFile(file) ? {} : { note: "this drawing's file is gone" }),
  };
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
  const comments = (ctx.comments ??= new Comments(boards.root));
  /** The agents waiting for a comment now: a key → {rel (null: any drawing), until}. */
  const waiters = (ctx.waiters ??= new Map());
  const listening = (rel) => [...waiters.values()].some((w) => w.until > Date.now() && (w.rel === null || w.rel === rel));
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
    if (route === "GET /api/comments") {
      // A drawing's threads, and whether an agent is waiting for one.
      const rel = req.query.get("path");
      if (rel === null) return bad("path");
      boards.resolve(rel, false);
      return json(200, { threads: comments.load(rel).threads, listening: listening(rel) });
    }
    if (route === "POST /api/comments") {
      // What the page does: {op: "new", rect, elements, text, png?, send?}, {op: "say", id, text, send?},
      // {op: "send", id}, {op: "resolve", id, resolved}.
      const rel = req.query.get("path");
      if (rel === null) return bad("path");
      boards.resolve(rel, false);
      const b = body();
      if (!b) return bad("the body is not a JSON object");
      if (b.op === "new") {
        let png = null;
        if (typeof b.png === "string" && b.png !== "") {
          if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b.png)) return bad("png is not base64");
          png = Buffer.from(b.png, "base64");
        }
        return json(200, { thread: comments.add(rel, { rect: b.rect, elements: b.elements, text: b.text, png, send: b.send === true }) });
      }
      if (typeof b.id !== "string") return bad("id");
      if (comments.find(b.id).data.path !== rel) throw new Fail("NotFound", `no comment ${b.id}`);
      if (b.op === "say") return json(200, { thread: comments.say(b.id, "user", b.text, { send: b.send === true }).thread });
      if (b.op === "send") return json(200, { thread: comments.send(b.id).thread });
      if (b.op === "resolve") return json(200, { thread: comments.resolve(b.id, b.resolved !== false).thread });
      return bad("op");
    }
    if (route === "POST /api/comments/take") {
      // An agent's wait: answers with the next thread the person sent ({thread}), or {thread: null} after a while.
      // While it waits the page offers "Send to Agent".
      const rel = req.query.get("path");
      if (rel !== null) boards.resolve(rel, false);
      const ms = Number(req.query.get("ms"));
      const until = Date.now() + (Number.isFinite(ms) && req.query.get("ms") !== null ? Math.min(WAIT_MS, Math.max(0, ms)) : WAIT_MS);
      const key = crypto.randomUUID();
      waiters.set(key, { rel, until: until + LISTEN_GRACE_MS });
      try {
        for (;;) {
          const got = comments.take(rel);
          if (got) return json(200, { thread: describeThread(boards, comments, got.data.path, got.thread) });
          if (Date.now() >= until || req.gone?.()) return json(200, { thread: null });
          await new Promise((r) => setTimeout(r, TAKE_STEP_MS));
        }
      } finally {
        if (req.gone?.()) waiters.delete(key);
        else waiters.get(key).until = Date.now() + LISTEN_GRACE_MS;
        for (const [k, w] of waiters) if (w.until <= Date.now()) waiters.delete(k);
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
const stateFile = (vault) => path.join(homeDir(), "servers", shortHash(vault) + ".json");
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

board.mjs comments [NAME]             the open comments (of that drawing; none: of every drawing); --all: the resolved ones too
board.mjs comments [NAME] --wait      wait until the person sends a comment to the agent; prints that thread and ends
board.mjs comment-reply ID TEXT       reply to a comment (TEXT "-": from stdin); --resolve also closes it
board.mjs comment-resolve ID          close a comment; --reopen opens it again

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
  const flags = new Set();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (["--all", "--wait", "--resolve", "--reopen"].includes(a)) flags.add(a.slice(2));
    else if (a === "-") words.push(a);
    else if (a === "--vault" || a === "--port") {
      const v = rest[++i];
      if (v === undefined) fail(`${a} needs a value`);
      if (a === "--vault") vaultArg = v;
      else if (!/^\d+$/.test(v)) fail("--port is a number");
      else port = Number(v);
    } else if (a.startsWith("--")) fail(`unknown option ${a}`);
    else words.push(a);
  }
  if (words.length > (command === "comment-reply" ? 2 : 1)) fail("one name at most (quote a name that has spaces)");
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
  if (command === "comments") {
    const boards = new Boards(vault);
    const comments = new Comments(vault);
    let rel = null;
    if (words.length === 1) {
      rel = boards.find(words[0]);
      if (rel === null) fail(`no drawing named ${words[0]}`);
    }
    if (!flags.has("wait")) {
      const out = [];
      for (const data of rel === null ? comments.all() : [comments.load(rel)]) {
        for (const t of data.threads) if (flags.has("all") || !t.resolved) out.push(describeThread(boards, comments, data.path, t));
      }
      return print(out);
    }
    // Until a comment is sent: the page shows an agent as listening while this asks.
    const me = path.join(here, "board.mjs");
    const again = `node ${JSON.stringify(me)} comments${words.length ? " " + JSON.stringify(words[0]) : ""} --wait --vault ${JSON.stringify(vault)}`;
    for (;;) {
      try {
        const state = await ensure(vault, port);
        const query = new URLSearchParams(rel === null ? {} : { path: rel });
        const res = await fetch(`${state.url}api/comments/take?${query}`, { method: "POST", headers: { [WRITE_HEADER]: "1" }, signal: AbortSignal.timeout(WAIT_MS + 15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { thread } = await res.json();
        if (thread) return print({ ...thread, next: again });
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  if (command === "comment-reply" || command === "comment-resolve") {
    const boards = new Boards(vault);
    const comments = new Comments(vault);
    if (words.length === 0) fail(`${command} needs a comment's id`);
    try {
      let done;
      if (command === "comment-resolve") done = comments.resolve(words[0], !flags.has("reopen"));
      else {
        if (words.length < 2) fail("comment-reply needs the text (or - for stdin)");
        const said = words[1] === "-" ? fs.readFileSync(0, "utf8") : words[1];
        done = comments.say(words[0], "agent", said, { resolve: flags.has("resolve") });
      }
      return print(describeThread(boards, comments, done.data.path, done.thread));
    } catch (e) {
      fail(e.message);
    }
  }
  fail(`unknown command ${command}\n\n${USAGE}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === path.join(here, "board.mjs")) {
  main(process.argv.slice(2)).catch((e) => fail(e?.message ?? String(e)));
}
