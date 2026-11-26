// The tome-slides skill: the deck's files as the page reads them, what
// `check` says, the print page, and the server's rules (only opened decks,
// only files in their folder, slides in a sandbox, comments).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Its notes go to a folder of the test's own.
process.env.TOME_SLIDES_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-slides-home-")));
const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../skills/tome-slides/scripts");
const { checkDeck, cleanAnchor, Decks, handle, htmlProblems, makeDeck, printPage, readIndex, relParts, withProbe } = await import(path.join(scripts, "slides.mjs"));

const PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body><p>hi</p></body></html>';

function folder(index = { title: "Q3", slides: [{ file: "01.html", notes: "Say hi." }, { file: "part/02.html", title: "Plan", transition: "slide" }] }) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-slides-")));
  fs.mkdirSync(path.join(dir, "part"));
  fs.mkdirSync(path.join(dir, ".git"));
  fs.mkdirSync(path.join(dir, "exports"));
  fs.writeFileSync(path.join(dir, "deck.json"), JSON.stringify(index));
  fs.writeFileSync(path.join(dir, "01.html"), PAGE);
  fs.writeFileSync(path.join(dir, "part/02.html"), PAGE);
  fs.writeFileSync(path.join(dir, "theme.css"), "body{}");
  fs.writeFileSync(path.join(dir, "exports/old.html"), PAGE);
  fs.writeFileSync(path.join(dir, ".git/config"), "secret");
  return dir;
}
function req(method, target, body, headers = {}) {
  const url = new URL(target, "http://x");
  const h = { host: "127.0.0.1:4770", ...headers };
  if (method !== "GET" && !("x-tome-slides" in headers)) h["x-tome-slides"] = "1";
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return { method, path: decodeURIComponent(url.pathname), query: url.searchParams, headers: h, body: Buffer.from(body === undefined ? "" : JSON.stringify(body)) };
}
const json = (r) => JSON.parse(r.body.toString("utf8"));

test("paths inside a deck: no way out, nothing hidden", () => {
  assert.deepEqual(relParts("part/02.html"), ["part", "02.html"]);
  for (const bad of ["", "/etc/passwd", "../x.html", "a/../b.html", ".git/config", "a/.hidden/b.html", "a\\b.html", "a//b.html", "a\0.html"]) assert.equal(relParts(bad), null, bad);
});

