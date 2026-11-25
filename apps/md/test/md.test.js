// The tome-md skill: what the page relies on (the file's blocks and lines)
// and the server's rules (only opened files, only its own page, comments).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Its notes go to a folder of the test's own.
process.env.TOME_MD_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-md-home-")));
const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../skills/tome-md/scripts");
const { Comments, Docs, handle, isDoc } = await import(path.join(scripts, "md.mjs"));
const { changedBlocks, locate, split } = await import(path.join(scripts, "page/doc.js"));

function folder() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-md-")));
  fs.mkdirSync(path.join(dir, ".git"));
  fs.mkdirSync(path.join(dir, "notes/img"), { recursive: true });
  fs.writeFileSync(path.join(dir, "notes/a.md"), "# A\n\nfirst\n");
  fs.writeFileSync(path.join(dir, "notes/img/p.png"), "png");
  fs.writeFileSync(path.join(dir, "notes/secret.txt"), "no");
  fs.writeFileSync(path.join(dir, ".git/config.png"), "no");
  return dir;
}
function req(method, target, body, headers = {}) {
  const url = new URL(target, "http://x");
  const h = { host: "127.0.0.1:4750", ...headers };
  if (method !== "GET" && !("x-tome-md" in headers)) h["x-tome-md"] = "1";
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return { method, path: decodeURIComponent(url.pathname), query: url.searchParams, headers: h, body: Buffer.from(body === undefined ? "" : JSON.stringify(body)) };
}
const json = (r) => JSON.parse(r.body.toString("utf8"));

test("blocks: the lines they came from, what is shown, what changed", () => {
  const text = "---\ntitle: x\n---\n# Head\n\npara one\nline two\n\n- a\n- b\n\n<script>alert(1)</script>\n\n![p](img/a.png) [l](https://x.example) [j](javascript:1)\n";
  const d = split(text);
  assert.equal(d.front, "title: x");
  assert.deepEqual(d.blocks.map((b) => [b.line, b.end]), [[4, 4], [6, 7], [9, 10], [12, 12], [14, 14]]);
  assert.deepEqual(d.blocks.map((b) => b.heading), ["Head", "Head", "Head", "Head", "Head"]);
  const html = d.blocks.map((b) => b.html).join("");
  // What is written as HTML is shown, not run; a picture's source is the page's to set; a link goes to the web or nowhere.
  assert.ok(!html.includes("<script") && html.includes("&lt;script&gt;"));
  assert.ok(html.includes('<img data-src="img/a.png"') && !/<img[^>]* src=/.test(html));
  assert.ok(html.includes('href="https://x.example"') && !html.includes("javascript:"));
  const e = split(text.replace("para one", "para 1") + "\nnew\n");
  assert.deepEqual(changedBlocks(d.blocks, e.blocks), [1, 5]);
  assert.equal(split("no front\n").front, null);
  assert.equal(split("a\r\n\r\nb\r\n").blocks[1].line, 3);
});

test("a comment finds its text again after the file changed", () => {
  const blocks = split("# T\n\nadded\n\nalpha beta\n\nalpha beta\n\nlast\n").blocks;
  const raw = (i) => blocks[i].raw;
  assert.equal(locate(blocks, { quote: "alpha  beta", lines: [7, 7] }, raw), 3);
  assert.equal(locate(blocks, { quote: "alpha beta", lines: [3, 3] }, raw), 2);
  assert.equal(locate(blocks, { quote: "gone words", lines: [9, 9] }, raw), 4);
  assert.equal(locate(blocks, { quote: "gone words", lines: [99, 99] }, raw), 4);
  assert.equal(locate(blocks, null, raw), -1);
});

test("only opened files, and their own pictures", async () => {
  const dir = folder();
  const docs = new Docs();
  const ctx = { build: "b1" };
  assert.ok(isDoc("a.MD") && isDoc("b.markdown") && !isDoc("c.txt"));
  assert.deepEqual(json(await handle(ctx, req("GET", "/api/docs"))).docs, []);
  assert.throws(() => docs.add(path.join(dir, "notes/secret.txt")), /not a Markdown file/);
  assert.throws(() => docs.add(path.join(dir, "notes/none.md")), /no such file/);
  const doc = docs.add(path.join(dir, "notes/a.md"));
  const got = json(await handle(ctx, req("GET", `/api/doc?id=${doc.id}`)));
  assert.deepEqual([got.name, got.text, got.file], ["a.md", "# A\n\nfirst\n", path.join(dir, "notes/a.md")]);
  assert.equal((await handle(ctx, req("GET", "/api/doc?id=0000000000000000"))).status, 404);
  const asset = async (src) => (await handle(ctx, req("GET", `/api/asset?id=${doc.id}&src=${encodeURIComponent(src)}`))).status;
  assert.equal(await asset("img/p.png"), 200);
  for (const bad of ["secret.txt", "../.git/config.png", "../../x.png", "/etc/x.png", "https://x.example/a.png", "img/none.png"]) assert.notEqual(await asset(bad), 200, bad);
  // The file changes under the page; then it is closed.
  const w = (rev, ms) => handle(ctx, req("GET", `/api/wait?id=${doc.id}&rev=${rev}&ms=${ms}`));
  assert.deepEqual(json(await w(got.rev, 1)), { rev: got.rev });
  setTimeout(() => fs.writeFileSync(doc.file, "# A\n\nby an agent\n"), 300);
  assert.equal(json(await w(got.rev, 5000)).text, "# A\n\nby an agent\n");
  docs.remove(doc.id);
  assert.equal((await handle(ctx, req("GET", `/api/doc?id=${doc.id}`))).status, 404);
});

