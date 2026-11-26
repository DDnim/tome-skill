// The tome-design skill: the design's files as the page reads them, what
// `check` says, and the server's rules (only opened designs, only files in
// their folder, boards in a sandbox, comments).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Its notes go to a folder of the test's own.
process.env.TOME_DESIGN_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-design-home-")));
const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../skills/tome-design/scripts");
const { checkDesign, cleanAnchor, Designs, handle, htmlProblems, makeDesign, readIndex, relParts, withProbe } = await import(path.join(scripts, "design.mjs"));

const PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body><p>hi</p></body></html>';

function folder(index = { title: "Flow", boards: [{ file: "Main.html", x: 0, y: 0, w: 390, h: 844 }, { file: "screens/Home.html", title: "Home", x: 470, y: 0, w: 390, h: 844 }] }) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-design-")));
  fs.mkdirSync(path.join(dir, "screens"));
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(path.join(dir, "design.json"), JSON.stringify(index));
  fs.writeFileSync(path.join(dir, "Main.html"), PAGE);
  fs.writeFileSync(path.join(dir, "screens/Home.html"), PAGE);
  fs.writeFileSync(path.join(dir, "logo.svg"), "<svg/>");
  fs.writeFileSync(path.join(dir, ".git/config"), "secret");
  return dir;
}
function req(method, target, body, headers = {}) {
  const url = new URL(target, "http://x");
  const h = { host: "127.0.0.1:4760", ...headers };
  if (method !== "GET" && !("x-tome-design" in headers)) h["x-tome-design"] = "1";
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return { method, path: decodeURIComponent(url.pathname), query: url.searchParams, headers: h, body: Buffer.from(body === undefined ? "" : JSON.stringify(body)) };
}
const json = (r) => JSON.parse(r.body.toString("utf8"));

test("paths inside a design: no way out, nothing hidden", () => {
  assert.deepEqual(relParts("screens/Home.html"), ["screens", "Home.html"]);
  for (const bad of ["", "/etc/passwd", "../x.html", "a/../b.html", ".git/config", "a/.hidden/b.html", "a\\b.html", "a//b.html", "a\0.html"]) assert.equal(relParts(bad), null, bad);
});

