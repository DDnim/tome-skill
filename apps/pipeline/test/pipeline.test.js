// The tome-pipeline skill: what `check` reads in pipeline.json, a run carried
// from start to end (order, steps taken from earlier runs, retries, time
// limits, a question for a person, an agent), `resume`, the lock, and the
// server's rules (only opened pipelines, only files of their runs).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

process.env.TOME_PIPELINE_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-pipeline-home-")));
const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../skills/tome-pipeline/scripts");
const { answer, checkPipeline, handle, holder, lastLine, layout, listRuns, makePipeline, parseDuration, Pipelines, readPipeline, readStatus, relParts, runPipeline, view } = await import(path.join(scripts, "pipeline.mjs"));

/** A pipeline's folder with these steps and files; `calls.log` beside it gets a line per step that ran. */
function folder(steps, files = {}, extra = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-pipeline-")));
  fs.mkdirSync(path.join(dir, "steps"));
  fs.writeFileSync(path.join(dir, "pipeline.json"), JSON.stringify({ format: 1, title: "Test", steps, ...extra }));
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
  return dir;
}
const calls = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, "calls.log"), "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
};
/** A sh step's script: notes the call, then the body. */
const sh = (body) => `echo "$STEP" >> "$PIPELINE_DIR/calls.log"\n${body}\n`;
const quiet = { say: () => {} };
const lines = () => {
  const out = [];
  return { say: (l) => out.push(l), out };
};

test("paths and durations", () => {
  assert.deepEqual(relParts("steps/a.sh"), ["steps", "a.sh"]);
  for (const bad of ["", "/etc/passwd", "../x", "a/../b", ".git/config", "a\\b"]) assert.equal(relParts(bad), null, bad);
  assert.equal(parseDuration("90s"), 90000);
  assert.equal(parseDuration("15m"), 900000);
  assert.equal(parseDuration("2h"), 7200000);
  assert.equal(parseDuration(30), 30000);
  assert.equal(parseDuration("soon"), null);
});

test("check: what is wrong in pipeline.json, and which steps are not written yet", () => {
  const dir = folder(
    [
      { id: "fetch", kind: "sh", run: "steps/fetch.sh", out: ["a.txt"] },
      { id: "write", kind: "agent", prompt: "steps/write.md", needs: ["fetch"], out: ["b.md"] },
      { id: "pick", kind: "human", needs: ["write"], choices: "write/b.md" },
      { id: "cmd", kind: "sh", run: "echo hi > x.txt", needs: ["pick"] },
    ],
    { "steps/fetch.sh": "true" },
  );
  const ok = checkPipeline(dir);
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.todo, [{ step: "write", missing: "steps/write.md" }]);
  assert.deepEqual(layout(readPipeline(dir).steps), { at: { fetch: [0, 0], write: [1, 0], pick: [2, 0], cmd: [3, 0] }, lanes: {} });
  assert.deepEqual(readPipeline(dir).steps.find((s) => s.id === "pick").out, ["answer.txt"]);

  fs.writeFileSync(
    path.join(dir, "pipeline.json"),
    JSON.stringify({
      format: 2,
      steps: [
        { id: "A", kind: "sh", run: "x" },
        { id: "a", kind: "bash", run: "x" },
        { id: "a", kind: "sh", run: "x" },
        { id: "b", kind: "agent", prompt: "../p.md" },
        { id: "c", kind: "sh", needs: ["d", "nope"], run: "x", retry: 99, timeout: "soon", colour: 1 },
        { id: "d", kind: "sh", needs: ["c"], run: "x", out: ["_log.txt"] },
        { id: "e", kind: "human", choices: "c/x.md" },
      ],
    }),
  );
  const problems = checkPipeline(dir).problems.join("\n");
  for (const want of [/format 2/, /steps\[0\]: id is lowercase/, /step "a": kind is one of/, /a second step "a"/, /an agent step needs prompt/, /an agent step needs out/, /needs "nope", which is not a step/, /retry is a whole number/, /timeout is like/, /unknown field colour/, /out "_log.txt"/, /go round in a circle: (c → d → c|d → c → d)/, /choices come from "c", which it does not need/]) {
    assert.match(problems, want);
  }
});