test("only its own page may ask", async () => {
  const ctx = { build: "b1" };
  const status = async (headers) => (await handle(ctx, req("GET", "/api/docs", undefined, headers))).status;
  assert.equal(await status({}), 200);
  assert.equal(await status({ host: "evil.example:4750" }), 403);
  assert.equal(await status({ host: "127.0.0.1.evil.example:4750" }), 403);
  assert.equal(await status({ origin: "https://evil.example" }), 403);
  assert.equal(await status({ origin: "http://127.0.0.1:4720" }), 403);
  assert.equal(await status({ "sec-fetch-site": "cross-site" }), 403);
  assert.equal(await status({ host: "localhost:9999", origin: "http://localhost:9999" }), 200);
  assert.equal((await handle(ctx, req("POST", "/api/comments?id=x", { op: "new", text: "x" }, { "x-tome-md": null }))).status, 403);
  // The page itself, and nothing hidden beside it.
  for (const route of ["/", "/d/0123456789abcdef", "/page.js", "/doc.js", "/vendor/marked.esm.js"]) assert.equal((await handle(ctx, req("GET", route))).status, 200, route);
  for (const missing of ["/.x", "/vendor/../../md.mjs", "/nothing.js"]) assert.equal((await handle(ctx, req("GET", missing))).status, 404, missing);
});

test("comments: saved, sent, taken by a waiting agent, answered", async () => {
  const dir = folder();
  fs.writeFileSync(path.join(dir, "notes/b.md"), "# B\n");
  const docs = new Docs();
  const a = docs.add(path.join(dir, "notes/a.md"));
  const b = docs.add(path.join(dir, "notes/b.md"));
  const ctx = { build: "b1" };
  const post = (doc, body) => handle(ctx, req("POST", `/api/comments?id=${doc.id}`, body));
  const get = async (doc) => json(await handle(ctx, req("GET", `/api/comments?id=${doc.id}`)));
  const take = async (doc, ms) => json(await handle(ctx, req("POST", `/api/comments/take?ms=${ms}` + (doc ? `&id=${doc.id}` : "")))).thread;
  assert.deepEqual(await get(a), { threads: [], listening: false });

  // Saved while no agent listens: an agent that waits does not get it.
  const anchor = { quote: " first ", lines: [3, 3], heading: "A", more: 1 };
  const made = json(await post(a, { op: "new", anchor, text: " shorter " })).thread;
  assert.deepEqual([made.n, made.sent, made.anchor, made.messages[0].text], [1, null, { quote: "first", lines: [3, 3], heading: "A" }, "shorter"]);
  assert.equal(await take(null, 1), null);
  assert.equal((await get(b)).listening, true); // it asks again in a moment

  // Sent: the waiting agent gets it, once, with where it is.
  await post(a, { op: "send", id: made.id });
  assert.equal(await take(b, 1), null);
  const got = await take(a, 1000);
  assert.deepEqual([got.id, got.file, got.quote, got.lines, got.heading, got.sent], [made.id, a.file, "first", [3, 3], "A", true]);
  assert.equal(await take(null, 1), null);

  // The agent answers; the person's next words go out again; a talk about the whole file has no place.
  const comments = new Comments();
  comments.say(made.id, "agent", "done");
  await post(a, { op: "say", id: made.id, text: "even shorter", send: true });
  assert.deepEqual((await take(null, 1000)).messages.map((m) => m.from), ["user", "agent", "user"]);
  const waiting = take(null, 5000);
  setTimeout(() => post(b, { op: "new", anchor: null, text: "what is this file for?", send: true }), 200);
  const late = await waiting;
  assert.deepEqual([late.file, late.quote, late.lines, late.messages[0].text], [b.file, null, null, "what is this file for?"]);

  // Notes wait; sending one comment sends the file's notes with it, in one go.
  const n1 = json(await post(b, { op: "new", anchor: null, text: "note one" })).thread;
  const n2 = json(await post(b, { op: "new", anchor: { quote: "B", lines: [1, 1] }, text: "note two" })).thread;
  await post(a, { op: "new", anchor: null, text: "a note on the other file" });
  assert.equal(await take(null, 1), null);
  await post(b, { op: "new", anchor: null, text: "now send", send: true });
  const all = json(await handle(ctx, req("POST", `/api/comments/take?ms=1000`)));
  assert.deepEqual([all.thread.id, ...all.also.map((x) => x.id)].slice(0, 2), [n1.id, n2.id]);
  assert.deepEqual([all.thread.messages[0].text, ...all.also.map((x) => x.messages[0].text)], ["note one", "note two", "now send"]);
  assert.equal((await get(a)).threads.at(-1).sent, null);
  assert.equal(await take(null, 1), null);
  await post(a, { op: "resolve", id: (await get(a)).threads.at(-1).id });

  comments.say(made.id, "agent", "ok", { resolve: true });
  assert.equal((await get(a)).threads[0].resolved, true);
  assert.equal((await post(a, { op: "resolve", id: made.id, resolved: false })).status, 200);
  assert.equal((await post(b, { op: "resolve", id: made.id })).status, 404);
  assert.equal(json(await handle(ctx, req("GET", "/api/docs"))).docs.find((d) => d.id === a.id).open, 1);
  for (const bad of [{ op: "new", text: "" }, { op: "new", anchor: { quote: "" }, text: "x" }, { op: "nothing", id: made.id }]) assert.equal((await post(a, bad)).status, 400, JSON.stringify(bad));
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