test("the index as the page reads it, and what is wrong with it", () => {
  const dir = folder();
  const index = readIndex(dir);
  assert.equal(index.title, "Flow");
  assert.deepEqual(index.boards.map((b) => [b.file, b.title, b.exists]), [["Main.html", null, true], ["screens/Home.html", "Home", true]]);
  assert.deepEqual(index.problems, []);
  assert.deepEqual(checkDesign(dir), []);

  fs.writeFileSync(
    path.join(dir, "design.json"),
    JSON.stringify({ boards: [{ file: "Main.html", x: 0, y: 0, w: 390, h: 844 }, { file: "Main.html", x: 0, y: 0, w: 1, h: 1 }, { file: "../out.html", x: 0, y: 0, w: 100, h: 100 }, { file: "Gone.html", x: 100, y: 0, w: 390, h: 100 }], notes: [{ x: 0 }] }),
  );
  const problems = checkDesign(dir).map((p) => `${p.file}: ${p.problem}`).join("\n");
  for (const words of ["`title` is missing", "listed twice", "boards[2].file", "Gone.html: boards[3] names it", "overlap", "notes[0] needs", "screens/Home.html: an HTML file that design.json does not list"]) assert.match(problems, new RegExp(words.replace(/[`[\]().]/g, "\\$&")), words);
  fs.writeFileSync(path.join(dir, "design.json"), "{ not json");
  assert.match(readIndex(dir).problems[0].problem, /not JSON/);
});

test("what check says about a board's HTML", () => {
  assert.deepEqual(htmlProblems(PAGE), []);
  assert.deepEqual(htmlProblems('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head><body><a href="https://example.com">x</a></body></html>'), []);
  const bad = htmlProblems('<div><img src="https://example.com/a.png"><iframe></iframe><style>b{background:url(https://x.example/b.png)}</style></div>').join("\n");
  for (const words of ["not a whole page", "meta charset", "<iframe>", "loads from the web", "CSS url()"]) assert.ok(bad.includes(words), words);
});

test("a new design: its folder and index, a free name", () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-design-new-")));
  const a = makeDesign("登录 / 流程", parent);
  const b = makeDesign("登录 / 流程", parent);
  assert.equal(path.basename(a), "登录 - 流程");
  assert.equal(path.basename(b), "登录 - 流程 2");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(a, "design.json"), "utf8")), { title: "登录 / 流程", boards: [], notes: [] });
  assert.equal(makeDesign("..", parent), path.join(parent, "design"));
});

test("the probe goes into a board's HTML", () => {
  assert.equal(withProbe("<html><body>x</body></html>"), '<html><body>x<script src="/probe.js"></script></body></html>');
  assert.equal(withProbe("x"), 'x<script src="/probe.js"></script>');
});

test("only opened designs, only their own files, boards in a sandbox", async () => {
  const dir = folder();
  const ctx = {};
  const d = new Designs().add(dir);
  assert.throws(() => new Designs().add(path.join(dir, "screens")), /no design\.json/);
  const list = json(await handle(ctx, req("GET", "/api/designs"))).designs;
  assert.ok(list.some((x) => x.id === d.id && x.boards === 2));
  const design = json(await handle(ctx, req("GET", `/api/design?id=${d.id}`)));
  assert.equal(design.boards.length, 2);
  assert.ok(design.rev && design.boards.every((b) => b.rev));

  const board = await handle(ctx, req("GET", `/f/${d.id}/screens/Home.html`));
  assert.equal(board.status, 200);
  assert.match(board.body.toString(), /<script src="\/probe\.js"><\/script><\/body>/);
  assert.match(board.headers["Content-Security-Policy"], /^sandbox allow-scripts;/);
  assert.match(board.headers["Content-Security-Policy"], /connect-src 'none'/);
  assert.equal((await handle(ctx, req("GET", `/f/${d.id}/logo.svg`))).type, "image/svg+xml");
  for (const bad of [`/f/${d.id}/.git/config`, `/f/${d.id}/../x`, `/f/${d.id}/nothing.png`, `/f/0000000000000000/Main.html`]) assert.notEqual((await handle(ctx, req("GET", bad))).status, 200, bad);
  // A link out of the folder is not followed.
  fs.symlinkSync("/etc/hosts", path.join(dir, "hosts.txt"));
  assert.equal((await handle(ctx, req("GET", `/f/${d.id}/hosts.txt`))).status, 404);

  // A change to a board: a new revision of it and of the whole.
  fs.writeFileSync(path.join(dir, "Main.html"), PAGE.replace("hi", "changed"));
  const after = json(await handle(ctx, req("GET", `/api/wait?id=${d.id}&rev=${design.rev}&ms=0`)));
  assert.notEqual(after.rev, design.rev);
  assert.notEqual(after.boards[0].rev, design.boards[0].rev);
  assert.equal(after.boards[1].rev, design.boards[1].rev);
  assert.equal(json(await handle(ctx, req("GET", `/api/wait?id=${d.id}&rev=${after.rev}&ms=0`))).rev, after.rev);
});

test("only its own page may ask", async () => {
  const ctx = {};
  assert.equal((await handle(ctx, req("GET", "/api/designs", undefined, { host: "evil.example:4760" }))).status, 403);
  assert.equal((await handle(ctx, req("GET", "/api/designs", undefined, { origin: "http://evil.example" }))).status, 403);
  // A board's scripts run in a sandbox: their origin is "null".
  assert.equal((await handle(ctx, req("GET", "/api/designs", undefined, { origin: "null" }))).status, 403);
  assert.equal((await handle(ctx, req("GET", "/api/designs", undefined, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await handle(ctx, req("POST", "/api/comments?id=x", {}, { "x-tome-design": null }))).status, 403);
  assert.equal((await handle(ctx, req("GET", "/page.js"))).status, 200);
  assert.equal((await handle(ctx, req("GET", "/d/0123456789abcdef"))).type, "text/html; charset=utf-8");
  assert.equal((await handle(ctx, req("GET", "/.hidden"))).status, 404);
});

test("comments: saved, sent, taken by a waiting agent, answered", async () => {
  const dir = folder();
  const ctx = {};
  const d = new Designs().add(dir);
  const post = (body) => handle(ctx, req("POST", `/api/comments?id=${d.id}`, body));
  const where = { board: "Main.html", rect: [10, 20, 100, 40.4], element: { path: "#go", tag: "button", text: "Sign in", html: "<button id=go>Sign in</button>" } };
  const note = json(await post({ op: "new", anchor: where, text: "  bigger  " })).thread;
  assert.equal(note.n, 1);
  assert.deepEqual(note.anchor.rect, [10, 20, 100, 40]);
  assert.equal(note.messages[0].text, "bigger");
  assert.equal(note.sent, null);
  const whole = json(await post({ op: "new", anchor: null, text: "darker overall", send: true })).thread;
  assert.ok(whole.sent);

  const taken = json(await handle(ctx, req("POST", `/api/comments/take?id=${d.id}&ms=0`)));
  // The note went out with the one sent.
  assert.deepEqual([taken.thread.n, ...taken.also.map((x) => x.n)], [1, 2]);
  assert.equal(taken.thread.board, "Main.html");
  assert.equal(taken.thread.file, path.join(dir, "Main.html"));
  assert.equal(taken.thread.element.path, "#go");
  assert.equal(taken.also[0].board, null);
  assert.equal(json(await handle(ctx, req("POST", `/api/comments/take?id=${d.id}&ms=0`))).thread, null);

  assert.equal(json(await post({ op: "resolve", id: note.id })).thread.resolved, true);
  const r = json(await handle(ctx, req("GET", `/api/comments?id=${d.id}`)));
  assert.equal(r.threads.length, 2);
  assert.equal(r.listening, true); // an agent asked a moment ago
  for (const bad of [{ op: "new", text: "" }, { op: "new", anchor: { board: "../x.html", rect: [0, 0, 1, 1] }, text: "x" }, { op: "new", anchor: { board: "Main.html" }, text: "x" }, { op: "nothing", id: note.id }]) assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  assert.deepEqual(cleanAnchor({ board: "Main.html", rect: [0, 0, 1, 1], elements: [{ path: "p", tag: "p", text: "t", html: "<p>t</p>" }] }).elements, [{ path: "p", tag: "p", text: "t" }]);
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
