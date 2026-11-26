#!/usr/bin/env node
// tome-slides: slide decks (a folder of slides, each a plain HTML file) shown
// in a page of this machine: the slides in a row down the side, one large,
// its speaker notes under it, a presentation full screen with a speaker
// view, and comments an agent answers. One process serves the page (./page)
// and the decks that were opened with `open` or made with `new`, on
// 127.0.0.1; an agent starts it and hands the address to the person. No
// dependencies: Node 20+ (and Chrome, only for `export`).
//
// It reads the opened deck folders and writes nothing in them but a new
// deck's `deck.json` (`new`) and what `export` makes. Its own notes are in
// `~/.tome-slides`: which decks are open, the running process, the comments.

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 4770;
export const INDEX = "deck.json";
export const TRANSITIONS = ["fade", "slide", "none"];
const PORT_TRIES = 30;
const MAX_BODY = 1024 * 1024;
const MAX_FILE = 32 * 1024 * 1024;
const MAX_INDEX = 1024 * 1024;
const MAX_COMMENT = 8000;
const MAX_NOTES = 8000;
const MAX_TEXT = 600;
const MAX_HTML = 1200;
const MAX_SLIDES = 300;
const WRITE_HEADER = "x-tome-slides";
const WAIT_MS = 25000;
const WAIT_STEP_MS = 250;
const TAKE_STEP_MS = 400;
/** How long the page still shows an agent as listening after its wait ended (it asks again right away). */
const LISTEN_GRACE_MS = 3000;
/** What `export` makes goes here, in the deck's folder; nothing in it is a slide. */
const EXPORTS = "exports";
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
  return process.env.TOME_SLIDES_HOME || path.join(os.homedir(), ".tome-slides");
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

// ---- a deck's files ----
//
// A deck is a folder. `deck.json` lists its slides in order:
// {title, size?: [w, h], transition?, slides: [{file, title?, notes?, transition?}]}.
// Each slide is an HTML file in the folder; pictures, fonts, styles and
// scripts it links to sit beside it. The page shows only files inside the
// folder, never a hidden one.

/** A path inside a deck as written in its index or asked for by the page: its parts, or null when it may not name a file. */
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

const isSlideFile = (rel) => /\.html?$/i.test(rel);

/** What the index says, made safe to show, and what is wrong with it: {title, size, transition, slides, problems}. */
export function readIndex(root) {
  const problems = [];
  const file = path.join(root, INDEX);
  const empty = { title: path.basename(root), size: [1920, 1080], transition: "fade", slides: [] };
  let bytes = null;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return { ...empty, problems: [{ file: INDEX, problem: `there is no ${INDEX}` }], bytes: null };
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
  const title = typeof v.title === "string" && v.title.trim() ? v.title.trim().slice(0, 200) : empty.title;
  if (typeof v.title !== "string" || !v.title.trim()) problems.push({ file: INDEX, problem: "`title` is missing: the deck's name, as the person says it" });
  let size = empty.size;
  if (v.size !== undefined) {
    if (Array.isArray(v.size) && v.size.length === 2 && v.size.every((n) => num(n) && n >= 200 && n <= 8000)) size = v.size.map(Math.round);
    else problems.push({ file: INDEX, problem: "`size` is [width, height] in px, each from 200 to 8000 (leave it out for 1920×1080)" });
  }
  let transition = empty.transition;
  if (v.transition !== undefined) {
    if (TRANSITIONS.includes(v.transition)) transition = v.transition;
    else problems.push({ file: INDEX, problem: `\`transition\` is one of ${TRANSITIONS.join(", ")}` });
  }
  const slides = [];
  const seen = new Set();
  const list = Array.isArray(v.slides) ? v.slides : [];
  if (v.slides !== undefined && !Array.isArray(v.slides)) problems.push({ file: INDEX, problem: "`slides` is a list: [{file, title?, notes?}]" });
  for (const [i, s] of list.slice(0, MAX_SLIDES).entries()) {
    const where = `slides[${i}]`;
    if (!s || typeof s !== "object") {
      problems.push({ file: INDEX, problem: `${where} is not an object` });
      continue;
    }
    if (!relParts(s.file) || !isSlideFile(s.file)) {
      problems.push({ file: INDEX, problem: `${where}.file is a path inside the folder ending .html, without .. or hidden parts` });
      continue;
    }
    if (seen.has(s.file)) {
      problems.push({ file: INDEX, problem: `${where}: ${s.file} is listed twice` });
      continue;
    }
    seen.add(s.file);
    const out = { file: s.file, title: typeof s.title === "string" && s.title.trim() ? s.title.trim().slice(0, 200) : null, notes: "", transition: null, exists: inside(root, s.file) !== null };
    if (typeof s.notes === "string") {
      out.notes = s.notes.slice(0, MAX_NOTES);
      if (s.notes.length > MAX_NOTES) problems.push({ file: INDEX, problem: `${where}.notes is longer than ${MAX_NOTES} characters` });
    } else if (s.notes !== undefined) problems.push({ file: INDEX, problem: `${where}.notes is text: what to say on this slide` });
    if (s.transition !== undefined) {
      if (TRANSITIONS.includes(s.transition)) out.transition = s.transition;
      else problems.push({ file: INDEX, problem: `${where}.transition is one of ${TRANSITIONS.join(", ")}` });
    }
    if (!out.exists) problems.push({ file: s.file, problem: `${where} names it, and there is no such file` });
    slides.push(out);
  }
  if (list.length > MAX_SLIDES) problems.push({ file: INDEX, problem: `more than ${MAX_SLIDES} slides` });
  return { title, size, transition, slides, problems, bytes };
}

