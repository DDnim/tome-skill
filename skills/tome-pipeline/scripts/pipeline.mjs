#!/usr/bin/env node
// tome-pipeline: a pipeline is a folder. `pipeline.json` lists its steps (what
// each does, what it needs, what it makes); each step is a script, a prompt
// for an agent, or a question for a person. `run` carries one run of it from
// start to end: the steps in the order their needs give, side by side where
// they can be, each retried and timed out as written, a step whose inputs did
// not change taken from an earlier run instead of run again. Every run is a
// folder `runs/<time>/` with each step's log and files and a `status.json`;
// `resume` carries an unfinished run on. It is no daemon: when the run ends,
// stops or waits for a person, the process ends (exit 0 / 1 / 3), with one
// last line that says how it ended.
//
// The same script serves a page on 127.0.0.1 that draws the steps and shows
// each one's state, log and files. No dependencies: Node 20+. Its own notes
// are in `~/.tome-pipeline` (which pipelines are open, the running page).

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 4780;
export const INDEX = "pipeline.json";
export const FORMAT = 1;
export const KINDS = ["sh", "agent", "human"];
export const RUNS = "runs";
const PORT_TRIES = 30;
const MAX_BODY = 64 * 1024;
const MAX_INDEX = 1024 * 1024;
const MAX_STEPS = 200;
const MAX_LOG_TAIL = 64 * 1024;
const CACHE_LOOKBACK = 60;
const TICK_MS = 150;
const KILL_GRACE_MS = 3000;
const WRITE_HEADER = "x-tome-pipeline";
const LOG = "_log.txt";
const PROMPT = "_prompt.md";
const LOCK = ".lock";
export const EXIT = { done: 0, failed: 1, usage: 2, waiting: 3, busy: 4 };
const here = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const PAGE = path.join(here, "page");
const ME = path.join(here, "pipeline.mjs");

class Fail extends Error {
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}
const STATUS = { NotFound: 404, Forbidden: 403, Invalid: 400, Busy: 409, Io: 500 };

const isFile = (p) => fs.statSync(p, { throwIfNoEntry: false })?.isFile() === true;
const isDir = (p) => fs.statSync(p, { throwIfNoEntry: false })?.isDirectory() === true;
const shortHash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function homeDir() {
  return process.env.TOME_PIPELINE_HOME || path.join(os.homedir(), ".tome-pipeline");
}

function atomicWrite(file, bytes, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
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

/** A path inside the pipeline's folder as written in its index: its parts, or null when it may not name a file. */
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
  return real.startsWith(root + path.sep) && isFile(real) ? real : null;
}

// ---- the pipeline's file ----
//
// {format: 1, title, parallel?, agent?: [command…], steps: [{id, title?, kind:
// "sh"|"agent"|"human", run? (sh), prompt? (agent), ask?, choices? (human),
// needs?, out?, in?, retry?, timeout?, fresh?, model?, agent?, env?}]}

/** "90s", "15m", "2h", or a number of seconds: milliseconds, or null. */
export function parseDuration(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v * 1000);
  const m = typeof v === "string" ? v.trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h)?$/) : null;
  if (!m) return null;
  return Math.round(Number(m[1]) * { s: 1000, m: 60000, h: 3600000 }[m[2] ?? "s"]);
}

const ID = /^[a-z][a-z0-9_-]{0,39}$/;
const RUNNABLE = /\.(sh|bash|mjs|cjs|js|py|rb)$/i;

/** The file a sh step's `run` starts with, when it names one in the folder: {rel, rest}; else null (a shell command). */
function runFile(run) {
  const m = run.trim().match(/^(\S+)(.*)$/s);
  if (!m) return null;
  const first = m[1];
  if (!(first.includes("/") || RUNNABLE.test(first))) return null;
  return relParts(first) ? { rel: first, rest: m[2] } : null;
}

