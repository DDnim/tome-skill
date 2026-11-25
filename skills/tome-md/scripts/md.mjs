#!/usr/bin/env node
// tome-md: Markdown files read in a page of this machine, with comments an
// agent answers. One process serves the page (./page) and the files that
// were opened with `open`, on 127.0.0.1; an agent starts it and hands the
// address to the person. No dependencies: Node 20+.
//
// It reads the opened Markdown files and the pictures they show, and
// writes nothing but its own notes (`~/.tome-md`): which files are open,
// the running process, the comments.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 4750;
const PORT_TRIES = 30;
const MAX_BODY = 1024 * 1024;
const MAX_DOC = 8 * 1024 * 1024;
const MAX_COMMENT = 8000;
const MAX_QUOTE = 4000;
const WRITE_HEADER = "x-tome-md";
const WAIT_MS = 25000;
const WAIT_STEP_MS = 200;
const TAKE_STEP_MS = 400;
/** How long the page still shows an agent as listening after its wait ended (it asks again right away). */
const LISTEN_GRACE_MS = 3000;
const here = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const PAGE = path.join(here, "page");

class Fail extends Error {
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}
const STATUS = { NotFound: 404, Forbidden: 403, Invalid: 400, Io: 500 };

const isFile = (p) => fs.statSync(p, { throwIfNoEntry: false })?.isFile() === true;
const shortHash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const revOf = (bytes) => shortHash(bytes);
const now = () => new Date().toISOString();
export const isDoc = (p) => /\.(md|markdown)$/i.test(p);

function homeDir() {
  return process.env.TOME_MD_HOME || path.join(os.homedir(), ".tome-md");
}

function atomicWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(tmp, bytes, { flag: "wx", mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// ---- the opened files ----
//
// `<home>/docs.json`: [{file, openedAt}]. Only these files are served; a
// file gets on the list by `open` on the command line, never from the page.

/** The Markdown files that were opened. A file's id is a hash of its real path. */
export class Docs {
  constructor() {
    this.note = path.join(homeDir(), "docs.json");
  }

  entries() {
    const v = readJson(this.note);
    return Array.isArray(v) ? v.filter((e) => e && typeof e.file === "string") : [];
  }

  /** The opened files that still exist, the last opened first: [{id, file, name, mtime}]. */
  list() {
    const out = [];
    for (const e of this.entries()) {
      const st = fs.statSync(e.file, { throwIfNoEntry: false });
      if (st?.isFile()) out.push({ id: shortHash(e.file), file: e.file, name: path.basename(e.file), mtime: Math.floor(st.mtimeMs), openedAt: e.openedAt });
    }
    return out.sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0));
  }

  /** Puts a file on the list (again: moves it to the front). */
  add(file) {
    let real;
    try {
      real = fs.realpathSync(file);
    } catch {
      throw new Fail("NotFound", `no such file: ${file}`);
    }
    if (!isFile(real)) throw new Fail("NotFound", `not a file: ${file}`);
    if (!isDoc(real)) throw new Fail("Invalid", `not a Markdown file (.md): ${file}`);
    const rest = this.entries().filter((e) => e.file !== real);
    atomicWrite(this.note, Buffer.from(JSON.stringify([{ file: real, openedAt: now() }, ...rest], null, 2)));
    return this.get(shortHash(real));
  }

  remove(id) {
    const rest = this.entries().filter((e) => shortHash(e.file) !== id);
    atomicWrite(this.note, Buffer.from(JSON.stringify(rest, null, 2)));
  }

  get(id) {
    const doc = this.list().find((d) => d.id === id);
    if (!doc) throw new Fail("NotFound", `no opened file ${id}`);
    return doc;
  }

  read(id) {
    const doc = this.get(id);
    let bytes;
    try {
      bytes = fs.readFileSync(doc.file);
    } catch {
      throw new Fail("NotFound", doc.file);
    }
    if (bytes.length > MAX_DOC) throw new Fail("Invalid", "the file is too large");
    return { ...doc, text: bytes.toString("utf8"), rev: revOf(bytes) };
  }
}

