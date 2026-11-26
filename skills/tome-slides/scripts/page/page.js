// The page: `/` lists the opened decks, `/d/<id>` shows one: its slides in
// a row down the side, the chosen one large with its speaker notes under it
// (`?s=<n>`). It presents the deck full screen (`?present=<n>`), with a
// speaker view in a second window (`?speaker=1`), and lays every slide out
// as a page to print or save as PDF (`/print/<id>`). It follows the deck's
// files (a slide an agent rewrote shows at once, marked), and takes
// comments: on an element of a slide, on an area of it, or on the whole
// deck. An agent that waits for them answers in the thread.

// ---- words ----

const zh = {
  "Decks": "幻灯片",
  "No deck is open. An agent opens one with the tome-slides skill.": "还没有打开的幻灯片。让 agent 用 tome-slides skill 打开一套。",
  "{n} slides": "{n} 页",
  "{n} open comments": "{n} 条未解决的评论",
  "All decks": "全部幻灯片",
  "This deck was removed.": "这套幻灯片被删掉了。",
  "The deck could not be opened.": "幻灯片打不开。",
  "{n} changed": "改了 {n} 页",
  "Comment": "评论",
  "Comments": "评论",
  "{n} problems in the files": "文件里有 {n} 个问题",
  "No slides yet.": "还没有幻灯片。",
  "This slide's file is missing.": "这一页的文件不在了。",
  "Click an element, or drag over an area. Esc to stop.": "点一个元素，或者拖出一块区域。Esc 退出。",
  "Speaker notes": "演讲备注",
  "No notes for this slide.": "这一页没有备注。",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent 在等评论。发给它时，之前加的注释会一起发出去。",
  "No agent is listening. Notes are saved for it to read.": "没有 Agent 在等。注释会存下来，等它来读。",
  "Ask about this deck, or say what to change.": "对这套幻灯片提问，或者说要怎么改。",
  "What about this part? Ask, or say what to change.": "这里怎么了？提问，或者说要怎么改。",
  "Send to Agent": "发给 Agent",
  "Add note": "添加注释",
  "Note, not sent": "注释，还没发",
  "Reply": "回复",
  "Resolve": "解决",
  "Sent to Agent": "已发给 Agent",
  "Agent": "Agent",
  "You": "你",
  "Whole deck": "整套幻灯片",
  "Slide {n}": "第 {n} 页",
  "Area": "区域",
  "{n} elements": "{n} 个元素",
  "Drop this place": "不针对这里",
  "No comments yet. Press Comment, then click the slide.": "还没有评论。按「评论」，再点幻灯片。",
  "Present": "演示",
  "Exit": "退出",
  "Speaker view": "演讲者视图",
  "Export PDF": "导出 PDF",
  "Export PowerPoint": "导出 PPTX",
  "Exporting…": "正在导出…",
  "Export failed: {detail}": "导出失败：{detail}",
  "Saved to {file}": "已保存到 {file}",
  "Copy path": "复制路径",
  "Copied": "已复制",
  "→ or a click: next. ←: back. S: speaker view. C: comment. Esc: exit.": "→ 或点一下：下一步。←：上一步。S：演讲者视图。C：评论。Esc：退出。",
  "End of the deck. Esc to exit.": "演示结束。按 Esc 退出。",
  "Now": "当前",
  "Next": "下一步",
  "The end": "结束",
  "Reset": "重置",
  "Waiting for the presentation…": "等演示开始……",
  "The presentation window is closed.": "演示窗口已经关了。",
  "{n} steps": "{n} 步",
};
const ja = {
  "Decks": "スライド",
  "No deck is open. An agent opens one with the tome-slides skill.": "開いているスライドはありません。agent が tome-slides skill で開きます。",
  "{n} slides": "{n} 枚",
  "{n} open comments": "未解決のコメント {n} 件",
  "All decks": "すべてのスライド",
  "This deck was removed.": "このスライドは削除されました。",
  "The deck could not be opened.": "スライドを開けません。",
  "{n} changed": "{n} 枚変更",
  "Comment": "コメント",
  "Comments": "コメント",
  "{n} problems in the files": "ファイルに問題が {n} 件",
  "No slides yet.": "スライドはまだありません。",
  "This slide's file is missing.": "このスライドのファイルがありません。",
  "Click an element, or drag over an area. Esc to stop.": "要素をクリックするか、範囲をドラッグ。Esc でやめる。",
  "Speaker notes": "スピーカーノート",
  "No notes for this slide.": "このスライドにノートはありません。",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent がコメントを待っています。送ると、それまでのメモも一緒に送られます。",
  "No agent is listening. Notes are saved for it to read.": "待っている Agent はいません。メモは保存され、あとで読まれます。",
  "Ask about this deck, or say what to change.": "このスライドについて質問するか、どう変えるかを書く。",
  "What about this part? Ask, or say what to change.": "この部分について質問するか、どう変えるかを書く。",
  "Send to Agent": "Agent に送る",
  "Add note": "メモを追加",
  "Note, not sent": "メモ（未送信）",
  "Reply": "返信",
  "Resolve": "解決",
  "Sent to Agent": "Agent に送信済み",
  "Agent": "Agent",
  "You": "あなた",
  "Whole deck": "スライド全体",
  "Slide {n}": "{n} 枚目",
  "Area": "範囲",
  "{n} elements": "要素 {n} 個",
  "Drop this place": "この場所を外す",
  "No comments yet. Press Comment, then click the slide.": "コメントはまだありません。「コメント」を押してスライドをクリック。",
  "Present": "プレゼン",
  "Exit": "終了",
  "Speaker view": "発表者ビュー",
  "Export PDF": "PDF に書き出す",
  "Export PowerPoint": "PPTX に書き出す",
  "Exporting…": "書き出し中…",
  "Export failed: {detail}": "書き出せませんでした: {detail}",
  "Saved to {file}": "{file} に保存しました",
  "Copy path": "パスをコピー",
  "Copied": "コピーしました",
  "→ or a click: next. ←: back. S: speaker view. C: comment. Esc: exit.": "→ かクリックで次へ。← で戻る。S で発表者ビュー。C でコメント。Esc で終了。",
  "End of the deck. Esc to exit.": "スライドの終わりです。Esc で終了。",
  "Now": "現在",
  "Next": "次",
  "The end": "終わり",
  "Reset": "リセット",
  "Waiting for the presentation…": "プレゼンの開始を待っています…",
  "The presentation window is closed.": "プレゼンのウィンドウは閉じられました。",
  "{n} steps": "{n} ステップ",
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

const WRITE = { "content-type": "application/json", "x-tome-slides": "1" };
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
  decks: () => call("/api/decks"),
  deck: (id) => call("/api/deck?" + q({ id })),
  wait: (id, rev) => call("/api/wait?" + q({ id, rev })),
  comments: (id) => call("/api/comments?" + q({ id })),
  comment: (id, body) => call("/api/comments?" + q({ id }), { method: "POST", headers: WRITE, body: JSON.stringify(body) }),
};
const fileUrl = (id, file, params) => `/f/${id}/${file.split("/").map(encodeURIComponent).join("/")}?${q(params)}`;