/** What the index says, checked: {title, format, parallel, agent, steps, problems: [text], todo: [{step, missing}]}. */
export function readPipeline(root) {
  const problems = [];
  const todo = [];
  const file = path.join(root, INDEX);
  const out = { title: path.basename(root), format: FORMAT, parallel: 4, agent: null, steps: [], problems, todo, bytes: null };
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st?.isFile()) {
    problems.push(`no ${INDEX}`);
    return out;
  }
  if (st.size > MAX_INDEX) {
    problems.push(`${INDEX} is larger than ${MAX_INDEX} bytes`);
    return out;
  }
  const bytes = fs.readFileSync(file);
  out.bytes = bytes;
  let v;
  try {
    v = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    problems.push(`${INDEX} is not JSON: ${e.message}`);
    return out;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    problems.push(`${INDEX} is not an object`);
    return out;
  }
  if (v.format !== undefined && v.format !== FORMAT) problems.push(`format ${JSON.stringify(v.format)}: this tome-pipeline reads format ${FORMAT}`);
  if (typeof v.title === "string" && v.title.trim()) out.title = v.title.trim().slice(0, 200);
  if (v.parallel !== undefined) {
    if (Number.isInteger(v.parallel) && v.parallel >= 1 && v.parallel <= 32) out.parallel = v.parallel;
    else problems.push("parallel is a whole number from 1 to 32");
  }
  const command = (c, where) => {
    if (c === undefined) return null;
    if (Array.isArray(c) && c.length && c.every((s) => typeof s === "string" && s)) return c;
    problems.push(`${where}agent is a command as a list of words, like ["codex", "exec", "--full-auto", "-"]`);
    return null;
  };
  out.agent = command(v.agent, "");
  if (!Array.isArray(v.steps)) {
    problems.push("steps is not a list");
    return out;
  }
  if (v.steps.length > MAX_STEPS) problems.push(`more than ${MAX_STEPS} steps`);
  const seen = new Set();
  for (const [i, s] of v.steps.slice(0, MAX_STEPS).entries()) {
    const where = `steps[${i}]`;
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      problems.push(`${where} is not an object`);
      continue;
    }
    if (typeof s.id !== "string" || !ID.test(s.id)) {
      problems.push(`${where}: id is lowercase letters, digits, - and _, starting with a letter`);
      continue;
    }
    if (seen.has(s.id)) {
      problems.push(`${where}: a second step "${s.id}"`);
      continue;
    }
    seen.add(s.id);
    const at = `step "${s.id}": `;
    const step = { id: s.id, title: typeof s.title === "string" && s.title.trim() ? s.title.trim().slice(0, 120) : s.id, kind: s.kind, needs: [], out: [], in: [], retry: 0, timeoutMs: null, fresh: s.fresh === true, env: {}, implemented: true, note: typeof s.note === "string" ? s.note.trim().slice(0, 2000) : "" };
    if (!KINDS.includes(s.kind)) problems.push(`${at}kind is one of ${KINDS.join(", ")}`);
    const list = (name, check) => {
      if (s[name] === undefined) return [];
      if (!Array.isArray(s[name]) || !s[name].every((x) => typeof x === "string")) {
        problems.push(`${at}${name} is a list of strings`);
        return [];
      }
      return s[name].filter((x) => check(x));
    };
    step.needs = list("needs", () => true);
    step.out = list("out", (f) => {
      const ok = relParts(f) !== null && !f.startsWith("_");
      if (!ok) problems.push(`${at}out "${f}" is a path inside the step's folder, not starting with _ or .`);
      return ok;
    });
    step.in = list("in", (f) => {
      const ok = relParts(f) !== null;
      if (!ok) problems.push(`${at}in "${f}" is a path inside the pipeline's folder`);
      return ok;
    });
    if (s.retry !== undefined) {
      if (Number.isInteger(s.retry) && s.retry >= 0 && s.retry <= 10) step.retry = s.retry;
      else problems.push(`${at}retry is a whole number from 0 to 10`);
    }
    if (s.timeout !== undefined) {
      step.timeoutMs = parseDuration(s.timeout);
      if (step.timeoutMs === null) problems.push(`${at}timeout is like "90s", "15m", "2h" or a number of seconds`);
    }
    if (s.env !== undefined) {
      if (s.env && typeof s.env === "object" && !Array.isArray(s.env) && Object.entries(s.env).every(([k, x]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof x === "string")) step.env = s.env;
      else problems.push(`${at}env is an object of NAME: "text"`);
    }
    if (s.kind === "sh") {
      if (typeof s.run !== "string" || !s.run.trim()) problems.push(`${at}a sh step needs run: a file in the folder (steps/x.sh) or a command`);
      else {
        step.run = s.run.trim();
        const f = runFile(step.run);
        if (f && !inside(root, f.rel)) {
          step.implemented = false;
          todo.push({ step: s.id, missing: f.rel });
        }
      }
    } else if (s.kind === "agent") {
      if (typeof s.prompt !== "string" || !relParts(s.prompt)) problems.push(`${at}an agent step needs prompt: a file in the folder (steps/x.md)`);
      else {
        step.prompt = s.prompt;
        if (!inside(root, s.prompt)) {
          step.implemented = false;
          todo.push({ step: s.id, missing: s.prompt });
        }
      }
      if (s.model !== undefined) {
        if (typeof s.model === "string" && /^[\w.:\-/]{1,80}$/.test(s.model)) step.model = s.model;
        else problems.push(`${at}model is a model's name`);
      }
      step.agent = command(s.agent, at);
      if (!step.out.length) problems.push(`${at}an agent step needs out: the files it writes`);
    } else if (s.kind === "human") {
      step.ask = typeof s.ask === "string" && s.ask.trim() ? s.ask.trim().slice(0, 500) : `Answer for "${step.title}"`;
      if (s.choices !== undefined) {
        if (typeof s.choices === "string" && /^[a-z][a-z0-9_-]*\/.+/.test(s.choices) && relParts(s.choices)) step.choices = s.choices;
        else problems.push(`${at}choices is "<step id>/<file>": the file of a step it needs whose lines are the choices`);
      }
      if (step.out.length > 1) problems.push(`${at}a human step writes one file (out: ["answer.txt"])`);
      if (!step.out.length) step.out = ["answer.txt"];
    }
    for (const k of Object.keys(s)) {
      if (!["id", "title", "kind", "run", "prompt", "ask", "choices", "needs", "out", "in", "retry", "timeout", "fresh", "model", "agent", "env", "note"].includes(k)) problems.push(`${at}unknown field ${k}`);
    }
    out.steps.push(step);
  }
  const ids = new Set(out.steps.map((s) => s.id));
  for (const s of out.steps) {
    for (const n of s.needs) if (!ids.has(n)) problems.push(`step "${s.id}" needs "${n}", which is not a step`);
    s.needs = s.needs.filter((n) => ids.has(n) && n !== s.id);
    if (s.choices && !s.needs.includes(s.choices.split("/")[0])) problems.push(`step "${s.id}": choices come from "${s.choices.split("/")[0]}", which it does not need`);
  }
  const cycle = findCycle(out.steps);
  if (cycle) problems.push(`the needs go round in a circle: ${cycle.join(" → ")}`);
  return out;
}

/** A circle in the steps' needs, as ids, or null. */
function findCycle(steps) {
  const by = new Map(steps.map((s) => [s.id, s]));
  const state = new Map();
  const trail = [];
  const visit = (id) => {
    state.set(id, 1);
    trail.push(id);
    for (const n of by.get(id).needs) {
      if (state.get(n) === 1) return [...trail.slice(trail.indexOf(n)), n];
      if (!state.has(n)) {
        const c = visit(n);
        if (c) return c;
      }
    }
    trail.pop();
    state.set(id, 2);
    return null;
  };
  for (const s of steps) {
    if (!state.has(s.id)) {
      const c = visit(s.id);
      if (c) return c;
    }
  }
  return null;
}

/**
 * Where the page draws each step, as grid cells: `at` {id: [col, row]}, and `lanes` {"from>to": [[col, row], …]},
 * the empty cells a need that skips columns runs through, so no line crosses a box.
 * A step's column is its longest chain of needs; a step that needs nothing sits just before the first step that
 * needs it. Rows are ordered by the rows of what each step needs (a few sweeps both ways), then pulled level with
 * them where the column has room.
 */
export function layout(steps) {
  const by = new Map(steps.map((s) => [s.id, s]));
  const col = new Map();
  const depth = (id, seen = new Set()) => {
    if (col.has(id)) return col.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = Math.max(-1, ...by.get(id).needs.filter((n) => by.has(n)).map((n) => depth(n, seen))) + 1;
    col.set(id, d);
    return d;
  };
  steps.forEach((s) => depth(s.id));
  const after = new Map(steps.map((s) => [s.id, []]));
  for (const s of steps) for (const n of s.needs) if (by.has(n) && n !== s.id) after.get(n).push(s.id);
  for (const s of steps) {
    const later = after.get(s.id).map((d) => col.get(d));
    if (!s.needs.length && later.length) col.set(s.id, Math.max(0, Math.min(...later) - 1));
  }
  // the cells: steps, and one stand-in per column a need passes through
  const cells = new Map(steps.map((s) => [s.id, { id: s.id, col: col.get(s.id), prev: [], next: [] }]));
  const lanes = {};
  const link = (a, b) => (cells.get(a).next.push(b), cells.get(b).prev.push(a));
  for (const s of steps) {
    for (const n of s.needs) {
      if (!by.has(n) || n === s.id || col.get(n) >= col.get(s.id)) continue;
      let last = n;
      const via = [];
      for (let c = col.get(n) + 1; c < col.get(s.id); c++) {
        const id = `${n}>${s.id}@${c}`;
        cells.set(id, { id, col: c, prev: [], next: [], lane: true });
        link(last, id);
        via.push(id);
        last = id;
      }
      link(last, s.id);
      if (via.length) lanes[`${n}>${s.id}`] = via;
    }
  }
  const cols = [];
  for (const c of cells.values()) (cols[c.col] ??= []).push(c);
  for (let i = 0; i < cols.length; i++) cols[i] ??= [];
  const order = new Map();
  const number = () => cols.forEach((list) => list.forEach((c, i) => order.set(c.id, i)));
  number();
  const sweep = (list, side) => {
    const key = new Map(list.map((c, i) => {
      const near = c[side].map((id) => order.get(id));
      return [c.id, near.length ? near.reduce((a, b) => a + b, 0) / near.length : i];
    }));
    list.sort((a, b) => key.get(a.id) - key.get(b.id));
    list.forEach((c, i) => order.set(c.id, i));
  };
  for (let k = 0; k < 4; k++) {
    for (let i = 1; i < cols.length; i++) sweep(cols[i], "prev");
    for (let i = cols.length - 2; i >= 0; i--) sweep(cols[i], "next");
  }
  // rows: in that order, each as level with what it needs as the cells above it allow
  const row = new Map();
  for (const list of cols) {
    let free = 0;
    for (const c of list) {
      const near = c.prev.map((id) => row.get(id)).filter((r) => r !== undefined).sort((a, b) => a - b);
      const want = near.length ? near[Math.floor((near.length - 1) / 2)] : 0;
      const r = Math.max(free, want);
      row.set(c.id, r);
      free = r + 1;
    }
  }
  const at = {};
  for (const s of steps) at[s.id] = [col.get(s.id), row.get(s.id)];
  const out = {};
  for (const [k, via] of Object.entries(lanes)) out[k] = via.map((id) => [cells.get(id).col, row.get(id)]);
  return { at, lanes: out };
}