test("a run: steps in order, side by side, files passed on; the next run takes unchanged steps from it", async () => {
  const dir = folder(
    [
      { id: "fetch", kind: "sh", run: "steps/fetch.sh", out: ["a.txt"], fresh: true },
      { id: "upper", kind: "sh", run: "steps/upper.mjs", needs: ["fetch"], out: ["b.txt"] },
      { id: "count", kind: "sh", run: "steps/count.sh", needs: ["fetch"], out: ["c.txt"] },
      { id: "join", kind: "sh", run: 'cat "$IN_UPPER/b.txt" "$IN_COUNT/c.txt" > d.txt; echo join >> "$PIPELINE_DIR/calls.log"', needs: ["upper", "count"], out: ["d.txt"] },
    ],
    {
      "steps/fetch.sh": sh("printf 'news' > a.txt"),
      "steps/upper.mjs": 'import fs from "node:fs";\nfs.appendFileSync(process.env.PIPELINE_DIR + "/calls.log", "upper\\n");\nfs.writeFileSync("b.txt", fs.readFileSync(process.env.IN_FETCH + "/a.txt", "utf8").toUpperCase());\n',
      "steps/count.sh": sh('wc -c < "$IN_FETCH/a.txt" | tr -d " " > c.txt'),
    },
  );
  const first = await runPipeline(dir, quiet);
  assert.equal(first.state, "done");
  assert.deepEqual(new Set(calls(dir)), new Set(["fetch", "upper", "count", "join"]));
  assert.equal(calls(dir).at(-1), "join");
  const run1 = path.join(dir, "runs", first.run);
  assert.equal(fs.readFileSync(path.join(run1, "join/d.txt"), "utf8"), "NEWS4\n");
  assert.ok(fs.existsSync(path.join(run1, "fetch/_log.txt")));

  // fetch reads the outside world and runs again; it made the same file, so the rest is taken from run 1.
  fs.writeFileSync(path.join(dir, "calls.log"), "");
  const out = lines();
  const second = await runPipeline(dir, out);
  assert.deepEqual(calls(dir), ["fetch"]);
  assert.deepEqual(Object.fromEntries(Object.entries(second.steps).map(([k, s]) => [k, [s.state, s.from ?? null]])), { fetch: ["done", null], upper: ["skipped", first.run], count: ["skipped", first.run], join: ["skipped", first.run] });
  assert.equal(fs.readFileSync(path.join(dir, "runs", second.run, "join/d.txt"), "utf8"), "NEWS4\n");
  assert.match(out.out.at(-1), /^DONE Test · run /);

  // A changed script runs again, and the steps after it whose input changed.
  fs.writeFileSync(path.join(dir, "calls.log"), "");
  fs.writeFileSync(path.join(dir, "steps/count.sh"), sh('echo "n=$(wc -c < "$IN_FETCH/a.txt" | tr -d " ")" > c.txt'));
  const third = await runPipeline(dir, quiet);
  assert.deepEqual(calls(dir), ["fetch", "count", "join"]);
  assert.equal(fs.readFileSync(path.join(dir, "runs", third.run, "join/d.txt"), "utf8"), "NEWSn=4\n");
  assert.deepEqual(listRuns(dir), [third.run, second.run, first.run]);

  // --all runs everything; --only runs one step with what it needs from the latest runs.
  fs.writeFileSync(path.join(dir, "calls.log"), "");
  await runPipeline(dir, { ...quiet, all: true });
  assert.deepEqual(new Set(calls(dir)), new Set(["fetch", "upper", "count", "join"]));
  fs.writeFileSync(path.join(dir, "calls.log"), "");
  const only = await runPipeline(dir, { ...quiet, only: "upper" });
  assert.deepEqual(calls(dir), ["upper"]);
  assert.deepEqual(Object.fromEntries(Object.entries(only.steps).map(([k, s]) => [k, s.state])), { fetch: "skipped", upper: "done", count: "off", join: "off" });
});

