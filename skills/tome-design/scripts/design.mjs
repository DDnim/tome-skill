#!/usr/bin/env node
// tome-design: designs (a folder of artboards, each a plain HTML file) seen
// side by side on a canvas in a page of this machine, with comments an agent
// answers. One process serves the page (./page) and the designs that were
// opened with `open` or made with `new`, on 127.0.0.1; an agent starts it
// and hands the address to the person. No dependencies: Node 20+.
//
// It reads the opened design folders and writes nothing in them but a new
// design's `design.json` (`new`). Its own notes are in `~/.tome-design`:
// which designs are open, the running process, the comments.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 4760;
export const INDEX = "design.json";
const PORT_TRIES = 30;
const MAX_BODY = 1024 * 1024;
const MAX_FILE = 32 * 1024 * 1024;
const MAX_INDEX = 1024 * 1024;
const MAX_COMMENT = 8000;
const MAX_TEXT = 600;
const MAX_HTML = 1200;
const MAX_BOARDS = 200;
const MAX_NOTES = 500;
const WRITE_HEADER = "x-tome-design";
const WAIT_MS = 25000;
const WAIT_STEP_MS = 250;
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
const isDir = (p) => fs.statSync(p, { throwIfNoEntry: false })?.isDirectory() === true;
const shortHash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const now = () => new Date().toISOString();
const num = (v) => typeof v === "number" && Number.isFinite(v);

function homeDir() {
  return process.env.TOME_DESIGN_HOME || path.join(os.homedir(), ".tome-design");
}