/** The steps that come after `id`, through needs (not `id` itself). */
function downstream(steps, id) {
  const out = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of steps) {
      if (!out.has(s.id) && s.needs.some((n) => n === id || out.has(n))) {
        out.add(s.id);
        grew = true;
      }
    }
  }
  return out;
}

/** What is wrong (problems) and not written yet (todo) in a pipeline's folder. */
export function checkPipeline(root) {
  const p = readPipeline(root);
  return { problems: p.problems, todo: p.todo, steps: p.steps.length };
}

/** Makes a new pipeline's folder: pipeline.json with no steps, steps/, and a .gitignore that leaves runs/ out. */
export function makePipeline(title, parent) {
  const clean = title.replace(/[/\\:\0]/g, "-").replace(/^\.+/, "").trim().slice(0, 120) || "pipeline";
  fs.mkdirSync(parent, { recursive: true });
  let dir = path.join(parent, clean);
  for (let n = 2; fs.existsSync(dir); n++) dir = path.join(parent, `${clean} ${n}`);
  fs.mkdirSync(path.join(dir, "steps"), { recursive: true });
  fs.writeFileSync(path.join(dir, INDEX), JSON.stringify({ format: FORMAT, title, steps: [] }, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), `${RUNS}/\n`);
  return fs.realpathSync(dir);
}

/** The folder a path names: the folder itself, or the folder of its pipeline.json. */
export function rootOf(p) {
  let real;
  try {
    real = fs.realpathSync(p);
  } catch {
    throw new Fail("NotFound", `no such folder: ${p}`);
  }
  if (isFile(real) && path.basename(real) === INDEX) real = path.dirname(real);
  if (!isDir(real)) throw new Fail("Invalid", `not a pipeline's folder: ${p}`);
  if (!isFile(path.join(real, INDEX))) throw new Fail("NotFound", `no ${INDEX} in ${p}: make one with \`new\``);
  return real;
}

// ---- runs ----

const runsDir = (root) => path.join(root, RUNS);
const RUN_NAME = /^\d{4}-\d\d-\d\d_\d{6}(-\d+)?$/;

/** The runs' names, the newest first. */
export function listRuns(root) {
  let names = [];
  try {
    names = fs.readdirSync(runsDir(root)).filter((n) => RUN_NAME.test(n) && isFile(path.join(runsDir(root), n, "status.json")));
  } catch {
    return [];
  }
  return names.sort().reverse();
}

export function readStatus(root, run) {
  return RUN_NAME.test(run) ? readJson(path.join(runsDir(root), run, "status.json")) : null;
}

function newRunName(root) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  let name = base;
  for (let n = 2; fs.existsSync(path.join(runsDir(root), name)); n++) name = `${base}-${n}`;
  return name;
}

/** Who holds the pipeline now: {pid, run, startedAt} of a live process, or null. */
export function holder(root) {
  const v = readJson(path.join(runsDir(root), LOCK));
  if (!v || !Number.isInteger(v.pid)) return null;
  try {
    process.kill(v.pid, 0);
    return v;
  } catch (e) {
    return e.code === "EPERM" ? v : null;
  }
}

function lock(root, run) {
  fs.mkdirSync(runsDir(root), { recursive: true });
  const file = path.join(runsDir(root), LOCK);
  const mine = JSON.stringify({ pid: process.pid, run, startedAt: now() });
  for (let i = 0; i < 2; i++) {
    try {
      fs.writeFileSync(file, mine, { flag: "wx" });
      return () => {
        if (readJson(file)?.pid === process.pid) fs.rmSync(file, { force: true });
      };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const h = holder(root);
      if (h) throw new Fail("Busy", `already running (pid ${h.pid}, run ${h.run})`);
      fs.rmSync(file, { force: true }); // left by a process that is gone
    }
  }
  throw new Fail("Busy", "could not take the lock");
}

/** A file's sha256, read in pieces. */
function hashFile(file) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(1 << 20);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex").slice(0, 24);
}

/** A step's fingerprint: its definition, its script or prompt, its `in` files and what the steps it needs made. */
function stepKey(root, p, step, ups) {
  const files = {};
  const add = (rel) => {
    const f = inside(root, rel);
    files[rel] = f ? hashFile(f) : null;
  };
  if (step.kind === "sh") {
    const f = runFile(step.run);
    if (f) add(f.rel);
  }
  if (step.kind === "agent") add(step.prompt);
  step.in.forEach(add);
  const def = { ...step, title: undefined, note: undefined, implemented: undefined, agent: step.agent ?? (step.kind === "agent" ? p.agent : undefined) };
  return shortHash(JSON.stringify({ def, files, ups }));
}

/** The files a step made in a run's folder, hashed: {file: hash}, or null when one is missing. */
function outputsOf(dir, step) {
  const out = {};
  for (const f of step.out) {
    const file = path.join(dir, ...f.split("/"));
    if (!isFile(file)) return null;
    out[f] = hashFile(file);
  }
  return out;
}

/** Puts the files of a step from an earlier run into this run's folder (a hard link; a copy when that fails). */
function linkOutputs(fromDir, toDir, step) {
  for (const f of step.out) {
    const a = path.join(fromDir, ...f.split("/"));
    const b = path.join(toDir, ...f.split("/"));
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.rmSync(b, { force: true });
    try {
      fs.linkSync(a, b);
    } catch {
      fs.copyFileSync(a, b);
    }
  }
}

/** A word for bash, quoted so nothing in it is read as code. */
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

const envName = (id) => "IN_" + id.toUpperCase().replace(/[^A-Z0-9]/g, "_");

/** How a run is told: progress lines and the last line. */
function say(line) {
  process.stdout.write(line + "\n");
}

/**
 * One run of the pipeline in `root`: `{resume, run, from, only, all}`.
 * - a new run (default): every step, the ones whose fingerprint an earlier run already has taken from it;
 *   `all`: none taken; `only: id`: that step alone, what it needs taken from the latest runs that have it
 * - `resume`: carries on the latest run (or `run`): its done steps stay, the rest run; `from: id` runs that step and those after it again
 * Resolves to the run's status. Throws Fail("Busy") while another process runs the pipeline.
 */