test("a failing step: retried, then the run stops, says where, and resume carries it on", async () => {
  const dir = folder(
    [
      { id: "flaky", kind: "sh", run: "steps/flaky.sh", out: ["f.txt"], retry: 1 },
      { id: "tts", kind: "sh", run: "steps/tts.sh", needs: ["flaky"], out: ["v.txt"] },
      { id: "render", kind: "sh", run: "steps/render.sh", needs: ["tts"], out: ["r.txt"] },
    ],
    {
      "steps/flaky.sh": sh('[ "$TRY" = 1 ] && { echo "first try fails" >&2; exit 1; }\necho ok > f.txt'),
      "steps/tts.sh": sh('[ -f "$PIPELINE_DIR/broken" ] && { echo "sentence 12 was cut" >&2; exit 2; }\necho voice > v.txt'),
      "steps/render.sh": sh('cat "$IN_TTS/v.txt" > r.txt'),
      broken: "",
    },
  );
  const out = lines();
  const failed = await runPipeline(dir, out);
  assert.equal(failed.state, "failed");
  assert.equal(failed.steps.flaky.state, "done");
  assert.equal(failed.steps.flaky.tries, 2);
  assert.equal(failed.steps.tts.state, "failed");
  assert.equal(failed.steps.tts.error, "exit 2");
  assert.equal(failed.steps.render.state, "pending");
  const last = out.out.at(-1);
  assert.match(last, /^FAIL Test · run \S+ · tts · exit 2 · log .*tts\/_log\.txt · after fixing: node .* resume /);
  assert.match(fs.readFileSync(path.join(dir, "runs", failed.run, "tts/_log.txt"), "utf8"), /sentence 12 was cut/);

  fs.rmSync(path.join(dir, "broken"));
  fs.writeFileSync(path.join(dir, "calls.log"), "");
  const resumed = await runPipeline(dir, { ...quiet, resume: true });
  assert.equal(resumed.run, failed.run);
  assert.equal(resumed.state, "done");
  assert.deepEqual(calls(dir), ["tts", "render"]);

  fs.writeFileSync(path.join(dir, "calls.log"), "");
  const again = await runPipeline(dir, { ...quiet, resume: true, from: "tts" });
  assert.equal(again.state, "done");
  assert.deepEqual(calls(dir), ["tts", "render"]);
});

test("a step over its time limit is stopped", async () => {
  const dir = folder([{ id: "slow", kind: "sh", run: "sleep 20; touch x.txt", out: ["x.txt"], timeout: 0.3 }]);
  const t0 = Date.now();
  const st = await runPipeline(dir, quiet);
  assert.ok(Date.now() - t0 < 8000);
  assert.equal(st.state, "failed");
  assert.match(st.steps.slow.error, /timed out/);
});

test("a step that is not written yet fails the run and says so", async () => {
  const dir = folder([{ id: "later", kind: "sh", run: "steps/later.sh", out: ["x.txt"] }]);
  const st = await runPipeline(dir, quiet);
  assert.equal(st.state, "failed");
  assert.match(st.steps.later.error, /not written yet: steps\/later\.sh/);
});

test("a question for a person: the run waits, the answer lets it go on, the same question later takes the answer", async () => {
  const dir = folder(
    [
      { id: "options", kind: "sh", run: "printf -- '- Cheaper AI\\n- Free models\\n# not a choice\\n' > o.md", out: ["o.md"] },
      { id: "pick", kind: "human", ask: "Which cover line?", needs: ["options"], choices: "options/o.md" },
      { id: "cover", kind: "sh", run: 'cat "$IN_PICK/answer.txt" > cover.txt', needs: ["pick"], out: ["cover.txt"] },
    ],
    {},
  );
  const out = lines();
  const waiting = await runPipeline(dir, out);
  assert.equal(waiting.state, "waiting");
  assert.equal(waiting.steps.pick.state, "waiting");
  assert.match(out.out.at(-1), /^WAIT Test · run \S+ · pick waits for a person: Which cover line\? · answer: node .* answer .* pick "…" --resume$/);
  const v = view(dir, "x");
  assert.deepEqual(v.steps.find((s) => s.id === "pick").choicesList, ["Cheaper AI", "Free models"]);

  assert.throws(() => answer(dir, "cover", "x"), /not a question/);
  const a = answer(dir, "pick", "Free models");
  assert.equal(a.run, waiting.run);
  assert.equal(readStatus(dir, waiting.run).steps.pick.state, "done");
  const done = await runPipeline(dir, { ...quiet, resume: true });
  assert.equal(done.state, "done");
  assert.equal(fs.readFileSync(path.join(dir, "runs", done.run, "cover/cover.txt"), "utf8"), "Free models\n");

  const next = await runPipeline(dir, quiet);
  assert.equal(next.state, "done");
  assert.equal(next.steps.pick.state, "skipped");
});

