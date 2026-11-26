#!/usr/bin/env node
// tome-etl: a dbt project seen as a graph. It reads what dbt wrote in the
// project's `target/` (`manifest.json` from `dbt parse`; `catalog.json` and
// `run_results.json` when they are there) and never the warehouse, lays the
// models, sources, seeds and snapshots out by what each reads, and serves a
// page on 127.0.0.1 that draws them, shows one model's SQL, columns, tests
// and last results, and takes comments an agent answers. Models that are not
// written yet are plans in the project's `tome-etl.json`: they are drawn
// dashed on the same graph, and `scaffold` writes a plan's `.sql` and `.yml`.
// `review` names what a model lacks (tests, a tested key, a description, a
// unique key when incremental, freshness on a source).
//
// The only dbt command it runs is `dbt parse`, which connects to nothing.
// No dependencies: Node 20+. Its own notes are in `~/.tome-etl` (which
// projects are open, the running page, the comments).

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 4790;
export const PLAN_FILE = "tome-etl.json";
export const FORMAT = 1;
export const RULES = ["no-tests", "no-key-test", "key-not-tested", "unique-without-not-null", "no-description", "incremental-no-unique-key", "source-no-freshness"];
export const MATERIALIZED = ["view", "table", "incremental", "ephemeral", "materialized_view"];
const PORT_TRIES = 30;
const MAX_BODY = 256 * 1024;
const MAX_PLAN_FILE = 2 * 1024 * 1024;
const MAX_PLANS = 300;
const MAX_COMMENT = 8000;
const MAX_SQL = 400 * 1024;
/** More boxes than this are not drawn at once: the page shows one model's neighbours instead. */
export const MAX_DRAW = 160;
const MAX_WALK = 20000;
const STALE_CACHE_MS = 3000;
const PARSE_TIMEOUT_MS = 10 * 60 * 1000;
const WRITE_HEADER = "x-tome-etl";
const WAIT_MS = 25000;
const TAKE_STEP_MS = 400;
/** How long the page still shows an agent as listening after its wait ended (it asks again right away). */
const LISTEN_GRACE_MS = 3000;
const here = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const PAGE = path.join(here, "page");
const ME = path.join(here, "etl.mjs");

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
const str = (v) => (typeof v === "string" ? v : "");
const list = (v) => (Array.isArray(v) ? v : v === null || v === undefined || v === "" ? [] : [v]);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function homeDir() {
  return process.env.TOME_ETL_HOME || path.join(os.homedir(), ".tome-etl");
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

/** A path inside the project as written in a plan: its parts, or null when it may not name a file. */
export function relParts(rel) {
  if (typeof rel !== "string" || !rel || rel.length > 400 || rel.includes("\0") || rel.includes("\\") || rel.startsWith("/")) return null;
  const parts = rel.split("/");
  if (parts.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) return null;
  return parts;
}

const sig = (file) => {
  const st = fs.statSync(file, { throwIfNoEntry: false });
  return st?.isFile() ? `${Math.floor(st.mtimeMs)}:${st.size}` : "-";
};

// ---- the project ----

/** What kind of project a folder is: "dbt", or null. */
export function projectKind(root) {
  return isFile(path.join(root, "dbt_project.yml")) ? "dbt" : null;
}

/** The project's folder a path names: the folder itself, or the folder of a file in it. */
export function rootOf(p) {
  let real;
  try {
    real = fs.realpathSync(p);
  } catch {
    throw new Fail("NotFound", `no such folder: ${p}`);
  }
  if (isFile(real)) real = path.dirname(real);
  if (!isDir(real)) throw new Fail("Invalid", `not a folder: ${p}`);
  if (!projectKind(real)) {
    const hint = isFile(path.join(real, "workflow_settings.yaml")) || isFile(path.join(real, "dataform.json")) ? " (a Dataform project: not read yet)" : "";
    throw new Fail("NotFound", `no dbt_project.yml in ${p}${hint}`);
  }
  return real;
}

/** `target-path` as dbt_project.yml gives it on one line; else "target". */
function targetDir(root) {
  let name = process.env.DBT_TARGET_PATH || "";
  if (!name) {
    try {
      const m = fs.readFileSync(path.join(root, "dbt_project.yml"), "utf8").match(/^target-path:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/m);
      if (m) name = m[1].trim();
    } catch {
      // the default
    }
  }
  return path.resolve(root, name || "target");
}

/** The project's `name` in dbt_project.yml, or "". */
function projectName(root) {
  try {
    return fs.readFileSync(path.join(root, "dbt_project.yml"), "utf8").match(/^name:\s*["']?([A-Za-z_]\w*)["']?\s*(?:#.*)?$/m)?.[1] ?? "";
  } catch {
    return "";
  }
}

// ---- reading what dbt wrote ----
//
// A node of the graph: {id, type: "model" | "source" | "seed" | "snapshot" |
// "exposure" | "plan" | "unknown", name, pkg, own, path, patch, folder, tags,
// materialized, description, relation, deps: [id], key, config, columns:
// [{name, description, type, tests: [kind]}], tests: [{id, kind, name,
// column, detail, status, message, failures}], sql, compiled, result,
// freshness, stats}. Everything the rest of this file and the page use is
// read from these, so another tool's project needs only its own reader.

const DRAWN = ["model", "seed", "snapshot"];

/** `"pkg://models/schema.yml"` → `models/schema.yml`. */
const patchPath = (v) => (typeof v === "string" && v ? v.replace(/^[^:/]+:\/\//, "") : null);

/** The name a `ref('x')` or `source('a', 'b')` written in a test's arguments points at. */
function refName(text) {
  const r = str(text).match(/ref\(\s*['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
  if (r) return r[2] ?? r[1];
  const s = str(text).match(/source\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/);
  return s ? `${s[1]}.${s[2]}` : null;
}

function short(v, n = 160) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s === undefined ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** A test's arguments in a few words: `in (placed, shipped)`, `→ customers.customer_id`. */
function testDetail(kind, kw) {
  if (kind === "accepted_values") return `in (${list(kw.values).map(String).join(", ")})`.slice(0, 200);
  if (kind === "relationships") return `→ ${refName(kw.to) ?? short(kw.to, 60)}.${str(kw.field)}`;
  const rest = Object.entries(kw).filter(([k]) => !["model", "column_name"].includes(k));
  return rest.length ? short(Object.fromEntries(rest), 200) : "";
}

const freshnessText = (f) => {
  const part = (v) => (obj(v).count ? `${v.count} ${v.period}${v.count === 1 ? "" : "s"}` : null);
  return { warn: part(obj(f).warn_after), error: part(obj(f).error_after) };
};

/** The graph of a dbt project from its manifest (any schema version since v4), with catalog and results when given. */
export function fromDbt(manifest, { catalog = null, results = null, sources = null, project: named = "" } = {}) {
  const meta = obj(manifest.metadata);
  const project = str(meta.project_name) || named;
  const nodes = new Map();
  const add = (n) => (nodes.set(n.id, n), n);
  const base = (n, type) => ({
    id: n.unique_id,
    type,
    name: n.name,
    pkg: str(n.package_name),
    own: !project || n.package_name === project,
    path: str(n.original_file_path) || null,
    patch: patchPath(n.patch_path),
    folder: path.posix.dirname(str(n.original_file_path) || "."),
    tags: [...new Set([...list(n.tags), ...list(obj(n.config).tags)].filter((t) => typeof t === "string"))],
    materialized: null,
    description: str(n.description).trim(),
    relation: str(n.relation_name) || null,
    deps: [],
    key: null,
    config: {},
    columns: Object.values(obj(n.columns)).map((c) => ({ name: str(c.name), description: str(c.description).trim(), type: str(c.data_type) || null, tests: [], constraints: list(c.constraints).map((k) => str(obj(k).type)).filter(Boolean) })),
    tests: [],
    sql: null,
    compiled: null,
    result: null,
    freshness: null,
    stats: null,
  });

  const tests = [];
  for (const n of Object.values(obj(manifest.nodes))) {
    if (!n || typeof n.unique_id !== "string") continue;
    if (n.resource_type === "test") {
      tests.push(n);
      continue;
    }
    if (!DRAWN.includes(n.resource_type)) continue;
    const node = add(base(n, n.resource_type));
    const cfg = obj(n.config);
    node.materialized = n.resource_type === "model" ? str(cfg.materialized) || "view" : n.resource_type;
    node.deps = list(obj(n.depends_on).nodes).filter((d) => typeof d === "string");
    node.sql = typeof n.raw_code === "string" ? n.raw_code : typeof n.raw_sql === "string" ? n.raw_sql : null;
    node.compiled = typeof n.compiled_code === "string" ? n.compiled_code : typeof n.compiled_sql === "string" ? n.compiled_sql : null;
    const pick = {};
    for (const k of ["unique_key", "incremental_strategy", "on_schema_change", "partition_by", "cluster_by", "strategy", "updated_at", "check_cols", "event_time"]) {
      const v = cfg[k];
      if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) pick[k] = v;
    }
    if (obj(cfg.contract).enforced === true || obj(n.contract).enforced === true) pick.contract = "enforced";
    node.config = pick;
    // The key, where the project says it: constraints, then the incremental (or snapshot) unique key.
    const constrained = [
      ...list(n.constraints).filter((k) => obj(k).type === "primary_key").flatMap((k) => list(k.columns)),
      ...node.columns.filter((c) => c.constraints.includes("primary_key")).map((c) => c.name),
    ].filter((c) => typeof c === "string");
    const unique = list(cfg.unique_key).filter((c) => typeof c === "string" && /^[\w"`.]+$/.test(c));
    if (constrained.length) node.key = { columns: [...new Set(constrained)], from: "constraint" };
    else if (unique.length) node.key = { columns: unique, from: "unique_key" };
    node.inferredKey = list(n.primary_key).filter((c) => typeof c === "string");
  }
  for (const s of Object.values(obj(manifest.sources))) {
    if (!s || typeof s.unique_id !== "string") continue;
    const node = add(base(s, "source"));
    node.name = `${str(s.source_name)}.${str(s.name)}`;
    node.materialized = "source";
    node.description = str(s.description).trim() || str(s.source_description).trim();
    const f = freshnessText(s.freshness);
    node.freshness = { warn: f.warn, error: f.error, loadedAt: str(s.loaded_at_field) || null, status: null, maxLoadedAt: null };
  }
  for (const e of Object.values(obj(manifest.exposures))) {
    if (!e || typeof e.unique_id !== "string") continue;
    const node = add(base(e, "exposure"));
    node.materialized = str(e.type) || "exposure";
    node.deps = list(obj(e.depends_on).nodes).filter((d) => typeof d === "string");
  }

  for (const t of tests) {
    const md = obj(t.test_metadata);
    const kw = obj(md.kwargs);
    const deps = list(obj(t.depends_on).nodes).filter((d) => nodes.has(d));
    // The model a test is written under: `attached_node` (dbt 1.5+), else the one its `model` argument names.
    let owner = typeof t.attached_node === "string" && nodes.has(t.attached_node) ? t.attached_node : null;
    if (!owner) {
      const named = refName(kw.model);
      owner = (named && deps.find((d) => nodes.get(d).name === named)) ?? (md.name ? deps[deps.length - 1] : null) ?? null;
    }
    const kind = md.name ? (md.namespace ? `${md.namespace}.${md.name}` : str(md.name)) : "singular";
    const column = str(t.column_name) || str(kw.column_name) || null;
    const test = { id: t.unique_id, kind, name: str(t.name), column, detail: md.name ? testDetail(str(md.name), kw) : str(t.original_file_path), columns: list(kw.combination_of_columns).filter((c) => typeof c === "string"), severity: str(obj(t.config).severity).toLowerCase() || "error", status: null, message: null, failures: null };
    for (const id of owner ? [owner] : deps) {
      const node = nodes.get(id);
      node.tests.push(test);
      const col = column ? node.columns.find((c) => c.name.toLowerCase() === column.toLowerCase()) : null;
      if (col) col.tests.push(kind);
    }
  }
  for (const u of Object.values(obj(manifest.unit_tests))) {
    const owner = list(obj(u?.depends_on).nodes).find((d) => nodes.has(d));
    if (owner) nodes.get(owner).tests.push({ id: u.unique_id, kind: "unit", name: str(u.name), column: null, detail: str(u.description), columns: [], severity: "error", status: null, message: null, failures: null });
  }
  for (const n of nodes.values()) {
    n.deps = [...new Set(n.deps.filter((d) => nodes.has(d) && d !== n.id))];
    if (!n.key && n.inferredKey?.length) n.key = { columns: n.inferredKey, from: "tests" };
    delete n.inferredKey;
  }

  // What the last `dbt run / build / test` said, node by node.
  let ran = null;
  if (results && Array.isArray(results.results)) {
    ran = { at: str(obj(results.metadata).generated_at) || null, which: str(obj(results.args).which) || null, target: str(obj(results.args).target) || null };
    const tested = new Map();
    for (const n of nodes.values()) for (const t of n.tests) (tested.get(t.id) ?? tested.set(t.id, []).get(t.id)).push(t);
    for (const r of results.results) {
      if (!r || typeof r.unique_id !== "string") continue;
      const status = str(r.status);
      const message = typeof r.message === "string" ? r.message.slice(0, 2000) : null;
      for (const t of tested.get(r.unique_id) ?? []) Object.assign(t, { status, message, failures: Number.isFinite(r.failures) ? r.failures : null });
      const node = nodes.get(r.unique_id);
      if (!node) continue;
      const rows = obj(r.adapter_response).rows_affected;
      node.result = { status, seconds: Number.isFinite(r.execution_time) ? Math.round(r.execution_time * 100) / 100 : null, rows: Number.isFinite(rows) && rows >= 0 ? rows : null, message, at: list(r.timing).map((t) => str(obj(t).completed_at)).filter(Boolean).pop() ?? ran.at };
      if (!node.compiled && typeof r.compiled_code === "string") node.compiled = r.compiled_code;
    }
  }
  if (sources && Array.isArray(sources.results)) {
    for (const r of sources.results) {
      const node = nodes.get(r?.unique_id);
      if (node?.freshness) Object.assign(node.freshness, { status: str(r.status) || null, maxLoadedAt: str(r.max_loaded_at) || null });
    }
  }
  // The warehouse's own word on columns and sizes, when `dbt docs generate` was run.
  if (catalog) {
    for (const [id, c] of [...Object.entries(obj(catalog.nodes)), ...Object.entries(obj(catalog.sources))]) {
      const node = nodes.get(id);
      if (!node || !c) continue;
      const known = new Map(node.columns.map((x) => [x.name.toLowerCase(), x]));
      for (const col of Object.values(obj(c.columns)).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
        const mine = known.get(str(col.name).toLowerCase());
        if (mine) mine.type = str(col.type) || mine.type;
        else node.columns.push({ name: str(col.name), description: str(col.comment).trim(), type: str(col.type) || null, tests: [], constraints: [], undocumented: true });
      }
      const stat = (...names) => {
        for (const k of names) {
          const s = obj(c.stats)[k];
          if (s && s.include !== false && Number.isFinite(Number(s.value))) return Number(s.value);
        }
        return null;
      };
      node.stats = { rows: stat("row_count", "num_rows"), bytes: stat("bytes", "num_bytes"), kind: str(obj(c.metadata).type) || null };
    }
  }
  const version = str(meta.dbt_schema_version).match(/manifest\/v(\d+)/)?.[1] ?? null;
  return {
    kind: "dbt",
    project: project || null,
    tool: { name: "dbt", version: str(meta.dbt_version) || null, schema: version ? `v${version}` : null, adapter: str(meta.adapter_type) || null },
    parsedAt: str(meta.generated_at) || null,
    ran,
    catalog: Boolean(catalog),
    nodes,
    packages: [...new Set(Object.keys(obj(manifest.macros)).map((k) => k.split(".")[1]).filter(Boolean))],
  };
}

// ---- plans: the models that are not written yet ----
//
// `<project>/tome-etl.json`: {format: 1, dbt?: [command…], plans: [{name,
// kind?: "model" | "source", path?, materialized?, description?, grain?,
// key?: [column], from?: [name], columns?: [{name, type?, description?,
// tests?: [name | {name: arguments}]}], watermark?, tags?, note?,
// loaded_at?, freshness?: {warn?, error?} (a source)}]}.

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,119}$/;
const SOURCE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,79}\.[A-Za-z_][A-Za-z0-9_]{0,119}$/;
const AGE = /^(\d{1,4})\s*(minute|hour|day)s?$|^(\d{1,4})\s*(m|h|d)$/;

/** "12h", "2 days": {count, period}, or null. */
export function parseAge(v) {
  const m = typeof v === "string" ? v.trim().toLowerCase().match(AGE) : null;
  if (!m) return null;
  const count = Number(m[1] ?? m[3]);
  const period = m[2] ?? { m: "minute", h: "hour", d: "day" }[m[4]];
  return count > 0 ? { count, period } : null;
}

/** What the plan file says, checked: {dbt, plans, problems: [text], open: [{plan, missing}], bytes}. */
export function readPlans(root) {
  const problems = [];
  const open = [];
  const out = { dbt: null, plans: [], problems, open, exists: false };
  const file = path.join(root, PLAN_FILE);
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st?.isFile()) return out;
  out.exists = true;
  if (st.size > MAX_PLAN_FILE) {
    problems.push(`${PLAN_FILE} is larger than ${MAX_PLAN_FILE} bytes`);
    return out;
  }
  let v;
  try {
    v = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    problems.push(`${PLAN_FILE} is not JSON: ${e.message}`);
    return out;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    problems.push(`${PLAN_FILE} is not an object`);
    return out;
  }
  if (v.format !== undefined && v.format !== FORMAT) problems.push(`format ${JSON.stringify(v.format)}: this tome-etl reads format ${FORMAT}`);
  if (v.dbt !== undefined) {
    if (Array.isArray(v.dbt) && v.dbt.length && v.dbt.every((s) => typeof s === "string" && s)) out.dbt = v.dbt;
    else problems.push('dbt is the command that starts dbt, as a list of words, like ["uvx", "--from", "dbt-core", "--with", "dbt-duckdb", "dbt"]');
  }
  for (const k of Object.keys(v)) if (!["format", "dbt", "plans"].includes(k)) problems.push(`unknown field ${k}`);
  if (v.plans === undefined) return out;
  if (!Array.isArray(v.plans)) {
    problems.push("plans is not a list");
    return out;
  }
  if (v.plans.length > MAX_PLANS) problems.push(`more than ${MAX_PLANS} plans`);
  const seen = new Set();
  const text = (x, n) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  for (const [i, p] of v.plans.slice(0, MAX_PLANS).entries()) {
    const where = `plans[${i}]`;
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      problems.push(`${where} is not an object`);
      continue;
    }
    const kind = p.kind === undefined ? "model" : p.kind;
    if (!["model", "source"].includes(kind)) {
      problems.push(`${where}: kind is "model" or "source"`);
      continue;
    }
    if (typeof p.name !== "string" || !(kind === "source" ? SOURCE_NAME : NAME).test(p.name)) {
      problems.push(`${where}: name is ${kind === "source" ? 'a source and its table, "raw.payments"' : "a model's name: letters, digits and _"}`);
      continue;
    }
    if (seen.has(p.name)) {
      problems.push(`${where}: a second plan "${p.name}"`);
      continue;
    }
    seen.add(p.name);
    const at = `plan "${p.name}": `;
    const plan = { name: p.name, kind, path: null, materialized: null, description: text(p.description, 2000), grain: text(p.grain, 300), key: [], from: [], columns: [], watermark: null, tags: [], note: text(p.note, 2000), loadedAt: null, freshness: null };
    const strings = (name, check, hint) => {
      if (p[name] === undefined) return [];
      if (!Array.isArray(p[name]) || !p[name].every((x) => typeof x === "string" && check(x))) {
        problems.push(`${at}${name} is a list of ${hint}`);
        return [];
      }
      return [...new Set(p[name])];
    };
    const ext = kind === "source" ? /\.ya?ml$/ : /\.sql$/;
    if (p.path === undefined) plan.path = kind === "source" ? `models/sources/${p.name.replace(".", "__")}.yml` : `models/${p.name}.sql`;
    else if (relParts(p.path) && ext.test(p.path) && (kind === "source" || path.posix.basename(p.path) === `${p.name}.sql`)) plan.path = p.path;
    else problems.push(`${at}path is the file to write inside the project, ${kind === "source" ? "ending .yml" : `ending /${p.name}.sql`}`);
    plan.tags = strings("tags", (x) => /^[\w.:-]{1,60}$/.test(x), "tags");
    plan.key = strings("key", (x) => NAME.test(x), "column names");
    if (p.columns !== undefined) {
      if (!Array.isArray(p.columns)) problems.push(`${at}columns is a list`);
      else {
        const names = new Set();
        for (const c of p.columns.slice(0, 500)) {
          if (!c || typeof c !== "object" || typeof c.name !== "string" || !NAME.test(c.name) || names.has(c.name.toLowerCase())) {
            problems.push(`${at}a column needs a name of its own (letters, digits and _): ${short(c, 60)}`);
            continue;
          }
          names.add(c.name.toLowerCase());
          const col = { name: c.name, type: text(c.type, 80) || null, description: text(c.description, 1000), tests: [] };
          if (c.tests !== undefined) {
            const fine = (t) => (typeof t === "string" && /^[\w.]{1,80}$/.test(t)) || (t && typeof t === "object" && !Array.isArray(t) && Object.keys(t).length === 1 && /^[\w.]{1,80}$/.test(Object.keys(t)[0]));
            if (Array.isArray(c.tests) && c.tests.every(fine)) col.tests = c.tests;
            else problems.push(`${at}column ${c.name}: tests is a list of test names ("not_null") or {name: arguments} ({"accepted_values": {"values": ["a", "b"]}})`);
          }
          plan.columns.push(col);
        }
      }
    }
    for (const k of plan.key) if (plan.columns.length && !plan.columns.some((c) => c.name === k)) problems.push(`${at}key column ${k} is not in columns`);
    const known = ["name", "kind", "path", "description", "columns", "tags", "note", "key"];
    if (kind === "model") {
      known.push("materialized", "grain", "from", "watermark");
      plan.from = strings("from", (x) => NAME.test(x) || SOURCE_NAME.test(x), 'names: a model, seed or snapshot ("stg_orders"), a source\'s table ("raw.payments") or another plan');
      if (p.materialized !== undefined) {
        if (MATERIALIZED.includes(p.materialized)) plan.materialized = p.materialized;
        else problems.push(`${at}materialized is one of ${MATERIALIZED.join(", ")}`);
      }
      if (p.watermark !== undefined) {
        if (typeof p.watermark === "string" && NAME.test(p.watermark)) plan.watermark = p.watermark;
        else problems.push(`${at}watermark is the column new rows are found by ("updated_at")`);
      }
      if (plan.from.includes(p.name)) problems.push(`${at}it reads itself`);
      if (!plan.grain) open.push({ plan: p.name, missing: "grain: what one row is" });
      if (!plan.key.length) open.push({ plan: p.name, missing: "key: the columns that name one row" });
      if (!plan.from.length) open.push({ plan: p.name, missing: "from: what it reads" });
      if (!plan.materialized) open.push({ plan: p.name, missing: "materialized: view, table or incremental" });
      if (plan.materialized === "incremental" && !plan.watermark) open.push({ plan: p.name, missing: "watermark: the column new rows are found by (an incremental model)" });
    } else {
      known.push("loaded_at", "freshness");
      if (p.loaded_at !== undefined) {
        if (typeof p.loaded_at === "string" && p.loaded_at.trim() && p.loaded_at.length <= 200) plan.loadedAt = p.loaded_at.trim();
        else problems.push(`${at}loaded_at is the column (or expression) that says when a row arrived`);
      }
      if (p.freshness !== undefined) {
        const f = obj(p.freshness);
        const warn = f.warn === undefined ? null : parseAge(f.warn);
        const error = f.error === undefined ? null : parseAge(f.error);
        if ((f.warn !== undefined && !warn) || (f.error !== undefined && !error) || (!warn && !error)) problems.push(`${at}freshness is {"warn": "12h", "error": "24h"} (minutes, hours or days)`);
        else plan.freshness = { warn, error };
      }
      if (!plan.freshness) open.push({ plan: p.name, missing: "freshness: how old its newest row may be" });
      if (plan.freshness && !plan.loadedAt) open.push({ plan: p.name, missing: "loaded_at: the column freshness is read from" });
    }
    for (const k of Object.keys(p)) if (!known.includes(k)) problems.push(`${at}unknown field ${k}`);
    out.plans.push(plan);
  }
  return out;
}

/** Adds the plans to a graph: a plan whose model exists is `written`; the others become nodes drawn dashed. */
function addPlans(graph, plans) {
  const byName = new Map();
  for (const n of graph.nodes.values()) if (n.type !== "exposure" && (!byName.has(n.name) || n.own)) byName.set(n.name, n);
  const state = [];
  const fresh = plans.plans.filter((p) => !byName.has(p.name));
  for (const p of plans.plans) {
    const real = byName.get(p.name);
    if (real) {
      real.planned = true;
      state.push({ name: p.name, kind: p.kind, state: "written", file: real.path });
    } else state.push({ name: p.name, kind: p.kind, state: "planned", file: p.path });
  }
  const planId = (name) => `plan.${name}`;
  const planned = new Set(fresh.map((p) => p.name));
  for (const p of fresh) {
    const deps = [];
    for (const f of p.from) {
      if (byName.has(f)) deps.push(byName.get(f).id);
      else if (planned.has(f)) deps.push(planId(f));
      else {
        // What it reads is nowhere: drawn as a hole in the graph, and named as a problem.
        const id = `unknown.${f}`;
        if (!graph.nodes.has(id)) graph.nodes.set(id, { id, type: "unknown", name: f, pkg: "", own: true, path: null, patch: null, folder: "", tags: [], materialized: null, description: "", relation: null, deps: [], key: null, config: {}, columns: [], tests: [], sql: null, compiled: null, result: null, freshness: null, stats: null });
        deps.push(id);
        plans.problems.push(`plan "${p.name}" reads "${f}", which is not a model, seed, snapshot, source or plan`);
      }
    }
    graph.nodes.set(planId(p.name), {
      id: planId(p.name),
      type: "plan",
      plan: p.kind,
      name: p.name,
      pkg: graph.project ?? "",
      own: true,
      path: p.path,
      patch: p.kind === "source" ? p.path : p.path.replace(/\.sql$/, ".yml"),
      folder: path.posix.dirname(p.path),
      tags: p.tags,
      materialized: p.kind === "source" ? "source" : p.materialized,
      description: p.description,
      grain: p.grain,
      note: p.note,
      watermark: p.watermark,
      relation: null,
      deps,
      key: p.key.length ? { columns: p.key, from: "plan" } : null,
      config: {},
      columns: p.columns.map((c) => ({ name: c.name, description: c.description, type: c.type, tests: c.tests.map((t) => (typeof t === "string" ? t : Object.keys(t)[0])), constraints: [] })),
      tests: [],
      sql: null,
      compiled: null,
      result: null,
      freshness: p.kind === "source" ? { warn: p.freshness?.warn ? `${p.freshness.warn.count} ${p.freshness.warn.period}s` : null, error: p.freshness?.error ? `${p.freshness.error.count} ${p.freshness.error.period}s` : null, loadedAt: p.loadedAt, status: null, maxLoadedAt: null } : null,
      stats: null,
    });
  }
  // A circle among the plans would hang the drawing: named, and its last link dropped.
  const cycle = findCycle(graph.nodes);
  if (cycle) {
    plans.problems.push(`the plans read each other in a circle: ${cycle.map((id) => graph.nodes.get(id).name).join(" → ")}`);
    const n = graph.nodes.get(cycle[cycle.length - 2]);
    n.deps = n.deps.filter((d) => d !== cycle[cycle.length - 1]);
  }
  graph.plans = state;
}

/** A circle in what the nodes read, as ids (the first repeated at the end), or null. */
function findCycle(nodes) {
  const state = new Map();
  for (const start of nodes.keys()) {
    if (state.has(start)) continue;
    const stack = [[start, 0]];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const deps = nodes.get(top[0]).deps;
      if (top[1] >= deps.length) {
        state.set(top[0], 2);
        stack.pop();
        continue;
      }
      const next = deps[top[1]++];
      if (!nodes.has(next)) continue;
      if (state.get(next) === 1) {
        const trail = stack.map((s) => s[0]);
        return [...trail.slice(trail.indexOf(next)), next].reverse();
      }
      if (!state.has(next)) {
        state.set(next, 1);
        stack.push([next, 0]);
      }
    }
  }
  return null;
}

// ---- one project, read once and kept until its files change ----

const cache = new Map();

/** The files a project's graph is read from. */
function artifacts(root) {
  const t = targetDir(root);
  return { manifest: path.join(t, "manifest.json"), catalog: path.join(t, "catalog.json"), results: path.join(t, "run_results.json"), sources: path.join(t, "sources.json"), plans: path.join(root, PLAN_FILE) };
}

/**
 * The project as a graph: what dbt wrote in `target/`, with the plans on it.
 * `graph.missing`: there is no manifest yet. Kept until one of those files changes.
 */
export function loadProject(root) {
  const files = artifacts(root);
  const key = Object.values(files).map(sig).join("|");
  const hit = cache.get(root);
  if (hit && hit.key === key) return hit.graph;
  const manifest = readJson(files.manifest);
  const usable = manifest && typeof manifest === "object" && manifest.nodes && typeof manifest.nodes === "object";
  const graph = usable ? fromDbt(manifest, { catalog: readJson(files.catalog), results: readJson(files.results), sources: readJson(files.sources), project: projectName(root) }) : { kind: "dbt", project: null, tool: { name: "dbt", version: null, schema: null, adapter: null }, parsedAt: null, ran: null, catalog: false, nodes: new Map(), packages: [] };
  graph.root = root;
  graph.missing = !usable;
  graph.unreadable = !usable && isFile(files.manifest);
  graph.files = files;
  graph.project ??= projectName(root) || path.basename(root);
  const plans = readPlans(root);
  addPlans(graph, plans);
  graph.planFile = { exists: plans.exists, problems: plans.problems, open: plans.open, dbt: plans.dbt, plans: plans.plans };
  // Who reads whom, and what each node lacks.
  graph.children = new Map([...graph.nodes.keys()].map((id) => [id, []]));
  for (const n of graph.nodes.values()) for (const d of n.deps) graph.children.get(d)?.push(n.id);
  graph.findings = reviewGraph(graph);
  graph.findingsBy = new Map();
  for (const f of graph.findings) (graph.findingsBy.get(f.node) ?? graph.findingsBy.set(f.node, []).get(f.node)).push(f);
  graph.rev = shortHash(key);
  cache.set(root, { key, graph });
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return graph;
}

const staleCache = new Map();

/**
 * Whether the project's files are newer than its manifest: {stale, changed: [a few paths]}.
 * Looks at dbt_project.yml and at the .sql / .yml / .csv / .py files of the folders its models live in.
 */
export function staleness(root, graph) {
  const hit = staleCache.get(root);
  if (hit && hit.rev === graph.rev && Date.now() - hit.at < STALE_CACHE_MS) return hit.value;
  const st = fs.statSync(graph.files.manifest, { throwIfNoEntry: false });
  let value = { stale: false, changed: [] };
  if (st?.isFile()) {
    const since = st.mtimeMs;
    const tops = new Set(["models", "seeds", "snapshots"]);
    for (const n of graph.nodes.values()) if (n.own && n.path && n.type !== "plan") tops.add(n.path.split("/")[0]);
    const changed = [];
    let seen = 0;
    const walk = (dir, rel) => {
      let names = [];
      try {
        names = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of names) {
        if (e.name.startsWith(".") || seen++ > MAX_WALK) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, rel + e.name + "/");
        else if (/\.(sql|ya?ml|csv|py)$/i.test(e.name) && (fs.statSync(full, { throwIfNoEntry: false })?.mtimeMs ?? 0) > since) changed.push(rel + e.name);
      }
    };
    if ((fs.statSync(path.join(root, "dbt_project.yml"), { throwIfNoEntry: false })?.mtimeMs ?? 0) > since) changed.push("dbt_project.yml");
    for (const top of tops) if (relParts(top)) walk(path.join(root, top), top + "/");
    value = { stale: changed.length > 0, changed: changed.slice(0, 8), more: Math.max(0, changed.length - 8) };
  }
  staleCache.set(root, { rev: graph.rev, at: Date.now(), value });
  return value;
}

// ---- review ----

const isUnique = (t) => t.kind === "unique" || /(^|\.)unique_combination_of_columns$/.test(t.kind);
const sameColumns = (a, b) => a.length === b.length && a.every((x) => b.some((y) => y.toLowerCase() === x.toLowerCase().replace(/["`]/g, "")));

/** What each node of the project lacks: [{rule, node, name, type, path, detail}], in the order of RULES. */
export function reviewGraph(graph) {
  const out = [];
  const say = (rule, n, detail) => out.push({ rule, node: n.id, name: n.name, type: n.type, path: n.patch ?? n.path, detail });
  for (const n of graph.nodes.values()) {
    if (!n.own) continue;
    if (n.type === "source") {
      if (!n.freshness?.warn && !n.freshness?.error) say("source-no-freshness", n, "no freshness: nothing tells when this source stops arriving");
      continue;
    }
    if (!["model", "snapshot"].includes(n.type)) continue;
    const data = n.tests.filter((t) => t.kind !== "unit");
    const uniques = data.filter(isUnique);
    const notNull = new Set(data.filter((t) => t.kind === "not_null" && t.column).map((t) => t.column.toLowerCase()));
    const constrained = new Set(n.columns.filter((c) => c.constraints.includes("not_null") || c.constraints.includes("primary_key")).map((c) => c.name.toLowerCase()));
    const ephemeral = n.materialized === "ephemeral";
    if (!data.length && !ephemeral) say("no-tests", n, "no tests");
    else if (!ephemeral && !uniques.length && n.key?.from !== "constraint") say("no-key-test", n, "no test says which columns name one row (unique)");
    if (n.key && n.key.from !== "tests" && uniques.length) {
      const cols = n.key.columns.map((c) => c.replace(/["`]/g, ""));
      const tested = uniques.some((t) => (t.column ? sameColumns(cols, [t.column]) : sameColumns(cols, t.columns)));
      if (!tested && n.key.from !== "constraint") say("key-not-tested", n, `${n.key.from === "unique_key" ? "unique_key" : "the key"} (${cols.join(", ")}) has no unique test`);
    }
    if (n.key && n.key.from !== "tests" && data.length) {
      const loose = n.key.columns.map((c) => c.replace(/["`]/g, "")).filter((c) => !notNull.has(c.toLowerCase()) && !constrained.has(c.toLowerCase()));
      if (loose.length) say("key-not-tested", n, `key column ${loose.join(", ")} has no not_null test`);
    }
    for (const t of uniques) {
      const cols = t.column ? [t.column] : t.columns;
      const loose = cols.filter((c) => !notNull.has(c.toLowerCase()) && !constrained.has(c.toLowerCase()));
      if (loose.length && !(n.key && n.key.from !== "tests" && sameColumns(n.key.columns, cols))) say("unique-without-not-null", n, `${loose.join(", ")} is tested unique but not not_null: rows with no value all pass`);
    }
    if (!n.description) say("no-description", n, "no description");
    if (n.materialized === "incremental" && !n.config.unique_key && n.config.incremental_strategy !== "append" && n.config.incremental_strategy !== "microbatch") say("incremental-no-unique-key", n, "incremental with no unique_key: a rerun adds the same rows again");
  }
  return out.sort((a, b) => RULES.indexOf(a.rule) - RULES.indexOf(b.rule) || a.name.localeCompare(b.name));
}

// ---- choosing nodes ----

/** The node a word names: its id, a model's name, a source's "source.table", or `source:…`. */
export function findNode(graph, word) {
  if (graph.nodes.has(word)) return graph.nodes.get(word);
  const name = word.replace(/^source:/, "");
  let hit = null;
  for (const n of graph.nodes.values()) {
    if (n.name !== name || n.type === "exposure") continue;
    if (n.own) return n;
    hit ??= n;
  }
  return hit;
}

/** `orders`, `+orders`, `orders+`, `2+orders+1`: {node, up, down} (levels; Infinity for a bare +), or null. */
export function parseSelect(graph, text) {
  const m = String(text).trim().match(/^(?:(\d*)\+)?(.+?)(?:\+(\d*))?$/);
  if (!m) return null;
  const node = findNode(graph, m[2]);
  if (!node) return null;
  const depth = (v) => (v === undefined ? 0 : v === "" ? Infinity : Number(v));
  return { node, up: depth(m[1]), down: depth(m[3]) };
}

/** The ids within `up` levels of what `id` reads and `down` levels of what reads it, with `id`. `cut`: there is more beyond. */
export function neighbourhood(graph, id, up, down) {
  const ids = new Set([id]);
  const cut = { up: false, down: false };
  const walk = (next, depth, side) => {
    const seen = new Set([id]);
    let frontier = [id];
    for (let level = 0; frontier.length; level++) {
      const fresh = [];
      for (const f of frontier) {
        for (const n of next(f)) {
          if (seen.has(n)) continue;
          seen.add(n);
          fresh.push(n);
        }
      }
      if (!fresh.length) break;
      if (level >= depth) {
        cut[side] = true;
        break;
      }
      fresh.forEach((n) => ids.add(n));
      frontier = fresh;
    }
  };
  walk((n) => graph.nodes.get(n)?.deps ?? [], up, "up");
  walk((n) => graph.children.get(n) ?? [], down, "down");
  return { ids, cut };
}

/**
 * Where the page draws each node, as grid cells: `at` {id: [col, row]}, and `lanes` {"from>to": [[col, row], …]},
 * the empty cells a link that skips columns runs through, so no line crosses a box.
 * A node's column is its longest chain of what it reads; one that reads nothing sits just before its first reader.
 */
export function layout(items) {
  const by = new Map(items.map((s) => [s.id, s]));
  const col = new Map();
  // Columns in the order of the links, without recursion: a project's chains can be long.
  const left = new Map(items.map((s) => [s.id, s.deps.filter((d) => by.has(d) && d !== s.id).length]));
  const after = new Map(items.map((s) => [s.id, []]));
  for (const s of items) for (const d of s.deps) if (by.has(d) && d !== s.id) after.get(d).push(s.id);
  const ready = items.filter((s) => left.get(s.id) === 0).map((s) => s.id);
  for (const id of ready) col.set(id, 0);
  for (let i = 0; i < ready.length; i++) {
    const id = ready[i];
    for (const a of after.get(id)) {
      col.set(a, Math.max(col.get(a) ?? 0, col.get(id) + 1));
      left.set(a, left.get(a) - 1);
      if (left.get(a) === 0) ready.push(a);
    }
  }
  for (const s of items) if (!col.has(s.id)) col.set(s.id, 0); // a circle: drawn anyway
  for (const s of items) {
    const later = after.get(s.id).map((d) => col.get(d));
    if (col.get(s.id) === 0 && later.length) col.set(s.id, Math.max(0, Math.min(...later) - 1));
  }
  const cells = new Map(items.map((s) => [s.id, { id: s.id, col: col.get(s.id), prev: [], next: [] }]));
  const lanes = {};
  const link = (a, b) => (cells.get(a).next.push(b), cells.get(b).prev.push(a));
  for (const s of items) {
    for (const n of s.deps) {
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
  cols.forEach((l) => l.forEach((c, i) => order.set(c.id, i)));
  const sweep = (l, side) => {
    const key = new Map(l.map((c, i) => {
      const near = c[side].map((id) => order.get(id));
      return [c.id, near.length ? near.reduce((a, b) => a + b, 0) / near.length : i];
    }));
    l.sort((a, b) => key.get(a.id) - key.get(b.id));
    l.forEach((c, i) => order.set(c.id, i));
  };
  for (let k = 0; k < 4; k++) {
    for (let i = 1; i < cols.length; i++) sweep(cols[i], "prev");
    for (let i = cols.length - 2; i >= 0; i--) sweep(cols[i], "next");
  }
  const row = new Map();
  for (const l of cols) {
    let free = 0;
    for (const c of l) {
      const near = c.prev.map((id) => row.get(id)).filter((r) => r !== undefined).sort((a, b) => a - b);
      const want = near.length ? near[Math.floor((near.length - 1) / 2)] : 0;
      const r = Math.max(free, want);
      row.set(c.id, r);
      free = r + 1;
    }
  }
  const at = {};
  for (const s of items) at[s.id] = [col.get(s.id), row.get(s.id)];
  const out = {};
  for (const [k, via] of Object.entries(lanes)) out[k] = via.map((id) => [cells.get(id).col, row.get(id)]);
  return { at, lanes: out };
}

// ---- what the page and the commands read ----

const FAILED = ["fail", "error", "runtime error"];

/** A node in a few fields: what a list or a box shows. */
function slim(graph, n) {
  const failing = n.tests.filter((t) => FAILED.includes(t.status)).length;
  return {
    id: n.id,
    type: n.type,
    name: n.name,
    own: n.own,
    pkg: n.own ? undefined : n.pkg,
    folder: n.folder,
    materialized: n.materialized,
    tags: n.tags.length ? n.tags : undefined,
    tests: n.tests.length,
    failing: failing || undefined,
    warned: n.tests.filter((t) => t.status === "warn").length || undefined,
    status: n.result?.status ?? undefined,
    findings: graph.findingsBy.get(n.id)?.length || undefined,
    plan: n.type === "plan" ? n.plan : undefined,
    planned: n.planned || undefined,
  };
}

/** The whole project in the fields the page's lists need. */
export function summary(root, id) {
  const graph = loadProject(root);
  const nodes = [...graph.nodes.values()];
  const count = (type) => nodes.filter((n) => n.type === type).length;
  const stale = staleness(root, graph);
  const folders = new Map();
  const tags = new Map();
  for (const n of nodes) {
    if (n.folder) folders.set(n.folder, (folders.get(n.folder) ?? 0) + 1);
    for (const t of n.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const by = {};
  for (const f of graph.findings) by[f.rule] = (by[f.rule] ?? 0) + 1;
  return {
    id,
    root,
    kind: graph.kind,
    project: graph.project,
    tool: graph.tool,
    parsedAt: graph.parsedAt,
    missing: graph.missing,
    unreadable: graph.unreadable,
    stale: stale.stale,
    changed: stale.changed,
    ran: graph.ran,
    catalog: graph.catalog,
    counts: { model: count("model"), source: count("source"), seed: count("seed"), snapshot: count("snapshot"), exposure: count("exposure"), plan: count("plan"), tests: new Set(nodes.flatMap((n) => n.tests.map((t) => t.id))).size },
    nodes: nodes.map((n) => slim(graph, n)).sort((a, b) => a.folder.localeCompare(b.folder, "en", { numeric: true }) || a.name.localeCompare(b.name, "en", { numeric: true })),
    folders: [...folders].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })).map(([name, n]) => ({ name, n })),
    tags: [...tags].sort((a, b) => a[0].localeCompare(b[0])).map(([name, n]) => ({ name, n })),
    findings: graph.findings,
    findingsBy: by,
    plans: graph.plans,
    problems: graph.planFile.problems,
    open: graph.planFile.open,
    maxDraw: MAX_DRAW,
    rev: shortHash([graph.rev, stale.stale, stale.changed.join(",")].join("|")),
  };
}

/** The nodes a filter keeps: {folder (it and the folders under it), tag, type}. */
function filtered(graph, { folder = null, tag = null, type = null } = {}) {
  const out = [];
  for (const n of graph.nodes.values()) {
    if (folder && n.folder !== folder && !n.folder.startsWith(folder + "/")) continue;
    if (tag && !n.tags.includes(tag)) continue;
    if (type && n.type !== type) continue;
    out.push(n);
  }
  return out;
}

/**
 * The part of the graph to draw: around `focus` (`up` / `down` levels), or every node the filter keeps.
 * {nodes: [slim + at], lanes, cut, total} or {tooMany: n} when the filter keeps more than MAX_DRAW.
 */
export function drawing(root, { focus = null, up = 2, down = 2, folder = null, tag = null } = {}) {
  const graph = loadProject(root);
  let chosen;
  let cut = { up: false, down: false };
  if (focus) {
    const node = findNode(graph, focus);
    if (!node) throw new Fail("NotFound", `no model ${focus}`);
    let hood = neighbourhood(graph, node.id, up, down);
    // A model read by hundreds: fewer levels, until it fits.
    for (let u = up, d = down; hood.ids.size > MAX_DRAW && (u > 1 || d > 1); ) {
      if (d >= u && d > 1) d = Math.min(d, 8) - 1;
      else u = Math.min(u, 8) - 1;
      hood = neighbourhood(graph, node.id, u, d);
    }
    chosen = [...hood.ids].slice(0, MAX_DRAW).map((id) => graph.nodes.get(id));
    cut = { ...hood.cut, trimmed: hood.ids.size > MAX_DRAW };
    focus = node.id;
  } else {
    chosen = filtered(graph, { folder, tag });
    if (chosen.length > MAX_DRAW) return { tooMany: chosen.length, total: graph.nodes.size, rev: graph.rev };
  }
  const keep = new Set(chosen.map((n) => n.id));
  const items = chosen.map((n) => ({ id: n.id, deps: n.deps.filter((d) => keep.has(d)) }));
  const { at, lanes } = layout(items);
  return {
    focus,
    cut,
    total: graph.nodes.size,
    nodes: chosen.map((n, i) => ({ ...slim(graph, n), deps: items[i].deps, at: at[n.id], moreUp: n.deps.some((d) => !keep.has(d)) || undefined, moreDown: (graph.children.get(n.id) ?? []).some((d) => !keep.has(d)) || undefined })),
    lanes,
    rev: graph.rev,
  };
}

/** Everything about one node: what the page shows under the graph and what `show` prints. */
export function detail(root, word, { sql = true } = {}) {
  const graph = loadProject(root);
  const n = findNode(graph, word);
  if (!n) throw new Fail("NotFound", `no model ${word}`);
  const base = n.own || !n.pkg ? root : path.join(root, "dbt_packages", n.pkg);
  const abs = (rel) => (rel && relParts(rel) ? path.join(base, ...rel.split("/")) : null);
  let compiled = n.compiled;
  if (sql && compiled === null && n.path && n.type === "model") {
    // After `dbt compile` the SQL dbt would run is a file, even when a later `dbt parse` wrote the manifest.
    const f = path.join(targetDir(root), "compiled", n.pkg, ...n.path.split("/"));
    const st = fs.statSync(f, { throwIfNoEntry: false });
    if (st?.isFile() && st.size <= MAX_SQL && relParts(n.path)) compiled = fs.readFileSync(f, "utf8");
  }
  const name = (id) => {
    const x = graph.nodes.get(id);
    return x ? { id, name: x.name, type: x.type } : null;
  };
  const clip = (s) => (typeof s === "string" ? (s.length > MAX_SQL ? s.slice(0, MAX_SQL) + "\n-- … cut" : s) : null);
  return {
    ...slim(graph, n),
    description: n.description,
    relation: n.relation,
    path: n.path,
    patch: n.patch,
    file: abs(n.path),
    patchFile: abs(n.patch),
    exists: n.type === "plan" ? isFile(abs(n.path) ?? "") : undefined,
    key: n.key,
    config: n.config,
    grain: n.grain,
    note: n.note,
    watermark: n.watermark,
    columns: n.columns.map(({ constraints, ...c }) => ({ ...c, constraints: constraints.length ? constraints : undefined })),
    testList: n.tests,
    reads: n.deps.map(name).filter(Boolean),
    readBy: (graph.children.get(n.id) ?? []).map(name).filter(Boolean),
    result: n.result,
    freshness: n.freshness,
    stats: n.stats,
    review: graph.findingsBy.get(n.id) ?? [],
    ...(sql ? { sql: clip(n.sql), compiled: clip(compiled) } : {}),
  };
}

// ---- scaffold: a plan's files ----

/** A value as YAML at an indent: maps, lists, strings (quoted when they must be), numbers, booleans. */
export function yaml(v, indent = 0) {
  const pad = " ".repeat(indent);
  const scalar = (x) => {
    if (x === null || x === undefined) return "null";
    if (typeof x !== "string") return String(x);
    return /^[A-Za-z_][\w ./()'-]*$/.test(x) && !/^(true|false|null|yes|no|on|off|~)$/i.test(x) && !x.endsWith(" ") ? x : JSON.stringify(x);
  };
  const simple = (x) => x === null || typeof x !== "object";
  if (simple(v)) return `${pad}${scalar(v)}\n`;
  if (Array.isArray(v)) {
    if (!v.length) return `${pad}[]\n`;
    return v.map((x) => (simple(x) ? `${pad}- ${scalar(x)}\n` : `${pad}- ${yaml(x, indent + 2).trimStart()}`)).join("");
  }
  const keys = Object.keys(v);
  if (!keys.length) return `${pad}{}\n`;
  return keys
    .map((k) => {
      const x = v[k];
      if (simple(x)) return `${pad}${k}: ${scalar(x)}\n`;
      if (Array.isArray(x) && x.length && x.every(simple) && JSON.stringify(x).length <= 70) return `${pad}${k}: [${x.map(scalar).join(", ")}]\n`;
      if ((Array.isArray(x) && !x.length) || (!Array.isArray(x) && !Object.keys(x).length)) return `${pad}${k}: ${Array.isArray(x) ? "[]" : "{}"}\n`;
      return `${pad}${k}:\n${yaml(x, indent + 2)}`;
    })
    .join("");
}

const olderThan = (version, major, minor) => {
  const m = str(version).match(/^(\d+)\.(\d+)/);
  return m ? Number(m[1]) < major || (Number(m[1]) === major && Number(m[2]) < minor) : false;
};

/** The files a plan becomes: [{path, text}] (a model: its .sql and its .yml; a source: its .yml). */
export function scaffoldFiles(graph, plan) {
  const testsKey = olderThan(graph.tool?.version, 1, 8) ? "tests" : "data_tests";
  // dbt 1.11 and later want a test's arguments under `arguments`; before that they sit beside its name.
  const nested = !olderThan(graph.tool?.version, 1, 11);
  const OWN = ["arguments", "config", "name", "description"];
  const test = (t) => {
    if (typeof t === "string" || !nested) return t;
    const [name, args] = Object.entries(t)[0];
    if (!args || typeof args !== "object" || Array.isArray(args) || "arguments" in args) return t;
    const mine = Object.fromEntries(Object.entries(args).filter(([k]) => !OWN.includes(k)));
    const rest = Object.fromEntries(Object.entries(args).filter(([k]) => OWN.includes(k)));
    return { [name]: { ...(Object.keys(mine).length ? { arguments: mine } : {}), ...rest } };
  };
  const column = (c, extra = []) => {
    const names = new Set(c.tests.map((t) => (typeof t === "string" ? t : Object.keys(t)[0])));
    const tests = [...extra.filter((t) => !names.has(t)), ...c.tests.map(test)];
    return { name: c.name, ...(c.description ? { description: c.description } : {}), ...(c.type ? { data_type: c.type } : {}), ...(tests.length ? { [testsKey]: tests } : {}) };
  };
  if (plan.kind === "source") {
    const [source, table] = plan.name.split(".");
    const t = { name: table, ...(plan.description ? { description: plan.description } : {}), ...(plan.loadedAt ? { loaded_at_field: plan.loadedAt } : {}) };
    if (plan.freshness) t.freshness = { ...(plan.freshness.warn ? { warn_after: plan.freshness.warn } : {}), ...(plan.freshness.error ? { error_after: plan.freshness.error } : {}) };
    if (plan.tags.length) t.tags = plan.tags;
    if (plan.columns.length) t.columns = plan.columns.map((c) => column(c, plan.key.length === 1 && plan.key[0] === c.name ? ["unique", "not_null"] : plan.key.includes(c.name) ? ["not_null"] : []));
    return [{ path: plan.path, text: `version: 2\n\nsources:\n${yaml([{ name: source, tables: [t] }], 2)}` }];
  }
  // The model's file: its inputs as CTEs, the watermark of an incremental one, and the select left to write.
  const cte = (name) => name.replace(/[^A-Za-z0-9_]/g, "_");
  const byName = new Map([...graph.nodes.values()].filter((n) => n.type !== "exposure").map((n) => [n.name, n]));
  const reads = plan.from.map((f) => {
    const n = byName.get(f);
    const source = n ? n.type === "source" || (n.type === "plan" && n.plan === "source") : SOURCE_NAME.test(f);
    const [a, b] = f.split(".");
    return { name: cte(source ? b : f), sql: source ? `{{ source('${a}', '${b}') }}` : `{{ ref('${f}') }}` };
  });
  const config = [];
  if (plan.materialized) config.push(`materialized='${plan.materialized}'`);
  if (plan.materialized === "incremental" && plan.key.length) config.push(`unique_key=${plan.key.length === 1 ? `'${plan.key[0]}'` : `[${plan.key.map((k) => `'${k}'`).join(", ")}]`}`);
  if (plan.tags.length) config.push(`tags=[${plan.tags.map((t) => `'${t}'`).join(", ")}]`);
  const lines = [];
  if (config.length) lines.push(`{{ config(${config.join(", ")}) }}`, "");
  if (plan.grain) lines.push(`-- One row: ${plan.grain}`);
  if (plan.key.length) lines.push(`-- Key: ${plan.key.join(", ")}`);
  if (plan.grain || plan.key.length) lines.push("");
  const first = reads[0]?.name;
  const watermark = plan.materialized === "incremental" && plan.watermark ? ["", "    {% if is_incremental() %}", `    where ${plan.watermark} > (select max(${plan.watermark}) from {{ this }})`, "    {% endif %}"] : [];
  const todo = `    -- TODO(tome-etl): write this select${plan.columns.length ? `. Columns: ${plan.columns.map((c) => c.name).join(", ")}` : ""}`;
  if (reads.length) {
    lines.push("with", "");
    for (const r of reads) lines.push(`${r.name} as (`, "", `    select * from ${r.sql}`, ...(r.name === first ? watermark : []), "", "),", "");
    lines.push("final as (", "", todo, `    select * from ${first}`, "", ")", "", "select * from final");
  } else lines.push(todo.trim(), "select 1 as todo");
  const model = { name: plan.name, ...(plan.description || plan.grain ? { description: [plan.description, plan.grain ? `One row: ${plan.grain}.` : ""].filter(Boolean).join(" ") } : {}) };
  const single = plan.key.length === 1 ? plan.key[0] : null;
  let todoKey = "";
  let listed = plan.columns;
  for (const k of plan.key) if (!listed.some((c) => c.name === k)) listed = [...listed, { name: k, type: null, description: "", tests: [] }];
  if (plan.key.length > 1) {
    if (graph.packages?.includes("dbt_utils")) model[testsKey] = [test({ "dbt_utils.unique_combination_of_columns": { combination_of_columns: plan.key } })];
    else todoKey = `    # TODO(tome-etl): test that (${plan.key.join(", ")}) is unique together (dbt_utils.unique_combination_of_columns, or a test of your own)\n`;
  }
  if (listed.length) model.columns = listed.map((c) => column(c, c.name === single ? ["unique", "not_null"] : plan.key.includes(c.name) ? ["not_null"] : []));
  return [
    { path: plan.path, text: lines.join("\n") + "\n" },
    { path: plan.path.replace(/\.sql$/, ".yml"), text: `version: 2\n\nmodels:\n${yaml([model], 2).replace(/^(  - name: .*\n)/, `$1${todoKey}`)}` },
  ];
}

/** Writes the files of the plans named (all planned ones: `names` null). Never over a file that is there. */
export function scaffold(root, names = null) {
  const graph = loadProject(root);
  if (graph.planFile.problems.length) throw new Fail("Invalid", `${PLAN_FILE} has problems: ${graph.planFile.problems.join("; ")} (see \`check\`)`);
  const todo = [];
  for (const name of names ?? graph.plans.filter((p) => p.state === "planned").map((p) => p.name)) {
    const plan = graph.planFile.plans.find((p) => p.name === name);
    if (!plan) throw new Fail("NotFound", `no plan "${name}" in ${PLAN_FILE}`);
    if (graph.plans.find((p) => p.name === name).state === "written") throw new Fail("Invalid", `"${name}" is written already (${graph.plans.find((p) => p.name === name).file}): take its plan out of ${PLAN_FILE}`);
    todo.push(plan);
  }
  if (!todo.length) throw new Fail("NotFound", `no plan to write in ${PLAN_FILE}`);
  const files = todo.flatMap((plan) => scaffoldFiles(graph, plan).map((f) => ({ ...f, plan: plan.name, file: path.join(root, ...f.path.split("/")) })));
  for (const f of files) if (fs.existsSync(f.file)) throw new Fail("Busy", `${f.path} is there already: scaffold writes new files only`);
  for (const f of files) {
    fs.mkdirSync(path.dirname(f.file), { recursive: true });
    fs.writeFileSync(f.file, f.text, { flag: "wx" });
  }
  return files.map((f) => ({ plan: f.plan, file: f.file }));
}

// ---- dbt parse ----

/** The command that starts dbt here: tome-etl.json's `dbt`, $TOME_ETL_DBT, the project's own venv, or `dbt`. */
export function dbtCommand(root, plans = readPlans(root)) {
  if (plans.dbt) return plans.dbt;
  const env = (process.env.TOME_ETL_DBT ?? "").trim();
  if (env) return env.split(/\s+/);
  for (const v of [".venv", "venv"]) {
    const bin = path.join(root, v, "bin", "dbt");
    if (isFile(bin)) return [bin];
  }
  return ["dbt"];
}

/** Runs `dbt parse` in the project (it reads the files and connects to nothing): {ok, exit, seconds, log}. */
export function dbtParse(root) {
  const argv = [...dbtCommand(root), "parse"];
  const started = Date.now();
  return new Promise((resolve) => {
    let log = "";
    let child;
    const end = (exit, extra = "") => resolve({ ok: exit === 0, exit, seconds: Math.round((Date.now() - started) / 100) / 10, command: argv.join(" "), log: (log + extra).replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n").slice(-40) });
    try {
      child = spawn(argv[0], argv.slice(1), { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return end(127, `could not start ${argv[0]}: ${e.message}`);
    }
    const timer = setTimeout(() => child.kill("SIGTERM"), PARSE_TIMEOUT_MS);
    const take = (c) => (log = (log + c.toString("utf8")).slice(-64 * 1024));
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (e) => (clearTimeout(timer), end(127, `could not start ${argv[0]}: ${e.message} (set "dbt" in ${PLAN_FILE} or $TOME_ETL_DBT)`)));
    child.on("close", (code, signal) => (clearTimeout(timer), end(code ?? (signal ? 124 : 1))));
  });
}

// ---- the opened projects ----

export class Projects {
  constructor() {
    this.note = path.join(homeDir(), "projects.json");
  }

  entries() {
    const v = readJson(this.note);
    return Array.isArray(v) ? v.filter((e) => e && typeof e.root === "string") : [];
  }

  list() {
    const out = [];
    for (const e of this.entries()) {
      if (!projectKind(e.root)) continue;
      const g = loadProject(e.root);
      out.push({ id: shortHash(e.root), root: e.root, title: g.project, kind: g.kind, models: [...g.nodes.values()].filter((n) => n.type === "model").length, plans: g.plans.filter((p) => p.state === "planned").length, findings: g.findings.length, missing: g.missing, openedAt: e.openedAt });
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
    const e = this.entries().find((x) => shortHash(x.root) === id);
    if (!e || !projectKind(e.root)) throw new Fail("NotFound", `no opened project ${id}`);
    return { id, root: e.root };
  }
}

// ---- comments ----
//
// `<home>/comments/<project id>/comments.json`: {root, next, threads}. A
// thread: {id, n, at, anchor, messages: [{from: "user" | "agent", text,
// at}], sent, taken, resolved}. `anchor` (null: the whole project): {node
// (its id), name, column (or null)}. `sent`: the person handed it to an
// agent; `taken`: a waiting agent got it. A thread not sent is a note: it
// goes out with the next one that is sent.

function commentText(v) {
  const text = typeof v === "string" ? v.trim() : "";
  if (!text) throw new Fail("Invalid", "the comment has no text");
  if (text.length > MAX_COMMENT) throw new Fail("Invalid", "the comment is too long");
  return text;
}

/** A comment's place as the page gives it, checked against the project. */
export function cleanAnchor(root, a) {
  if (a === null || a === undefined) return null;
  if (typeof a !== "object" || typeof a.node !== "string" || a.node.length > 400) throw new Fail("Invalid", "anchor");
  const n = loadProject(root).nodes.get(a.node);
  if (!n) throw new Fail("Invalid", "anchor.node");
  const column = typeof a.column === "string" && a.column ? n.columns.find((c) => c.name === a.column)?.name ?? null : null;
  if (a.column && !column) throw new Fail("Invalid", "anchor.column");
  return { node: n.id, name: n.name, column };
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
    atomicWrite(path.join(this.root, shortHash(data.root), "comments.json"), Buffer.from(JSON.stringify(data, null, 2)), 0o600);
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

  /** Sending one sends the project's notes too: the open threads the person wrote last in and never sent. */
  sendNotes(data, at) {
    for (const t of data.threads) {
      if (!t.resolved && !t.sent && t.messages[t.messages.length - 1]?.from === "user") t.sent = at;
    }
  }

  add(d, { anchor, text, send }) {
    const body = commentText(text);
    const where = cleanAnchor(d.root, anchor);
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

  /** Every thread sent and not yet taken (of that project; null: of any), marked taken: [{data, thread}]. */
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

/** A thread as an agent reads it: the model it is about, and the files to change. */
function describeThread(root, thread) {
  const a = thread.anchor;
  let where = {};
  if (a && projectKind(root)) {
    try {
      const d = detail(root, a.node, { sql: false });
      where = { file: d.file, patchFile: d.patchFile, type: d.type };
    } catch {
      where = { note: "this model is no longer in the project: find it by its name" };
    }
  }
  return {
    id: thread.id,
    n: thread.n,
    project: root,
    node: a?.node ?? null,
    name: a?.name ?? null,
    column: a?.column ?? null,
    ...where,
    messages: thread.messages,
    sent: Boolean(thread.sent),
    resolved: thread.resolved,
    ...(isDir(root) ? {} : { note: "this project's folder is gone" }),
  };
}

// ---- the page ----

const TYPES = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};
const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

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
  if (req.path.startsWith("/api/") && site !== undefined && site !== "same-origin" && site !== "none") return text(403, "not from the page");
  if (req.method !== "GET" && req.method !== "HEAD" && h(WRITE_HEADER) === undefined) return text(403, "not from the page");
  const projects = (ctx.projects ??= new Projects());
  const comments = (ctx.comments ??= new Comments());
  /** The agents waiting for a comment now: a key → {id (null: any project), until}. */
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
  const level = (name, fallback) => {
    const v = req.query.get(name);
    if (v === "all") return Infinity;
    const n = Number(v);
    return v !== null && Number.isInteger(n) && n >= 0 && n <= 50 ? n : fallback;
  };
  try {
    const route = `${req.method} ${req.path}`;
    if (route === "GET /api/ping") return json(200, { ok: true, pid: process.pid, build: ctx.build, home: homeDir() });
    if (route === "GET /api/projects") return json(200, { projects: projects.list().map((d) => ({ ...d, open: comments.load(d).threads.filter((t) => !t.resolved).length })) });
    const id = req.query.get("id");
    if (route === "GET /api/project") {
      // The whole project for the lists; with `rev`, only {rev} while nothing changed.
      if (id === null) return bad("id");
      const d = projects.get(id);
      const s = summary(d.root, d.id);
      return json(200, req.query.get("rev") === s.rev ? { rev: s.rev, same: true } : s);
    }
    if (route === "GET /api/graph") {
      if (id === null) return bad("id");
      const d = projects.get(id);
      return json(200, drawing(d.root, { focus: req.query.get("focus"), up: level("up", 2), down: level("down", 2), folder: req.query.get("folder"), tag: req.query.get("tag") }));
    }
    if (route === "GET /api/node") {
      const node = req.query.get("node");
      if (id === null || node === null) return bad("id and node");
      return json(200, detail(projects.get(id).root, node));
    }
    if (route === "GET /api/comments") {
      if (id === null) return bad("id");
      return json(200, { threads: comments.load(projects.get(id)).threads, listening: listening(id) });
    }
    if (route === "POST /api/comments") {
      // What the page does: {op: "new", anchor, text, send?}, {op: "say", id, text, send?}, {op: "send", id}, {op: "resolve", id, resolved}.
      if (id === null) return bad("id");
      const d = projects.get(id);
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
      const d = id === null ? null : projects.get(id);
      const until = Date.now() + ms();
      const key = crypto.randomUUID();
      waiters.set(key, { id, until: until + LISTEN_GRACE_MS });
      try {
        for (;;) {
          const [first, ...rest] = comments.take(d).map((g) => describeThread(g.data.root, g.thread));
          if (first) return json(200, { thread: first, also: rest });
          if (Date.now() >= until || req.gone?.()) return json(200, { thread: null });
          await sleep(TAKE_STEP_MS);
        }
      } finally {
        if (req.gone?.()) waiters.delete(key);
        else waiters.get(key).until = Date.now() + LISTEN_GRACE_MS;
        for (const [k, w] of waiters) if (w.until <= Date.now()) waiters.delete(k);
      }
    }
    if (req.path.startsWith("/api/")) return text(404, "no such call");
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

// `<home>/servers/main.json` holds {pid, url, port, root, kind: "etl", startedAt}, like the other local pages.
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
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true, mode: 0o700 });
  atomicWrite(stateFile(), Buffer.from(JSON.stringify({ pid: process.pid, url, port, root: homeDir(), kind: "etl", startedAt: now() }, null, 2)), 0o600);
  const bye = () => {
    if (readJson(stateFile())?.pid === process.pid) fs.rmSync(stateFile(), { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
  console.error(`tome-etl: ${url}`);
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
  if (state) await stop(); // an older build: replaced
  fs.mkdirSync(path.dirname(logFile()), { recursive: true, mode: 0o700 });
  const log = fs.openSync(logFile(), "a", 0o600);
  const child = spawn(process.execPath, [ME, "serve", "--port", String(port)], { detached: true, stdio: ["ignore", log, log] });
  child.unref();
  fs.closeSync(log);
  if (!(await until(8000, async () => (state = await running()) !== null))) throw new Error(`it did not start: see ${logFile()}`);
  return { ...state, reused: false };
}

// ---- the command ----

function fail(message, code = 2) {
  console.error(`tome-etl: ${message}`);
  process.exit(code);
}

const USAGE = `tome-etl: a dbt project as a graph in a page of this machine, read from what dbt wrote in target/ (never from the warehouse)

etl.mjs open [PROJECT]              start the page if needed and open the project; prints {url, …} (no PROJECT: the list)
        --select NAME               the address that shows that model and what is around it
etl.mjs parse PROJECT               run \`dbt parse\` there (it connects to nothing), so target/manifest.json is new
etl.mjs status PROJECT              what was read: dbt's version, when it was parsed, whether files changed since, counts
etl.mjs models PROJECT              the models, sources, seeds, snapshots and plans, a line each
        --select "+orders+1"        that model with what it reads (+ before) and what reads it (+ after), a number of levels
        --folder models/staging     those in that folder; --tag NAME: those with that tag
etl.mjs show PROJECT NAME           one model: its files, columns, tests with their last result, what it reads, who reads it
etl.mjs review PROJECT              what the models lack: {findings, by, list: [{rule, name, path, detail}]}
        --rule NAME                 that rule alone (${RULES.join(", ")})
etl.mjs check PROJECT               ${PLAN_FILE}: what is wrong (problems), what a plan leaves open, which plans are written; exits 1 on problems
etl.mjs scaffold PROJECT [NAME…]    write the .sql and .yml of those plans (none named: every plan not written yet); never over a file
etl.mjs list                        the opened projects
etl.mjs close PROJECT               take it off the list (the files stay)
etl.mjs stop                        end the page's process
etl.mjs serve                       run the page here, in the foreground

etl.mjs comments [PROJECT]            the open comments (of that project; none: of every project); --all: the resolved ones too
etl.mjs comments [PROJECT] --wait     wait until the person sends a comment to the agent; prints that thread and ends
etl.mjs comment-reply ID TEXT         reply to a comment (TEXT "-": from stdin); --resolve also closes it
etl.mjs comment-resolve ID            close a comment; --reopen opens it again

--port N      the page's first port to try (default ${DEFAULT_PORT})
dbt is started as tome-etl.json's "dbt" says, else $TOME_ETL_DBT, else the project's .venv/bin/dbt, else \`dbt\`.
`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || ["help", "--help", "-h"].includes(command)) return void process.stdout.write(USAGE);
  let port = DEFAULT_PORT;
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
    if (["--all", "--wait", "--resolve", "--reopen"].includes(a)) flags.add(a.slice(2));
    else if (a === "--port") {
      const v = value(a);
      if (!/^\d+$/.test(v)) fail("--port is a number");
      port = Number(v);
    } else if (["--select", "--folder", "--tag", "--rule"].includes(a)) opt[a.slice(2)] = value(a);
    else if (a.startsWith("--")) fail(`unknown option ${a}`);
    else words.push(a);
  }
  const print = (v) => console.log(JSON.stringify(v, null, 2));
  const projects = new Projects();
  const comments = new Comments();
  const folder = (what) => (words.length ? rootOf(words[0]) : fail(`${what} needs a project's folder`));
  const opened = (p) => {
    const root = rootOf(p);
    return projects.list().find((d) => d.root === root) ?? fail(`not an opened project: ${p} (open it first)`);
  };
  const urlOf = (base, d, node) => `${base}p/${d.id}${node ? `?node=${encodeURIComponent(node)}` : ""}`;
  const chosen = (graph) => {
    let nodes = filtered(graph, { folder: opt.folder?.replace(/\/+$/, "") ?? null, tag: opt.tag ?? null });
    if (opt.select) {
      const s = parseSelect(graph, opt.select) ?? fail(`no model ${opt.select}`);
      const { ids } = neighbourhood(graph, s.node.id, s.up, s.down);
      nodes = nodes.filter((n) => ids.has(n.id));
    }
    return nodes;
  };
  try {
    if (command === "serve") return void (await serve(port));
    if (command === "stop") return print(await stop());
    if (command === "list") {
      const state = await running();
      return print(projects.list().map((d) => ({ ...d, url: state ? urlOf(state.url, d) : null, comments: comments.load(d).threads.filter((t) => !t.resolved).length })));
    }
    if (command === "close") {
      const d = opened(words[0] ?? fail("close needs a project's folder"));
      projects.remove(d.id);
      return print({ closed: d.root });
    }
    if (command === "open") {
      const d = words.length ? projects.add(words[0]) : null;
      let node = null;
      if (opt.select) {
        if (!d) fail("--select needs a project");
        node = (parseSelect(loadProject(d.root), opt.select) ?? fail(`no model ${opt.select}`)).node.id;
      }
      const state = await ensure(port);
      const res = { url: state.url, pid: state.pid, reused: state.reused, stop: `node ${JSON.stringify(ME)} stop` };
      if (!d) return print(res);
      const s = summary(d.root, d.id);
      return print({ ...res, url: urlOf(state.url, d, node), id: d.id, project: s.project, root: d.root, ...(s.missing ? { note: `no ${path.relative(d.root, loadProject(d.root).files.manifest)} yet: run \`parse\`` } : { parsedAt: s.parsedAt, stale: s.stale }), counts: s.counts });
    }
    if (command === "parse") {
      const root = folder("parse");
      const r = await dbtParse(root);
      const g = loadProject(root);
      print({ ...r, manifest: g.missing ? null : g.files.manifest, ...(g.missing ? {} : { dbt: g.tool.version, models: [...g.nodes.values()].filter((n) => n.type === "model").length }) });
      process.exit(r.ok ? 0 : 1);
    }
    if (command === "status") {
      const root = folder("status");
      const s = summary(root, shortHash(root));
      const g = loadProject(root);
      return print({ project: s.project, root, kind: s.kind, dbt: s.tool.version, manifest: s.missing ? null : { file: g.files.manifest, schema: s.tool.schema, adapter: s.tool.adapter, parsedAt: s.parsedAt, stale: s.stale, ...(s.stale ? { changed: s.changed, note: "files changed after the manifest was written: run `parse`" } : {}) }, ...(s.missing ? { note: s.unreadable ? "target/manifest.json could not be read" : "no target/manifest.json yet: run `parse`" } : {}), catalog: s.catalog, lastRun: s.ran, counts: s.counts, plans: s.plans, problems: s.problems, findings: s.findingsBy });
    }
    if (command === "models") {
      const g = loadProject(folder("models"));
      return print(chosen(g).map((n) => ({ name: n.name, type: n.type, materialized: n.materialized ?? undefined, path: n.path, tests: n.tests.length, reads: n.deps.map((d) => g.nodes.get(d).name), findings: g.findingsBy.get(n.id)?.map((f) => f.rule), status: n.result?.status })));
    }
    if (command === "show") {
      const root = folder("show");
      if (words.length < 2) fail("show needs a model's name");
      const { sql, compiled, id, testList, tests, ...d } = detail(root, words[1], { sql: false });
      // A test in a line: what it is, on which column, and how it last ended.
      return print({ ...d, tests: testList.map((t) => [t.kind, t.column ?? (t.columns.length ? t.columns.join("+") : null), t.detail || null, t.status].filter((x) => x !== null).join(" · ")) });
    }
    if (command === "review") {
      const g = loadProject(folder("review"));
      if (opt.rule && !RULES.includes(opt.rule)) fail(`--rule is one of ${RULES.join(", ")}`);
      const keep = new Set(chosen(g).map((n) => n.id));
      const found = g.findings.filter((f) => keep.has(f.node) && (!opt.rule || f.rule === opt.rule));
      const by = {};
      for (const f of found) by[f.rule] = (by[f.rule] ?? 0) + 1;
      return print({ findings: found.length, by, ...(g.missing ? { note: "no target/manifest.json yet: run `parse`" } : {}), list: found.map(({ node, ...f }) => f) });
    }
    if (command === "check") {
      const root = folder("check");
      const g = loadProject(root);
      print({ problems: g.planFile.problems, open: g.planFile.open, plans: g.plans, ...(g.planFile.exists ? {} : { note: `no ${PLAN_FILE} in this project: nothing is planned` }) });
      process.exit(g.planFile.problems.length ? 1 : 0);
    }
    if (command === "scaffold") {
      const root = folder("scaffold");
      const wrote = scaffold(root, words.length > 1 ? words.slice(1) : null);
      return print({ wrote, next: `write each select, then: node ${JSON.stringify(ME)} parse ${JSON.stringify(root)}` });
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
      const again = `node ${JSON.stringify(ME)} comments${d ? " " + JSON.stringify(d.root) : ""} --wait`;
      for (;;) {
        try {
          const state = await ensure(port);
          const query = new URLSearchParams(d ? { id: d.id } : {});
          const res = await fetch(`${state.url}api/comments/take?${query}`, { method: "POST", headers: { [WRITE_HEADER]: "1" }, signal: AbortSignal.timeout(WAIT_MS + 15000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { thread, also } = await res.json();
          if (thread) return print({ ...thread, also: also ?? [], next: again });
        } catch {
          await sleep(2000);
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

if (process.argv[1] && fs.realpathSync(process.argv[1]) === ME) {
  main(process.argv.slice(2)).catch((e) => fail(e?.message ?? String(e)));
}