export async function runPipeline(root, opts = {}) {
  const tell = opts.say ?? say;
  const p = readPipeline(root);
  if (p.problems.length) throw new Fail("Invalid", `${INDEX} has problems: ${p.problems.join("; ")} (see \`check\`)`);
  if (!p.steps.length) throw new Fail("Invalid", "the pipeline has no steps yet");
  const by = new Map(p.steps.map((s) => [s.id, s]));
  for (const k of ["from", "only"]) if (opts[k] && !by.has(opts[k])) throw new Fail("NotFound", `no step "${opts[k]}"`);

  let name;
  let status;
  if (opts.resume) {
    name = opts.run ?? listRuns(root)[0];
    if (!name) throw new Fail("NotFound", "no run to resume: start one with `run`");
    status = readStatus(root, name);
    if (!status) throw new Fail("NotFound", `no run ${name}`);
  } else name = newRunName(root);
  const unlock = lock(root, name);
  const runDir = path.join(runsDir(root), name);
  const forced = new Set();
  try {
    if (!opts.resume) {
      fs.mkdirSync(runDir, { recursive: true });
      status = { format: FORMAT, pipeline: p.title, run: name, state: "running", startedAt: now(), endedAt: null, pid: process.pid, only: opts.only ?? null, steps: {} };
      for (const s of p.steps) status.steps[s.id] = { state: "pending" };
      if (opts.only) {
        forced.add(opts.only);
        for (const s of p.steps) if (s.id !== opts.only && !by.get(opts.only).needs.includes(s.id)) status.steps[s.id] = { state: "off" };
        for (const n of by.get(opts.only).needs) {
          const found = latestResult(root, by.get(n), name);
          if (!found) throw new Fail("NotFound", `"${opts.only}" needs "${n}", which no run has made yet: run the pipeline (or \`run --only ${n}\`) first`);
          linkOutputs(found.dir, path.join(runDir, n), by.get(n));
          status.steps[n] = { state: "skipped", from: found.run, outputs: found.outputs, key: found.key };
        }
      }
      if (opts.all) p.steps.forEach((s) => forced.add(s.id));
    } else {
      for (const s of p.steps) status.steps[s.id] ??= { state: "pending" };
      for (const id of Object.keys(status.steps)) if (!by.has(id)) delete status.steps[id];
      const again = opts.from ? new Set([opts.from, ...downstream(p.steps, opts.from)]) : new Set();
      for (const s of p.steps) {
        const st = status.steps[s.id];
        if (st.state === "off") continue;
        if (again.has(s.id) || !["done", "skipped"].includes(st.state)) {
          if (again.has(s.id)) forced.add(s.id);
          const keepAnswer = s.kind === "human" && !again.has(s.id);
          status.steps[s.id] = { state: "pending" };
          if (!keepAnswer) fs.rmSync(path.join(runDir, s.id), { recursive: true, force: true });
        }
      }
      status.state = "running";
      status.endedAt = null;
      status.pid = process.pid;
      status.resumedAt = now();
    }
    const save = () => atomicWrite(path.join(runDir, "status.json"), Buffer.from(JSON.stringify(status, null, 2)));
    save();
    tell(`tome-pipeline: ${p.title} · run ${name}${opts.resume ? " (resumed)" : ""} · ${path.join(runDir)}`);

    const children = new Set();
    let stopping = false;
    const onSignal = () => {
      stopping = true;
      for (const c of children) killGroup(c);
    };
    process.on("SIGTERM", onSignal);
    process.on("SIGINT", onSignal);
    const running = new Map(); // id → promise
    let failed = null;
    try {
      for (;;) {
        // A person's answer written while the run goes on lets the steps after it go.
        for (const s of p.steps) {
          const st = status.steps[s.id];
          if (st.state === "waiting" && s.kind === "human") {
            const outputs = outputsOf(path.join(runDir, s.id), s);
            if (outputs) {
              Object.assign(st, { state: "done", endedAt: now(), outputs });
              save();
              tell(`✓ ${s.id} answered`);
            }
          }
        }
        const ok = (id) => ["done", "skipped"].includes(status.steps[id].state);
        const ready = failed || stopping ? [] : p.steps.filter((s) => status.steps[s.id].state === "pending" && !running.has(s.id) && s.needs.every(ok));
        for (const s of ready) {
          if (running.size >= p.parallel) break;
          const st = status.steps[s.id];
          const ups = Object.fromEntries(s.needs.map((n) => [n, Object.keys(status.steps[n].outputs ?? {}).length ? status.steps[n].outputs : status.steps[n].key ?? null]));
          const key = stepKey(root, p, s, ups);
          const dir = path.join(runDir, s.id);
          if (!forced.has(s.id) && !s.fresh) {
            const hit = cached(root, s, key, name);
            if (hit) {
              linkOutputs(hit.dir, dir, s);
              status.steps[s.id] = { state: "skipped", key, from: hit.run, outputs: hit.outputs, endedAt: now() };
              save();
              tell(`= ${s.id} unchanged, taken from ${hit.run}`);
              continue;
            }
          }
          if (!s.implemented) {
            Object.assign(st, { state: "failed", key, error: `not written yet: ${s.kind === "sh" ? runFile(s.run).rel : s.prompt}` });
            failed = s.id;
            save();
            tell(`✗ ${s.id} not written yet`);
            break;
          }
          fs.mkdirSync(dir, { recursive: true });
          if (s.kind === "human") {
            const outputs = outputsOf(dir, s);
            Object.assign(st, outputs ? { state: "done", key, outputs, endedAt: now() } : { state: "waiting", key, since: now() });
            save();
            tell(outputs ? `✓ ${s.id} answered` : `? ${s.id} waits for a person: ${s.ask}`);
            continue;
          }
          Object.assign(st, { state: "running", key, startedAt: now(), tries: 0 });
          save();
          tell(`▶ ${s.id}`);
          const job = (async () => {
            for (let attempt = 1; attempt <= s.retry + 1; attempt++) {
              st.tries = attempt;
              save();
              const r = await runStep(root, p, s, { runDir, name, status, children, attempt });
              if (stopping) {
                Object.assign(st, { state: "failed", exit: r.code, error: "stopped", endedAt: now() });
                return;
              }
              const outputs = r.code === 0 ? outputsOf(dir, s) : null;
              if (r.code === 0 && outputs) {
                Object.assign(st, { state: "done", exit: 0, outputs, endedAt: now(), ms: Date.now() - Date.parse(st.startedAt) });
                delete st.error;
                tell(`✓ ${s.id} ${seconds(st.ms)}`);
                return;
              }
              const why = r.timedOut ? `timed out after ${seconds(s.timeoutMs)}` : r.code !== 0 ? `exit ${r.code}` : `did not write ${s.out.filter((f) => !isFile(path.join(dir, ...f.split("/")))).join(", ")}`;
              Object.assign(st, { exit: r.code, error: why });
              tell(`✗ ${s.id} ${why} (try ${attempt}/${s.retry + 1})`);
              save();
            }
            Object.assign(st, { state: "failed", endedAt: now(), ms: Date.now() - Date.parse(st.startedAt) });
            failed ??= s.id;
          })().finally(() => {
            running.delete(s.id);
            save();
          });
          running.set(s.id, job);
        }
        if (running.size === 0) {
          const more = !failed && !stopping && p.steps.some((s) => status.steps[s.id].state === "pending" && s.needs.every(ok));
          if (!more) break;
          continue;
        }
        await Promise.race([...running.values(), sleep(TICK_MS)]);
      }
    } finally {
      process.off("SIGTERM", onSignal);
      process.off("SIGINT", onSignal);
    }
    const states = Object.values(status.steps).map((s) => s.state);
    status.state = stopping ? "stopped" : failed || states.includes("failed") ? "failed" : states.includes("waiting") ? "waiting" : "done";
    status.endedAt = now();
    status.pid = null;
    save();
    tell(lastLine(root, p, status));
    return status;
  } finally {
    unlock();
  }
}