test("an agent step: its prompt with where the inputs are and what to write, on stdin of the agent's command", async () => {
  const dir = folder(
    [
      { id: "notes", kind: "sh", run: "echo facts > n.txt", out: ["n.txt"] },
      { id: "write", kind: "agent", prompt: "steps/write.md", needs: ["notes"], out: ["script.md"], model: "opus" },
    ],
    {
      "steps/write.md": "Write a short script from the notes.",
      "steps/agent.mjs": 'import fs from "node:fs";\nlet s = "";\nprocess.stdin.on("data", (d) => (s += d)).on("end", () => fs.writeFileSync("script.md", `model=${process.env.AGENT_MODEL}\\n${s}`));\n',
    },
    { agent: ["node", "steps/agent.mjs"] },
  );
  const st = await runPipeline(dir, quiet);
  assert.equal(st.state, "done");
  const got = fs.readFileSync(path.join(dir, "runs", st.run, "write/script.md"), "utf8");
  assert.match(got, /^model=opus\nWrite a short script from the notes\./);
  assert.match(got, /- notes: .*\/notes \(n\.txt\)/);
  assert.match(got, /Write these files in the folder .*\/write: script\.md/);
  assert.ok(fs.existsSync(path.join(dir, "runs", st.run, "write/_prompt.md")));
});

test("one run at a time; a run whose process is gone shows as interrupted", async () => {
  const dir = folder([{ id: "a", kind: "sh", run: "echo > a.txt", out: ["a.txt"] }]);
  fs.mkdirSync(path.join(dir, "runs"));
  fs.writeFileSync(path.join(dir, "runs/.lock"), JSON.stringify({ pid: process.pid, run: "x" }));
  assert.equal(holder(dir).pid, process.pid);
  await assert.rejects(runPipeline(dir, quiet), /already running/);
  fs.rmSync(path.join(dir, "runs/.lock"));

  const st = await runPipeline(dir, quiet);
  const file = path.join(dir, "runs", st.run, "status.json");
  fs.writeFileSync(file, JSON.stringify({ ...st, state: "running", steps: { a: { state: "running", startedAt: new Date().toISOString() } } }));
  const v = view(dir, "x");
  assert.equal(v.run.state, "interrupted");
  assert.equal(v.run.steps.a.state, "interrupted");
  assert.match(lastLine(dir, readPipeline(dir), { ...st, state: "failed", steps: { a: { state: "failed", error: "exit 1", tries: 1 } } }), /^FAIL Test · run \S+ · a · exit 1 · log /);
});

function req(method, target, body, headers = {}) {
  const url = new URL(target, "http://x");
  const h = { host: "127.0.0.1:4780", ...headers };
  if (method !== "GET" && !("x-tome-pipeline" in headers)) h["x-tome-pipeline"] = "1";
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return { method, path: decodeURIComponent(url.pathname), query: url.searchParams, headers: h, body: Buffer.from(body === undefined ? "" : JSON.stringify(body)) };
}
const json = (r) => JSON.parse(r.body.toString("utf8"));