function atomicWrite(file, bytes, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(tmp, bytes, { flag: "wx", mode });
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

// ---- a design's files ----
//
// A design is a folder. `design.json` lists its artboards and notes:
// {title, boards: [{file, title?, x, y, w, h}], notes: [{id, x, y, text, kind?, w?}]}.
// Each board is an HTML file in the folder; pictures, fonts, styles and
// scripts it links to sit beside it. The page shows only files inside the
// folder, never a hidden one.

/** A path inside a design as written in its index or asked for by the page: its parts, or null when it may not name a file. */
export function relParts(rel) {
  if (typeof rel !== "string" || !rel || rel.length > 400 || rel.includes("\0") || rel.includes("\\") || rel.startsWith("/")) return null;
  const parts = rel.split("/");
  if (parts.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) return null;
  return parts;
}

/** The real file `rel` names inside `root`, or null. */
function inside(root, rel) {
  const parts = relParts(rel);
  if (!parts) return null;
  let real;
  try {
    real = fs.realpathSync(path.join(root, ...parts));
  } catch {
    return null;
  }
  if (!real.startsWith(root + path.sep) || !isFile(real)) return null;
  return path.relative(root, real).split(path.sep).some((s) => s.startsWith(".")) ? null : real;
}

const isBoardFile = (rel) => /\.html?$/i.test(rel);

/** What the index says, made safe to show, and what is wrong with it: {title, boards, notes, problems}. */
export function readIndex(root) {
  const problems = [];
  const file = path.join(root, INDEX);
  let bytes = null;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return { title: path.basename(root), boards: [], notes: [], problems: [{ file: INDEX, problem: `there is no ${INDEX}` }], bytes: null };
  }
  let v = null;
  if (bytes.length > MAX_INDEX) problems.push({ file: INDEX, problem: "it is larger than 1 MB" });
  else {
    try {
      v = JSON.parse(bytes.toString("utf8"));
    } catch (e) {
      problems.push({ file: INDEX, problem: `it is not JSON: ${e.message}` });
    }
  }
  if (v !== null && (typeof v !== "object" || Array.isArray(v))) {
    problems.push({ file: INDEX, problem: "it is not a JSON object" });
    v = null;
  }
  v ??= {};
  const title = typeof v.title === "string" && v.title.trim() ? v.title.trim().slice(0, 200) : path.basename(root);
  if (typeof v.title !== "string" || !v.title.trim()) problems.push({ file: INDEX, problem: "`title` is missing: the design's name, as the person says it" });
  const boards = [];
  const seen = new Set();
  const list = Array.isArray(v.boards) ? v.boards : [];
  if (v.boards !== undefined && !Array.isArray(v.boards)) problems.push({ file: INDEX, problem: "`boards` is a list: [{file, x, y, w, h}]" });
  for (const [i, b] of list.slice(0, MAX_BOARDS).entries()) {
    const where = `boards[${i}]`;
    if (!b || typeof b !== "object") {
      problems.push({ file: INDEX, problem: `${where} is not an object` });
      continue;
    }
    if (!relParts(b.file) || !isBoardFile(b.file)) {
      problems.push({ file: INDEX, problem: `${where}.file is a path inside the folder ending .html, without .. or hidden parts` });
      continue;
    }
    if (seen.has(b.file)) {
      problems.push({ file: INDEX, problem: `${where}: ${b.file} is listed twice` });
      continue;
    }
    seen.add(b.file);
    const out = { file: b.file, title: typeof b.title === "string" && b.title.trim() ? b.title.trim().slice(0, 200) : null, x: 0, y: 0, w: 1280, h: 800, exists: inside(root, b.file) !== null };
    for (const k of ["x", "y"]) {
      if (num(b[k])) out[k] = b[k];
      else problems.push({ file: INDEX, problem: `${where}.${k} is a number (px on the canvas)` });
    }
    for (const k of ["w", "h"]) {
      if (num(b[k]) && b[k] >= 40 && b[k] <= 8000) out[k] = b[k];
      else problems.push({ file: INDEX, problem: `${where}.${k} is a number from 40 to 8000 (the frame's size in px)` });
    }
    if (!out.exists) problems.push({ file: b.file, problem: `${where} names it, and there is no such file` });
    boards.push(out);
  }
  if (list.length > MAX_BOARDS) problems.push({ file: INDEX, problem: `more than ${MAX_BOARDS} boards` });
  // Boards side by side must not cover each other.
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const a = boards[i];
      const b = boards[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) problems.push({ file: INDEX, problem: `${a.file} and ${b.file} overlap on the canvas` });
    }
  }
  const notes = [];
  const ids = new Set();
  for (const [i, n] of (Array.isArray(v.notes) ? v.notes : []).slice(0, MAX_NOTES).entries()) {
    const where = `notes[${i}]`;
    if (!n || typeof n !== "object" || typeof n.text !== "string" || !num(n.x) || !num(n.y)) {
      problems.push({ file: INDEX, problem: `${where} needs x, y and text` });
      continue;
    }
    const id = typeof n.id === "string" && n.id ? n.id.slice(0, 60) : `note-${i + 1}`;
    if (ids.has(id)) problems.push({ file: INDEX, problem: `${where}: the id ${id} is used twice` });
    ids.add(id);
    notes.push({ id, x: n.x, y: n.y, text: n.text.slice(0, 4000), kind: n.kind === "title" ? "title" : "sticky", w: num(n.w) && n.w >= 60 && n.w <= 4000 ? n.w : n.kind === "title" ? null : 260 });
  }
  if (v.notes !== undefined && !Array.isArray(v.notes)) problems.push({ file: INDEX, problem: "`notes` is a list: [{id, x, y, text, kind?}]" });
  return { title, boards, notes, problems, bytes };
}

/** HTML files in the folder (not hidden, two levels deep at most) that the index does not list. */
function unlisted(root, listed) {
  const out = [];
  const walk = (dir, depth) => {
    let names = [];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      if (d.name.startsWith(".") || d.name === "node_modules") continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (d.isFile() && isBoardFile(d.name)) {
        const rel = path.relative(root, p).split(path.sep).join("/");
        if (!listed.has(rel)) out.push(rel);
      }
    }
  };
  walk(root, 0);
  return out.sort();
}