/** A step's result in the newest earlier run with this fingerprint whose files are all there. */
function cached(root, step, key, except) {
  for (const run of listRuns(root).slice(0, CACHE_LOOKBACK)) {
    if (run === except) continue;
    const st = readStatus(root, run)?.steps?.[step.id];
    if (!st || st.key !== key || !["done", "skipped"].includes(st.state)) continue;
    const dir = path.join(runsDir(root), run, step.id);
    const outputs = outputsOf(dir, step);
    if (outputs) return { run, dir, outputs };
  }
  return null;
}

/** A step's result in the newest run that has one, whatever its fingerprint (for `run --only`). */
function latestResult(root, step, except) {
  for (const run of listRuns(root).slice(0, CACHE_LOOKBACK)) {
    if (run === except) continue;
    const st = readStatus(root, run)?.steps?.[step.id];
    if (!st || !["done", "skipped"].includes(st.state)) continue;
    const dir = path.join(runsDir(root), run, step.id);
    const outputs = outputsOf(dir, step);
    if (outputs) return { run, dir, outputs, key: st.key };
  }
  return null;
}

const seconds = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s` : `${Math.round(ms / 100) / 10}s`);

/** The one line a run ends with: what a watcher (a person, a scheduler, a bot) reads. */
export function lastLine(root, p, status) {
  const head = `${p.title} · run ${status.run}`;
  if (status.state === "done") return `DONE ${head}`;
  if (status.state === "waiting") {
    const w = Object.entries(status.steps).filter(([, s]) => s.state === "waiting").map(([id]) => id);
    const s = p.steps.find((x) => x.id === w[0]);
    return `WAIT ${head} · ${w.join(", ")} waits for a person${s ? `: ${s.ask}` : ""} · answer: node ${JSON.stringify(ME)} answer ${JSON.stringify(root)} ${w[0]} "…" --resume`;
  }
  const [id, st] = Object.entries(status.steps).find(([, s]) => s.state === "failed") ?? [];
  const log = id ? path.join(runsDir(root), status.run, id, LOG) : null;
  const what = id ? ` · ${id} · ${st.error ?? `exit ${st.exit}`}${st.tries > 1 ? ` · ${st.tries} tries` : ""} · log ${log}` : "";
  return `${status.state === "stopped" ? "STOP" : "FAIL"} ${head}${what} · after fixing: node ${JSON.stringify(ME)} resume ${JSON.stringify(root)}`;
}

function killGroup(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // gone
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // gone
    }
  }, KILL_GRACE_MS).unref();
}

const INTERPRETER = { sh: "bash", bash: "bash", mjs: process.execPath, cjs: process.execPath, js: process.execPath, py: "python3", rb: "ruby" };

/** Runs one try of a sh or agent step: {code, timedOut}. */
function runStep(root, p, s, { runDir, name, status, children, attempt }) {
  const dir = path.join(runDir, s.id);
  const env = { ...process.env, ...s.env, PIPELINE_DIR: root, RUN_DIR: runDir, RUN: name, STEP: s.id, OUT: dir, TRY: String(attempt) };
  for (const n of s.needs) env[envName(n)] = path.join(runDir, n);
  let argv;
  let input = null;
  if (s.kind === "sh") {
    const f = runFile(s.run);
    if (f) {
      const file = inside(root, f.rel);
      const ext = path.extname(file).slice(1).toLowerCase();
      const rest = f.rest.trim();
      argv = ["bash", "-c", `${INTERPRETER[ext] ? shq(INTERPRETER[ext]) + " " : ""}${shq(file)}${rest ? " " + rest : ""}`];
    } else argv = ["bash", "-c", s.run];
  } else {
    input = agentPrompt(root, p, s, { runDir, name, dir });
    fs.writeFileSync(path.join(dir, PROMPT), input);
    const custom = s.agent ?? p.agent;
    if (custom) {
      // A word that names a file in the pipeline's folder (steps/my-agent.mjs) is that file wherever the step runs.
      argv = custom.map((w, i) => (i > 0 || w.includes("/") ? inside(root, w) ?? w : w));
      if (s.model) env.AGENT_MODEL = s.model;
    } else {
      argv = ["claude", "-p", "--permission-mode", "acceptEdits", ...(s.model ? ["--model", s.model] : []), "--add-dir", root, ...s.needs.map((n) => ["--add-dir", path.join(runDir, n)]).flat()];
    }
  }
  const log = fs.openSync(path.join(dir, LOG), "a");
  fs.writeSync(log, `\n[${now()}] try ${attempt}: ${argv.map((a) => (a.length > 120 ? a.slice(0, 117) + "…" : a)).join(" ")}\n`);
  return new Promise((resolve) => {
    let timedOut = false;
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { cwd: dir, env, detached: true, stdio: [input === null ? "ignore" : "pipe", log, log] });
    } catch (e) {
      fs.writeSync(log, `could not start: ${e.message}\n`);
      fs.closeSync(log);
      return resolve({ code: 127, timedOut });
    }
    children.add(child);
    if (input !== null) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
    const timer = s.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killGroup(child);
        }, s.timeoutMs)
      : null;
    let settled = false;
    const done = (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      children.delete(child);
      try {
        fs.writeSync(log, `[${now()}] exit ${code}${timedOut ? " (timed out)" : ""}\n`);
        fs.closeSync(log);
      } catch {
        // closed
      }
      resolve({ code, timedOut });
    };
    child.on("error", (e) => {
      try {
        fs.writeSync(log, `could not start ${argv[0]}: ${e.message}\n`);
      } catch {
        // closed
      }
      done(127);
    });
    child.on("close", (code, signal) => done(code ?? (signal ? 128 + (os.constants.signals[signal] ?? 0) : 1)));
  });
}

/** What an agent step is told: its prompt file, then where its inputs are and which files to write. */
function agentPrompt(root, p, s, { runDir, name, dir }) {
  const body = fs.readFileSync(inside(root, s.prompt), "utf8");
  const ins = s.needs.map((n) => {
    const d = path.join(runDir, n);
    let files = [];
    try {
      files = fs.readdirSync(d).filter((f) => !f.startsWith("_") && !f.startsWith("."));
    } catch {
      // none
    }
    return `- ${n}: ${d}${files.length ? ` (${files.join(", ")})` : ""}`;
  });
  return `${body.trimEnd()}

