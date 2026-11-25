// The page: `/` lists the opened files, `/d/<id>` shows one. A file is
// shown as it reads, follows the file when something writes it (an agent's
// edit: what changed is marked), and takes comments: on selected text, or
// on the whole file. An agent that waits for them answers in the thread.
import { changedBlocks, locate, split } from "/doc.js";

// ---- words ----

const zh = {
  "Markdown files": "Markdown 文件",
  "No file is open. An agent opens one with the tome-md skill.": "还没有打开的文件。让 agent 用 tome-md skill 打开一个。",
  "{n} open comments": "{n} 条未解决的评论",
  "All files": "全部文件",
  "This file was removed.": "这个文件被删掉了。",
  "The file could not be opened.": "文件打不开。",
  "{n} changed": "改了 {n} 处",
  "Comment": "评论",
  "Comments": "评论",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent 在等评论。发给它时，之前加的注释会一起发出去。",
  "No agent is listening. Notes are saved for it to read.": "没有 Agent 在等。注释会存下来，等它来读。",
  "Ask about this file, or say what to change.": "对这篇文档提问，或者说要怎么改。",
  "What about this part? Ask, or say what to change.": "这一段怎么了？提问，或者说要怎么改。",
  "Send to Agent": "发给 Agent",
  "Add note": "添加注释",
  "Note, not sent": "注释，还没发",
  "Reply": "回复",
  "Resolve": "解决",
  "Sent to Agent": "已发给 Agent",
  "Agent": "Agent",
  "You": "你",
  "Whole file": "整篇",
  "Drop the selection": "不针对这段",
  "No comments yet. Select some text to comment on it.": "还没有评论。选中一段文字就能评论。",
  "Properties": "属性",
  "Copy path": "复制路径",
  "Copied": "已复制",
};
const ja = {
  "Markdown files": "Markdown ファイル",
  "No file is open. An agent opens one with the tome-md skill.": "開いているファイルはありません。agent が tome-md skill で開きます。",
  "{n} open comments": "未解決のコメント {n} 件",
  "All files": "すべてのファイル",
  "This file was removed.": "このファイルは削除されました。",
  "The file could not be opened.": "ファイルを開けません。",
  "{n} changed": "{n} か所変更",
  "Comment": "コメント",
  "Comments": "コメント",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent がコメントを待っています。送ると、それまでのメモも一緒に送られます。",
  "No agent is listening. Notes are saved for it to read.": "待っている Agent はいません。メモは保存され、あとで読まれます。",
  "Ask about this file, or say what to change.": "この文書について質問するか、どう変えるかを書く。",
  "What about this part? Ask, or say what to change.": "この部分について質問するか、どう変えるかを書く。",
  "Send to Agent": "Agent に送る",
  "Add note": "メモを追加",
  "Note, not sent": "メモ（未送信）",
  "Reply": "返信",
  "Resolve": "解決",
  "Sent to Agent": "Agent に送信済み",
  "Agent": "Agent",
  "You": "あなた",
  "Whole file": "全体",
  "Drop the selection": "この部分を外す",
  "No comments yet. Select some text to comment on it.": "コメントはまだありません。文章を選択するとコメントできます。",
  "Properties": "プロパティ",
  "Copy path": "パスをコピー",
  "Copied": "コピーしました",
};
export const tables = { zh, ja };
const language = navigator.language || "en";
const lang = language.startsWith("zh") ? "zh" : language.startsWith("ja") ? "ja" : "en";
function t(text, values = {}) {
  let out = tables[lang]?.[text] ?? text;
  for (const [k, v] of Object.entries(values)) out = out.replace(`{${k}}`, String(v));
  return out;
}

// ---- the server ----

const WRITE = { "content-type": "application/json", "x-tome-md": "1" };
async function call(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = new Error(body?.detail || `HTTP ${res.status}`);
    e.code = body?.code || String(res.status);
    throw e;
  }
  return body;
}
const q = (params) => new URLSearchParams(params).toString();
const api = {
  docs: () => call("/api/docs"),
  doc: (id) => call("/api/doc?" + q({ id })),
  wait: (id, rev, signal) => call("/api/wait?" + q({ id, rev }), { signal }),
  comments: (id) => call("/api/comments?" + q({ id })),
  comment: (id, body) => call("/api/comments?" + q({ id }), { method: "POST", headers: WRITE, body: JSON.stringify(body) }),
  asset: (id, src) => "/api/asset?" + q({ id, src }),
};

// ---- small things ----

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const root = document.getElementById("root");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const el = (html) => {
  const d = document.createElement("template");
  d.innerHTML = html.trim();
  return d.content.firstElementChild;
};

// ---- the list ----