test("the index as the page reads it, and what is wrong with it", () => {
  const dir = folder();
  const index = readIndex(dir);
  assert.equal(index.title, "Q3");
  assert.deepEqual(index.size, [1920, 1080]);
  assert.equal(index.transition, "fade");
  assert.deepEqual(index.slides.map((s) => [s.file, s.title, s.notes, s.transition, s.exists]), [["01.html", null, "Say hi.", null, true], ["part/02.html", "Plan", "", "slide", true]]);
  assert.deepEqual(index.problems, []);
  // What export made is not a slide.
  assert.deepEqual(checkDeck(dir), []);

  fs.writeFileSync(
    path.join(dir, "deck.json"),
    JSON.stringify({ size: [10, 10], transition: "spin", slides: [{ file: "01.html", notes: 3 }, { file: "01.html" }, { file: "../out.html" }, { file: "Gone.html", transition: "zoom" }] }),
  );
  const problems = checkDeck(dir).map((p) => `${p.file}: ${p.problem}`).join("\n");
  for (const words of ["`title` is missing", "`size` is [width, height]", "`transition` is one of", "slides[0].notes is text", "listed twice", "slides[2].file", "slides[3].transition", "Gone.html: slides[3] names it", "part/02.html: an HTML file that deck.json does not list"]) assert.match(problems, new RegExp(words.replace(/[`[\]().]/g, "\\$&")), words);
  assert.equal(readIndex(dir).size.join(), "1920,1080");
  fs.writeFileSync(path.join(dir, "deck.json"), "{ not json");
  assert.match(readIndex(dir).problems[0].problem, /not JSON/);
});

test("what check says about a slide's HTML", () => {
  assert.deepEqual(htmlProblems(PAGE), []);
  assert.deepEqual(htmlProblems('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head><body><a href="https://example.com">x</a><li data-step="2">b</li></body></html>'), []);
  const bad = htmlProblems('<div><img src="https://example.com/a.png"><iframe></iframe><style>b{background:url(https://x.example/b.png)}</style><p data-step="first">x</p></div>').join("\n");
  for (const words of ["not a whole page", "meta charset", "<iframe>", "loads from the web", "CSS url()", "data-step is a whole number"]) assert.ok(bad.includes(words), words);
});

test("a new deck: its folder and index, a free name", () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tome-slides-new-")));
  const a = makeDeck("季度 / 回顾", parent);
  const b = makeDeck("季度 / 回顾", parent);
  assert.equal(path.basename(a), "季度 - 回顾");
  assert.equal(path.basename(b), "季度 - 回顾 2");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(a, "deck.json"), "utf8")), { title: "季度 / 回顾", size: [1920, 1080], slides: [] });
  assert.equal(makeDeck("..", parent), path.join(parent, "deck"));
  // A claude-slides deck is not taken for one.
  fs.mkdirSync(path.join(parent, "cs/project"), { recursive: true });
  fs.writeFileSync(path.join(parent, "cs/project/deck.json"), "{}");
  assert.throws(() => Decks.rootOf(path.join(parent, "cs")), /claude-slides deck/);
});

test("the probe goes into a slide's HTML", () => {
  assert.equal(withProbe("<html><body>x</body></html>"), '<html><body>x<script src="/probe.js"></script></body></html>');
  assert.equal(withProbe("x"), 'x<script src="/probe.js"></script>');
});

test("the print page: every slide that exists, at the deck's size", async () => {
  const dir = folder({ title: "A <b> & c", size: [1280, 720], slides: [{ file: "01.html" }, { file: "Gone.html" }, { file: "part/02.html", title: '"Plan"' }] });
  const d = new Decks().add(dir);
  const html = printPage(new Decks().read(d.id));
  assert.match(html, /@page \{ size: 1280px 720px; margin: 0; \}/);
  assert.equal((html.match(/<iframe /g) ?? []).length, 2);
  assert.match(html, new RegExp(`src="/f/${d.id}/part/02\\.html\\?clip=1&amp;r=`));
  assert.match(html, /<title>A &lt;b&gt; &amp; c<\/title>/);
  assert.match(html, /title="&quot;Plan&quot;"/);
  const r = await handle({}, req("GET", `/print/${d.id}`));
  assert.equal(r.status, 200);
  assert.equal(r.type, "text/html; charset=utf-8");
  assert.equal((await handle({}, req("GET", "/print/0000000000000000"))).status, 404);
});

test("only opened decks, only their own files, slides in a sandbox", async () => {
  const dir = folder();
  const ctx = {};
  const d = new Decks().add(dir);
  assert.throws(() => new Decks().add(path.join(dir, "part")), /no deck\.json/);
  const list = json(await handle(ctx, req("GET", "/api/decks"))).decks;
  assert.ok(list.some((x) => x.id === d.id && x.slides === 2));
  const deck = json(await handle(ctx, req("GET", `/api/deck?id=${d.id}`)));
  assert.equal(deck.slides.length, 2);
  assert.deepEqual(deck.size, [1920, 1080]);
  assert.ok(deck.rev && deck.slides.every((s) => s.rev));

  const slide = await handle(ctx, req("GET", `/f/${d.id}/part/02.html`));
  assert.equal(slide.status, 200);
  assert.match(slide.body.toString(), /<script src="\/probe\.js"><\/script><\/body>/);
  assert.match(slide.headers["Content-Security-Policy"], /^sandbox allow-scripts;/);
  assert.match(slide.headers["Content-Security-Policy"], /connect-src 'none'/);
  assert.equal((await handle(ctx, req("GET", `/f/${d.id}/theme.css`))).type, "text/css; charset=utf-8");
  for (const bad of [`/f/${d.id}/.git/config`, `/f/${d.id}/../x`, `/f/${d.id}/nothing.png`, `/f/0000000000000000/01.html`]) assert.notEqual((await handle(ctx, req("GET", bad))).status, 200, bad);
  // A link out of the folder is not followed.
  fs.symlinkSync("/etc/hosts", path.join(dir, "hosts.txt"));
  assert.equal((await handle(ctx, req("GET", `/f/${d.id}/hosts.txt`))).status, 404);
  const base = json(await handle(ctx, req("GET", `/api/deck?id=${d.id}`)));

  // A change to a slide: a new revision of it and of the whole.
  fs.writeFileSync(path.join(dir, "01.html"), PAGE.replace("hi", "changed"));
  const after = json(await handle(ctx, req("GET", `/api/wait?id=${d.id}&rev=${base.rev}&ms=0`)));
  assert.notEqual(after.rev, base.rev);
  assert.notEqual(after.slides[0].rev, base.slides[0].rev);
  assert.equal(after.slides[1].rev, base.slides[1].rev);
  assert.equal(json(await handle(ctx, req("GET", `/api/wait?id=${d.id}&rev=${after.rev}&ms=0`))).rev, after.rev);
  // What export writes does not count as a change.
  fs.writeFileSync(path.join(dir, "exports/Q3.pdf"), "%PDF");
  assert.equal(json(await handle(ctx, req("GET", `/api/wait?id=${d.id}&rev=${after.rev}&ms=0`))).rev, after.rev);
});

test("only its own page may ask", async () => {
  const ctx = {};
  assert.equal((await handle(ctx, req("GET", "/api/decks", undefined, { host: "evil.example:4770" }))).status, 403);
  assert.equal((await handle(ctx, req("GET", "/api/decks", undefined, { origin: "http://evil.example" }))).status, 403);
  // A slide's scripts run in a sandbox: their origin is "null".
  assert.equal((await handle(ctx, req("GET", "/api/decks", undefined, { origin: "null" }))).status, 403);
  assert.equal((await handle(ctx, req("GET", "/api/decks", undefined, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await handle(ctx, req("POST", "/api/comments?id=x", {}, { "x-tome-slides": null }))).status, 403);
  for (const f of ["/page.js", "/probe.js", "/print.js", "/page.css"]) assert.equal((await handle(ctx, req("GET", f))).status, 200, f);
  assert.equal((await handle(ctx, req("GET", "/d/0123456789abcdef"))).type, "text/html; charset=utf-8");
  assert.equal((await handle(ctx, req("GET", "/.hidden"))).status, 404);
});

test("comments: saved, sent, taken by a waiting agent, answered", async () => {
  const dir = folder();
  const ctx = {};
  const d = new Decks().add(dir);
  const post = (body) => handle(ctx, req("POST", `/api/comments?id=${d.id}`, body));
  const where = { slide: "part/02.html", rect: [10, 20, 100, 40.4], element: { path: "h2", tag: "h2", text: "Plan", html: "<h2>Plan</h2>" } };
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
  assert.equal(taken.thread.slide, "part/02.html");
  assert.equal(taken.thread.number, 2);
  assert.equal(taken.thread.file, path.join(dir, "part/02.html"));
  assert.equal(taken.thread.element.path, "h2");
  assert.equal(taken.also[0].slide, null);
  assert.equal(taken.also[0].file, path.join(dir, "deck.json"));
  assert.equal(json(await handle(ctx, req("POST", `/api/comments/take?id=${d.id}&ms=0`))).thread, null);

  assert.equal(json(await post({ op: "resolve", id: note.id })).thread.resolved, true);
  const r = json(await handle(ctx, req("GET", `/api/comments?id=${d.id}`)));
  assert.equal(r.threads.length, 2);
  assert.equal(r.listening, true); // an agent asked a moment ago
  for (const bad of [{ op: "new", text: "" }, { op: "new", anchor: { slide: "../x.html", rect: [0, 0, 1, 1] }, text: "x" }, { op: "new", anchor: { slide: "01.html" }, text: "x" }, { op: "new", anchor: { board: "01.html", rect: [0, 0, 1, 1] }, text: "x" }, { op: "nothing", id: note.id }]) assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  assert.deepEqual(cleanAnchor({ slide: "01.html", rect: [0, 0, 1, 1], elements: [{ path: "p", tag: "p", text: "t", html: "<p>t</p>" }] }).elements, [{ path: "p", tag: "p", text: "t" }]);
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
  const print = fs.readFileSync(path.join(scripts, "page/print.js"), "utf8");
  for (const name of ["zh", "ja", "en"]) assert.match(print, new RegExp(`${name}: \\{ wait: .*, ready: .*, print: .* \\}`), name);
});

test("the PowerPoint file: a zip of the parts, a picture and the notes on each slide", async () => {
  const zlib = await import("node:zlib");
  const { crc32, makePptx } = await import(path.join(scripts, "pptx.mjs"));
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const file = makePptx({
    title: "Q3 <plan> & more",
    size: [1920, 1080],
    slides: [
      { png, title: "Cover", notes: "Say hi.\n\n<b>& bye</b>", transition: "fade" },
      { png, title: "Plan", notes: "", transition: "slide" },
    ],
  });
  // Read it back: the central directory, then each entry.
  const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = file.readUInt16LE(end + 10);
  let at = file.readUInt32LE(end + 16);
  const parts = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(file.readUInt32LE(at), 0x02014b50);
    const method = file.readUInt16LE(at + 10);
    const crc = file.readUInt32LE(at + 16);
    const size = file.readUInt32LE(at + 20);
    const nameLen = file.readUInt16LE(at + 28);
    const local = file.readUInt32LE(at + 42);
    const name = file.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    const start = local + 30 + file.readUInt16LE(local + 26) + file.readUInt16LE(local + 28);
    const body = file.subarray(start, start + size);
    const raw = method === 8 ? zlib.inflateRawSync(body) : body;
    assert.equal(crc32(raw), crc, name);
    parts.set(name, raw);
    at += 46 + nameLen;
  }
  assert.equal([...parts.keys()][0], "[Content_Types].xml");
  for (const name of ["ppt/presentation.xml", "ppt/slides/slide2.xml", "ppt/notesSlides/notesSlide1.xml", "ppt/notesMasters/notesMaster1.xml", "ppt/theme/theme2.xml"]) assert.ok(parts.has(name), name);
  assert.deepEqual(parts.get("ppt/media/slide1.png"), png);
  const xml = (name) => parts.get(name).toString("utf8");
  assert.match(xml("ppt/presentation.xml"), /<p:sldSz cx="12192000" cy="6858000"\/>/);
  assert.match(xml("ppt/slides/slide1.xml"), /<p:fade\/>/);
  assert.match(xml("ppt/slides/slide2.xml"), /<p:push dir="l"\/>/);
  const notes = xml("ppt/notesSlides/notesSlide1.xml");
  assert.match(notes, /<a:t>Say hi\.<\/a:t>.*<a:t>&lt;b&gt;&amp; bye&lt;\/b&gt;<\/a:t>/);
  assert.match(xml("docProps/core.xml"), /<dc:title>Q3 &lt;plan&gt; &amp; more<\/dc:title>/);
  assert.match(xml("[Content_Types].xml"), /notesSlide2\.xml/);
});