---
This is step "${s.id}" (${s.title}) of the pipeline "${p.title}", run ${name}. The pipeline's folder is ${root}.
${ins.length ? `Read what the steps before it made (do not change them):\n${ins.join("\n")}\n` : ""}Write these files in the folder ${dir}: ${s.out.join(", ")}
Write nothing anywhere else. When the files are written, stop.
`;
}

/** Writes a person's answer to a human step that waits in the latest run (or `run`): the run's status. */
export function answer(root, id, text, run = null) {
  const p = readPipeline(root);
  const s = p.steps.find((x) => x.id === id);
  if (!s) throw new Fail("NotFound", `no step "${id}"`);
  if (s.kind !== "human") throw new Fail("Invalid", `"${id}" is a ${s.kind} step, not a question for a person`);
  const name = run ?? listRuns(root).find((r) => readStatus(root, r)?.steps?.[id]?.state === "waiting");
  const status = name ? readStatus(root, name) : null;
  if (!status || status.steps?.[id]?.state !== "waiting") throw new Fail("NotFound", `no run waits for "${id}"`);
  const file = path.join(runsDir(root), name, id, ...s.out[0].split("/"));
  atomicWrite(file, Buffer.from(text.endsWith("\n") ? text : text + "\n"));
  if (!holder(root)) {
    Object.assign(status.steps[id], { state: "done", endedAt: now(), outputs: outputsOf(path.join(runsDir(root), name, id), s) });
    atomicWrite(path.join(runsDir(root), name, "status.json"), Buffer.from(JSON.stringify(status, null, 2)));
  }
  return { run: name, step: id, file };
}

/** The choices a human step offers in a run: the lines of its `choices` file, or []. */
function choicesOf(root, run, s) {
  if (!s.choices) return [];
  const [from, ...rest] = s.choices.split("/");
  const file = path.join(runsDir(root), run, from, ...rest);
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
      .filter((l) => l && !l.startsWith("#"))
      .slice(0, 50);
  } catch {
    return [];
  }
}

// ---- the opened pipelines ----

export class Pipelines {
  constructor() {
    this.note = path.join(homeDir(), "pipelines.json");
  }

  entries() {
    const v = readJson(this.note);
    return Array.isArray(v) ? v.filter((e) => e && typeof e.root === "string") : [];
  }

  list() {
    const out = [];
    for (const e of this.entries()) {
      if (!isFile(path.join(e.root, INDEX))) continue;
      const p = readPipeline(e.root);
      const last = listRuns(e.root)[0];
      const st = last ? readStatus(e.root, last) : null;
      out.push({ id: shortHash(e.root), root: e.root, title: p.title, steps: p.steps.length, last: last ? { run: last, state: shownState(e.root, st) } : null, openedAt: e.openedAt });
    }
    return out.sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0));
  }

  add(p) {
    const root = rootOf(p);
    const rest = this.entries().filter((e) => e.root !== root);
    fs.mkdirSync(homeDir(), { recursive: true, mode: 0o700 });
    atomicWrite(this.note, Buffer.from(JSON.stringify([{ root, openedAt: now() }, ...rest], null, 2)), 0o600);
    return this.get(shortHash(root));
  }

  remove(id) {
    atomicWrite(this.note, Buffer.from(JSON.stringify(this.entries().filter((e) => shortHash(e.root) !== id), null, 2)), 0o600);
  }

  get(id) {
    const d = this.list().find((x) => x.id === id);
    if (!d) throw new Fail("NotFound", `no opened pipeline ${id}`);
    return d;
  }
}

/** A run's state as it is now: a run whose process is gone while it said "running" was interrupted. */
function shownState(root, status) {
  if (!status) return null;
  if (status.state === "running" && !holder(root)) return "interrupted";
  return status.state;
}

/** The pipeline as the page draws it, with one run (the latest when `run` is null). */
export function view(root, id, run = null) {
  const p = readPipeline(root);
  const runs = listRuns(root);
  const name = run && runs.includes(run) ? run : runs[0] ?? null;
  const status = name ? readStatus(root, name) : null;
  const state = shownState(root, status);
  const steps = status?.steps ?? {};
  if (state === "interrupted") for (const s of Object.values(steps)) if (s.state === "running") s.state = "interrupted";
  const { at, lanes } = layout(p.steps);
  return {
    lanes,
    id,
    root,
    title: p.title,
    problems: p.problems,
    todo: p.todo,
    busy: holder(root),
    steps: p.steps.map((s) => ({ ...s, at: at[s.id], choicesList: s.kind === "human" && name && steps[s.id]?.state === "waiting" ? choicesOf(root, name, s) : undefined })),
    runs: runs.slice(0, 30).map((r) => ({ run: r, state: r === name ? state : shownState(root, readStatus(root, r)) })),
    run: status ? { ...status, state } : null,
    rev: shortHash([p.bytes ? shortHash(p.bytes) : "-", name ?? "-", status ? JSON.stringify(status) : "-", runs.length, state ?? "-", p.todo.length].join("|")),
  };
}

/** The files a step made in a run: [{file, size}] (not the runner's own _ files). */
function filesOf(dir) {
  const out = [];
  const walk = (d, rel) => {
    let names = [];
    try {
      names = fs.readdirSync(d).sort();
    } catch {
      return;
    }
    for (const n of names) {
      if (n.startsWith(".") || (!rel && n.startsWith("_"))) continue;
      const full = path.join(d, n);
      const st = fs.statSync(full, { throwIfNoEntry: false });
      if (st?.isDirectory()) {
        if (out.length < 200) walk(full, rel + n + "/");
      } else if (st?.isFile() && out.length < 200) out.push({ file: rel + n, size: st.size });
    }
  };
  walk(dir, "");
  return out;
}

function logTail(file) {
  try {
    const st = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    try {
      const n = Math.min(st.size, MAX_LOG_TAIL);
      const buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, st.size - n);
      return { text: buf.toString("utf8"), cut: st.size > n, size: st.size };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { text: "", cut: false, size: 0 };
  }
}

// ---- the page ----

const TYPES = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
};
/** Files a step made that the page shows as text. */
const TEXT = /\.(txt|md|json|jsonl|ndjson|csv|tsv|srt|vtt|log|ya?ml|toml|xml|sql|html?|css|js|mjs|py|sh)$/i;
const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

function pageFile(urlPath) {
  const name = urlPath === "/" || /^\/p\/[0-9a-f]{16}\/?$/.test(urlPath) ? "index.html" : urlPath.slice(1);
  if (!/^[a-z]+\.(html|js|css)$/.test(name)) return null;
  const file = path.join(PAGE, name);
  return isFile(file) ? file : null;
}

export async function handle(ctx, req) {
  const json = (status, value) => ({ status, type: TYPES.json, body: Buffer.from(JSON.stringify(value)) });
  const text = (status, s) => ({ status, type: TYPES.txt, body: Buffer.from(s) });
  const bad = (detail) => json(400, { code: "Invalid", detail });
  const h = (name) => req.headers[name];
  if (!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(h("host") ?? "")) return text(403, "Host not allowed");
  if (h("origin") !== undefined && h("origin") !== `http://${h("host")}`) return text(403, "Origin not allowed");
  const site = h("sec-fetch-site");
  if ((req.path.startsWith("/api/") || req.path.startsWith("/o/")) && site !== undefined && site !== "same-origin" && site !== "none") return text(403, "not from the page");
  if (req.method !== "GET" && req.method !== "HEAD" && h(WRITE_HEADER) === undefined) return text(403, "not from the page");
  const pipelines = (ctx.pipelines ??= new Pipelines());
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
    if (route === "GET /api/ping") return json(200, { ok: true, pid: process.pid, build: ctx.build, home: homeDir() });
    if (route === "GET /api/pipelines") return json(200, { pipelines: pipelines.list() });
    if (route === "GET /api/pipeline") {
      const id = req.query.get("id");
      if (id === null) return bad("id");
      const d = pipelines.get(id);
      return json(200, view(d.root, d.id, req.query.get("run")));
    }
    if (route === "GET /api/step") {
      // One step in one run: its log's end and its files.
      const id = req.query.get("id");
      const run = req.query.get("run");
      const step = req.query.get("step");
      if (id === null || run === null || step === null || !RUN_NAME.test(run) || !ID.test(step)) return bad("id, run and step");
      const d = pipelines.get(id);
      const dir = path.join(runsDir(d.root), run, step);
      return json(200, { log: logTail(path.join(dir, LOG)), files: filesOf(dir), prompt: isFile(path.join(dir, PROMPT)) });
    }
    if (route === "POST /api/answer") {
      // A person's answer to a human step from the page; the run goes on in a process of its own.
      const id = req.query.get("id");
      const b = body();
      if (id === null || !b || typeof b.step !== "string" || typeof b.text !== "string" || !b.text.trim()) return bad("id, and {step, text, run?}");
      if (b.text.length > 20000) return bad("the answer is too long");
      const d = pipelines.get(id);
      const done = answer(d.root, b.step, b.text, typeof b.run === "string" && RUN_NAME.test(b.run) ? b.run : null);
      let resumed = false;
      if (!holder(d.root)) {
        const child = spawn(process.execPath, [ME, "resume", d.root, "--run", done.run], { detached: true, stdio: "ignore" });
        child.unref();
        resumed = true;
      }
      return json(200, { ...done, resumed });
    }
    const o = req.path.match(/^\/o\/([0-9a-f]{16})\/([^/]+)\/([^/]+)\/(.+)$/);
    if (o && (req.method === "GET" || req.method === "HEAD")) {
      const [, id, run, step, rel] = o;
      if (!RUN_NAME.test(run) || !ID.test(step) || !relParts(rel)) return text(404, "not found");
      const d = pipelines.get(id);
      const file = inside(path.join(runsDir(d.root), run, step), rel) ?? (rel === LOG || rel === PROMPT ? path.join(runsDir(d.root), run, step, rel) : null);
      if (!file || !isFile(file)) return text(404, "not found");
      return sendFile(file, req, req.query.get("download") !== null);
    }
    if (req.method === "GET" || req.method === "HEAD") {
      const file = pageFile(req.path);
      if (file) return { status: 200, type: TYPES[path.extname(file).slice(1)], body: fs.readFileSync(file) };
    }
    return text(404, "not found");
  } catch (e) {
    if (e instanceof Fail) return json(STATUS[e.code] ?? 400, { code: e.code, detail: e.message });
    return json(500, { code: "Io", detail: String(e?.message ?? e) });
  }
}

