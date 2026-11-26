// The tome-etl skill: a dbt project read from the manifests of three dbt
// versions, with results and catalog laid on it; what `review` finds; plans
// in tome-etl.json and the files `scaffold` writes from them; the part of a
// large graph that is drawn; and the server's rules (only opened projects,
// only its own page, comments on a model an agent takes).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

process.env.TOME_ETL_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-etl-home-")));
delete process.env.TOME_ETL_DBT;
const dir = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.join(dir, "../../../skills/tome-etl/scripts");
const { cleanAnchor, dbtCommand, dbtParse, detail, drawing, findNode, fromDbt, handle, layout, loadProject, MAX_DRAW, neighbourhood, parseAge, parseSelect, Projects, readPlans, relParts, reviewGraph, rootOf, scaffold, scaffoldFiles, staleness, summary, yaml } = await import(path.join(scripts, "etl.mjs"));

const fixture = (v) => JSON.parse(fs.readFileSync(path.join(dir, "fixtures", `manifest-dbt-${v}.json`), "utf8"));
const M = "model.jaffle_shop.";

/** A dbt project's folder: dbt_project.yml, a manifest in target/, and the files given. */
function project(manifest = fixture("1.12"), files = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-etl-")));
  fs.writeFileSync(path.join(root, "dbt_project.yml"), "name: jaffle_shop\n");
  const all = { ...(manifest ? { "target/manifest.json": JSON.stringify(manifest) } : {}), ...files };
  for (const [f, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), typeof text === "string" ? text : JSON.stringify(text));
  }
  return root;
}
const plans = (list, extra = {}) => ({ "tome-etl.json": { format: 1, plans: list, ...extra } });

/** A manifest written by hand: `models` {name: {deps, …}}, with tests as [model, kind, column]. */
function manifest(models, tests = [], sources = {}) {
  const nodes = {};
  for (const [name, m] of Object.entries(models)) {
    nodes[`model.p.${name}`] = { unique_id: `model.p.${name}`, resource_type: m.type ?? "model", name, package_name: "p", original_file_path: `models/${m.folder ?? ""}${name}.sql`, description: m.description ?? "", config: { materialized: "table", ...(m.config ?? {}) }, columns: Object.fromEntries((m.columns ?? []).map((c) => [c, { name: c }])), constraints: m.constraints ?? [], tags: m.tags ?? [], depends_on: { nodes: (m.deps ?? []).map((d) => (d.includes(".") ? d : `model.p.${d}`)) }, raw_code: `select * from ${name}` };
  }
  for (const [i, [model, kind, column, kwargs]] of tests.entries()) {
    nodes[`test.p.t${i}`] = { unique_id: `test.p.t${i}`, resource_type: "test", name: `${kind}_${model}_${column ?? ""}`, package_name: "p", config: {}, column_name: column ?? null, attached_node: `model.p.${model}`, test_metadata: { name: kind.split(".").pop(), namespace: kind.includes(".") ? kind.split(".")[0] : null, kwargs: kwargs ?? {} }, depends_on: { nodes: [`model.p.${model}`] } };
  }
  const src = {};
  for (const [name, s] of Object.entries(sources)) src[`source.p.${name}`] = { unique_id: `source.p.${name}`, resource_type: "source", name: name.split(".")[1], source_name: name.split(".")[0], package_name: "p", original_file_path: "models/sources.yml", config: {}, columns: {}, ...s };
  return { metadata: { dbt_schema_version: "https://schemas.getdbt.com/dbt/manifest/v12.json", dbt_version: "1.12.0", project_name: "p", generated_at: "2026-01-01T00:00:00Z" }, nodes, sources: src, macros: {} };
}

function req(method, target, body, headers = {}) {
  const url = new URL(target, "http://x");
  const h = { host: "127.0.0.1:4790", ...headers };
  if (method !== "GET" && !("x-tome-etl" in headers)) h["x-tome-etl"] = "1";
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return { method, path: decodeURIComponent(url.pathname), query: url.searchParams, headers: h, body: Buffer.from(body === undefined ? "" : JSON.stringify(body)) };
}
const json = (r) => JSON.parse(r.body.toString("utf8"));