/** The folder a file's pictures may come from: the nearest one above it that is a vault or a repository, else its own. */
function assetRoot(file) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".obsidian")) || fs.existsSync(path.join(dir, ".git"))) return dir;
    if (dir === path.dirname(dir)) return path.dirname(file);
  }
}

const IMAGES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif" };

/** The picture a file shows as `src` (a path beside it): {type, abs}. */
function asset(doc, src) {
  const no = () => new Fail("Forbidden", `not a picture of this file: ${src}`);
  if (typeof src !== "string" || src.includes("\0") || /^[a-z][a-z0-9+.-]*:/i.test(src)) throw no();
  const type = IMAGES[path.extname(src).slice(1).toLowerCase()];
  if (!type) throw no();
  let real;
  try {
    real = fs.realpathSync(path.resolve(path.dirname(doc.file), src));
  } catch {
    throw new Fail("NotFound", src);
  }
  const root = fs.realpathSync(assetRoot(doc.file));
  // Inside that folder, and not in a hidden one (`.git`, `.obsidian`).
  if (!real.startsWith(root + path.sep) || path.relative(root, real).split(path.sep).some((s) => s.startsWith(".")) || !isFile(real)) throw no();
  return { type, abs: real };
}

// ---- comments ----
//
// `<home>/comments/<file id>/comments.json`: {file, next, threads}. A
// thread: {id, n, at, anchor, messages: [{from: "user" | "agent", text,
// at}], sent, taken, resolved}. `anchor`: {quote, lines: [first, last],
// heading} for a comment on selected text, null for one on the whole file.
// `sent`: the person handed it to an agent; `taken`: a waiting agent got it.
// A thread not sent is a note: it goes out with the next one that is sent.

function commentText(v) {
  const text = typeof v === "string" ? v.trim() : "";
  if (!text) throw new Fail("Invalid", "the comment has no text");
  if (text.length > MAX_COMMENT) throw new Fail("Invalid", "the comment is too long");
  return text;
}

function cleanAnchor(a) {
  if (a === null || a === undefined) return null;
  if (typeof a !== "object" || typeof a.quote !== "string" || !a.quote.trim()) throw new Fail("Invalid", "anchor");
  const lines = Array.isArray(a.lines) && a.lines.length === 2 && a.lines.every((n) => Number.isInteger(n) && n > 0) ? [a.lines[0], Math.max(a.lines[0], a.lines[1])] : null;
  return { quote: a.quote.trim().slice(0, MAX_QUOTE), lines, heading: typeof a.heading === "string" && a.heading ? a.heading.slice(0, 200) : null };
}

export class Comments {
  constructor() {
    this.root = path.join(homeDir(), "comments");
  }

  load(doc) {
    const v = readJson(path.join(this.root, doc.id, "comments.json"));
    if (v && Array.isArray(v.threads)) return { file: doc.file, next: Number(v.next) || v.threads.length + 1, threads: v.threads };
    return { file: doc.file, next: 1, threads: [] };
  }

  store(data) {
    atomicWrite(path.join(this.root, shortHash(data.file), "comments.json"), Buffer.from(JSON.stringify(data, null, 2)));
  }

  /** Every file's comments. */
  all() {
    let names = [];
    try {
      names = fs.readdirSync(this.root);
    } catch {
      return [];
    }
    const out = [];
    for (const name of names.sort()) {
      const v = readJson(path.join(this.root, name, "comments.json"));
      if (v && typeof v.file === "string" && Array.isArray(v.threads) && name === shortHash(v.file)) out.push(v);
    }
    return out;
  }

  find(id) {
    for (const data of this.all()) {
      const thread = data.threads.find((t) => t.id === id);
      if (thread) return { data, thread };
    }
    throw new Fail("NotFound", `no comment ${id}`);
  }

  /** Sending one sends the file's notes too: the open threads the person wrote last in and never sent. */
  sendNotes(data, at) {
    for (const t of data.threads) {
      if (!t.resolved && !t.sent && t.messages[t.messages.length - 1]?.from === "user") t.sent = at;
    }
  }