/** A file a step made: pictures, sound and video as themselves (with ranges), text as text, the rest to download. */
function sendFile(file, req, download) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const st = fs.statSync(file);
  const name = path.basename(file);
  let type = TYPES[ext] && !["html", "js", "css", "json"].includes(ext) ? TYPES[ext] : TEXT.test(file) ? TYPES.txt : "application/octet-stream";
  const headers = { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'", "Accept-Ranges": "bytes" };
  if (download || type === "application/octet-stream") headers["Content-Disposition"] = `attachment; filename="${name.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  const range = (req.headers.range ?? "").match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = st.size - 1;
  let status = 200;
  if (range && st.size > 0) {
    if (range[1] === "") start = Math.max(0, st.size - Number(range[2]));
    else {
      start = Number(range[1]);
      if (range[2] !== "") end = Math.min(end, Number(range[2]));
    }
    if (start > end || start >= st.size) return { status: 416, type: TYPES.txt, body: Buffer.alloc(0), headers: { "Content-Range": `bytes */${st.size}` } };
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
  }
  const length = st.size === 0 ? 0 : end - start + 1;
  return { status, type, length, stream: () => fs.createReadStream(file, length ? { start, end } : { start: 0, end: -1 }), headers };
}

function ownBuild() {
  let names = [];
  try {
    names = fs.readdirSync(PAGE).sort();
  } catch {
    // no page
  }
  const files = [ME, ...names.map((f) => path.join(PAGE, f))];
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

// `<home>/servers/main.json` holds {pid, url, port, root, kind: "pipeline", startedAt}, like the other local pages.
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
    await sleep(100);
  }
}

export async function serve(firstPort = DEFAULT_PORT) {
  const { server, port } = await listen(firstPort);
  const ctx = { build: ownBuild() };
  server.on("request", (req, res) => {
    const chunks = [];
    let size = 0;
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
        out = await handle(ctx, { method: req.method, path: pathname, query: url.searchParams, headers: req.headers, body: Buffer.concat(chunks) });
      } catch {
        out = { status: 400, type: TYPES.txt, body: Buffer.from("bad request\n") };
      }
      res.writeHead(out.status, {
        "Content-Type": out.type,
        "Content-Length": out.stream ? out.length : out.body.length,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": PAGE_CSP,
        ...(out.headers ?? {}),
      });
      if (req.method === "HEAD") return res.end();
      if (out.stream) {
        if (!out.length) return res.end();
        const s = out.stream();
        s.on("error", () => res.destroy());
        res.on("close", () => s.destroy());
        return s.pipe(res);
      }
      res.end(out.body);
    });
  });
  const url = `http://127.0.0.1:${port}/`;
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true, mode: 0o700 });
  atomicWrite(stateFile(), Buffer.from(JSON.stringify({ pid: process.pid, url, port, root: homeDir(), kind: "pipeline", startedAt: now() }, null, 2)), 0o600);
  const bye = () => {
    if (readJson(stateFile())?.pid === process.pid) fs.rmSync(stateFile(), { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
  console.error(`tome-pipeline: ${url}`);
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

async function ensure(port) {
  let state = await running();
  if (state && state.build === ownBuild()) return { ...state, reused: true };
  if (state) await stop();
  fs.mkdirSync(path.dirname(logFile()), { recursive: true, mode: 0o700 });
  const log = fs.openSync(logFile(), "a", 0o600);
  const child = spawn(process.execPath, [ME, "serve", "--port", String(port)], { detached: true, stdio: ["ignore", log, log] });
  child.unref();
  fs.closeSync(log);
  if (!(await until(8000, async () => (state = await running()) !== null))) throw new Error(`it did not start: see ${logFile()}`);
  return { ...state, reused: false };
}

// ---- the command ----

function fail(message, code = EXIT.usage) {
  console.error(`tome-pipeline: ${message}`);
  process.exit(code);
}

const USAGE = `tome-pipeline: a pipeline is a folder (pipeline.json and steps/); run it, carry a run on, and watch it in a page of this machine

pipeline.mjs new TITLE [--in DIR]      make a pipeline's folder DIR/TITLE (default DIR: ./pipelines) and open it; prints {url, root, index, …}
pipeline.mjs check FOLDER              what is wrong in pipeline.json (problems) and which steps are not written yet (todo); exits 1 on problems
pipeline.mjs run FOLDER                one run: a new runs/<time>/; steps whose inputs did not change are taken from an earlier run
             --all                     run every step, take none from earlier runs
             --only STEP               that step alone (to try it), what it needs taken from the latest runs
pipeline.mjs resume FOLDER             carry the latest run on: done steps stay, the rest run
             --from STEP               run STEP and every step after it again
             --run NAME                that run instead of the latest
pipeline.mjs answer FOLDER STEP TEXT   answer a human step that waits (TEXT "-": from stdin); --resume then carries the run on
pipeline.mjs status FOLDER             the latest run (--run NAME: that one): its state and each step's
pipeline.mjs schedule FOLDER --cron "0 6 * * *"   the lines of a scheduled job that runs it (prints them; writes nothing)
pipeline.mjs open [FOLDER]             start the page if needed; prints {url, …} (no FOLDER: the list)
pipeline.mjs list                      the opened pipelines
pipeline.mjs close FOLDER              take it off the list (the files stay)
pipeline.mjs stop                      end the page's process
pipeline.mjs serve                     run the page here, in the foreground

run and resume print a line per step and end with one line: DONE …, FAIL …, WAIT … or STOP …;
they exit 0 (done), 1 (a step failed), 3 (a step waits for a person) or 4 (the pipeline is running already).

--port N      the page's first port to try (default ${DEFAULT_PORT})
`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || ["help", "--help", "-h"].includes(command)) return void process.stdout.write(USAGE);
  let port = DEFAULT_PORT;
  let parent = null;
  const opt = {};
  const words = [];
  const flags = new Set();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const value = (name) => {
      const v = rest[++i];
      if (v === undefined) fail(`${name} needs a value`);
      return v;
    };
    if (["--all", "--resume"].includes(a)) flags.add(a.slice(2));
    else if (a === "--port") {
      const v = value(a);
      if (!/^\d+$/.test(v)) fail("--port is a number");
      port = Number(v);
    } else if (a === "--in") parent = path.resolve(value(a));
    else if (["--only", "--from", "--run", "--cron"].includes(a)) opt[a.slice(2)] = value(a);
    else if (a.startsWith("--")) fail(`unknown option ${a}`);
    else words.push(a);
  }
  const print = (v) => console.log(JSON.stringify(v, null, 2));
  const pipelines = new Pipelines();
  const folder = (what) => (words.length ? rootOf(words[0]) : fail(`${what} needs a pipeline's folder`));
  const urlOf = (base, d) => `${base}p/${d.id}`;
  const runIt = async (root, o) => {
    try {
      pipelines.add(root);
    } catch {
      // the list is a convenience
    }
    const status = await runPipeline(root, o);
    process.exit(EXIT[status.state] ?? EXIT.failed);
  };
  try {
    if (command === "serve") return void (await serve(port));
    if (command === "stop") return print(await stop());
    if (command === "check") {
      const r = checkPipeline(folder("check"));
      print(r);
      process.exit(r.problems.length ? 1 : 0);
    }
    if (command === "run") {
      if (opt.from || opt.run) fail("run starts a new run; to carry one on: resume [--from STEP] [--run NAME]");
      return await runIt(folder("run"), { all: flags.has("all"), only: opt.only });
    }
    if (command === "resume") {
      if (opt.only || flags.has("all")) fail("resume carries a run on; to start one: run [--only STEP] [--all]");
      return await runIt(folder("resume"), { resume: true, from: opt.from, run: opt.run });
    }
    if (command === "answer") {
      const root = folder("answer");
      if (words.length < 3) fail("answer needs the step and the text (or - for stdin)");
      const done = answer(root, words[1], words[2] === "-" ? fs.readFileSync(0, "utf8") : words[2], opt.run ?? null);
      if (!flags.has("resume")) return print({ ...done, next: `node ${JSON.stringify(ME)} resume ${JSON.stringify(root)}` });
      return await runIt(root, { resume: true, run: done.run });
    }
    if (command === "status") {
      const root = folder("status");
      const name = opt.run ?? listRuns(root)[0];
      if (!name) return print({ run: null, note: "no run yet" });
      const v = view(root, shortHash(root), name);
      return print({ run: name, state: v.run?.state, busy: v.busy, steps: Object.fromEntries(Object.entries(v.run?.steps ?? {}).map(([id, s]) => [id, { state: s.state, ...(s.error ? { error: s.error } : {}), ...(s.from ? { from: s.from } : {}), ...(s.ms ? { ms: s.ms } : {}) }])), folder: path.join(runsDir(root), name) });
    }
    if (command === "schedule") {
      const root = folder("schedule");
      if (!opt.cron) fail('schedule needs --cron "MIN HOUR DAY MONTH WEEKDAY"');
      const p = readPipeline(root);
      const line = `node ${JSON.stringify(ME)} run ${JSON.stringify(root)}`;
      return print({ cron: opt.cron, title: p.title, command: line, crontab: `${opt.cron} ${line} >> ${JSON.stringify(path.join(runsDir(root), "cron.log"))} 2>&1` });
    }
    if (command === "list") {
      const state = await running();
      return print(pipelines.list().map((d) => ({ id: d.id, root: d.root, title: d.title, steps: d.steps, last: d.last, url: state ? urlOf(state.url, d) : null })));
    }
    if (command === "close") {
      const root = folder("close");
      const d = pipelines.list().find((x) => x.root === root) ?? fail(`not an opened pipeline: ${root}`);
      pipelines.remove(d.id);
      return print({ closed: d.root });
    }
    if (command === "new" || command === "open") {
      let d = null;
      if (command === "new") {
        if (words.length === 0 || !words[0].trim()) fail("new needs a title");
        d = pipelines.add(makePipeline(words[0], parent ?? path.resolve("pipelines")));
      } else if (words.length) d = pipelines.add(words[0]);
      const state = await ensure(port);
      const res = { url: state.url, pid: state.pid, reused: state.reused, stop: `node ${JSON.stringify(ME)} stop` };
      if (!d) return print(res);
      return print({ ...res, url: urlOf(state.url, d), id: d.id, title: d.title, root: d.root, index: path.join(d.root, INDEX), steps: d.steps });
    }
  } catch (e) {
    fail(e.message, e instanceof Fail && e.code === "Busy" ? EXIT.busy : EXIT.usage);
  }
  fail(`unknown command ${command}\n\n${USAGE}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === ME) {
  main(process.argv.slice(2)).catch((e) => fail(e?.message ?? String(e)));
}