test("the server: only this machine, only opened pipelines, only the files of their runs", async () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-pipeline-new-")));
  const made = makePipeline("News: daily", parent);
  assert.equal(path.basename(made), "News- daily");
  assert.equal(fs.readFileSync(path.join(made, ".gitignore"), "utf8"), "runs/\n");
  assert.equal(path.basename(makePipeline("News: daily", parent)), "News- daily 2");

  const dir = folder([
    { id: "pic", kind: "sh", run: "printf 'a,b\\n1,2\\n' > t.csv; echo log-line", out: ["t.csv"] },
    { id: "ask", kind: "human", needs: ["pic"] },
  ]);
  const st = await runPipeline(dir, quiet);
  const d = new Pipelines().add(dir);
  const ctx = {};

  assert.equal((await handle(ctx, req("GET", "/api/pipelines", undefined, { host: "evil.test" }))).status, 403);
  assert.equal((await handle(ctx, req("GET", "/api/pipelines", undefined, { origin: "http://evil.test" }))).status, 403);
  const list = json(await handle(ctx, req("GET", "/api/pipelines")));
  assert.equal(list.pipelines[0].id, d.id);
  assert.deepEqual(list.pipelines[0].last, { run: st.run, state: "waiting" });
  assert.equal((await handle(ctx, req("GET", "/api/pipeline?id=0123456789abcdef"))).status, 404);

  const v = json(await handle(ctx, req("GET", `/api/pipeline?id=${d.id}`)));
  assert.equal(v.run.run, st.run);
  assert.deepEqual(v.steps.map((s) => [s.id, s.at]), [["pic", [0, 0]], ["ask", [1, 0]]]);
  const step = json(await handle(ctx, req("GET", `/api/step?id=${d.id}&run=${st.run}&step=pic`)));
  assert.match(step.log.text, /log-line/);
  assert.deepEqual(step.files.map((f) => f.file), ["t.csv"]);

  const file = await handle(ctx, req("GET", `/o/${d.id}/${st.run}/pic/t.csv`));
  assert.equal(file.status, 200);
  assert.match(file.type, /^text\/plain/);
  assert.match(file.headers["Content-Security-Policy"], /sandbox/);
  const part = await handle(ctx, req("GET", `/o/${d.id}/${st.run}/pic/t.csv`, undefined, { range: "bytes=0-2" }));
  assert.equal(part.status, 206);
  assert.equal(part.headers["Content-Range"], "bytes 0-2/8");
  for (const bad of [`/o/${d.id}/${st.run}/pic/..%2F..%2F..%2Fpipeline.json`, `/o/${d.id}/..%2F..%2Fx/pic/t.csv`, `/o/${d.id}/${st.run}/pic/.hidden`, `/o/0123456789abcdef/${st.run}/pic/t.csv`]) {
    assert.notEqual((await handle(ctx, req("GET", bad))).status, 200, bad);
  }

  // An answer needs the page's header; it is written into the run that waits.
  assert.equal((await handle(ctx, req("POST", `/api/answer?id=${d.id}`, { step: "ask", text: "yes" }, { "x-tome-pipeline": null }))).status, 403);
  assert.equal((await handle(ctx, req("POST", `/api/answer?id=${d.id}`, { step: "ask", text: " " }))).status, 400);
  assert.equal((await handle(ctx, req("GET", "/"))).status, 200);
  assert.equal((await handle(ctx, req("GET", `/p/${d.id}`))).status, 200);
  assert.equal((await handle(ctx, req("GET", "/page.js"))).status, 200);
  assert.equal((await handle(ctx, req("GET", "/pipeline.mjs"))).status, 404);
});

test("every word of the page has a Chinese and a Japanese version", async () => {
  const text = fs.readFileSync(path.join(scripts, "page/page.js"), "utf8");
  const used = new Set([...text.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]));
  for (const word of ["done", "failed", "waiting", "interrupted", "stopped", "running"]) used.add(word);
  const globalThisNavigator = globalThis.navigator;
  if (!globalThisNavigator) Object.defineProperty(globalThis, "navigator", { value: { language: "en" }, configurable: true });
  const { tables } = await import("data:text/javascript," + encodeURIComponent(text.split("// ---- the server ----")[0]));
  for (const lang of ["zh", "ja"]) for (const w of used) assert.ok(tables[lang][w], `${lang}: ${w}`);
});
