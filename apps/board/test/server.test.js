// The skill's server (skills/tome-board/scripts/board.mjs): the same rules the page relies on.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { emptyText } from "../src/format.js";
import { Boards, Comments, EMPTY_TEXT, boardFileStem, handle, isBoard, pngPath } from "../../../skills/tome-board/scripts/board.mjs";

// Comments and process notes go to a folder of the test's own.
process.env.TOME_BOARD_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "tome-board-home-"));

const PNG = Buffer.from("\x89PNG\r\n\x1a\nrest", "latin1");

function vault() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-board-")));
  fs.mkdirSync(path.join(dir, "Task"));
  fs.mkdirSync(path.join(dir, "web/assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "web/index.html"), "<page>");
  fs.writeFileSync(path.join(dir, "web/assets/a.js"), "js");
  fs.writeFileSync(path.join(dir, "web/.secret"), "no");
  return { dir, ctx: { boards: new Boards(dir), port: 4740, web: path.join(dir, "web"), build: "b1" } };
}

function req(method, target, body, headers = {}) {
  const url = new URL(target, "http://x");
  const h = { host: "127.0.0.1:4740", ...headers };
  if (method !== "GET" && !("x-tome-board" in headers)) h["x-tome-board"] = "1";
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return { method, path: decodeURIComponent(url.pathname), query: url.searchParams, headers: h, body: Buffer.from(body === undefined ? "" : JSON.stringify(body)) };
}
const json = (r) => JSON.parse(r.body.toString("utf8"));
const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test("names and pictures", () => {
  assert.ok(isBoard("a/b.excalidraw.md") && isBoard("B.EXCALIDRAW") && !isBoard("a.md") && !isBoard("a.png"));
  assert.equal(pngPath("Excalidraw/a/流程.excalidraw.md"), "Excalidraw/a/流程.png");
  assert.equal(pngPath("Excalidraw/x.excalidraw"), "Excalidraw/x.png");
  assert.equal(boardFileStem("  a/b: [c]  #1 "), "a b c 1");
  assert.equal(boardFileStem("..hidden"), "hidden");
  assert.equal(codeOf(() => boardFileStem(" /// ")), "InvalidName");
  assert.equal([...boardFileStem("字".repeat(200))].length, 80);
  assert.equal(EMPTY_TEXT, emptyText());
});

test("stays in the board folder", () => {
  const { dir, ctx } = vault();
  const v = ctx.boards;
  assert.deepEqual(v.list(), []);
  assert.equal(v.find("流程"), null);
  assert.equal(v.create("a", "x"), "Excalidraw/a.excalidraw.md");
  assert.equal(v.create("a", "y"), "Excalidraw/a 2.excalidraw.md");
  fs.writeFileSync(path.join(dir, "Excalidraw/图.png"), PNG);
  assert.equal(v.create("图", ""), "Excalidraw/图 2.excalidraw.md");
  fs.writeFileSync(path.join(dir, "Task/card.md"), "card");
  fs.writeFileSync(path.join(dir, "Task/t.excalidraw.md"), "x");
  fs.writeFileSync(path.join(dir, "Excalidraw/note.md"), "x");
  for (const bad of ["Task/card.md", "Task/t.excalidraw.md", "Excalidraw/note.md", "Excalidraw/../Task/t.excalidraw.md", "/etc/x.excalidraw", "Excalidraw/.h.excalidraw"]) {
    assert.ok(codeOf(() => v.read(bad)), bad);
    assert.ok(codeOf(() => v.write(bad, "y", null)), bad);
    assert.ok(codeOf(() => v.writePng(bad, PNG)), bad);
  }
  assert.equal(codeOf(() => v.write("Excalidraw/missing.excalidraw.md", "y", null)), "NotFound");
  assert.equal(fs.readFileSync(path.join(dir, "Task/card.md"), "utf8"), "card");
  // A link out of the vault is not followed.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tome-board-out-"));
  fs.writeFileSync(path.join(outside, "o.excalidraw.md"), "secret");
  fs.symlinkSync(path.join(outside, "o.excalidraw.md"), path.join(dir, "Excalidraw/o.excalidraw.md"));
  assert.equal(codeOf(() => v.read("Excalidraw/o.excalidraw.md")), "OutsideVault");
});

test("follows the plugin's folder", () => {
  const { dir, ctx } = vault();
  const settings = path.join(dir, ".obsidian/plugins/obsidian-excalidraw-plugin/data.json");
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(settings, '{"folder":"/Draw/Boards/"}');
  assert.equal(ctx.boards.dirName(), "Draw/Boards");
  assert.equal(ctx.boards.create("a", "x"), "Draw/Boards/a.excalidraw.md");
  assert.equal(ctx.boards.list()[0].name, "a");
  fs.writeFileSync(settings, '{"folder":"../x"}');
  assert.equal(ctx.boards.dirName(), "Excalidraw");
});

test("creates, saves and lists", async () => {
  const { dir, ctx } = vault();
  const made = await handle(ctx, req("POST", "/api/boards", { title: "流程", text: "v1" }));
  assert.deepEqual(json(made), { path: "Excalidraw/流程.excalidraw.md", name: "流程" });
  const got = json(await handle(ctx, req("GET", "/api/board?name=%E6%B5%81%E7%A8%8B")));
  assert.equal(got.text, "v1");
  assert.ok(got.png.endsWith("/Excalidraw/流程.png"));
  const p = "/api/board?path=Excalidraw/%E6%B5%81%E7%A8%8B.excalidraw.md";
  const saved = await handle(ctx, req("PUT", p, { text: "v2", base: got.rev, png: PNG.toString("base64") }));
  assert.equal(saved.status, 200);
  assert.deepEqual(fs.readFileSync(path.join(dir, "Excalidraw/流程.png")), PNG);
  // From the old rev again: someone else's change would be lost.
  const again = await handle(ctx, req("PUT", p, { text: "v3", base: got.rev }));
  assert.deepEqual([again.status, json(again).code], [409, "Conflict"]);
  assert.equal(fs.readFileSync(path.join(dir, "Excalidraw/流程.excalidraw.md"), "utf8"), "v2");
  assert.equal((await handle(ctx, req("PUT", p, { text: "v3", base: json(saved).rev, png: Buffer.from("<html>").toString("base64") }))).status, 400);
  const list = json(await handle(ctx, req("GET", "/api/boards")));
  assert.deepEqual([list.dir, list.boards[0].name, list.boards[0].png], ["Excalidraw", "流程", true]);
  assert.deepEqual((await handle(ctx, req("GET", "/api/png?path=Excalidraw/%E6%B5%81%E7%A8%8B.excalidraw.md"))).body, PNG);
  assert.equal((await handle(ctx, req("GET", "/api/board?name=nothing"))).status, 404);
  assert.equal((await handle(ctx, req("GET", "/api/board?path=Task/x.md"))).status, 403);
});

test("waits for a change", async () => {
  const { dir, ctx } = vault();
  await handle(ctx, req("POST", "/api/boards", { title: "a", text: "v1" }));
  const rev = json(await handle(ctx, req("GET", "/api/board?name=a"))).rev;
  const w = (r, ms) => handle(ctx, req("GET", `/api/wait?path=Excalidraw/a.excalidraw.md&rev=${r}&ms=${ms}`));
  assert.deepEqual(json(await w(rev, 1)), { rev });
  const file = path.join(dir, "Excalidraw/a.excalidraw.md");
  setTimeout(() => fs.writeFileSync(file, "by an agent"), 300);
  assert.equal(json(await w(rev, 5000)).text, "by an agent");
  fs.rmSync(file);
  assert.deepEqual(json(await w("x", 1)), { rev: null });
});

test("only its own page may ask", async () => {
  const { ctx } = vault();
  const status = async (headers) => (await handle(ctx, req("GET", "/api/boards", undefined, headers))).status;
  assert.equal(await status({}), 200);
  // Another name for this computer (DNS rebinding), another site's page,
  // a page at another port of this computer.
  assert.equal(await status({ host: "evil.example:4740" }), 403);
  assert.equal(await status({ host: "127.0.0.1.evil.example:4740" }), 403);
  assert.equal(await status({ origin: "https://evil.example" }), 403);
  assert.equal(await status({ origin: "http://127.0.0.1:4720" }), 403);
  assert.equal(await status({ "sec-fetch-site": "cross-site" }), 403);
  assert.equal(await status({ host: "localhost:4740", origin: "http://localhost:4740" }), 200);
  // A port forwarded to another one (out of a container).
  assert.equal(await status({ host: "127.0.0.1:9999" }), 200);
  assert.equal(await status({ host: "localhost:9999", origin: "http://localhost:9999" }), 200);
  assert.equal(await status({ "sec-fetch-site": "same-origin" }), 200);
  // A write without the page's header (a form on another site).
  assert.equal((await handle(ctx, req("POST", "/api/boards", { title: "x", text: "" }, { "x-tome-board": null }))).status, 403);
  assert.equal(ctx.boards.list().length, 0);
});

test("serves the page", async () => {
  const { ctx } = vault();
  for (const route of ["/", "/b/%E6%B5%81%E7%A8%8B", "/b/dir/a.b"]) {
    const r = await handle(ctx, req("GET", route));
    assert.deepEqual([r.status, r.body.toString(), r.type], [200, "<page>", "text/html; charset=utf-8"], route);
  }
  assert.equal((await handle(ctx, req("GET", "/assets/a.js"))).body.toString(), "js");
  for (const missing of ["/.secret", "/assets/../.secret", "/nothing.js", "/assets"]) assert.equal((await handle(ctx, req("GET", missing))).status, 404, missing);
  assert.equal((await handle({ ...ctx, web: null }, req("GET", "/"))).status, 404);
});

test("comments: saved, sent, taken by a waiting agent, answered", async () => {
  const { ctx } = vault();
  await handle(ctx, req("POST", "/api/boards", { title: "a", text: "v1" }));
  await handle(ctx, req("POST", "/api/boards", { title: "b", text: "v1" }));
  const a = "Excalidraw/a.excalidraw.md";
  const b = "Excalidraw/b.excalidraw.md";
  const at = (rel) => "/api/comments?path=" + encodeURIComponent(rel);
  const post = async (rel, body) => handle(ctx, req("POST", at(rel), body));
  const get = async (rel) => json(await handle(ctx, req("GET", at(rel))));
  const take = async (rel, ms) => json(await handle(ctx, req("POST", `/api/comments/take?ms=${ms}` + (rel ? "&path=" + encodeURIComponent(rel) : "")))).thread;
  assert.deepEqual(await get(a), { threads: [], listening: false });

  // Saved while no agent listens: an agent that waits does not get it.
  const rect = { x: 1, y: 2, width: 30, height: 40 };
  const made = json(await post(a, { op: "new", rect, elements: [{ id: "e1", type: "text", text: "Login", more: 1 }, { nope: 1 }], text: " make it blue ", png: PNG.toString("base64") }));
  const id = made.thread.id;
  assert.deepEqual([made.thread.n, made.thread.sent, made.thread.region, made.thread.messages[0].text], [1, null, true, "make it blue"]);
  assert.deepEqual(made.thread.elements, [{ id: "e1", type: "text", text: "Login" }]);
  assert.equal(await take(null, 1), null);
  assert.equal((await get(a)).listening, true); // it asks again in a moment
  assert.equal((await get(b)).listening, true);

  // Sent: the waiting agent gets it, once, with where to look.
  assert.equal((await post(a, { op: "send", id })).status, 200);
  assert.equal(await take(b, 1), null);
  const got = await take(a, 1000);
  assert.deepEqual([got.id, got.n, got.board, got.sent, got.rect], [id, 1, "a", true, rect]);
  assert.ok(got.file.endsWith("/Excalidraw/a.excalidraw.md") && got.png.endsWith("/Excalidraw/a.png"));
  assert.deepEqual(fs.readFileSync(got.region), PNG);
  assert.equal(await take(null, 1), null);

  // The agent answers; the person's next words go out again.
  const comments = new Comments(ctx.boards.root);
  comments.say(id, "agent", "done");
  assert.deepEqual((await get(a)).threads[0].messages.map((m) => [m.from, m.text]), [["user", "make it blue"], ["agent", "done"]]);
  await post(a, { op: "say", id, text: "darker", send: true });
  assert.equal((await take(null, 1000)).messages.length, 3);

  // A wait that is already asking gets a comment sent meanwhile.
  const waiting = take(null, 5000);
  setTimeout(() => post(b, { op: "new", rect, elements: [], text: "why?", send: true }), 200);
  const late = await waiting;
  assert.deepEqual([late.board, late.n, late.region, late.messages[0].text], ["b", 1, null, "why?"]);

  // Resolved and reopened; the other drawing's thread is not this one's.
  comments.say(id, "agent", "ok", { resolve: true });
  assert.equal((await get(a)).threads[0].resolved, true);
  assert.equal((await post(a, { op: "resolve", id, resolved: false })).status, 200);
  assert.equal((await get(a)).threads[0].resolved, false);
  assert.equal((await post(b, { op: "resolve", id })).status, 404);
  for (const bad of [{ op: "new", rect, text: "" }, { op: "new", rect: { x: 1 }, text: "x" }, { op: "new", rect, text: "x", png: Buffer.from("<html>").toString("base64") }, { op: "nothing", id }]) {
    assert.equal((await post(a, bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await post("Task/card.md", { op: "new", rect, text: "x" })).status, 403);
  assert.equal((await handle(ctx, req("POST", at(a), { op: "send", id }, { "x-tome-board": null }))).status, 403);
});