/** What is wrong with one board's HTML, by reading it (whether it runs and how it looks is not checked). */
export function htmlProblems(text) {
  const out = [];
  if (!/<html[\s>]/i.test(text) || !/<body[\s>]/i.test(text)) out.push("it is not a whole page: write <!doctype html>, <html>, <head> and <body>");
  if (!/<meta[^>]+charset/i.test(text)) out.push('no <meta charset="utf-8"> in <head>');
  if (/<(iframe|object|embed)[\s>]/i.test(text)) out.push("<iframe>, <object> and <embed> do not show here");
  // A link (<a href>) may go anywhere: it is not loaded. Only what the page loads counts.
  const loads = [...text.matchAll(/<(?:img|script|link|source|video|audio)\b[^>]*\b(?:src|href)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]+)/gi)].map((m) => m[1]).filter((u) => !/^(?:https?:)?\/\/fonts\.(?:googleapis|gstatic)\.com\//i.test(u));
  if (loads.length) out.push(`it loads from the web, which the page blocks (only Google Fonts may load): ${[...new Set(loads)].slice(0, 3).join(", ")}; put the file in the folder and link it relatively`);
  if (/url\(\s*["']?(?:https?:)?\/\/(?!fonts\.(?:googleapis|gstatic)\.com)/i.test(text)) out.push("a CSS url() loads from the web, which the page blocks: put the file in the folder");
  return out;
}

/** Everything `check` reports for a design: [{file, problem}]. */
export function checkDesign(root) {
  const index = readIndex(root);
  const problems = [...index.problems];
  for (const b of index.boards) {
    const real = inside(root, b.file);
    if (!real) continue;
    let text = "";
    try {
      text = fs.readFileSync(real, "utf8");
    } catch {
      continue;
    }
    for (const p of htmlProblems(text)) problems.push({ file: b.file, problem: p });
  }
  for (const rel of unlisted(root, new Set(index.boards.map((b) => b.file)))) problems.push({ file: rel, problem: `an HTML file that ${INDEX} does not list: add it to boards (or move it out, if it is not a board)` });
  if (index.boards.length === 0 && index.bytes !== null) problems.push({ file: INDEX, problem: "no boards yet" });
  return problems;
}

/** A board's revision: its bytes. The rest of the folder (pictures, styles) counts as one. */
function revs(root, boards) {
  const out = {};
  for (const b of boards) {
    const real = inside(root, b.file);
    out[b.file] = real ? shortHash(fs.readFileSync(real)) : null;
  }
  return out;
}

/** The size and time of every other file the boards may load, as one signature (cheap: no reading). */
function assetSig(root) {
  const parts = [];
  const walk = (dir, depth) => {
    let names = [];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (d.name.startsWith(".") || d.name === "node_modules") continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (d.isFile() && !isBoardFile(d.name) && d.name !== INDEX) {
        const st = fs.statSync(p, { throwIfNoEntry: false });
        if (st) parts.push(`${path.relative(root, p)}:${st.size}:${Math.floor(st.mtimeMs)}`);
      }
    }
  };
  walk(root, 0);
  return shortHash(parts.join("\n"));
}

/** The opened designs. */
export class Designs {
  constructor() {
    this.note = path.join(homeDir(), "designs.json");
  }

  entries() {
    const v = readJson(this.note);
    return Array.isArray(v) ? v.filter((e) => e && typeof e.root === "string") : [];
  }

  /** The opened designs whose folder still exists, the last opened first: [{id, root, title, boards, mtime}]. */
  list() {
    const out = [];
    for (const e of this.entries()) {
      if (!isDir(e.root)) continue;
      const st = fs.statSync(path.join(e.root, INDEX), { throwIfNoEntry: false });
      const index = readIndex(e.root);
      out.push({ id: shortHash(e.root), root: e.root, title: index.title, boards: index.boards.length, mtime: Math.floor(st?.mtimeMs ?? 0), openedAt: e.openedAt });
    }
    return out.sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0));
  }

  /** The folder a path names: the folder itself, or the folder of its design.json. */
  static rootOf(p) {
    let real;
    try {
      real = fs.realpathSync(p);
    } catch {
      throw new Fail("NotFound", `no such folder: ${p}`);
    }
    if (isFile(real) && path.basename(real) === INDEX) real = path.dirname(real);
    if (!isDir(real)) throw new Fail("Invalid", `not a design's folder: ${p}`);
    if (!isFile(path.join(real, INDEX))) {
      if (isFile(path.join(real, "project", "canvas.json"))) throw new Fail("Invalid", `${p} is a claude-design canvas (project/canvas.json), not a tome-design; make a new design with \`new\``);
      throw new Fail("NotFound", `no ${INDEX} in ${p}: make one with \`new\``);
    }
    return real;
  }

  /** Puts a design on the list (again: moves it to the front). */
  add(p) {
    const root = Designs.rootOf(p);
    const rest = this.entries().filter((e) => e.root !== root);
    atomicWrite(this.note, Buffer.from(JSON.stringify([{ root, openedAt: now() }, ...rest], null, 2)));
    return this.get(shortHash(root));
  }

  remove(id) {
    atomicWrite(this.note, Buffer.from(JSON.stringify(this.entries().filter((e) => shortHash(e.root) !== id), null, 2)));
  }

  get(id) {
    const d = this.list().find((x) => x.id === id);
    if (!d) throw new Fail("NotFound", `no opened design ${id}`);
    return d;
  }

  /** The design as the page draws it: its index, each board's revision, and one revision of the whole. */
  read(id) {
    const d = this.get(id);
    const index = readIndex(d.root);
    const boardRevs = revs(d.root, index.boards);
    const assets = assetSig(d.root);
    const rev = shortHash([index.bytes ? shortHash(index.bytes) : "-", assets, ...index.boards.map((b) => `${b.file}=${boardRevs[b.file]}`)].join("\n"));
    return { id: d.id, root: d.root, title: index.title, boards: index.boards.map((b) => ({ ...b, rev: boardRevs[b.file] })), notes: index.notes, problems: index.problems.length, assets, rev };
  }
}