async function showList() {
  document.title = t("Markdown files");
  const load = async () => {
    let docs = [];
    try {
      docs = (await api.docs()).docs;
    } catch (e) {
      root.innerHTML = `<div class="center">${esc(e.message)}</div>`;
      return;
    }
    root.innerHTML =
      `<div class="list"><h1>${esc(t("Markdown files"))}</h1>` +
      (docs.length === 0 ? `<p class="dim">${esc(t("No file is open. An agent opens one with the tome-md skill."))}</p>` : "") +
      docs
        .map(
          (d) =>
            `<a class="list-row" href="/d/${esc(d.id)}"><b>${esc(d.name)}</b><span class="dim mono">${esc(d.file)}</span>` +
            (d.open ? `<span class="count">${esc(t("{n} open comments", { n: d.open }))}</span>` : "") +
            `</a>`,
        )
        .join("") +
      `</div>`;
  };
  await load();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && load());
}

// ---- one file ----

async function showDoc(id) {
  let file;
  try {
    file = await api.doc(id);
  } catch (e) {
    root.innerHTML = `<div class="center"><div>${esc(t("The file could not be opened."))} ${esc(e.message)}</div><a href="/">${esc(t("All files"))}</a></div>`;
    return;
  }
  document.title = file.name;
  root.innerHTML = `
    <div class="doc-page">
      <header class="bar">
        <a href="/" title="${esc(t("All files"))}">←</a>
        <b>${esc(file.name)}</b>
        <button class="path mono" title="${esc(t("Copy path"))}">${esc(file.file)}</button>
        <span class="grow"></span>
        <button class="changed" hidden></button>
        <button class="toggle"></button>
      </header>
      <main><article class="doc"></article></main>
      <aside class="panel"></aside>
      <button class="float" hidden>${esc(t("Comment"))}</button>
    </div>`;
  const page = root.firstElementChild;
  const article = page.querySelector(".doc");
  const panel = page.querySelector(".panel");
  const float = page.querySelector(".float");
  const changedButton = page.querySelector(".changed");
  const toggle = page.querySelector(".toggle");

  /** What the page holds. `draft`: the anchor of the comment being written (null: the whole file). */
  const state = { text: file.text, rev: file.rev, blocks: [], changed: [], threads: [], listening: false, active: null, draft: null, texts: {}, seen: "" };

  // -- the document --

  function renderDoc() {
    const { front, blocks } = split(state.text);
    state.blocks = blocks;
    article.innerHTML =
      (front !== null ? `<details class="front"><summary>${esc(t("Properties"))}</summary><pre>${esc(front)}</pre></details>` : "") +
      blocks.map((b, i) => `<section class="blk" data-i="${i}">${b.html}</section>`).join("");
    for (const img of article.querySelectorAll("img[data-src]")) {
      const src = img.dataset.src;
      if (/^data:image\//i.test(src)) img.src = src;
      else if (!/^[a-z][a-z0-9+.-]*:/i.test(src)) {
        let rel = src;
        try {
          rel = decodeURIComponent(src);
        } catch {
          // as written
        }
        img.src = api.asset(id, rel);
      }
      // Anything else (a picture on the web) is not loaded: its alt text shows.
    }
    for (const box of article.querySelectorAll('input[type="checkbox"]')) box.disabled = true;
    mark();
  }

  const blockText = (i) => article.querySelector(`.blk[data-i="${i}"]`)?.textContent ?? "";
  const openThreads = () => state.threads.filter((x) => !x.resolved);

  /** Puts the marks on the blocks: what changed, where each open thread is, the one in hand. */
  function mark() {
    for (const s of article.querySelectorAll(".blk")) {
      s.classList.remove("changed", "active", "drafted");
      s.querySelector(".pins")?.remove();
    }
    const at = (i) => article.querySelector(`.blk[data-i="${i}"]`);
    for (const i of state.changed) at(i)?.classList.add("changed");
    for (const x of openThreads()) {
      const i = locate(state.blocks, x.anchor, blockText);
      const s = at(i);
      if (!s) continue;
      let pins = s.querySelector(".pins");
      if (!pins) s.prepend((pins = el(`<span class="pins"></span>`)));
      pins.append(el(`<button class="pin${x.id === state.active ? " on" : ""}" data-thread="${esc(x.id)}">${x.n}</button>`));
      if (x.id === state.active) s.classList.add("active");
    }
    if (state.draft) {
      const first = state.blocks.findIndex((b) => b.line === state.draft.lines[0]);
      const last = state.blocks.findIndex((b) => b.end === state.draft.lines[1]);
      for (let i = first; i !== -1 && i <= last; i++) at(i)?.classList.add("drafted");
    }
    changedButton.hidden = state.changed.length === 0;
    changedButton.textContent = t("{n} changed", { n: state.changed.length }) + " ×";
    const n = openThreads().length;
    toggle.innerHTML = `${esc(t("Comments"))} ${n}${state.listening ? '<em class="listening"></em>' : ""}`;
  }

  // -- the panel --

  /** A box to write in; what was typed outlives the panel being drawn again. */
  const composer = (key, placeholder) => `
    <div class="composer" data-key="${esc(key)}">
      <textarea rows="3" placeholder="${esc(placeholder)}">${esc(state.texts[key] ?? "")}</textarea>
      <div class="actions"><button class="note">${esc(t("Add note"))}</button>${state.listening ? `<button class="primary submit">${esc(t("Send to Agent"))}</button>` : ""}</div>
    </div>`;

  function renderPanel() {
    const focused = document.activeElement?.closest?.(".composer")?.dataset.key;
    const caret = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const threads = openThreads();
    panel.innerHTML =
      `<div class="agent${state.listening ? " on" : ""}">${esc(state.listening ? t("An agent is listening. Sending one comment sends your notes with it.") : t("No agent is listening. Notes are saved for it to read."))}</div>` +
      `<div class="new">` +
      (state.draft
        ? `<blockquote>${esc(state.draft.quote.slice(0, 300))}<button class="drop" title="${esc(t("Drop the selection"))}">×</button></blockquote>` + composer("new", t("What about this part? Ask, or say what to change."))
        : composer("new", t("Ask about this file, or say what to change."))) +
      `</div>` +
      (threads.length === 0 ? `<p class="dim empty">${esc(t("No comments yet. Select some text to comment on it."))}</p>` : "") +
      threads
        .slice()
        .reverse()
        .map((x) => {
          const last = x.messages[x.messages.length - 1];
          const mine = last?.from === "user";
          const on = x.id === state.active;
          return (
            `<div class="thread${on ? " on" : ""}" data-thread="${esc(x.id)}">` +
            `<div class="thread-head"><span class="pin static">${x.n}</span>` +
            (x.anchor ? "" : `<span class="dim">${esc(t("Whole file"))}</span>`) +
            (mine ? `<span class="dim">${esc(x.sent ? t("Sent to Agent") : t("Note, not sent"))}</span>` : "") +
            `<button class="resolve">${esc(t("Resolve"))}</button></div>` +
            (x.anchor ? `<blockquote>${esc(x.anchor.quote.slice(0, 200))}</blockquote>` : "") +
            x.messages.map((m) => `<div class="message ${esc(m.from)}"><i>${esc(m.from === "agent" ? t("Agent") : t("You"))}</i><div>${esc(m.text)}</div></div>`).join("") +
            (on && mine && !x.sent && state.listening ? `<div class="actions"><button class="primary send">${esc(t("Send to Agent"))}</button></div>` : "") +
            (on ? composer("reply:" + x.id, t("Reply")) : "") +
            `</div>`
          );
        })
        .join("");
    if (focused) {
      const again = panel.querySelector(`.composer[data-key="${CSS.escape(focused)}"] textarea`);
      if (again) {
        again.focus();
        again.setSelectionRange(caret[0], caret[1]);
      }
    }
  }

  async function act(body) {
    await api.comment(id, body);
    await loadComments();
  }

  /** Saves what was written. `send`: hands it to the agent, with the notes added before it; not: it stays a note. */
  async function submit(key, send) {
    const text = (state.texts[key] ?? "").trim();
    if (!text) return;
    state.texts[key] = "";
    try {
      if (key === "new") {
        const anchor = state.draft;
        state.draft = null;
        await act({ op: "new", anchor, text, send });
      } else await act({ op: "say", id: key.slice("reply:".length), text, send });
    } catch (e) {
      state.texts[key] = text;
      console.error(e);
      renderPanel();
    }
  }

  /** Shows a thread, and brings what it is about into view. */
  function show(threadId) {
    state.active = threadId;
    page.classList.add("panel-open");
    mark();
    renderPanel();
    article.querySelector(".blk.active")?.scrollIntoView({ block: "center", behavior: "smooth" });
    panel.querySelector(".thread.on")?.scrollIntoView({ block: "nearest" });
  }

  panel.addEventListener("input", (e) => {
    const key = e.target.closest(".composer")?.dataset.key;
    if (key) state.texts[key] = e.target.value;
  });
  panel.addEventListener("keydown", (e) => {
    const key = e.target.closest(".composer")?.dataset.key;
    if (key && e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(key, state.listening);
  });
  panel.addEventListener("click", (e) => {
    const thread = e.target.closest(".thread")?.dataset.thread;
    if (e.target.closest(".submit")) return void submit(e.target.closest(".composer").dataset.key, true);
    if (e.target.closest(".note")) return void submit(e.target.closest(".composer").dataset.key, false);
    if (e.target.closest(".drop")) {
      state.draft = null;
      mark();
      return void renderPanel();
    }
    if (e.target.closest(".resolve")) return void act({ op: "resolve", id: thread });
    if (e.target.closest(".send")) return void act({ op: "send", id: thread });
    if (thread && thread !== state.active) show(thread);
  });
  article.addEventListener("click", (e) => {
    const pin = e.target.closest(".pin");
    if (pin) show(pin.dataset.thread);
  });
  changedButton.addEventListener("click", () => {
    state.changed = [];
    mark();
  });
  toggle.addEventListener("click", () => page.classList.toggle("panel-open"));
  page.querySelector(".path").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(file.file);
      const b = e.currentTarget ?? e.target;
      b.textContent = t("Copied");
      setTimeout(() => (b.textContent = file.file), 1200);
    } catch {
      // No clipboard: the path is on the page to read.
    }
  });

  // -- commenting on selected text --

  /** What the selection is: {quote, lines, heading}; null: nothing of the document is selected. */
  function selectionAnchor() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const blockOf = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest(".blk");
    const a = blockOf(range.startContainer);
    const b = blockOf(range.endContainer);
    const quote = sel.toString().trim();
    if (!a || !b || !article.contains(a) || !quote) return null;
    const first = state.blocks[Number(a.dataset.i)];
    // A selection that ends at the very start of a block (a triple click does) does not hold that block.
    let end = Number(b.dataset.i);
    const tail = document.createRange();
    tail.setStart(b, 0);
    tail.setEnd(range.endContainer, range.endOffset);
    if (end > Number(a.dataset.i) && !tail.toString().trim()) end -= 1;
    const last = state.blocks[end];
    return { quote, lines: [first.line, Math.max(first.end, last.end)], heading: first.heading };
  }

  /** Puts the Comment button at the end of the selection; nothing of the document selected: hides it. */
  function placeFloat() {
    const anchor = selectionAnchor();
    if (!anchor) return void (float.hidden = true);
    const rects = getSelection().getRangeAt(0).getClientRects();
    const r = rects[rects.length - 1];
    if (!r) return;
    float.hidden = false;
    float.style.left = Math.min(r.right + 6, innerWidth - 90) + "px";
    float.style.top = Math.max(8, r.top - 4) + "px";
  }
  // Not while the mouse is still selecting: a button that comes up under
  // the pointer would pull the selection to the end of the page.
  let selecting = false;
  document.addEventListener("pointerdown", (e) => {
    if (e.target === float) return;
    selecting = true;
    float.hidden = true;
  });
  const settled = () => {
    selecting = false;
    // After the browser has settled the selection (a click clears it a moment later).
    setTimeout(placeFloat, 0);
  };
  document.addEventListener("pointerup", settled);
  document.addEventListener("pointercancel", settled);
  document.addEventListener("selectionchange", () => !selecting && placeFloat());
  // The click must not take the selection away before it is read.
  float.addEventListener("mousedown", (e) => e.preventDefault());
  float.addEventListener("click", () => {
    const anchor = selectionAnchor();
    if (!anchor) return;
    state.draft = anchor;
    state.active = null;
    getSelection().removeAllRanges();
    page.classList.add("panel-open");
    mark();
    renderPanel();
    panel.querySelector('.composer[data-key="new"] textarea')?.focus();
  });

  // -- keeping up --

  async function loadComments() {
    try {
      const r = await api.comments(id);
      const sig = JSON.stringify(r);
      if (sig === state.seen) return;
      state.seen = sig;
      state.threads = r.threads;
      state.listening = r.listening;
      if (state.active && !openThreads().some((x) => x.id === state.active)) state.active = null;
      mark();
      renderPanel();
    } catch {
      // The server is away for a moment: what was last read stays.
    }
  }

  renderDoc();
  renderPanel();
  if (innerWidth >= 900) page.classList.add("panel-open");
  await loadComments();
  setInterval(() => document.visibilityState === "visible" && loadComments(), 1500);

  // Follows the file: what something else wrote shows, the new and rewritten blocks marked.
  for (;;) {
    try {
      const r = await api.wait(id, state.rev);
      if (r.rev === null) {
        root.innerHTML = `<div class="center"><div>${esc(t("This file was removed."))}</div><a href="/">${esc(t("All files"))}</a></div>`;
        return;
      }
      if (r.rev === state.rev) continue;
      const before = state.blocks;
      const y = scrollY;
      state.rev = r.rev;
      state.text = r.text;
      state.draft = null;
      renderDoc();
      state.changed = changedBlocks(before, state.blocks);
      mark();
      renderPanel();
      scrollTo(0, y);
    } catch {
      await sleep(2000);
    }
  }
}

const m = location.pathname.match(/^\/d\/([0-9a-f]{16})\/?$/);
if (m) showDoc(m[1]);
else showList();