// ---- small things ----

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const root = document.getElementById("root");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const el = (html) => {
  const d = document.createElement("template");
  d.innerHTML = html.trim();
  return d.content.firstElementChild;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const typing = (e) => e.target.closest?.("input, textarea, select, [contenteditable]");
const frameHtml = (title) => `<iframe sandbox="allow-scripts" tabindex="-1" title="${esc(title)}"></iframe>`;
const gone = (text) => (root.innerHTML = `<div class="center"><div>${esc(text)}</div><a href="/">${esc(t("All decks"))}</a></div>`);

/** Follows a deck: calls `changed(deck)` each time its files change, until it is removed. */
async function follow(id, deck, changed) {
  for (;;) {
    try {
      const r = await api.wait(id, deck.rev);
      if (r.rev === null) return gone(t("This deck was removed."));
      if (r.rev === deck.rev) continue;
      const before = deck;
      deck = r;
      changed(r, before);
    } catch {
      await sleep(2000);
    }
  }
}

/** The slide shown at its size inside a box, scaled to fit: the scale. */
function fitInto(box, w, h, pad = 0) {
  const s = Math.min((box.clientWidth - pad * 2) / w, (box.clientHeight - pad * 2) / h);
  return s > 0 ? s : 0.1;
}

// ---- the list ----

async function showList() {
  document.title = t("Decks");
  const load = async () => {
    let decks = [];
    try {
      decks = (await api.decks()).decks;
    } catch (e) {
      root.innerHTML = `<div class="center">${esc(e.message)}</div>`;
      return;
    }
    root.innerHTML =
      `<div class="list"><h1>${esc(t("Decks"))}</h1>` +
      (decks.length === 0 ? `<p class="dim">${esc(t("No deck is open. An agent opens one with the tome-slides skill."))}</p>` : "") +
      decks
        .map(
          (d) =>
            `<a class="list-row" href="/d/${esc(d.id)}"><b>${esc(d.title)}</b><span class="dim">${esc(t("{n} slides", { n: d.slides }))}</span><span class="dim mono">${esc(d.root)}</span>` +
            (d.open ? `<span class="count">${esc(t("{n} open comments", { n: d.open }))}</span>` : "") +
            `</a>`,
        )
        .join("") +
      `</div>`;
  };
  await load();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && load());
}

// ---- one deck ----