test("paths, ages and YAML", () => {
  assert.deepEqual(relParts("models/marts/a.sql"), ["models", "marts", "a.sql"]);
  for (const bad of ["", "/etc/passwd", "../x.sql", "a/../b.sql", ".git/config", "a\\b.sql", "a//b.sql"]) assert.equal(relParts(bad), null, bad);
  assert.deepEqual(parseAge("12h"), { count: 12, period: "hour" });
  assert.deepEqual(parseAge("2 days"), { count: 2, period: "day" });
  assert.deepEqual(parseAge("30 minutes"), { count: 30, period: "minute" });
  for (const bad of ["soon", "0h", "12", 12]) assert.equal(parseAge(bad), null);
  assert.equal(yaml({ name: "a", description: "x: y", n: 3, on: true, list: ["a", "b"], deep: [{ k: "yes", v: [] }] }), 'name: a\ndescription: "x: y"\nn: 3\non: true\nlist: [a, b]\ndeep:\n  - k: "yes"\n    v: []\n');
});

test("a project is read the same from the manifests of dbt 1.4, 1.7 and 1.12", () => {
  for (const v of ["1.4", "1.7", "1.12"]) {
    // dbt 1.4 does not name the project in its manifest: dbt_project.yml does.
    const g = loadProject(project(fixture(v)));
    assert.equal(g.project, "jaffle_shop");
    assert.ok([...g.nodes.values()].every((n) => n.own));
    assert.ok(g.tool.version.startsWith(v), v);
    const of = (type) => [...g.nodes.values()].filter((n) => n.type === type).map((n) => n.name).sort();
    assert.deepEqual(of("seed"), ["raw_customers", "raw_orders", "raw_payments"], v);
    for (const m of ["customers", "orders", "stg_customers", "stg_orders", "stg_payments"]) assert.ok(of("model").includes(m), `${v} ${m}`);
    const orders = g.nodes.get(M + "orders");
    assert.deepEqual(orders.deps.sort(), [M + "stg_orders", M + "stg_payments"], v);
    assert.equal(orders.materialized, "table");
    assert.equal(g.nodes.get(M + "stg_orders").materialized, "view");
    assert.equal(orders.path, "models/orders.sql");
    assert.equal(orders.patch, "models/schema.yml");
    assert.match(orders.sql, /ref\('stg_orders'\)/);
    // A relationships test depends on both models: it belongs to the one it is written under.
    assert.equal(orders.tests.length, 10, v);
    const rel = orders.tests.find((t) => t.kind === "relationships");
    assert.equal(rel.column, "customer_id");
    assert.equal(rel.detail, "→ customers.customer_id");
    assert.equal(g.nodes.get(M + "customers").tests.length, 2, v);
    assert.deepEqual(orders.columns.find((c) => c.name === "order_id").tests.sort(), ["not_null", "unique"]);
    assert.match(orders.tests.find((t) => t.kind === "accepted_values").detail, /^in \(placed, shipped/);
  }
  // dbt 1.0 – 1.2 called the SQL raw_sql.
  const old = fixture("1.4");
  for (const n of Object.values(old.nodes)) if ("raw_code" in n) (n.raw_sql = n.raw_code), delete n.raw_code;
  assert.match(fromDbt(old).nodes.get(M + "orders").sql, /stg_payments/);
  // Whatever is in the file, nothing throws.
  assert.equal(fromDbt({}).nodes.size, 0);
  assert.equal(fromDbt({ nodes: { a: null, b: { resource_type: "model" } }, sources: [], metadata: 3 }).nodes.size, 0);
});

test("results, catalog and freshness are laid on the graph", () => {
  const m = manifest({ a: { columns: ["id"] }, b: { deps: ["a", "source.p.raw.events"] } }, [["a", "unique", "id"], ["a", "not_null", "id"]], { "raw.events": { freshness: { warn_after: { count: 12, period: "hour" }, error_after: { count: null, period: null } }, loaded_at_field: "loaded_at" } });
  const results = { metadata: { generated_at: "2026-01-02T00:00:00Z" }, args: { which: "build" }, results: [
    { unique_id: "model.p.a", status: "success", execution_time: 0.1234, adapter_response: { rows_affected: 42 }, timing: [{ name: "execute", completed_at: "2026-01-02T00:00:01Z" }], compiled_code: "select 1" },
    { unique_id: "model.p.b", status: "error", execution_time: 0.5, message: "Binder Error: no column x", adapter_response: {} },
    { unique_id: "test.p.t0", status: "fail", failures: 3, message: "Got 3 results, configured to fail if != 0" },
    { unique_id: "test.p.t1", status: "pass", failures: 0 },
  ] };
  const catalog = { nodes: { "model.p.a": { metadata: { type: "BASE TABLE" }, columns: { ID: { name: "ID", type: "INTEGER", index: 1 }, EXTRA: { name: "EXTRA", type: "VARCHAR", index: 2 } }, stats: { row_count: { value: 42, include: true }, bytes: { value: 2048, include: true }, has_stats: { value: true, include: false } } } }, sources: {} };
  const sources = { results: [{ unique_id: "source.p.raw.events", status: "warn", max_loaded_at: "2026-01-01T10:00:00Z" }] };
  const root = project(m, { "target/run_results.json": results, "target/catalog.json": catalog, "target/sources.json": sources });
  const a = detail(root, "a");
  assert.deepEqual(a.result, { status: "success", seconds: 0.12, rows: 42, message: null, at: "2026-01-02T00:00:01Z" });
  assert.equal(a.compiled, "select 1");
  assert.deepEqual(a.testList.map((t) => [t.kind, t.status, t.failures]), [["unique", "fail", 3], ["not_null", "pass", 0]]);
  assert.equal(a.failing, 1);
  // The catalog's column names differ in case; a column only the warehouse has is marked.
  assert.deepEqual(a.columns.map((c) => [c.name, c.type, c.undocumented ?? false]), [["id", "INTEGER", false], ["EXTRA", "VARCHAR", true]]);
  assert.deepEqual(a.stats, { rows: 42, bytes: 2048, kind: "BASE TABLE" });
  assert.equal(detail(root, "b").result.message, "Binder Error: no column x");
  const src = detail(root, "raw.events");
  assert.deepEqual(src.freshness, { warn: "12 hours", error: null, loadedAt: "loaded_at", status: "warn", maxLoadedAt: "2026-01-01T10:00:00Z" });
  assert.deepEqual(src.readBy.map((x) => x.name), ["b"]);
  const s = summary(root, "x");
  assert.deepEqual(s.ran, { at: "2026-01-02T00:00:00Z", which: "build", target: null });
  assert.equal(s.catalog, true);
  assert.equal(s.nodes.find((n) => n.name === "b").status, "error");
  // The SQL dbt compiled to a file is read when the manifest has none.
  fs.mkdirSync(path.join(root, "target/compiled/p/models"), { recursive: true });
  fs.writeFileSync(path.join(root, "target/compiled/p/models/b.sql"), "select 2");
  assert.equal(detail(root, "b").compiled, "select 2");
});

test("review: what each model lacks", () => {
  const m = manifest(
    {
      bare: {},
      keyless: { description: "d", columns: ["id"] },
      loose: { description: "d", columns: ["id"] },
      good: { description: "d", columns: ["id"] },
      combo: { description: "d", columns: ["a", "b"] },
      inc: { description: "d", columns: ["id"], config: { materialized: "incremental" } },
      inc_key: { description: "d", columns: ["id", "day"], config: { materialized: "incremental", unique_key: ["id", "day"] } },
      appended: { description: "d", columns: ["id"], config: { materialized: "incremental", incremental_strategy: "append" } },
      constrained: { description: "d", columns: ["id"], constraints: [{ type: "primary_key", columns: ["id"] }] },
      eph: { description: "d", config: { materialized: "ephemeral" } },
    },
    [
      ["keyless", "not_null", "id"],
      ["loose", "unique", "id"],
      ["good", "unique", "id"], ["good", "not_null", "id"],
      ["combo", "dbt_utils.unique_combination_of_columns", null, { combination_of_columns: ["a", "b"] }], ["combo", "not_null", "a"], ["combo", "not_null", "b"],
      ["inc", "unique", "id"], ["inc", "not_null", "id"],
      ["inc_key", "unique", "id"], ["inc_key", "not_null", "id"],
      ["appended", "unique", "id"], ["appended", "not_null", "id"],
      ["constrained", "not_null", "id"],
    ],
    { "raw.a": {}, "raw.b": { freshness: { warn_after: { count: 1, period: "day" } } } },
  );
  const found = reviewGraph(loadProject(project(m))).map((f) => `${f.name}: ${f.rule}`);
  assert.deepEqual(found.sort(), [
    "bare: no-description",
    "bare: no-tests",
    "inc: incremental-no-unique-key",
    "inc_key: key-not-tested", // unique_key (id, day) has no unique test of both
    "inc_key: key-not-tested", // and day may be null
    "keyless: no-key-test",
    "loose: unique-without-not-null",
    "raw.a: source-no-freshness",
  ]);
  // The example is well tested: only its staging models lack a description, and the model with a two-column key lacks its test.
  const g = loadProject(project());
  assert.deepEqual(g.findings.map((f) => `${f.name}: ${f.rule}`), ["customer_payment_methods: no-key-test", "stg_customers: no-description", "stg_orders: no-description", "stg_payments: no-description"]);
  assert.equal(g.findings[0].path, "models/marts/customer_payment_methods.yml");
});

test("plans: read, checked, drawn on the graph until they are written", () => {
  const root = project(fixture("1.7"), plans([
    { name: "daily_revenue", path: "models/marts/daily_revenue.sql", materialized: "incremental", grain: "an order date", key: ["order_date"], watermark: "order_date", from: ["orders"], columns: [{ name: "order_date", type: "date" }, { name: "revenue", tests: ["not_null"] }] },
    { name: "refunds_by_day", from: ["daily_revenue", "raw.refunds", "nowhere"] },
    { name: "raw.refunds", kind: "source", loaded_at: "_loaded_at", freshness: { warn: "12h", error: "2 days" }, columns: [{ name: "id" }] },
    { name: "orders", from: ["stg_orders"], grain: "an order", key: ["order_id"], materialized: "table" },
  ]));
  const g = loadProject(root);
  assert.deepEqual(g.plans.map((p) => [p.name, p.state]), [["daily_revenue", "planned"], ["refunds_by_day", "planned"], ["raw.refunds", "planned"], ["orders", "written"]]);
  assert.deepEqual(g.planFile.problems, ['plan "refunds_by_day" reads "nowhere", which is not a model, seed, snapshot, source or plan']);
  assert.deepEqual(g.planFile.open.map((o) => `${o.plan}: ${o.missing.split(":")[0]}`), ["refunds_by_day: grain", "refunds_by_day: key", "refunds_by_day: materialized"]);
  const plan = g.nodes.get("plan.daily_revenue");
  assert.deepEqual([plan.type, plan.deps, plan.key, plan.materialized], ["plan", [M + "orders"], { columns: ["order_date"], from: "plan" }, "incremental"]);
  assert.deepEqual(g.nodes.get("plan.refunds_by_day").deps, ["plan.daily_revenue", "plan.raw.refunds", "unknown.nowhere"]);
  assert.equal(g.nodes.get("unknown.nowhere").type, "unknown");
  assert.equal(g.nodes.get(M + "orders").planned, true);
  assert.equal(g.nodes.has("plan.orders"), false);
  assert.equal(findNode(g, "raw.refunds").id, "plan.raw.refunds");
  // Plans are not reviewed: they are not there yet.
  assert.ok(g.findings.every((f) => !f.node.startsWith("plan.")));

  const bad = readPlans(project(null, { "tome-etl.json": { format: 2, dbt: "dbt", colour: 1, plans: [
    { name: "a b" }, { name: "x" }, { name: "x" }, { name: "y", kind: "seed" },
    { name: "z", path: "../z.sql", materialized: "fast", key: ["id"], columns: [{ name: "other" }, { name: "other" }, { name: "t", tests: [{ a: 1, b: 2 }] }], from: ["z"], watermark: "a b", wat: 1 },
    { name: "raw.s", kind: "source", freshness: { warn: "soon" }, path: "models/s.sql" },
    { name: "w", path: "models/other_name.sql" },
  ] } }));
  const text = bad.problems.join("\n");
  for (const want of [/format 2/, /dbt is the command/, /unknown field colour/, /plans\[0\]: name is a model's name/, /a second plan "x"/, /kind is "model" or "source"/, /"z": path is the file/, /materialized is one of/, /a column needs a name of its own/, /column t: tests is a list/, /key column id is not in columns/, /it reads itself/, /watermark is the column/, /unknown field wat/, /"raw\.s": freshness is/, /"raw\.s": path is the file to write inside the project, ending \.yml/, /"w": path is the file/]) assert.match(text, want);
  assert.deepEqual(readPlans(project(null)).plans, []);
  assert.match(readPlans(project(null, { "tome-etl.json": "{" })).problems[0], /is not JSON/);

  // Plans that read each other in a circle are named, and still drawn.
  const loop = loadProject(project(null, plans([{ name: "a", from: ["b"] }, { name: "b", from: ["c"] }, { name: "c", from: ["a"] }])));
  assert.match(loop.planFile.problems.join("\n"), /read each other in a circle: /);
  assert.equal(drawing(loop.root).nodes.length, 3);
});

test("scaffold: a plan's files, in the words of the project's dbt", () => {
  const model = { name: "revenue_by_day", path: "models/marts/revenue_by_day.sql", materialized: "incremental", description: "Revenue per day.", grain: "an order date", key: ["order_date"], watermark: "order_date", from: ["orders", "raw.refunds"], tags: ["finance"], columns: [{ name: "order_date", type: "date" }, { name: "status", tests: ["not_null", { accepted_values: { values: ["a", "b"], config: { severity: "warn" } } }] }] };
  const source = { name: "raw.refunds", kind: "source", description: "Refunds as the shop exports them.", loaded_at: "_loaded_at", freshness: { warn: "12h", error: "2 days" }, key: ["id"], columns: [{ name: "id" }, { name: "amount", type: "integer" }] };
  const root = project(fixture("1.12"), plans([model, source, { name: "pair", key: ["a", "b"], from: ["orders"] }, { name: "empty" }]));
  const g = loadProject(root);
  const files = (name) => Object.fromEntries(scaffoldFiles(g, g.planFile.plans.find((p) => p.name === name)).map((f) => [f.path, f.text]));
  const m = files("revenue_by_day");
  assert.deepEqual(Object.keys(m), ["models/marts/revenue_by_day.sql", "models/marts/revenue_by_day.yml"]);
  const sql = m["models/marts/revenue_by_day.sql"];
  assert.match(sql, /^\{\{ config\(materialized='incremental', unique_key='order_date', tags=\['finance'\]\) \}\}\n/);
  assert.match(sql, /-- One row: an order date\n-- Key: order_date\n/);
  assert.match(sql, /orders as \(\n\n {4}select \* from \{\{ ref\('orders'\) \}\}\n\n {4}\{% if is_incremental\(\) %\}\n {4}where order_date > \(select max\(order_date\) from \{\{ this \}\}\)\n {4}\{% endif %\}\n\n\),/);
  assert.match(sql, /refunds as \(\n\n {4}select \* from \{\{ source\('raw', 'refunds'\) \}\}\n\n\),/);
  assert.match(sql, /TODO\(tome-etl\): write this select\. Columns: order_date, status\n {4}select \* from orders\n/);
  assert.equal(m["models/marts/revenue_by_day.yml"], `version: 2

models:
  - name: revenue_by_day
    description: "Revenue per day. One row: an order date."
    columns:
      - name: order_date
        data_type: date
        data_tests: [unique, not_null]
      - name: status
        data_tests:
          - not_null
          - accepted_values:
              arguments:
                values: [a, b]
              config:
                severity: warn
`);
  assert.equal(files("raw.refunds")["models/sources/raw__refunds.yml"], `version: 2

sources:
  - name: raw
    tables:
      - name: refunds
        description: Refunds as the shop exports them.
        loaded_at_field: _loaded_at
        freshness:
          warn_after:
            count: 12
            period: hour
          error_after:
            count: 2
            period: day
        columns:
          - name: id
            data_tests: [unique, not_null]
          - name: amount
            data_type: integer
`);
  // A key of two columns: each not null, and a reminder to test them together (no dbt_utils in this project).
  assert.match(files("pair")["models/pair.yml"], /- name: pair\n {4}# TODO\(tome-etl\): test that \(a, b\) is unique together.*\n {4}columns:\n {6}- name: a\n {8}data_tests: \[not_null\]\n/);
  assert.match(files("empty")["models/empty.sql"], /select 1 as todo/);
  // With dbt_utils installed, the test itself.
  const withUtils = fixture("1.12");
  withUtils.macros = { "macro.dbt_utils.unique_combination_of_columns": {} };
  const g2 = loadProject(project(withUtils, plans([{ name: "pair", key: ["a", "b"] }])));
  assert.match(scaffoldFiles(g2, g2.planFile.plans[0])[1].text, /data_tests:\n {6}- dbt_utils\.unique_combination_of_columns:\n {10}arguments:\n {12}combination_of_columns: \[a, b\]/);
  // An older dbt: `tests`, and a test's arguments beside its name.
  const old = loadProject(project(fixture("1.7"), plans([model])));
  const yml = scaffoldFiles(old, old.planFile.plans[0])[1].text;
  assert.match(yml, /tests: \[unique, not_null\]/);
  assert.match(yml, /- accepted_values:\n {14}values: \[a, b\]\n {14}config:/);
  assert.doesNotMatch(yml, /data_tests|arguments/);

  // Written to the project, never over a file that is there.
  const wrote = scaffold(root, ["revenue_by_day"]);
  assert.deepEqual(wrote.map((w) => path.relative(root, w.file)), ["models/marts/revenue_by_day.sql", "models/marts/revenue_by_day.yml"]);
  assert.throws(() => scaffold(root, ["revenue_by_day"]), /is there already/);
  assert.throws(() => scaffold(root, ["nothing"]), /no plan "nothing"/);
  assert.equal(detail(root, "revenue_by_day").exists, true);
  const all = scaffold(project(fixture("1.12"), plans([{ name: "one" }, { name: "orders" }])));
  assert.deepEqual(all.map((w) => w.plan), ["one", "one"]);
  assert.throws(() => scaffold(project(fixture("1.12"), plans([{ name: "orders" }])), ["orders"]), /written already/);
  assert.throws(() => scaffold(project(null, plans([{ name: "a", from: ["nowhere"] }]))), /has problems/);
});

test("choosing what to draw: a model and the levels around it", () => {
  const g = loadProject(project());
  const s = parseSelect(g, "+orders+1");
  assert.deepEqual([s.node.name, s.up, s.down], ["orders", Infinity, 1]);
  assert.deepEqual([parseSelect(g, "2+orders").up, parseSelect(g, "orders").down, parseSelect(g, "orders+").down], [2, 0, Infinity]);
  assert.equal(parseSelect(g, "nothing"), null);
  const names = (ids) => [...ids].map((id) => g.nodes.get(id).name).sort();
  assert.deepEqual(names(neighbourhood(g, M + "orders", Infinity, 0).ids), ["orders", "raw_orders", "raw_payments", "stg_orders", "stg_payments"]);
  const one = neighbourhood(g, M + "orders", 1, 1);
  assert.deepEqual(names(one.ids), ["daily_revenue", "orders", "stg_orders", "stg_payments"]);
  assert.deepEqual(one.cut, { up: true, down: false });
  const d = drawing(g.root, { focus: "orders", up: 1, down: 1 });
  assert.equal(d.focus, M + "orders");
  const at = Object.fromEntries(d.nodes.map((n) => [n.name, n.at]));
  assert.ok(at.stg_orders[0] < at.orders[0] && at.orders[0] < at.daily_revenue[0]);
  assert.equal(d.nodes.find((n) => n.name === "stg_orders").moreUp, true);
  assert.equal(d.nodes.find((n) => n.name === "stg_orders").moreDown, true); // customers reads it too
  assert.equal(drawing(g.root, { folder: "models/staging" }).nodes.length, 3);
  assert.equal(drawing(g.root).nodes.length, 10);
  assert.throws(() => drawing(g.root, { focus: "nothing" }), /no model nothing/);
  // A link that skips a column runs through an empty cell, not through a box.
  const l = layout([{ id: "a", deps: [] }, { id: "b", deps: ["a"] }, { id: "c", deps: ["a", "b"] }]);
  assert.deepEqual(l.at, { a: [0, 0], b: [1, 0], c: [2, 0] });
  assert.deepEqual(l.lanes, { "a>c": [[1, 1]] });
});

test("a large project: read once, drawn around one model", () => {
  const models = {};
  const N = 6000;
  for (let i = 0; i < N; i++) models[`m${i}`] = { folder: `area${i % 40}/`, deps: i < 40 ? [] : [`m${i - 40}`, `m${Math.floor(i / 3)}`], columns: ["id", "a", "b"], description: "d" };
  const tests = [];
  for (let i = 0; i < N; i++) tests.push([`m${i}`, "unique", "id"], [`m${i}`, "not_null", "id"]);
  const root = project(manifest(models, tests));
  let t = Date.now();
  const g = loadProject(root);
  assert.equal(g.nodes.size, N);
  assert.ok(Date.now() - t < 5000, `read in ${Date.now() - t} ms`);
  t = Date.now();
  assert.equal(loadProject(root), g); // kept until the files change
  assert.deepEqual(drawing(root), { tooMany: N, total: N, rev: g.rev });
  const d = drawing(root, { focus: "m3000", up: 2, down: 2 });
  assert.ok(d.nodes.length > 4 && d.nodes.length <= MAX_DRAW);
  // m1 is read by thousands, level after level: the drawing stays small.
  const hub = drawing(root, { focus: "m1", up: 0, down: Infinity });
  assert.ok(hub.nodes.length <= MAX_DRAW);
  assert.equal(hub.nodes[0].name, "m1");
  assert.equal(summary(root, "x").nodes.length, N);
  assert.equal(drawing(root, { folder: "models/area7" }).nodes.length, N / 40);
  assert.ok(Date.now() - t < 3000, `drawn in ${Date.now() - t} ms`);
  // A new manifest is read again.
  const next = manifest({ only: {} });
  fs.writeFileSync(path.join(root, "target/manifest.json"), JSON.stringify(next));
  assert.equal(loadProject(root).nodes.size, 1);
});

test("files changed after the manifest was written", () => {
  const root = project(fixture("1.12"), { "models/orders.sql": "select 1", "models/schema.yml": "version: 2", "README.md": "x" });
  const past = new Date(Date.now() - 60000);
  for (const f of ["models/orders.sql", "models/schema.yml", "dbt_project.yml"]) fs.utimesSync(path.join(root, f), past, past);
  assert.deepEqual(staleness(root, loadProject(root)), { stale: false, changed: [], more: 0 });
  const later = new Date(Date.now() + 60000);
  fs.utimesSync(path.join(root, "models/orders.sql"), later, later);
  fs.utimesSync(path.join(root, "README.md"), later, later);
  const g = loadProject(root);
  g.rev += "-"; // not the answer of a moment ago
  assert.deepEqual(staleness(root, g), { stale: true, changed: ["models/orders.sql"], more: 0 });
  // No manifest: nothing to be older than.
  const empty = project(null);
  assert.equal(summary(empty, "x").missing, true);
  assert.equal(summary(empty, "x").stale, false);
  assert.throws(() => rootOf(os.tmpdir()), /no dbt_project\.yml/);
});

test("dbt parse: the command it starts, and what it reports", async () => {
  const root = project(null);
  assert.deepEqual(dbtCommand(root), ["dbt"]);
  fs.mkdirSync(path.join(root, ".venv/bin"), { recursive: true });
  fs.writeFileSync(path.join(root, ".venv/bin/dbt"), "");
  assert.deepEqual(dbtCommand(root), [path.join(root, ".venv/bin/dbt")]);
  process.env.TOME_ETL_DBT = "uvx --from dbt-core dbt";
  assert.deepEqual(dbtCommand(root), ["uvx", "--from", "dbt-core", "dbt"]);
  delete process.env.TOME_ETL_DBT;
  // A stand-in for dbt: it notes how it was called and writes a manifest.
  const fake = path.join(root, "fake-dbt.mjs");
  fs.writeFileSync(fake, `import fs from "node:fs";\nfs.writeFileSync("called.txt", process.argv.slice(2).join(" "));\nfs.mkdirSync("target", { recursive: true });\nfs.writeFileSync("target/manifest.json", ${JSON.stringify(JSON.stringify(manifest({ only: {} })))});\nconsole.log("\\x1b[0mdone");\n`);
  fs.writeFileSync(path.join(root, "tome-etl.json"), JSON.stringify({ dbt: [process.execPath, fake] }));
  const r = await dbtParse(root);
  assert.deepEqual([r.ok, r.exit, r.log], [true, 0, ["done"]]);
  assert.equal(fs.readFileSync(path.join(root, "called.txt"), "utf8"), "parse"); // nothing but parse
  assert.equal(loadProject(root).nodes.size, 1);
  fs.writeFileSync(path.join(root, "tome-etl.json"), JSON.stringify({ dbt: ["no-such-dbt-anywhere"] }));
  const missing = await dbtParse(root);
  assert.equal(missing.ok, false);
  assert.match(missing.log.join("\n"), /could not start no-such-dbt-anywhere/);
});

test("only opened projects, only its own page", async () => {
  const root = project();
  const ctx = {};
  const d = new Projects().add(root);
  assert.throws(() => new Projects().add(os.tmpdir()), /no dbt_project\.yml/);
  const list = json(await handle(ctx, req("GET", "/api/projects"))).projects;
  assert.ok(list.some((x) => x.id === d.id && x.models === 7 && x.title === "jaffle_shop"));
  const p = json(await handle(ctx, req("GET", `/api/project?id=${d.id}`)));
  assert.equal(p.nodes.length, 10);
  assert.deepEqual(p.folders.map((f) => f.name), ["models", "models/marts", "models/staging", "seeds"]);
  assert.deepEqual(json(await handle(ctx, req("GET", `/api/project?id=${d.id}&rev=${p.rev}`))), { rev: p.rev, same: true });
  assert.equal(json(await handle(ctx, req("GET", `/api/graph?id=${d.id}`))).nodes.length, 10);
  assert.equal(json(await handle(ctx, req("GET", `/api/graph?id=${d.id}&focus=${M}orders&up=1&down=0`))).nodes.length, 3);
  assert.equal(json(await handle(ctx, req("GET", `/api/graph?id=${d.id}&focus=${M}orders&up=all&down=all`))).nodes.length, 6);
  const node = json(await handle(ctx, req("GET", `/api/node?id=${d.id}&node=${M}orders`)));
  assert.match(node.sql, /with orders as/);
  assert.equal(node.file, path.join(root, "models/orders.sql"));
  assert.equal(node.patchFile, path.join(root, "models/schema.yml"));
  for (const bad of ["/api/project?id=0000000000000000", `/api/node?id=${d.id}&node=nothing`, `/api/graph?id=${d.id}&focus=nothing`]) assert.equal((await handle(ctx, req("GET", bad))).status, 404, bad);
  for (const bad of ["/api/project", `/api/node?id=${d.id}`]) assert.equal((await handle(ctx, req("GET", bad))).status, 400, bad);

  assert.equal((await handle(ctx, req("GET", "/api/projects", undefined, { host: "evil.example:4790" }))).status, 403);
  assert.equal((await handle(ctx, req("GET", "/api/projects", undefined, { origin: "http://evil.example" }))).status, 403);
  assert.equal((await handle(ctx, req("GET", "/api/projects", undefined, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await handle(ctx, req("POST", `/api/comments?id=${d.id}`, {}, { "x-tome-etl": null }))).status, 403);
  assert.equal((await handle(ctx, req("GET", "/page.js"))).status, 200);
  assert.equal((await handle(ctx, req("GET", `/p/${d.id}`))).type, "text/html; charset=utf-8");
  for (const bad of ["/.hidden", "/etl.mjs", "/../etl.mjs", "/api/nothing"]) assert.equal((await handle(ctx, req("GET", bad))).status, 404, bad);

  new Projects().remove(d.id);
  assert.equal((await handle(ctx, req("GET", `/api/project?id=${d.id}`))).status, 404);
});

test("comments: on a model or a column, saved, sent, taken by a waiting agent, answered", async () => {
  const root = project();
  const ctx = {};
  const d = new Projects().add(root);
  const post = (body) => handle(ctx, req("POST", `/api/comments?id=${d.id}`, body));
  const note = json(await post({ op: "new", anchor: { node: M + "orders", column: "amount" }, text: "  in cents?  " })).thread;
  assert.equal(note.n, 1);
  assert.deepEqual(note.anchor, { node: M + "orders", name: "orders", column: "amount" });
  assert.equal(note.messages[0].text, "in cents?");
  assert.equal(note.sent, null);
  const whole = json(await post({ op: "new", anchor: null, text: "add a marts layer", send: true })).thread;
  assert.ok(whole.sent);

  const taken = json(await handle(ctx, req("POST", `/api/comments/take?id=${d.id}&ms=0`)));
  // The note went out with the one sent; the agent gets the files to change.
  assert.deepEqual([taken.thread.n, ...taken.also.map((x) => x.n)], [1, 2]);
  assert.deepEqual([taken.thread.name, taken.thread.column, taken.thread.file, taken.thread.patchFile], ["orders", "amount", path.join(root, "models/orders.sql"), path.join(root, "models/schema.yml")]);
  assert.equal(taken.also[0].node, null);
  assert.equal(json(await handle(ctx, req("POST", `/api/comments/take?id=${d.id}&ms=0`))).thread, null);

  assert.equal(json(await post({ op: "say", id: note.id, text: "and the currency?", send: true })).thread.taken, null);
  assert.equal(json(await handle(ctx, req("POST", "/api/comments/take?ms=0"))).thread.id, note.id);
  assert.equal(json(await post({ op: "resolve", id: note.id })).thread.resolved, true);
  const r = json(await handle(ctx, req("GET", `/api/comments?id=${d.id}`)));
  assert.equal(r.threads.length, 2);
  assert.equal(r.listening, true); // an agent asked a moment ago
  for (const bad of [{ op: "new", text: "" }, { op: "new", anchor: { node: "model.p.nothing" }, text: "x" }, { op: "new", anchor: { node: M + "orders", column: "nothing" }, text: "x" }, { op: "new", anchor: "orders", text: "x" }, { op: "nothing", id: note.id }]) assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  assert.deepEqual(cleanAnchor(root, { node: M + "orders" }), { node: M + "orders", name: "orders", column: null });
});

test("every word the page says has its 中文 and 日本語", () => {
  const src = fs.readFileSync(path.join(scripts, "page/page.js"), "utf8");
  const said = new Set([...src.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]));
  assert.ok(said.size > 10);
  for (const name of ["zh", "ja"]) {
    const table = src.slice(src.indexOf(`const ${name} = {`), src.indexOf("};", src.indexOf(`const ${name} = {`)));
    const keys = new Set([...table.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) => m[1]));
    assert.deepEqual([...said].filter((s) => !keys.has(s)), [], `missing in ${name}`);
    assert.deepEqual([...keys].filter((s) => !said.has(s)), [], `unused in ${name}`);
  }
});