  add(doc, { anchor, text, send }) {
    const body = commentText(text);
    const where = cleanAnchor(anchor);
    const data = this.load(doc);
    const at = now();
    const thread = { id: crypto.randomBytes(5).toString("hex"), n: data.next, at, anchor: where, messages: [{ from: "user", text: body, at }], sent: send ? at : null, taken: null, resolved: false };
    data.next += 1;
    if (send) this.sendNotes(data, at);
    data.threads.push(thread);
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
      if (send) this.sendNotes(data, at);
    } else if (resolve) thread.resolved = true;
    this.store(data);
    return { data, thread };
  }

  send(id) {
    const { data, thread } = this.find(id);
    thread.sent = now();
    thread.taken = null;
    thread.resolved = false;
    this.sendNotes(data, thread.sent);
    this.store(data);
    return { data, thread };
  }

  resolve(id, resolved) {
    const { data, thread } = this.find(id);
    thread.resolved = Boolean(resolved);
    this.store(data);
    return { data, thread };
  }

  /** Every thread sent and not yet taken (of that file; null: of any), marked taken: [{data, thread}], a file's in their order. */
  take(doc) {
    const out = [];
    const at = now();
    for (const data of doc === null ? this.all() : [this.load(doc)]) {
      const mine = data.threads.filter((t) => t.sent && !t.taken && !t.resolved);
      if (mine.length === 0) continue;
      for (const thread of mine) {
        thread.taken = at;
        out.push({ data, thread });
      }
      this.store(data);
    }
    return out;
  }
}

/** A thread as an agent reads it. */
function describeThread(file, thread) {
  return {
    id: thread.id,
    n: thread.n,
    file,
    quote: thread.anchor?.quote ?? null,
    lines: thread.anchor?.lines ?? null,
    heading: thread.anchor?.heading ?? null,
    messages: thread.messages,
    sent: Boolean(thread.sent),
    resolved: thread.resolved,
    ...(isFile(file) ? {} : { note: "this file is gone" }),
  };
}

// ---- the server ----

const TYPES = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  md: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};
// What the page may load: itself, and the pictures this process hands it.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** The file a path names under the page's folder. `/` and `/d/…` (a file's address) are the page itself. */
function pageFile(urlPath) {
  const rel = urlPath.replace(/^\/+/, "");
  if (rel === "" || rel === "d" || rel.startsWith("d/")) return path.join(PAGE, "index.html");
  const parts = rel.split("/");
  if (parts.some((s) => s === "" || s === ".." || s.startsWith(".") || s.includes("\\"))) return null;
  return path.join(PAGE, ...parts);
}