async function showDeck(id) {
  let deck;
  try {
    deck = await api.deck(id);
  } catch (e) {
    root.innerHTML = `<div class="center"><div>${esc(t("The deck could not be opened."))} ${esc(e.message)}</div><a href="/">${esc(t("All decks"))}</a></div>`;
    return;
  }
  const params = new URL(location.href).searchParams;
  if (params.get("speaker") === "1") return showSpeaker(id, deck);

  root.innerHTML = `
    <div class="deck-page">
      <header class="bar">
        <a href="/" title="${esc(t("All decks"))}">←</a>
        <b class="title"></b>
        <button class="path mono" title="${esc(t("Copy path"))}"></button>
        <span class="problems"></span>
        <span class="grow"></span>
        <button class="changed" hidden></button>
        <button class="export">${esc(t("Export PDF"))}</button>
        <button class="export-pptx" title="${esc(t("Export PowerPoint"))}">${esc(t("Export PowerPoint"))}</button>
        <button class="present-button">${esc(t("Present"))}<kbd>P</kbd></button>
        <button class="pick">${esc(t("Comment"))}<kbd>C</kbd></button>
        <button class="toggle"></button>
      </header>
      <div class="body">
        <nav class="rail"></nav>
        <main class="main">
          <div class="stage">
            <div class="room"><div class="sizer"><div class="screen"></div><div class="marks"></div></div></div>
            <div class="empty" hidden>${esc(t("No slides yet."))}</div>
            <div class="hint" hidden></div>
          </div>
          <section class="notes"><div class="notes-head"><b>${esc(t("Speaker notes"))}</b><span class="dim steps"></span></div><div class="notes-text"></div></section>
        </main>
        <aside class="panel"></aside>
      </div>
    </div>`;
  const page = root.firstElementChild;
  const rail = page.querySelector(".rail");
  const stage = page.querySelector(".stage");
  const panel = page.querySelector(".panel");
  const hint = page.querySelector(".hint");
  const changedButton = page.querySelector(".changed");
  const toggle = page.querySelector(".toggle");
  const pickButton = page.querySelector(".pick");

  /**
   * What the page holds. `current`: the slide shown large (its file).
   * `draft`: the place of the comment being written (null: the whole deck).
   * `steps`: how many steps each slide has, as its probe tells. `present`:
   * the presentation, while it runs.
   */
  const state = {
    deck,
    current: null,
    picking: false,
    changed: new Set(),
    threads: [],
    listening: false,
    active: null,
    draft: null,
    texts: {},
    seen: "",
    steps: {},
    present: null,
  };
  const slides = () => state.deck.slides;
  const shown = () => slides().filter((s) => s.exists);
  const slideOf = (file) => slides().find((s) => s.file === file) ?? null;
  const numberOf = (file) => slides().findIndex((s) => s.file === file) + 1;
  const slideName = (s) => (s ? s.title || s.file : "");
  const openThreads = () => state.threads.filter((x) => !x.resolved);
  const size = () => state.deck.size;
  const rev = (s) => `${s.rev}-${state.deck.assets}`;

  // -- the bar --

  function renderBar() {
    const d = state.deck;
    document.title = d.title;
    page.querySelector(".title").textContent = d.title;
    const pathButton = page.querySelector(".path");
    if (!pathButton.dataset.copied) pathButton.textContent = d.root;
    page.querySelector(".problems").textContent = d.problems ? "⚠ " + t("{n} problems in the files", { n: d.problems }) : "";
    changedButton.hidden = state.changed.size === 0;
    changedButton.textContent = t("{n} changed", { n: state.changed.size }) + " ×";
    pickButton.classList.toggle("on", state.picking);
    const n = openThreads().length;
    toggle.innerHTML = `${esc(t("Comments"))} ${n}${state.listening ? '<em class="listening"></em>' : ""}`;
    const pres = page.querySelector(".present");
    if (pres) {
      pres.querySelector(".p-pick").classList.toggle("on", state.picking);
      pres.querySelector(".p-toggle").innerHTML = toggle.innerHTML;
    }
  }

  // -- the slides down the side --

  const thumbs = new Map();
  const THUMB_W = 168;

  function renderRail() {
    const [w, h] = size();
    const s = THUMB_W / w;
    for (const [file, th] of thumbs) {
      if (!slideOf(file)) {
        th.node.remove();
        thumbs.delete(file);
      }
    }
    const counts = {};
    for (const x of openThreads()) if (x.anchor) counts[x.anchor.slide] = (counts[x.anchor.slide] ?? 0) + 1;
    for (const [i, sl] of slides().entries()) {
      let th = thumbs.get(sl.file);
      if (!th) {
        const node = el(`<button class="thumb" data-file="${esc(sl.file)}"><span class="num"></span><span class="tframe"><span class="tscale"></span></span><span class="tname"></span><span class="badge" hidden></span></button>`);
        th = { node, src: null };
        thumbs.set(sl.file, th);
      }
      rail.append(th.node);
      const { node } = th;
      node.querySelector(".num").textContent = String(i + 1);
      node.querySelector(".tname").textContent = sl.title ?? "";
      const frame = node.querySelector(".tframe");
      frame.style.width = THUMB_W + "px";
      frame.style.height = h * s + "px";
      const inner = node.querySelector(".tscale");
      Object.assign(inner.style, { width: w + "px", height: h + "px", transform: `scale(${s})` });
      if (!sl.exists) {
        if (th.src !== "missing") inner.innerHTML = `<span class="missing">${esc(t("This slide's file is missing."))}</span>`;
        th.src = "missing";
      } else {
        const src = fileUrl(id, sl.file, { clip: 1, r: rev(sl) });
        if (th.src !== src) {
          inner.innerHTML = frameHtml(slideName(sl));
          inner.firstElementChild.src = src;
          th.src = src;
        }
      }
      const badge = node.querySelector(".badge");
      badge.hidden = !counts[sl.file];
      badge.textContent = String(counts[sl.file] ?? "");
      node.classList.toggle("current", sl.file === state.current);
      node.classList.toggle("changed", state.changed.has(sl.file));
    }
  }

  rail.addEventListener("click", (e) => {
    const th = e.target.closest(".thumb");
    if (th) choose(th.dataset.file);
  });

  // -- the slide shown large --

  function choose(file, { scroll = true } = {}) {
    const sl = slideOf(file);
    if (!sl) return;
    state.current = file;
    state.changed.delete(file);
    const url = new URL(location.href);
    url.searchParams.set("s", String(numberOf(file)));
    url.searchParams.delete("present");
    history.replaceState(null, "", url);
    renderMain(false);
    renderRail();
    renderBar();
    if (scroll) thumbs.get(file)?.node.scrollIntoView({ block: "nearest" });
  }

  function step(by) {
    const list = slides();
    const at = list.findIndex((s) => s.file === state.current);
    const to = list[clamp(at + by, 0, list.length - 1)];
    if (to && to.file !== state.current) choose(to.file);
  }

  function renderMain(again) {
    const sl = slideOf(state.current);
    page.querySelector(".empty").hidden = slides().length > 0;
    const screen = stage.querySelector(".screen");
    const [w, h] = size();
    screen.style.width = w + "px";
    screen.style.height = h + "px";
    if (!sl) {
      screen.innerHTML = "";
      delete screen.dataset.src;
    } else if (!sl.exists) {
      screen.innerHTML = `<div class="missing">${esc(t("This slide's file is missing."))}</div>`;
      delete screen.dataset.src;
    } else {
      const src = fileUrl(id, sl.file, { clip: 1, r: rev(sl) });
      if (again || screen.dataset.src !== src) {
        screen.innerHTML = frameHtml(slideName(sl));
        screen.firstElementChild.src = src;
        screen.dataset.src = src;
      }
    }
    page.querySelector(".notes-text").textContent = sl?.notes || t("No notes for this slide.");
    page.querySelector(".notes-text").classList.toggle("dim", !sl?.notes);
    const n = sl ? (state.steps[sl.file] ?? 0) : 0;
    page.querySelector(".notes .steps").textContent = n ? t("{n} steps", { n }) : "";
    layoutMain();
    renderMarks();
  }

  function layoutMain() {
    const [w, h] = size();
    const room = stage.querySelector(".room");
    const sizer = stage.querySelector(".sizer");
    const s = fitInto(stage, w, h, 28);
    sizer.style.transform = `scale(${s})`;
    sizer.style.setProperty("--inv", String(1 / s));
    room.style.width = w * s + "px";
    room.style.height = h * s + "px";
  }
  new ResizeObserver(layoutMain).observe(stage);

  /** The pins of the open threads on the slide shown, and the place in hand. */
  function renderMarks() {
    const layer = stage.querySelector(".marks");
    layer.innerHTML = "";
    const file = state.current;
    const spot = (r) => {
      const s = el(`<div class="spot"></div>`);
      Object.assign(s.style, { left: r[0] + "px", top: r[1] + "px", width: Math.max(r[2], 4) + "px", height: Math.max(r[3], 4) + "px" });
      layer.append(s);
    };
    if (state.draft && state.draft.slide === file) spot(state.draft.rect);
    const [w] = size();
    for (const x of openThreads()) {
      if (!x.anchor || x.anchor.slide !== file) continue;
      const r = x.anchor.rect;
      if (x.id === state.active) spot(r);
      const pin = el(`<button class="pin${x.id === state.active ? " on" : ""}" data-thread="${esc(x.id)}">${x.n}</button>`);
      pin.style.left = clamp(r[0] + r[2], 0, w - 4) + "px";
      pin.style.top = clamp(r[1], 4, 1e9) + "px";
      layer.append(pin);
    }
  }
  stage.querySelector(".marks").addEventListener("click", (e) => {
    const pin = e.target.closest(".pin");
    if (pin) show(pin.dataset.thread);
  });

  // -- presenting: full screen, one slide and step at a time --

  const channel = "BroadcastChannel" in window ? new BroadcastChannel(`tome-slides-${id}`) : null;
  let presentCount = 0;

  function openPresent(file, fromStart = false) {
    const list = shown();
    const start = fromStart ? list[0] : (list.find((s) => s.file === file) ?? list[0]);
    if (!start) return;
    if (state.picking) setPicking(false);
    // The slide gets the whole screen: the comments come back with C or the button.
    state.present = { file: null, step: 0, end: false, black: false, full: false, panel: page.classList.contains("panel-open") };
    page.classList.remove("panel-open");
    const node = el(`
      <div class="present">
        <div class="present-body">
          <div class="present-stage"><div class="device"></div><div class="blank" hidden></div><div class="present-end" hidden>${esc(t("End of the deck. Esc to exit."))}</div><div class="present-tip">${esc(t("→ or a click: next. ←: back. S: speaker view. C: comment. Esc: exit."))}</div></div>
        </div>
        <div class="present-bar">
          <button class="exit">${esc(t("Exit"))}<kbd>Esc</kbd></button>
          <span class="count"></span>
          <span class="grow"></span>
          <button class="speaker-button">${esc(t("Speaker view"))}<kbd>S</kbd></button>
          <button class="p-pick">${esc(t("Comment"))}<kbd>C</kbd></button>
          <button class="p-toggle"></button>
        </div>
      </div>`);
    page.append(node);
    node.querySelector(".present-body").append(panel);
    node.querySelector(".exit").addEventListener("click", closePresent);
    node.querySelector(".speaker-button").addEventListener("click", openSpeaker);
    node.querySelector(".p-pick").addEventListener("click", () => setPicking(!state.picking));
    node.querySelector(".p-toggle").addEventListener("click", () => {
      page.classList.toggle("panel-open");
      layoutPresent();
    });
    node.querySelector(".present-end").addEventListener("click", () => presentKey({ key: "ArrowRight", preventDefault() {} }));
    // The bar shows while the mouse moves, and goes when it rests.
    let rest = 0;
    node.addEventListener("pointermove", () => {
      node.classList.add("moving");
      clearTimeout(rest);
      rest = setTimeout(() => node.classList.remove("moving"), 1800);
    });
    new ResizeObserver(layoutPresent).observe(node.querySelector(".present-stage"));
    setTimeout(() => node.querySelector(".present-tip")?.classList.add("gone"), 4000);
    // Full screen when the browser lets it (a click or a key asked for it).
    document.documentElement.requestFullscreen?.().then(
      () => state.present && (state.present.full = true),
      () => {},
    );
    presentGo(start.file, 0, "fresh");
    renderBar();
  }

  function closePresent() {
    if (!state.present) return;
    if (state.picking) setPicking(false);
    const was = state.present.file;
    page.classList.toggle("panel-open", state.present.panel || page.classList.contains("panel-open"));
    state.present = null;
    page.querySelector(".body").append(panel);
    page.querySelector(".present")?.remove();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    channel?.postMessage({ type: "bye" });
    if (was) choose(was);
    renderBar();
  }
  document.addEventListener("fullscreenchange", () => {
    // Leaving full screen (Esc in the browser) ends the presentation it began.
    if (!document.fullscreenElement && state.present?.full) closePresent();
  });

  const transitionOf = (s) => s.transition ?? state.deck.transition;

  /**
   * Shows a slide at a step. `how`: "forward", "back", "fresh" (no motion
   * but a fade) or "same" (the slide shown, drawn again).
   */
  function presentGo(file, stepAt, how) {
    const p = state.present;
    const sl = slideOf(file);
    if (!p || !sl?.exists) return;
    const node = page.querySelector(".present");
    const device = node.querySelector(".device");
    const old = device.querySelector(`iframe[data-n="${device.dataset.current}"]`);
    if (old && p.file === file && how !== "same") {
      // The same slide: only its steps change.
      p.step = stepAt;
      old.contentWindow?.postMessage({ tome: 1, type: "step", at: stepAt }, "*");
      return presentChanged();
    }
    // The move belongs to the slide that comes in (going back: the one that goes).
    const kind = how === "back" && p.file ? transitionOf(slideOf(p.file) ?? sl) : transitionOf(sl);
    p.file = file;
    p.step = stepAt;
    const [w, h] = size();
    const frame = el(frameHtml(slideName(sl)));
    frame.dataset.n = String(++presentCount);
    frame.dataset.file = file;
    frame.dataset.rev = rev(sl);
    frame.style.width = w + "px";
    frame.style.height = h + "px";
    device.dataset.current = frame.dataset.n;
    const W = device.clientWidth || w;
    const instant = !old || how === "same" || kind === "none";
    let from = [0, 0];
    let away = [0, 1];
    if (!instant && kind === "slide" && how !== "fresh") {
      from = how === "back" ? [-W, 1] : [W, 1];
      away = how === "back" ? [W, 1] : [-W, 1];
    } else if (!instant) {
      from = [0, 0];
      away = [0, 1];
    }
    placeFrame(frame, from, false);
    device.append(frame);
    layoutPresent();
    frame.addEventListener(
      "load",
      () => {
        if (device.dataset.current !== frame.dataset.n) return;
        void frame.offsetWidth;
        placeFrame(frame, [0, 1], !instant);
        if (old) placeFrame(old, away, !instant);
        setTimeout(() => {
          for (const f of device.querySelectorAll("iframe")) if (f.dataset.n !== device.dataset.current) f.remove();
        }, instant ? 0 : 520);
      },
      { once: true },
    );
    frame.src = fileUrl(id, file, { clip: 1, step: stepAt, r: frame.dataset.rev });
    presentChanged();
  }

  function placeFrame(f, [x, o], animate) {
    f.style.transition = animate ? "transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.4s ease-out" : "none";
    f.style.transform = `translateX(${x}px) scale(${f.dataset.s ?? 1})`;
    f.style.opacity = String(o);
  }

  /** The slide as large as the window lets it be. */
  function layoutPresent() {
    const node = page.querySelector(".present");
    if (!node) return;
    const [w, h] = size();
    const room = node.querySelector(".present-stage");
    const s = fitInto(room, w, h);
    const device = node.querySelector(".device");
    device.style.width = w * s + "px";
    device.style.height = h * s + "px";
    for (const f of device.querySelectorAll("iframe")) {
      f.dataset.s = String(s);
      f.style.transform = f.style.transform.replace(/scale\([^)]*\)/, `scale(${s})`) || `scale(${s})`;
    }
  }

  /** The presentation moved: its counter, the URL, and the speaker view. */
  function presentChanged() {
    const p = state.present;
    const node = page.querySelector(".present");
    const list = shown();
    const at = list.findIndex((s) => s.file === p.file);
    node.querySelector(".count").textContent = `${at + 1} / ${list.length}`;
    node.querySelector(".present-end").hidden = !p.end;
    node.querySelector(".blank").hidden = !p.black;
    const url = new URL(location.href);
    url.searchParams.set("present", String(numberOf(p.file)));
    url.searchParams.delete("s");
    history.replaceState(null, "", url);
    tell();
  }

  function tell() {
    const p = state.present;
    if (p) channel?.postMessage({ type: "at", file: p.file, step: p.step, end: p.end, steps: state.steps, startedAt: p.startedAt });
  }

  function next() {
    const p = state.present;
    if (p.end) return;
    const list = shown();
    const at = list.findIndex((s) => s.file === p.file);
    if (p.step < (state.steps[p.file] ?? 0)) presentGo(p.file, p.step + 1, "forward");
    else if (at < list.length - 1) presentGo(list[at + 1].file, 0, "forward");
    else {
      p.end = true;
      presentChanged();
    }
  }

  function back() {
    const p = state.present;
    if (p.end) {
      p.end = false;
      return presentChanged();
    }
    const list = shown();
    const at = list.findIndex((s) => s.file === p.file);
    if (p.step > 0) presentGo(p.file, p.step - 1, "back");
    else if (at > 0) presentGo(list[at - 1].file, state.steps[list[at - 1].file] ?? 0, "back");
  }

  function presentKey(e) {
    const p = state.present;
    const list = shown();
    if (e.key === "Escape") {
      if (state.picking) setPicking(false);
      else if (state.draft) {
        state.draft = null;
        renderPanel();
      } else closePresent();
    } else if (e.key === "c" || e.key === "C") setPicking(!state.picking);
    else if (e.key === "s" || e.key === "S") openSpeaker();
    else if (e.key === "b" || e.key === "B") {
      p.black = !p.black;
      presentChanged();
    } else if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
      if (e.shiftKey && e.key === " ") back();
      else next();
    } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) back();
    else if (e.key === "Home") {
      p.end = false;
      presentGo(list[0].file, 0, "back");
    } else if (e.key === "End") {
      p.end = false;
      const last = list[list.length - 1];
      presentGo(last.file, state.steps[last.file] ?? 0, "forward");
    } else return;
    e.preventDefault();
  }

  function openSpeaker() {
    if (!state.present) return;
    state.present.startedAt ??= Date.now();
    window.open(`/d/${id}?speaker=1`, `tome-slides-speaker-${id}`, "width=1200,height=760");
    setTimeout(tell, 600);
  }

  channel?.addEventListener("message", (e) => {
    const m = e.data;
    if (!state.present || !m) return;
    if (m.type === "hello") {
      state.present.startedAt ??= Date.now();
      tell();
    } else if (m.type === "key") presentKey({ key: m.key, shiftKey: m.shift, preventDefault() {} });
    else if (m.type === "reset") {
      state.present.startedAt = Date.now();
      tell();
    }
  });
  addEventListener("pagehide", () => channel?.postMessage({ type: "bye" }));

  // -- taking a comment on a slide --

  function iframes() {
    return [...page.querySelectorAll(".screen iframe, .device iframe")];
  }
  function setPicking(on) {
    state.picking = on;
    for (const f of iframes()) f.contentWindow?.postMessage({ tome: 1, type: "pick", on }, "*");
    stage.classList.toggle("picking", on);
    hint.hidden = !on;
    hint.textContent = t("Click an element, or drag over an area. Esc to stop.");
    if (state.present && on) page.querySelector(".present-stage").append(hint);
    else stage.append(hint);
    renderBar();
  }

  /** The slide an iframe shows, from the message's source. */
  function frameOf(source) {
    return iframes().find((f) => f.contentWindow === source) ?? [...rail.querySelectorAll("iframe")].find((f) => f.contentWindow === source) ?? null;
  }

  addEventListener("message", (e) => {
    const m = e.data;
    if (!m || m.tome !== 1) return;
    const frame = frameOf(e.source);
    if (!frame) return;
    const inPresent = Boolean(frame.closest(".present"));
    const file = inPresent ? frame.dataset.file : (frame.closest(".thumb")?.dataset.file ?? state.current);
    if (!file) return;
    if (m.type === "ready") {
      if (Number.isFinite(m.steps) && state.steps[file] !== m.steps) {
        state.steps[file] = m.steps;
        if (file === state.current) renderMain(false);
        tell();
      }
      if (inPresent) e.source.postMessage({ tome: 1, type: "present", on: true }, "*");
      if (state.picking && !frame.closest(".thumb")) e.source.postMessage({ tome: 1, type: "pick", on: true }, "*");
    } else if (frame.closest(".thumb")) return;
    else if (m.type === "go" && typeof m.file === "string") {
      // A link to another slide: that slide.
      if (!slideOf(m.file)?.exists) return;
      if (state.present) presentGo(m.file, 0, "forward");
      else choose(m.file);
    } else if (m.type === "next" && inPresent) next();
    else if ((m.type === "pick" || m.type === "area") && state.picking && Array.isArray(m.rect)) {
      state.draft = { slide: file, rect: m.rect, element: m.type === "pick" ? m.element : null, elements: m.type === "area" ? (m.elements ?? []) : [] };
      state.active = null;
      setPicking(false);
      page.classList.add("panel-open");
      layoutPresent();
      renderMarks();
      renderPanel();
      panel.querySelector('.composer[data-key="new"] textarea')?.focus();
    } else if (m.type === "key") key({ key: m.key, shiftKey: m.shift, preventDefault() {}, target: document.body });
  });

  // -- the panel --

  /** What a place is, in words: the slide, then the element or the area. */
  function aboutHtml(a) {
    const n = numberOf(a.slide);
    const name = `<b>${esc(n ? t("Slide {n}", { n }) : a.slide)}</b>`;
    if (a.element) {
      const what = a.element.text ? `“${a.element.text.slice(0, 120)}”` : "";
      return `${name} · <span class="mono">${esc(a.element.tag ?? "")}</span> ${esc(what)}`;
    }
    return `${name} · ${esc(t("Area"))}${a.elements?.length ? " · " + esc(t("{n} elements", { n: a.elements.length })) : ""}`;
  }

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
        ? `<div class="about">${aboutHtml(state.draft)}<button class="drop" title="${esc(t("Drop this place"))}">×</button></div>` + composer("new", t("What about this part? Ask, or say what to change."))
        : composer("new", t("Ask about this deck, or say what to change."))) +
      `</div>` +
      (threads.length === 0 ? `<p class="dim empty-note">${esc(t("No comments yet. Press Comment, then click the slide."))}</p>` : "") +
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
            (x.anchor ? "" : `<span class="dim">${esc(t("Whole deck"))}</span>`) +
            (mine ? `<span class="dim">${esc(x.sent ? t("Sent to Agent") : t("Note, not sent"))}</span>` : "") +
            `<button class="resolve">${esc(t("Resolve"))}</button></div>` +
            (x.anchor ? `<div class="about">${aboutHtml(x.anchor)}</div>` : "") +
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
    renderMarks();
  }

  /** Shows a thread, and the slide it is on. */
  function show(threadId) {
    state.active = threadId;
    page.classList.add("panel-open");
    const x = state.threads.find((th) => th.id === threadId);
    const sl = x?.anchor ? slideOf(x.anchor.slide) : null;
    if (sl && state.present) {
      if (state.present.file !== sl.file) presentGo(sl.file, state.steps[sl.file] ?? 0, "fresh");
      layoutPresent();
    } else if (sl && sl.file !== state.current) choose(sl.file);
    renderMarks();
    renderPanel();
    renderBar();
    panel.querySelector(".thread.on")?.scrollIntoView({ block: "nearest" });
  }

  panel.addEventListener("input", (e) => {
    const k = e.target.closest(".composer")?.dataset.key;
    if (k) state.texts[k] = e.target.value;
  });
  panel.addEventListener("keydown", (e) => {
    const k = e.target.closest(".composer")?.dataset.key;
    if (k && e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(k, state.listening);
  });
  panel.addEventListener("click", (e) => {
    const thread = e.target.closest(".thread")?.dataset.thread;
    if (e.target.closest(".submit")) return void submit(e.target.closest(".composer").dataset.key, true);
    if (e.target.closest(".note")) return void submit(e.target.closest(".composer").dataset.key, false);
    if (e.target.closest(".drop")) {
      state.draft = null;
      renderMarks();
      return void renderPanel();
    }
    if (e.target.closest(".resolve")) return void act({ op: "resolve", id: thread });
    if (e.target.closest(".send")) return void act({ op: "send", id: thread });
    if (thread && thread !== state.active) show(thread);
  });

  // -- the bar's buttons and the keys --

  changedButton.addEventListener("click", () => {
    state.changed.clear();
    renderRail();
    renderBar();
  });
  toggle.addEventListener("click", () => page.classList.toggle("panel-open"));
  pickButton.addEventListener("click", () => setPicking(!state.picking));
  page.querySelector(".present-button").addEventListener("click", () => openPresent(state.current));
  /** The server makes the file in the deck's exports/; the page downloads it with a plain link. */
  async function exportAs(b, kind, label) {
    if (b.disabled) return;
    b.disabled = true;
    b.textContent = t("Exporting…");
    try {
      const res = await fetch("/api/export?" + q({ id, kind }), { method: "POST", headers: WRITE });
      const body = await res.json().catch(() => null);
      // No Chrome to make a PDF with: the print dialog makes one.
      if (body?.code === "NoChrome" && kind === "pdf") return void window.open(`/print/${id}?auto=1`, "_blank");
      if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`);
      const a = Object.assign(document.createElement("a"), { href: body.download, download: body.file.split("/").pop() });
      document.body.append(a);
      a.click();
      a.remove();
      b.title = t("Saved to {file}", { file: body.file });
    } catch (err) {
      b.title = t("Export failed: {detail}", { detail: err.message });
      b.dataset.failed = "1";
      setTimeout(() => delete b.dataset.failed, 4000);
    } finally {
      b.disabled = false;
      b.textContent = t(label);
    }
  }
  page.querySelector(".export").addEventListener("click", (e) => exportAs(e.currentTarget, "pdf", "Export PDF"));
  page.querySelector(".export-pptx").addEventListener("click", (e) => exportAs(e.currentTarget, "pptx", "Export PowerPoint"));
  page.querySelector(".path").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    try {
      await navigator.clipboard.writeText(state.deck.root);
      b.dataset.copied = "1";
      b.textContent = t("Copied");
      setTimeout(() => {
        delete b.dataset.copied;
        b.textContent = state.deck.root;
      }, 1200);
    } catch {
      // No clipboard: the path is on the page to read.
    }
  });

  function key(e) {
    if (typing(e)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.present) return presentKey(e);
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      return openPresent(state.current, e.shiftKey);
    }
    if (e.key === "Escape") {
      if (state.picking) setPicking(false);
      else if (state.draft) {
        state.draft = null;
        renderMarks();
        renderPanel();
      }
      return;
    }
    if (e.key === "c" || e.key === "C") setPicking(!state.picking);
    else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) step(-1);
    else if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) step(1);
    else if (e.key === "Home") step(-1e6);
    else if (e.key === "End") step(1e6);
    else return;
    e.preventDefault();
  }
  document.addEventListener("keydown", key);

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
      renderMarks();
      renderPanel();
      renderRail();
      renderBar();
    } catch {
      // The server is away for a moment: what was last read stays.
    }
  }

  const asked = Number(params.get("s"));
  const first = slides()[clamp((Number.isInteger(asked) && asked > 0 ? asked : 1) - 1, 0, Math.max(0, slides().length - 1))];
  state.current = first?.file ?? null;
  if (innerWidth >= 1200) page.classList.add("panel-open");
  renderBar();
  renderRail();
  renderMain(true);
  renderPanel();
  const presented = Number(params.get("present"));
  if (Number.isInteger(presented) && presented > 0) openPresent(slides()[presented - 1]?.file ?? null);
  await loadComments();
  setInterval(() => document.visibilityState === "visible" && loadComments(), 1500);

  // Follows the deck: slides something rewrote show at once, marked.
  await follow(id, state.deck, (r, before) => {
    const old = new Map(before.slides.map((s) => [s.file, s]));
    const resized = before.size.join() !== r.size.join();
    state.deck = r;
    for (const s of r.slides) {
      const o = old.get(s.file);
      if (!o || o.rev !== s.rev || o.notes !== s.notes || o.title !== s.title || resized) state.changed.add(s.file);
    }
    for (const f of [...state.changed]) if (!slideOf(f)) state.changed.delete(f);
    if (state.draft && !slideOf(state.draft.slide)) state.draft = null;
    if (!slideOf(state.current)) state.current = r.slides[0]?.file ?? null;
    state.changed.delete(state.current);
    renderRail();
    renderMain(resized);
    renderBar();
    renderPanel();
    if (state.present) {
      const device = page.querySelector(".present .device");
      const frame = device?.querySelector(`iframe[data-n="${device.dataset.current}"]`);
      const sl = slideOf(state.present.file);
      if (!sl?.exists) closePresent();
      else if (frame?.dataset.rev !== rev(sl) || resized) presentGo(sl.file, state.present.step, "same");
    }
  });
}

// ---- the speaker view: the slide now, what comes next, the notes, the time ----

function showSpeaker(id, deck) {
  document.title = `${t("Speaker view")} · ${deck.title}`;
  root.innerHTML = `
    <div class="speaker">
      <header class="sp-bar">
        <b class="sp-time">00:00</b><button class="sp-reset">${esc(t("Reset"))}</button>
        <span class="grow"></span>
        <span class="sp-count dim"></span>
        <span class="grow"></span>
        <span class="sp-clock dim"></span>
      </header>
      <div class="sp-body">
        <section class="sp-now"><div class="sp-label">${esc(t("Now"))}</div><div class="sp-box"><div class="sp-device"></div></div></section>
        <section class="sp-side">
          <div class="sp-label">${esc(t("Next"))}</div><div class="sp-box small"><div class="sp-device"></div><div class="sp-the-end" hidden>${esc(t("The end"))}</div></div>
          <div class="sp-label">${esc(t("Speaker notes"))}</div><div class="sp-notes"></div>
        </section>
      </div>
      <div class="sp-wait">${esc(t("Waiting for the presentation…"))}</div>
    </div>`;
  const node = root.firstElementChild;
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(`tome-slides-${id}`) : null;
  const at = { file: null, step: 0, end: false, steps: {}, startedAt: null };
  const slideOf = (file) => deck.slides.find((s) => s.file === file) ?? null;

  /** Puts a slide at a step into a box: a new frame only when the slide or its file changed. */
  function put(box, sl, stepAt) {
    const device = box.querySelector(".sp-device");
    if (!sl) {
      device.innerHTML = "";
      delete device.dataset.src;
      return;
    }
    const [w, h] = deck.size;
    const src = fileUrl(id, sl.file, { clip: 1, step: stepAt, r: `${sl.rev}-${deck.assets}` });
    const same = device.dataset.file === sl.file && device.dataset.rev === `${sl.rev}-${deck.assets}`;
    if (!same) {
      device.innerHTML = frameHtml(sl.title || sl.file);
      const f = device.firstElementChild;
      Object.assign(f.style, { width: w + "px", height: h + "px" });
      f.src = src;
      device.dataset.file = sl.file;
      device.dataset.rev = `${sl.rev}-${deck.assets}`;
    } else device.firstElementChild?.contentWindow?.postMessage({ tome: 1, type: "step", at: stepAt }, "*");
    device.dataset.step = String(stepAt);
    layout(box);
  }

  function layout(box) {
    const [w, h] = deck.size;
    const s = fitInto(box, w, h);
    const device = box.querySelector(".sp-device");
    Object.assign(device.style, { width: w * s + "px", height: h * s + "px" });
    const f = device.firstElementChild;
    if (f) f.style.transform = `scale(${s})`;
  }
  for (const box of node.querySelectorAll(".sp-box")) new ResizeObserver(() => layout(box)).observe(box);

  function render() {
    node.querySelector(".sp-wait").hidden = Boolean(at.file);
    if (!at.file) return;
    const list = deck.slides.filter((s) => s.exists);
    const i = list.findIndex((s) => s.file === at.file);
    const sl = slideOf(at.file);
    const n = at.steps[at.file] ?? 0;
    node.querySelector(".sp-count").textContent = `${i + 1} / ${list.length}` + (n ? ` · ${at.step} / ${n}` : "");
    const [now, nextBox] = node.querySelectorAll(".sp-box");
    put(now, at.end ? null : sl, at.step);
    let nextSlide = null;
    let nextStep = 0;
    if (!at.end && at.step < n) {
      nextSlide = sl;
      nextStep = at.step + 1;
    } else if (!at.end && i < list.length - 1) nextSlide = list[i + 1];
    put(nextBox, nextSlide, nextStep);
    node.querySelector(".sp-the-end").hidden = Boolean(nextSlide);
    const notes = node.querySelector(".sp-notes");
    notes.textContent = sl?.notes || t("No notes for this slide.");
    notes.classList.toggle("dim", !sl?.notes);
  }

  const two = (n) => String(n).padStart(2, "0");
  setInterval(() => {
    const d = new Date();
    node.querySelector(".sp-clock").textContent = `${two(d.getHours())}:${two(d.getMinutes())}`;
    if (at.startedAt) {
      const s = Math.max(0, Math.floor((Date.now() - at.startedAt) / 1000));
      node.querySelector(".sp-time").textContent = (s >= 3600 ? `${Math.floor(s / 3600)}:` : "") + `${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
    }
  }, 500);
  node.querySelector(".sp-reset").addEventListener("click", () => channel?.postMessage({ type: "reset" }));

  channel?.addEventListener("message", (e) => {
    const m = e.data;
    if (m?.type === "at") {
      Object.assign(at, { file: m.file, step: m.step, end: m.end, steps: m.steps ?? {}, startedAt: m.startedAt ?? at.startedAt });
      render();
    } else if (m?.type === "bye") {
      at.file = null;
      node.querySelector(".sp-wait").textContent = t("The presentation window is closed.");
      render();
    }
  });
  channel?.postMessage({ type: "hello" });

  const KEYS = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "ArrowLeft", "ArrowUp", "PageUp", "Backspace", "Home", "End", "b", "B"];
  const forward = (k, shift) => KEYS.includes(k) && (channel?.postMessage({ type: "key", key: k, shift }), true);
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (forward(e.key, e.shiftKey)) e.preventDefault();
  });
  // Keys pressed while a slide in this window has the focus come as messages.
  addEventListener("message", (e) => {
    if (e.data?.tome === 1 && e.data.type === "key") forward(e.data.key, e.data.shift);
  });

  follow(id, deck, (r) => {
    deck = r;
    render();
  });
}

const m = location.pathname.match(/^\/d\/([0-9a-f]{16})\/?$/);
if (m) showDeck(m[1]);
else showList();