/** HTML files in the folder (not hidden, not exports, two levels deep at most) that the index does not list. */
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
      if (d.name.startsWith(".") || d.name === "node_modules" || (depth === 0 && d.name === EXPORTS)) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (d.isFile() && isSlideFile(d.name)) {
        const rel = path.relative(root, p).split(path.sep).join("/");
        if (!listed.has(rel)) out.push(rel);
      }
    }
  };
  walk(root, 0);
  return out.sort();
}

/** What is wrong with one slide's HTML, by reading it (whether it runs and how it looks is not checked). */
export function htmlProblems(text) {
  const out = [];
  if (!/<html[\s>]/i.test(text) || !/<body[\s>]/i.test(text)) out.push("it is not a whole page: write <!doctype html>, <html>, <head> and <body>");
  if (!/<meta[^>]+charset/i.test(text)) out.push('no <meta charset="utf-8"> in <head>');
  if (/<(iframe|object|embed)[\s>]/i.test(text)) out.push("<iframe>, <object> and <embed> do not show here");
  // A link (<a href>) may go anywhere: it is not loaded. Only what the page loads counts.
  const loads = [...text.matchAll(/<(?:img|script|link|source|video|audio)\b[^>]*\b(?:src|href)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]+)/gi)].map((m) => m[1]).filter((u) => !/^(?:https?:)?\/\/fonts\.(?:googleapis|gstatic)\.com\//i.test(u));
  if (loads.length) out.push(`it loads from the web, which the page blocks (only Google Fonts may load): ${[...new Set(loads)].slice(0, 3).join(", ")}; put the file in the folder and link it relatively`);
  if (/url\(\s*["']?(?:https?:)?\/\/(?!fonts\.(?:googleapis|gstatic)\.com)/i.test(text)) out.push("a CSS url() loads from the web, which the page blocks: put the file in the folder");
  const steps = [...text.matchAll(/\bdata-step\s*=\s*["']?([^"'\s>]*)/gi)].map((m) => m[1]);
  if (steps.some((s) => !/^[1-9]\d?$/.test(s))) out.push("data-step is a whole number from 1 to 99: the press on which the element appears");
  return out;
}

/** Everything `check` reports for a deck: [{file, problem}]. */
export function checkDeck(root) {
  const index = readIndex(root);
  const problems = [...index.problems];
  for (const s of index.slides) {
    const real = inside(root, s.file);
    if (!real) continue;
    let text = "";
    try {
      text = fs.readFileSync(real, "utf8");
    } catch {
      continue;
    }
    for (const p of htmlProblems(text)) problems.push({ file: s.file, problem: p });
  }
  for (const rel of unlisted(root, new Set(index.slides.map((s) => s.file)))) problems.push({ file: rel, problem: `an HTML file that ${INDEX} does not list: add it to slides (or move it out, if it is not a slide)` });
  if (index.slides.length === 0 && index.bytes !== null) problems.push({ file: INDEX, problem: "no slides yet" });
  return problems;
}

/** A slide's revision: its bytes. The rest of the folder (pictures, styles) counts as one. */
function revs(root, slides) {
  const out = {};
  for (const s of slides) {
    const real = inside(root, s.file);
    out[s.file] = real ? shortHash(fs.readFileSync(real)) : null;
  }
  return out;
}

/** The size and time of every other file the slides may load, as one signature (cheap: no reading). */
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
      if (d.name.startsWith(".") || d.name === "node_modules" || (depth === 0 && d.name === EXPORTS)) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (d.isFile() && !isSlideFile(d.name) && d.name !== INDEX) {
        const st = fs.statSync(p, { throwIfNoEntry: false });
        if (st) parts.push(`${path.relative(root, p)}:${st.size}:${Math.floor(st.mtimeMs)}`);
      }
    }
  };
  walk(root, 0);
  return shortHash(parts.join("\n"));
}

/** The opened decks. */
export class Decks {
  constructor() {
    this.note = path.join(homeDir(), "decks.json");
  }

  entries() {
    const v = readJson(this.note);
    return Array.isArray(v) ? v.filter((e) => e && typeof e.root === "string") : [];
  }

  /** The opened decks whose folder still exists, the last opened first: [{id, root, title, slides, mtime}]. */
  list() {
    const out = [];
    for (const e of this.entries()) {
      if (!isDir(e.root)) continue;
      const st = fs.statSync(path.join(e.root, INDEX), { throwIfNoEntry: false });
      const index = readIndex(e.root);
      out.push({ id: shortHash(e.root), root: e.root, title: index.title, slides: index.slides.length, mtime: Math.floor(st?.mtimeMs ?? 0), openedAt: e.openedAt });
    }
    return out.sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0));
  }

  /** The folder a path names: the folder itself, or the folder of its deck.json. */
  static rootOf(p) {
    let real;
    try {
      real = fs.realpathSync(p);
    } catch {
      throw new Fail("NotFound", `no such folder: ${p}`);
    }
    if (isFile(real) && path.basename(real) === INDEX) real = path.dirname(real);
    if (!isDir(real)) throw new Fail("Invalid", `not a deck's folder: ${p}`);
    if (!isFile(path.join(real, INDEX))) {
      if (isFile(path.join(real, "project", "deck.json"))) throw new Fail("Invalid", `${p} is a claude-slides deck (project/deck.json), not a tome-slides deck; make a new deck with \`new\``);
      throw new Fail("NotFound", `no ${INDEX} in ${p}: make one with \`new\``);
    }
    return real;
  }

  /** Puts a deck on the list (again: moves it to the front). */
  add(p) {
    const root = Decks.rootOf(p);
    const rest = this.entries().filter((e) => e.root !== root);
    atomicWrite(this.note, Buffer.from(JSON.stringify([{ root, openedAt: now() }, ...rest], null, 2)));
    return this.get(shortHash(root));
  }

  remove(id) {
    atomicWrite(this.note, Buffer.from(JSON.stringify(this.entries().filter((e) => shortHash(e.root) !== id), null, 2)));
  }

  get(id) {
    const d = this.list().find((x) => x.id === id);
    if (!d) throw new Fail("NotFound", `no opened deck ${id}`);
    return d;
  }

  /** The deck as the page draws it: its index, each slide's revision, and one revision of the whole. */
  read(id) {
    const d = this.get(id);
    const index = readIndex(d.root);
    const slideRevs = revs(d.root, index.slides);
    const assets = assetSig(d.root);
    const rev = shortHash([index.bytes ? shortHash(index.bytes) : "-", assets, ...index.slides.map((s) => `${s.file}=${slideRevs[s.file]}`)].join("\n"));
    return { id: d.id, root: d.root, title: index.title, size: index.size, transition: index.transition, slides: index.slides.map((s) => ({ ...s, rev: slideRevs[s.file] })), problems: index.problems.length, assets, rev };
  }
}

/** Makes a new deck's folder with an index and no slides: the folder. */
export function makeDeck(title, parent) {
  const name = title.trim().replace(/[\/\\:*?"<>|\0]+/g, "-").replace(/\s+/g, " ").replace(/^[.\s-]+|[\s-]+$/g, "").slice(0, 80) || "deck";
  fs.mkdirSync(parent, { recursive: true });
  let root = path.join(parent, name);
  for (let n = 2; fs.existsSync(root); n++) root = path.join(parent, `${name} ${n}`);
  fs.mkdirSync(root);
  atomicWrite(path.join(root, INDEX), Buffer.from(JSON.stringify({ title: title.trim(), size: [1920, 1080], slides: [] }, null, 2) + "\n"), 0o644);
  return fs.realpathSync(root);
}

// ---- comments ----
//
// `<home>/comments/<deck id>/comments.json`: {root, next, threads}. A
// thread: {id, n, at, anchor, messages: [{from: "user" | "agent", text,
// at}], sent, taken, resolved}. `anchor` (null: the whole deck): {slide,
// rect: [x, y, w, h] in the slide's px, element (the one clicked) or null,
// elements (the ones a dragged area holds)}. `sent`: the person handed it
// to an agent; `taken`: a waiting agent got it. A thread not sent is a
// note: it goes out with the next one that is sent.

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
  if (typeof a !== "object" || !relParts(a.slide) || !isSlideFile(a.slide)) throw new Fail("Invalid", "anchor");
  const rect = Array.isArray(a.rect) && a.rect.length === 4 && a.rect.every(num) ? a.rect.map((n) => Math.round(n)) : null;
  if (!rect) throw new Fail("Invalid", "anchor.rect");
  return {
    slide: a.slide,
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

  /** Sending one sends the deck's notes too: the open threads the person wrote last in and never sent. */
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

  /** Every thread sent and not yet taken (of that deck; null: of any), marked taken: [{data, thread}]. */
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
  let number = null;
  if (a && isDir(root)) {
    const at = readIndex(root).slides.findIndex((s) => s.file === a.slide);
    number = at === -1 ? null : at + 1;
  }
  return {
    id: thread.id,
    n: thread.n,
    deck: root,
    slide: a?.slide ?? null,
    number,
    file: a ? path.join(root, ...a.slide.split("/")) : path.join(root, INDEX),
    rect: a?.rect ?? null,
    element: a?.element ?? null,
    elements: a?.elements ?? [],
    messages: thread.messages,
    sent: Boolean(thread.sent),
    resolved: thread.resolved,
    ...(isDir(root) ? {} : { note: "this deck's folder is gone" }),
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
// A slide: its own folder and Google Fonts, in a sandbox of its own (another
// origin), so its scripts can reach neither the page nor this server's calls.
const SLIDE_CSP =
  "sandbox allow-scripts; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
const PROBE_TAG = '<script src="/probe.js"></script>';

/** The file a path names under the page's folder. `/` and `/d/…` (a deck's address) are the page itself. */
function pageFile(urlPath) {
  const rel = urlPath.replace(/^\/+/, "");
  if (rel === "" || rel === "d" || rel.startsWith("d/")) return path.join(PAGE, "index.html");
  const parts = relParts(rel);
  return parts ? path.join(PAGE, ...parts) : null;
}

/** A slide's HTML with the page's probe in it (it tells the page what was clicked, and shows a slide's steps one by one). */
export function withProbe(html) {
  const at = html.search(/<\/body\s*>/i);
  return at === -1 ? html + PROBE_TAG : html.slice(0, at) + PROBE_TAG + html.slice(at);
}

const escHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Every slide of a deck as a page of its size, to print or save as PDF. It is
 * written here, with the slides in it, so the page has loaded only when every
 * slide has (a headless Chrome prints it then).
 */
export function printPage(deck) {
  const [w, h] = deck.size;
  const pages = deck.slides
    .filter((s) => s.exists)
    .map((s) => {
      const src = `/f/${deck.id}/${s.file.split("/").map(encodeURIComponent).join("/")}?clip=1&r=${s.rev}-${deck.assets}`;
      return `<div class="print-page" style="width:${w}px;height:${h}px"><iframe sandbox="allow-scripts" tabindex="-1" title="${escHtml(s.title || s.file)}" src="${escHtml(src)}" style="width:${w}px;height:${h}px"></iframe></div>`;
    })
    .join("\n");
  return `<!doctype html>
<html class="printing" data-width="${w}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(deck.title)}</title>
<link rel="stylesheet" href="/page.css">
<style>@page { size: ${w}px ${h}px; margin: 0; }</style>
</head>
<body>
<div class="print-bar"><b>${escHtml(deck.title)}</b><span class="dim print-state"></span><span class="grow"></span><button class="primary print-go" disabled></button></div>
<div class="print-pages">
${pages}
</div>
<script src="/print.js"></script>
</body>
</html>
`;
}

/** Answers one request: {status, type, body, headers?}. `req`: {method, path, query (URLSearchParams), headers, body (Buffer)}. */
export async function handle(ctx, req) {
  const json = (status, value) => ({ status, type: TYPES.json, body: Buffer.from(JSON.stringify(value)) });
  const text = (status, s) => ({ status, type: TYPES.txt, body: Buffer.from(s) });
  const bad = (detail) => json(400, { code: "Invalid", detail });
  const h = (name) => req.headers[name];
  // Only a page this process served may ask (or no page: a command line):
  // this machine by name, at any port (a forwarded one may differ), and the
  // origin has to be that same address. A slide runs in a sandbox: its
  // origin is not the page's, so it can not call.
  if (!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(h("host") ?? "")) return text(403, "Host not allowed");
  if (h("origin") !== undefined && h("origin") !== `http://${h("host")}`) return text(403, "Origin not allowed");
  const site = h("sec-fetch-site");
  if (req.path.startsWith("/api/") && site !== undefined && site !== "same-origin" && site !== "none") return text(403, "not from the page");
  if (req.method !== "GET" && req.method !== "HEAD" && h(WRITE_HEADER) === undefined) return text(403, "not from the page");

  const decks = (ctx.decks ??= new Decks());
  const comments = (ctx.comments ??= new Comments());
  /** The agents waiting for a comment now: a key → {id (null: any deck), until}. */
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
    if (route === "GET /api/decks") return json(200, { decks: decks.list().map((d) => ({ ...d, open: comments.load(d).threads.filter((t) => !t.resolved).length })) });
    if (route === "GET /api/deck") {
      const id = req.query.get("id");
      if (id === null) return bad("id");
      return json(200, decks.read(id));
    }
    if (route === "GET /api/wait") {
      // Answers when the deck is no longer at `rev` (the deck as it is now; `rev: null`: gone), or after a while with the same rev.
      const id = req.query.get("id");
      const seen = req.query.get("rev");
      if (id === null || seen === null) return bad("id and rev");
      const until = Date.now() + ms();
      for (;;) {
        let d;
        try {
          d = decks.read(id);
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
      return json(200, { threads: comments.load(decks.get(id)).threads, listening: listening(id) });
    }
    if (route === "POST /api/comments") {
      // What the page does: {op: "new", anchor, text, send?}, {op: "say", id, text, send?}, {op: "send", id}, {op: "resolve", id, resolved}.
      const id = req.query.get("id");
      if (id === null) return bad("id");
      const d = decks.get(id);
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
      const d = id === null ? null : decks.get(id);
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
      // A deck's own file: a slide (with the probe), or what a slide loads.
      const d = decks.get(fm[1]);
      const real = inside(d.root, fm[2]);
      if (!real) return text(404, "not found\n");
      if (fs.statSync(real).size > MAX_FILE) return text(413, "too large\n");
      const ext = path.extname(real).slice(1).toLowerCase();
      const type = TYPES[ext] ?? "application/octet-stream";
      const headers = { "Content-Security-Policy": SLIDE_CSP, "X-Frame-Options": "SAMEORIGIN" };
      if (ext === "html" || ext === "htm") return { status: 200, type, headers, body: Buffer.from(withProbe(fs.readFileSync(real, "utf8"))) };
      return { status: 200, type, headers, body: fs.readFileSync(real) };
    }
    const pm = req.path.match(/^\/print\/([0-9a-f]{16})$/);
    if (pm) return { status: 200, type: TYPES.html, body: Buffer.from(printPage(decks.read(pm[1]))) };
    const f = pageFile(req.path);
    if (!f || !isFile(f)) return text(404, "not found\n");
    // The probe runs inside the slides.
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
  const files = [path.join(here, "slides.mjs"), ...names.map((f) => path.join(PAGE, f))];
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

// `<home>/servers/main.json` holds {pid, url, port, root, kind: "slides",
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
  atomicWrite(stateFile(), Buffer.from(JSON.stringify({ pid: process.pid, url, port, root: homeDir(), kind: "slides", startedAt: now() }, null, 2)));
  const bye = () => {
    if (readJson(stateFile())?.pid === process.pid) fs.rmSync(stateFile(), { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
  console.error(`tome-slides: ${url}`);
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
  const child = spawn(process.execPath, [path.join(here, "slides.mjs"), "serve", "--port", String(port)], { detached: true, stdio: ["ignore", log, log] });
  child.unref();
  fs.closeSync(log);
  if (!(await until(8000, async () => (state = await running()) !== null))) throw new Error(`it did not start: see ${logFile()}`);
  return { ...state, reused: false };
}

// ---- export: a PDF or pictures, by a headless Chrome ----

/** A Chrome (or Chromium, Edge, Brave) on this machine: `$CHROME_PATH` first. */
export function findChrome() {
  const named = process.env.CHROME_PATH;
  if (named) return isFile(named) ? named : null;
  const mac = ["Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser"].map((n) => `/Applications/${n}.app/Contents/MacOS/${n}`);
  for (const p of [...mac, ...mac.map((p) => path.join(os.homedir(), p))]) if (isFile(p)) return p;
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
    const r = spawnSync("which", [name], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

function chrome(bin, args) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tome-slides-chrome-"));
  try {
    const r = spawnSync(bin, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--user-data-dir=${profile}`, "--virtual-time-budget=20000", ...args], { encoding: "utf8", timeout: 120000 });
    if (r.status !== 0) throw new Error(`Chrome failed: ${(r.stderr || r.error?.message || "").trim().split("\n").slice(-3).join(" ")}`);
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

const safeName = (s) => s.replace(/[\/\\:*?"<>|\0]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "deck";

/** Makes the PDF (every slide a page) or one PNG per slide: the files made. */
async function exportDeck(d, state, { kind, out }) {
  const bin = findChrome();
  if (!bin) throw new Error("export needs Chrome (or Chromium, Edge, Brave); set CHROME_PATH to one. Without it: open the deck and use Export PDF in the page");
  const index = readIndex(d.root);
  const slides = index.slides.filter((s) => s.exists);
  if (slides.length === 0) throw new Error("the deck has no slides yet");
  const [w, h] = index.size;
  if (kind === "pdf") {
    const file = out ? path.resolve(out) : path.join(d.root, EXPORTS, `${safeName(index.title)}.pdf`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    chrome(bin, ["--no-pdf-header-footer", `--print-to-pdf=${file}`, `${state.url}print/${d.id}`]);
    if (!isFile(file)) throw new Error("Chrome made no PDF");
    return [file];
  }
  const dir = out ? path.resolve(out) : path.join(d.root, EXPORTS, safeName(index.title));
  fs.mkdirSync(dir, { recursive: true });
  const made = [];
  for (const [i, s] of slides.entries()) {
    const file = path.join(dir, `${String(i + 1).padStart(2, "0")}.png`);
    chrome(bin, [`--window-size=${w},${h}`, `--screenshot=${file}`, `${state.url}f/${d.id}/${s.file.split("/").map(encodeURIComponent).join("/")}?clip=1`]);
    made.push(file);
  }
  return made;
}

function fail(message) {
  console.error(`tome-slides: ${message}`);
  process.exit(2);
}

const USAGE = `tome-slides: slide decks (one plain HTML file per slide) in a page of this machine, presented full screen, with comments an agent answers

slides.mjs new TITLE [--in DIR]    make a deck's folder DIR/TITLE (default DIR: ./decks) with an empty ${INDEX}, open it; prints {url, root, index, …}
slides.mjs open [FOLDER]           start it if needed and open the deck in FOLDER; prints {url, …} (no FOLDER: the list of opened decks)
           --slide N               the address of slide N (1 is the first)
           --present N             the address of a presentation that starts at slide N
slides.mjs list                    the opened decks: [{id, root, title, slides, url, comments}]
slides.mjs check FOLDER            what is wrong with the deck's files: {problems, issues}; exits 1 while there are any
slides.mjs export FOLDER --pdf     every slide as a page of one PDF (needs Chrome); --png: one picture per slide; --out PATH
slides.mjs close FOLDER            take it off the list (the files stay)
slides.mjs stop                    end it
slides.mjs serve                   run it here, in the foreground

slides.mjs comments [FOLDER]           the open comments (of that deck; none: of every deck); --all: the resolved ones too
slides.mjs comments [FOLDER] --wait    wait until the person sends a comment to the agent; prints that thread and ends
slides.mjs comment-reply ID TEXT       reply to a comment (TEXT "-": from stdin); --resolve also closes it
slides.mjs comment-resolve ID          close a comment; --reopen opens it again

--port N      the first port to try (default ${DEFAULT_PORT})
`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || ["help", "--help", "-h"].includes(command)) return void process.stdout.write(USAGE);
  let port = DEFAULT_PORT;
  let parent = null;
  let slide = null;
  let present = null;
  let out = null;
  const words = [];
  const flags = new Set();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const value = (name) => {
      const v = rest[++i];
      if (v === undefined) fail(`${name} needs a value`);
      return v;
    };
    const number = (name) => {
      const v = value(name);
      if (!/^\d+$/.test(v) || Number(v) < 1) fail(`${name} is a slide's number: 1 is the first`);
      return Number(v);
    };
    if (["--all", "--wait", "--resolve", "--reopen", "--pdf", "--png"].includes(a)) flags.add(a.slice(2));
    else if (a === "--port") {
      const v = value(a);
      if (!/^\d+$/.test(v)) fail("--port is a number");
      port = Number(v);
    } else if (a === "--in") parent = path.resolve(value(a));
    else if (a === "--slide") slide = number(a);
    else if (a === "--present") present = number(a);
    else if (a === "--out") out = value(a);
    else if (a.startsWith("--")) fail(`unknown option ${a}`);
    else words.push(a);
  }
  if (words.length > (command === "comment-reply" ? 2 : 1)) fail("one folder at most (quote a path that has spaces)");
  const print = (v) => console.log(JSON.stringify(v, null, 2));
  const decks = new Decks();
  const comments = new Comments();
  const me = path.join(here, "slides.mjs");
  const opened = (p) => {
    const root = Decks.rootOf(p);
    return decks.list().find((d) => d.root === root) ?? fail(`not an opened deck: ${p} (open it first)`);
  };
  const urlOf = (base, d, s, p) => `${base}d/${d.id}${p ? `?present=${p}` : s ? `?s=${s}` : ""}`;
  try {
    if (command === "serve") return void (await serve(port));
    if (command === "stop") return print(await stop());
    if (command === "list") {
      const state = await running();
      return print(decks.list().map((d) => ({ id: d.id, root: d.root, title: d.title, slides: d.slides, url: state ? urlOf(state.url, d) : null, comments: comments.load(d).threads.filter((t) => !t.resolved).length })));
    }
    if (command === "check") {
      if (words.length === 0) fail("check needs a deck's folder");
      const issues = checkDeck(Decks.rootOf(words[0]));
      print({ problems: issues.length, issues });
      process.exit(issues.length ? 1 : 0);
    }
    if (command === "close") {
      if (words.length === 0) fail("close needs a deck's folder");
      const d = opened(words[0]);
      decks.remove(d.id);
      return print({ closed: d.root });
    }
    if (command === "export") {
      if (words.length === 0) fail("export needs a deck's folder");
      if (flags.has("pdf") === flags.has("png")) fail("export makes --pdf or --png");
      const d = decks.add(words[0]);
      const state = await ensure(port);
      return print({ files: await exportDeck(d, state, { kind: flags.has("pdf") ? "pdf" : "png", out }) });
    }
    if (command === "new" || command === "open") {
      let d = null;
      if (command === "new") {
        if (words.length === 0 || !words[0].trim()) fail("new needs a title");
        d = decks.add(makeDeck(words[0], parent ?? path.resolve("decks")));
      } else if (words.length) d = decks.add(words[0]);
      for (const asked of [slide, present]) {
        if (asked !== null && (!d || asked > readIndex(d.root).slides.length)) fail(`no slide ${asked} in that deck`);
      }
      const state = await ensure(port);
      const res = { url: state.url, pid: state.pid, reused: state.reused, stop: `node ${JSON.stringify(me)} stop` };
      if (!d) return print(res);
      return print({ ...res, url: urlOf(state.url, d, slide, present), id: d.id, title: d.title, root: d.root, index: path.join(d.root, INDEX), slides: d.slides });
    }
    if (command === "comments") {
      const d = words.length ? opened(words[0]) : null;
      if (!flags.has("wait")) {
        const list = [];
        for (const data of d ? [comments.load(d)] : comments.all()) {
          for (const t of data.threads) if (flags.has("all") || !t.resolved) list.push(describeThread(data.root, t));
        }
        return print(list);
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

if (process.argv[1] && fs.realpathSync(process.argv[1]) === path.join(here, "slides.mjs")) {
  main(process.argv.slice(2)).catch((e) => fail(e?.message ?? String(e)));
}