/** Makes a new design's folder with an index and no boards: the folder. */
export function makeDesign(title, parent) {
  const name = title.trim().replace(/[\/\\:*?"<>|\0]+/g, "-").replace(/\s+/g, " ").replace(/^[.\s-]+|[\s-]+$/g, "").slice(0, 80) || "design";
  fs.mkdirSync(parent, { recursive: true });
  let root = path.join(parent, name);
  for (let n = 2; fs.existsSync(root); n++) root = path.join(parent, `${name} ${n}`);
  fs.mkdirSync(root);
  atomicWrite(path.join(root, INDEX), Buffer.from(JSON.stringify({ title: title.trim(), boards: [], notes: [] }, null, 2) + "\n"), 0o644);
  return fs.realpathSync(root);
}

// ---- comments ----
//
// `<home>/comments/<design id>/comments.json`: {root, next, threads}. A
// thread: {id, n, at, anchor, messages: [{from: "user" | "agent", text,
// at}], sent, taken, resolved}. `anchor` (null: the whole design):
// {board, rect: [x, y, w, h] in the board's px, element (the one clicked)
// or null, elements (the ones a dragged area holds)}. `sent`: the person
// handed it to an agent; `taken`: a waiting agent got it. A thread not sent
// is a note: it goes out with the next one that is sent.

function commentText(v) {
  const text = typeof v === "string" ? v.trim() : "";
  if (!text) throw new Fail("Invalid", "the comment has no text");
  if (text.length > MAX_COMMENT) throw new Fail("Invalid", "the comment is too long");
  return text;
}

function cleanElement(e) {
  if (!e || typeof e !== "object" || typeof e.path !== "string") return null;
  const s = (v, n) => (typeof v === "string" && v ? v.slice(0, n) : null);
  return { path: e.path.slice(0, 400), tag: s(e.tag, 40), text: s(e.text, MAX_TEXT), html: s(e.html, MAX_HTML) };
}

export function cleanAnchor(a) {
  if (a === null || a === undefined) return null;
  if (typeof a !== "object" || !relParts(a.board) || !isBoardFile(a.board)) throw new Fail("Invalid", "anchor");
  const rect = Array.isArray(a.rect) && a.rect.length === 4 && a.rect.every(num) ? a.rect.map((n) => Math.round(n)) : null;
  if (!rect) throw new Fail("Invalid", "anchor.rect");
  return {
    board: a.board,
    rect,
    element: cleanElement(a.element),
    elements: Array.isArray(a.elements) ? a.elements.slice(0, 20).map(cleanElement).filter(Boolean).map(({ html, ...rest }) => rest) : [],
  };
}

export class Comments {
  constructor() {
    this.root = path.join(homeDir(), "comments");
  }

  load(d) {
    const v = readJson(path.join(this.root, d.id, "comments.json"));
    if (v && Array.isArray(v.threads)) return { root: d.root, next: Number(v.next) || v.threads.length + 1, threads: v.threads };
    return { root: d.root, next: 1, threads: [] };
  }

  store(data) {
    atomicWrite(path.join(this.root, shortHash(data.root), "comments.json"), Buffer.from(JSON.stringify(data, null, 2)));
  }

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
      if (v && typeof v.root === "string" && Array.isArray(v.threads) && name === shortHash(v.root)) out.push(v);
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

  /** Sending one sends the design's notes too: the open threads the person wrote last in and never sent. */
  sendNotes(data, at) {
    for (const t of data.threads) {
      if (!t.resolved && !t.sent && t.messages[t.messages.length - 1]?.from === "user") t.sent = at;
    }
  }

  add(d, { anchor, text, send }) {
    const body = commentText(text);
    const where = cleanAnchor(anchor);
    const data = this.load(d);
    const at = now();
    const thread = { id: crypto.randomBytes(5).toString("hex"), n: data.next, at, anchor: where, messages: [{ from: "user", text: body, at }], sent: send ? at : null, taken: null, resolved: false };
    data.next += 1;
    if (send) this.sendNotes(data, at);
    data.threads.push(thread);
    this.store(data);
    return thread;
  }

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

  /** Every thread sent and not yet taken (of that design; null: of any), marked taken: [{data, thread}]. */
  take(d) {
    const out = [];
    const at = now();
    for (const data of d === null ? this.all() : [this.load(d)]) {
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
function describeThread(root, thread) {
  const a = thread.anchor;
  return {
    id: thread.id,
    n: thread.n,
    design: root,
    board: a?.board ?? null,
    file: a ? path.join(root, ...a.board.split("/")) : path.join(root, INDEX),
    rect: a?.rect ?? null,
    element: a?.element ?? null,
    elements: a?.elements ?? [],
    messages: thread.messages,
    sent: Boolean(thread.sent),
    resolved: thread.resolved,
    ...(isDir(root) ? {} : { note: "this design's folder is gone" }),
  };
}

// ---- the server ----

const TYPES = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};
// The page: itself only.
const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
// A board: its own folder and Google Fonts, in a sandbox of its own (another
// origin), so its scripts can reach neither the page nor this server's calls.
const BOARD_CSP =
  "sandbox allow-scripts; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
const PROBE_TAG = '<script src="/probe.js"></script>';

/** The file a path names under the page's folder. `/` and `/d/…` (a design's address) are the page itself. */
function pageFile(urlPath) {
  const rel = urlPath.replace(/^\/+/, "");
  if (rel === "" || rel === "d" || rel.startsWith("d/")) return path.join(PAGE, "index.html");
  const parts = relParts(rel);
  return parts ? path.join(PAGE, ...parts) : null;
}

/** A board's HTML with the page's probe in it (it tells the page what was clicked, and how tall the board is). */
export function withProbe(html) {
  const at = html.search(/<\/body\s*>/i);
  return at === -1 ? html + PROBE_TAG : html.slice(0, at) + PROBE_TAG + html.slice(at);
}

/** Answers one request: {status, type, body, headers?}. `req`: {method, path, query (URLSearchParams), headers, body (Buffer)}. */
export async function handle(ctx, req) {
  const json = (status, value) => ({ status, type: TYPES.json, body: Buffer.from(JSON.stringify(value)) });
  const text = (status, s) => ({ status, type: TYPES.txt, body: Buffer.from(s) });
  const bad = (detail) => json(400, { code: "Invalid", detail });
  const h = (name) => req.headers[name];
  // Only a page this process served may ask (or no page: a command line):
  // this machine by name, at any port (a forwarded one may differ), and the
  // origin has to be that same address. A board runs in a sandbox: its
  // origin is not the page's, so it can not call.
  if (!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(h("host") ?? "")) return text(403, "Host not allowed");
  if (h("origin") !== undefined && h("origin") !== `http://${h("host")}`) return text(403, "Origin not allowed");
  const site = h("sec-fetch-site");
  if (req.path.startsWith("/api/") && site !== undefined && site !== "same-origin" && site !== "none") return text(403, "not from the page");
  if (req.method !== "GET" && req.method !== "HEAD" && h(WRITE_HEADER) === undefined) return text(403, "not from the page");

  const designs = (ctx.designs ??= new Designs());
  const comments = (ctx.comments ??= new Comments());
  /** The agents waiting for a comment now: a key → {id (null: any design), until}. */
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
    if (route === "GET /api/designs") return json(200, { designs: designs.list().map((d) => ({ ...d, open: comments.load(d).threads.filter((t) => !t.resolved).length })) });
    if (route === "GET /api/design") {
      const id = req.query.get("id");
      if (id === null) return bad("id");
      return json(200, designs.read(id));
    }
    if (route === "GET /api/wait") {
      // Answers when the design is no longer at `rev` (the design as it is now; `rev: null`: gone), or after a while with the same rev.
      const id = req.query.get("id");
      const seen = req.query.get("rev");
      if (id === null || seen === null) return bad("id and rev");
      const until = Date.now() + ms();
      for (;;) {
        let d;
        try {
          d = designs.read(id);
        } catch (e) {
          if (e instanceof Fail && e.code === "NotFound") return json(200, { rev: null });
          throw e;
        }
        if (d.rev !== seen) return json(200, d);
        if (Date.now() >= until || req.gone?.()) return json(200, { rev: seen });
        await new Promise((r) => setTimeout(r, WAIT_STEP_MS));
      }
    }
    if (route === "GET /api/comments") {
      const id = req.query.get("id");
      if (id === null) return bad("id");
      return json(200, { threads: comments.load(designs.get(id)).threads, listening: listening(id) });
    }
    if (route === "POST /api/comments") {
      // What the page does: {op: "new", anchor, text, send?}, {op: "say", id, text, send?}, {op: "send", id}, {op: "resolve", id, resolved}.
      const id = req.query.get("id");
      if (id === null) return bad("id");
      const d = designs.get(id);
      const b = body();
      if (!b) return bad("the body is not a JSON object");
      if (b.op === "new") return json(200, { thread: comments.add(d, { anchor: b.anchor, text: b.text, send: b.send === true }) });
      if (typeof b.id !== "string") return bad("id");
      if (comments.find(b.id).data.root !== d.root) throw new Fail("NotFound", `no comment ${b.id}`);
      if (b.op === "say") return json(200, { thread: comments.say(b.id, "user", b.text, { send: b.send === true }).thread });
      if (b.op === "send") return json(200, { thread: comments.send(b.id).thread });
      if (b.op === "resolve") return json(200, { thread: comments.resolve(b.id, b.resolved !== false).thread });
      return bad("op");
    }
    if (route === "POST /api/comments/take") {
      // An agent's wait: what the person sent ({thread, also: the others sent with it}), or {thread: null} after a while.
      const id = req.query.get("id");
      const d = id === null ? null : designs.get(id);
      const until = Date.now() + ms();
      const key = crypto.randomUUID();
      waiters.set(key, { id, until: until + LISTEN_GRACE_MS });
      try {
        for (;;) {
          const [first, ...rest] = comments.take(d).map((g) => describeThread(g.data.root, g.thread));
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
    const fm = req.path.match(/^\/f\/([0-9a-f]{16})\/(.+)$/);
    if (fm) {
      // A design's own file: a board (with the probe), or what a board loads.
      const d = designs.get(fm[1]);
      const real = inside(d.root, fm[2]);
      if (!real) return text(404, "not found\n");
      if (fs.statSync(real).size > MAX_FILE) return text(413, "too large\n");
      const ext = path.extname(real).slice(1).toLowerCase();
      const type = TYPES[ext] ?? "application/octet-stream";
      const headers = { "Content-Security-Policy": BOARD_CSP, "X-Frame-Options": "SAMEORIGIN" };
      if (ext === "html" || ext === "htm") return { status: 200, type, headers, body: Buffer.from(withProbe(fs.readFileSync(real, "utf8"))) };
      return { status: 200, type, headers, body: fs.readFileSync(real) };
    }
    const f = pageFile(req.path);
    if (!f || !isFile(f)) return text(404, "not found\n");
    // The probe runs inside the boards.
    const headers = path.basename(f) === "probe.js" ? { "X-Frame-Options": "SAMEORIGIN" } : {};
    return { status: 200, type: TYPES[path.extname(f).slice(1)] ?? "application/octet-stream", body: fs.readFileSync(f), headers };
  } catch (e) {
    if (e instanceof Fail) return json(STATUS[e.code] ?? 500, { code: e.code, detail: e.message });
    return json(500, { code: "Io", detail: String(e?.message ?? e) });
  }
}

/** Which copy of the script and page this is: a process of another build is replaced by `open`. */
function ownBuild() {
  let names = [];
  try {
    names = fs.readdirSync(PAGE).sort();
  } catch {
    // no page
  }
  const files = [path.join(here, "design.mjs"), ...names.map((f) => path.join(PAGE, f))];
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

// `<home>/servers/main.json` holds {pid, url, port, root, kind: "design",
// startedAt}: the fields the other local pages (slides, design, board, md) note.
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
        "Content-Security-Policy": PAGE_CSP,
        ...(out.headers ?? {}),
      });
      res.end(req.method === "HEAD" ? undefined : out.body);
    });
  });
  const url = `http://127.0.0.1:${port}/`;
  atomicWrite(stateFile(), Buffer.from(JSON.stringify({ pid: process.pid, url, port, root: homeDir(), kind: "design", startedAt: now() }, null, 2)));
  const bye = () => {
    if (readJson(stateFile())?.pid === process.pid) fs.rmSync(stateFile(), { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
  console.error(`tome-design: ${url}`);
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
  const child = spawn(process.execPath, [path.join(here, "design.mjs"), "serve", "--port", String(port)], { detached: true, stdio: ["ignore", log, log] });
  child.unref();
  fs.closeSync(log);
  if (!(await until(8000, async () => (state = await running()) !== null))) throw new Error(`it did not start: see ${logFile()}`);
  return { ...state, reused: false };
}

function fail(message) {
  console.error(`tome-design: ${message}`);
  process.exit(2);
}

const USAGE = `tome-design: designs (artboards in plain HTML) on a canvas in a page of this machine, with comments an agent answers

design.mjs new TITLE [--in DIR]    make a design's folder DIR/TITLE (default DIR: ./designs) with an empty ${INDEX}, open it; prints {url, root, index, …}
design.mjs open [FOLDER]           start it if needed and open the design in FOLDER; prints {url, …} (no FOLDER: the list of opened designs)
           --board FILE            the address of that board, shown alone
design.mjs list                    the opened designs: [{id, root, title, boards, url, comments}]
design.mjs check FOLDER            what is wrong with the design's files: {problems, issues}; exits 1 while there are any
design.mjs close FOLDER            take it off the list (the files stay)
design.mjs stop                    end it
design.mjs serve                   run it here, in the foreground

design.mjs comments [FOLDER]           the open comments (of that design; none: of every design); --all: the resolved ones too
design.mjs comments [FOLDER] --wait    wait until the person sends a comment to the agent; prints that thread and ends
design.mjs comment-reply ID TEXT       reply to a comment (TEXT "-": from stdin); --resolve also closes it
design.mjs comment-resolve ID          close a comment; --reopen opens it again

--port N      the first port to try (default ${DEFAULT_PORT})
`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || ["help", "--help", "-h"].includes(command)) return void process.stdout.write(USAGE);
  let port = DEFAULT_PORT;
  let parent = null;
  let board = null;
  const words = [];
  const flags = new Set();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const value = (name) => {
      const v = rest[++i];
      if (v === undefined) fail(`${name} needs a value`);
      return v;
    };
    if (["--all", "--wait", "--resolve", "--reopen"].includes(a)) flags.add(a.slice(2));
    else if (a === "--port") {
      const v = value(a);
      if (!/^\d+$/.test(v)) fail("--port is a number");
      port = Number(v);
    } else if (a === "--in") parent = path.resolve(value(a));
    else if (a === "--board") board = value(a);
    else if (a.startsWith("--")) fail(`unknown option ${a}`);
    else words.push(a);
  }
  if (words.length > (command === "comment-reply" ? 2 : 1)) fail("one folder at most (quote a path that has spaces)");
  const print = (v) => console.log(JSON.stringify(v, null, 2));
  const designs = new Designs();
  const comments = new Comments();
  const me = path.join(here, "design.mjs");
  const opened = (p) => {
    const root = Designs.rootOf(p);
    return designs.list().find((d) => d.root === root) ?? fail(`not an opened design: ${p} (open it first)`);
  };
  const urlOf = (base, d, b) => `${base}d/${d.id}${b ? `?b=${encodeURIComponent(b)}` : ""}`;
  try {
    if (command === "serve") return void (await serve(port));
    if (command === "stop") return print(await stop());
    if (command === "list") {
      const state = await running();
      return print(designs.list().map((d) => ({ id: d.id, root: d.root, title: d.title, boards: d.boards, url: state ? urlOf(state.url, d) : null, comments: comments.load(d).threads.filter((t) => !t.resolved).length })));
    }
    if (command === "check") {
      if (words.length === 0) fail("check needs a design's folder");
      const issues = checkDesign(Designs.rootOf(words[0]));
      print({ problems: issues.length, issues });
      process.exit(issues.length ? 1 : 0);
    }
    if (command === "close") {
      if (words.length === 0) fail("close needs a design's folder");
      const d = opened(words[0]);
      designs.remove(d.id);
      return print({ closed: d.root });
    }
    if (command === "new" || command === "open") {
      let d = null;
      if (command === "new") {
        if (words.length === 0 || !words[0].trim()) fail("new needs a title");
        d = designs.add(makeDesign(words[0], parent ?? path.resolve("designs")));
      } else if (words.length) d = designs.add(words[0]);
      if (board !== null && (!d || !readIndex(d.root).boards.some((b) => b.file === board))) fail(`no board ${board} in that design`);
      const state = await ensure(port);
      const out = { url: state.url, pid: state.pid, reused: state.reused, stop: `node ${JSON.stringify(me)} stop` };
      if (!d) return print(out);
      return print({ ...out, url: urlOf(state.url, d, board), id: d.id, title: d.title, root: d.root, index: path.join(d.root, INDEX), boards: d.boards });
    }
    if (command === "comments") {
      const d = words.length ? opened(words[0]) : null;
      if (!flags.has("wait")) {
        const out = [];
        for (const data of d ? [comments.load(d)] : comments.all()) {
          for (const t of data.threads) if (flags.has("all") || !t.resolved) out.push(describeThread(data.root, t));
        }
        return print(out);
      }
      const again = `node ${JSON.stringify(me)} comments${d ? " " + JSON.stringify(d.root) : ""} --wait`;
      for (;;) {
        try {
          const state = await ensure(port);
          const query = new URLSearchParams(d ? { id: d.id } : {});
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
      return print(describeThread(done.data.root, done.thread));
    }
  } catch (e) {
    fail(e.message);
  }
  fail(`unknown command ${command}\n\n${USAGE}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === path.join(here, "design.mjs")) {
  main(process.argv.slice(2)).catch((e) => fail(e?.message ?? String(e)));
}