/** Answers one request: {status, type, body}. `req`: {method, path, query (URLSearchParams), headers, body (Buffer)}. */
export async function handle(ctx, req) {
  const json = (status, value) => ({ status, type: TYPES.json, body: Buffer.from(JSON.stringify(value)) });
  const text = (status, s) => ({ status, type: TYPES.txt, body: Buffer.from(s) });
  const bad = (detail) => json(400, { code: "Invalid", detail });
  const h = (name) => req.headers[name];
  // Only a page this process served may ask (or no page: a command line):
  // this machine by name, at any port (a forwarded one may differ), and the
  // origin has to be that same address.
  if (!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(h("host") ?? "")) return text(403, "Host not allowed");
  if (h("origin") !== undefined && h("origin") !== `http://${h("host")}`) return text(403, "Origin not allowed");
  const site = h("sec-fetch-site");
  if (req.path.startsWith("/api/") && site !== undefined && site !== "same-origin" && site !== "none") return text(403, "not from the page");
  if (req.method !== "GET" && req.method !== "HEAD" && h(WRITE_HEADER) === undefined) return text(403, "not from the page");

  const docs = (ctx.docs ??= new Docs());
  const comments = (ctx.comments ??= new Comments());
  /** The agents waiting for a comment now: a key → {id (null: any file), until}. */
  const waiters = (ctx.waiters ??= new Map());
  const listening = (id) => [...waiters.values()].some((w) => w.until > Date.now() && (w.id === null || w.id === id));
  const body = () => {
    try {
      const v = JSON.parse(req.body.toString("utf8"));
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  const ms = () => {
    const n = Number(req.query.get("ms"));
    return Number.isFinite(n) && req.query.get("ms") !== null ? Math.min(WAIT_MS, Math.max(0, n)) : WAIT_MS;
  };
  try {
    const route = `${req.method} ${req.path}`;
    if (route === "GET /api/ping") return json(200, { ok: true, pid: process.pid, build: ctx.build, home: homeDir() });
    if (route === "GET /api/docs") return json(200, { docs: docs.list().map((d) => ({ ...d, open: comments.load(d).threads.filter((t) => !t.resolved).length })) });
    if (route === "GET /api/doc") {
      const id = req.query.get("id");
      if (id === null) return bad("id");
      return json(200, docs.read(id));
    }
    if (route === "GET /api/wait") {
      // Answers when the file is no longer at `rev` (with its text; `rev: null`: gone), or after a while with the same rev.
      const id = req.query.get("id");
      const seen = req.query.get("rev");
      if (id === null || seen === null) return bad("id and rev");
      const file = docs.get(id).file;
      const until = Date.now() + ms();
      let last;
      for (;;) {
        const st = fs.statSync(file, { throwIfNoEntry: false });
        if (!st) return json(200, { rev: null });
        const sig = `${st.size}:${st.mtimeMs}`;
        if (sig !== last) {
          const doc = docs.read(id);
          if (doc.rev !== seen) return json(200, { rev: doc.rev, text: doc.text });
          last = sig;
        }
        if (Date.now() >= until || req.gone?.()) return json(200, { rev: seen });
        await new Promise((r) => setTimeout(r, WAIT_STEP_MS));
      }
    }
    if (route === "GET /api/asset") {
      const id = req.query.get("id");
      const src = req.query.get("src");
      if (id === null || src === null) return bad("id and src");
      const a = asset(docs.get(id), src);
      return { status: 200, type: a.type, body: fs.readFileSync(a.abs) };
    }
    if (route === "GET /api/comments") {
      const id = req.query.get("id");
      if (id === null) return bad("id");
      return json(200, { threads: comments.load(docs.get(id)).threads, listening: listening(id) });
    }
    if (route === "POST /api/comments") {
      // What the page does: {op: "new", anchor, text, send?}, {op: "say", id, text, send?}, {op: "send", id}, {op: "resolve", id, resolved}.
      const id = req.query.get("id");
      if (id === null) return bad("id");
      const doc = docs.get(id);
      const b = body();
      if (!b) return bad("the body is not a JSON object");
      if (b.op === "new") return json(200, { thread: comments.add(doc, { anchor: b.anchor, text: b.text, send: b.send === true }) });
      if (typeof b.id !== "string") return bad("id");
      if (comments.find(b.id).data.file !== doc.file) throw new Fail("NotFound", `no comment ${b.id}`);
      if (b.op === "say") return json(200, { thread: comments.say(b.id, "user", b.text, { send: b.send === true }).thread });
      if (b.op === "send") return json(200, { thread: comments.send(b.id).thread });
      if (b.op === "resolve") return json(200, { thread: comments.resolve(b.id, b.resolved !== false).thread });
      return bad("op");
    }
    if (route === "POST /api/comments/take") {
      // An agent's wait: what the person sent ({thread, also: the others sent with it}), or {thread: null} after a while.
      // While it waits the page offers "Send to Agent".
      const id = req.query.get("id");
      const doc = id === null ? null : docs.get(id);
      const until = Date.now() + ms();
      const key = crypto.randomUUID();
      waiters.set(key, { id, until: until + LISTEN_GRACE_MS });
      try {
        for (;;) {
          const [first, ...rest] = comments.take(doc).map((g) => describeThread(g.data.file, g.thread));
          if (first) return json(200, { thread: first, also: rest });
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
    const f = pageFile(req.path);
    if (!f || !isFile(f)) return text(404, "not found\n");
    return { status: 200, type: TYPES[path.extname(f).slice(1)] ?? "application/octet-stream", body: fs.readFileSync(f) };
  } catch (e) {
    if (e instanceof Fail) return json(STATUS[e.code] ?? 500, { code: e.code, detail: e.message });
    return json(500, { code: "Io", detail: String(e?.message ?? e) });
  }
}

/** Which copy of the script and page this is: a process of another build is replaced by `open`. */
function ownBuild() {
  const files = [path.join(here, "md.mjs"), ...["index.html", "page.js", "doc.js", "page.css"].map((f) => path.join(PAGE, f))];
  return files.map((f) => Math.floor(fs.statSync(f, { throwIfNoEntry: false })?.mtimeMs ?? 0).toString(36)).join("-");
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

// `<home>/servers/main.json` holds {pid, url, port, root, kind: "md",
// startedAt}: the fields the other local pages (slides, design, board) note.
const stateFile = () => path.join(homeDir(), "servers", "main.json");
const logFile = () => path.join(homeDir(), "servers", "main.log");

async function ping(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(2000) });
    const v = res.ok ? await res.json() : null;
    return v?.ok === true ? v : null;
  } catch {
    return null;
  }
}

/** The process the state file names, when it answers as that pid for this home. */
async function running() {
  const state = readJson(stateFile());
  if (!state) return null;
  const who = await ping(state.port);
  return who && who.pid === state.pid && who.home === homeDir() ? { ...state, build: who.build } : null;
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
export async function serve(firstPort = DEFAULT_PORT) {
  const { server, port } = await listen(firstPort);
  const ctx = { build: ownBuild() };
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
  const url = `http://127.0.0.1:${port}/`;
  atomicWrite(stateFile(), Buffer.from(JSON.stringify({ pid: process.pid, url, port, root: homeDir(), kind: "md", startedAt: now() }, null, 2)));
  const bye = () => {
    if (readJson(stateFile())?.pid === process.pid) fs.rmSync(stateFile(), { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
  console.error(`tome-md: ${url}`);
  return { server, port, url };
}

async function stop() {
  const state = await running();
  if (!state) {
    fs.rmSync(stateFile(), { force: true });
    return { stopped: false, note: "it was not running" };
  }
  try {
    process.kill(state.pid, "SIGTERM");
  } catch {
    // already gone
  }
  await until(3000, async () => (await ping(state.port))?.pid !== state.pid);
  fs.rmSync(stateFile(), { force: true });
  return { stopped: true, pid: state.pid };
}

/** Starts the process when none of this build is running; returns its state. */
async function ensure(port) {
  let state = await running();
  if (state && state.build === ownBuild()) return { ...state, reused: true };
  if (state) await stop(); // an older build: replaced
  fs.mkdirSync(path.dirname(logFile()), { recursive: true, mode: 0o700 });
  const log = fs.openSync(logFile(), "a", 0o600);
  const child = spawn(process.execPath, [path.join(here, "md.mjs"), "serve", "--port", String(port)], { detached: true, stdio: ["ignore", log, log] });
  child.unref();
  fs.closeSync(log);
  if (!(await until(8000, async () => (state = await running()) !== null))) throw new Error(`it did not start: see ${logFile()}`);
  return { ...state, reused: false };
}

function fail(message) {
  console.error(`tome-md: ${message}`);
  process.exit(2);
}

const USAGE = `tome-md: Markdown files in a page of this machine, with comments an agent answers

md.mjs open [FILE]      start it if needed and open FILE in it; prints {url, …} (no FILE: the list of opened files)
md.mjs list             the opened files: [{id, file, url, comments}]
md.mjs close FILE       take FILE off the list (the file stays)
md.mjs stop             end it
md.mjs serve            run it here, in the foreground

md.mjs comments [FILE]             the open comments (of that file; none: of every file); --all: the resolved ones too
md.mjs comments [FILE] --wait      wait until the person sends a comment to the agent; prints that thread and ends
md.mjs comment-reply ID TEXT       reply to a comment (TEXT "-": from stdin); --resolve also closes it
md.mjs comment-resolve ID          close a comment; --reopen opens it again

--port N      the first port to try (default ${DEFAULT_PORT})
`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || ["help", "--help", "-h"].includes(command)) return void process.stdout.write(USAGE);
  let port = DEFAULT_PORT;
  const words = [];
  const flags = new Set();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (["--all", "--wait", "--resolve", "--reopen"].includes(a)) flags.add(a.slice(2));
    else if (a === "--port") {
      const v = rest[++i];
      if (v === undefined || !/^\d+$/.test(v)) fail("--port is a number");
      port = Number(v);
    } else if (a.startsWith("--")) fail(`unknown option ${a}`);
    else words.push(a);
  }
  if (words.length > (command === "comment-reply" ? 2 : 1)) fail("one file at most (quote a path that has spaces)");
  const print = (v) => console.log(JSON.stringify(v, null, 2));
  const docs = new Docs();
  const comments = new Comments();
  const me = path.join(here, "md.mjs");
  /** The opened file a path names. */
  const opened = (file) => {
    let real = null;
    try {
      real = fs.realpathSync(file);
    } catch {
      // gone, or never there
    }
    const doc = docs.list().find((d) => d.file === real);
    return doc ?? fail(`not an opened file: ${file} (open it first)`);
  };
  try {
    if (command === "serve") return void (await serve(port));
    if (command === "stop") return print(await stop());
    if (command === "list") {
      const state = await running();
      return print(docs.list().map((d) => ({ id: d.id, file: d.file, url: state ? `${state.url}d/${d.id}` : null, comments: comments.load(d).threads.filter((t) => !t.resolved).length })));
    }
    if (command === "close") {
      if (words.length === 0) fail("close needs a file");
      const doc = opened(words[0]);
      docs.remove(doc.id);
      return print({ closed: doc.file });
    }
    if (command === "open") {
      const doc = words.length ? docs.add(words[0]) : null;
      const state = await ensure(port);
      const out = { url: state.url, pid: state.pid, reused: state.reused, stop: `node ${JSON.stringify(me)} stop` };
      return print(doc ? { ...out, url: `${state.url}d/${doc.id}`, file: doc.file, id: doc.id } : out);
    }
    if (command === "comments") {
      const doc = words.length ? opened(words[0]) : null;
      if (!flags.has("wait")) {
        const out = [];
        for (const data of doc ? [comments.load(doc)] : comments.all()) {
          for (const t of data.threads) if (flags.has("all") || !t.resolved) out.push(describeThread(data.file, t));
        }
        return print(out);
      }
      // Until a comment is sent: the page shows an agent as listening while this asks.
      const again = `node ${JSON.stringify(me)} comments${doc ? " " + JSON.stringify(doc.file) : ""} --wait`;
      for (;;) {
        try {
          const state = await ensure(port);
          const query = new URLSearchParams(doc ? { id: doc.id } : {});
          const res = await fetch(`${state.url}api/comments/take?${query}`, { method: "POST", headers: { [WRITE_HEADER]: "1" }, signal: AbortSignal.timeout(WAIT_MS + 15000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { thread, also } = await res.json();
          if (thread) return print({ ...thread, also: also ?? [], next: again });
        } catch {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    if (command === "comment-reply" || command === "comment-resolve") {
      if (words.length === 0) fail(`${command} needs a comment's id`);
      let done;
      if (command === "comment-resolve") done = comments.resolve(words[0], !flags.has("reopen"));
      else {
        if (words.length < 2) fail("comment-reply needs the text (or - for stdin)");
        done = comments.say(words[0], "agent", words[1] === "-" ? fs.readFileSync(0, "utf8") : words[1], { resolve: flags.has("resolve") });
      }
      return print(describeThread(done.data.file, done.thread));
    }
  } catch (e) {
    fail(e.message);
  }
  fail(`unknown command ${command}\n\n${USAGE}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === path.join(here, "md.mjs")) {
  main(process.argv.slice(2)).catch((e) => fail(e?.message ?? String(e)));
}
