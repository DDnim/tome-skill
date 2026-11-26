// The page: `/` lists the opened designs, `/d/<id>` shows one: its boards
// side by side on a canvas (drag to move, pinch or ⌘ + scroll to zoom), or
// one board alone (`?b=<file>`). It follows the design's files (a board an
// agent rewrote shows at once, marked), and takes comments: on an element
// of a board, on an area of it, or on the whole design. An agent that waits
// for them answers in the thread.

// ---- words ----

const zh = {
  "Designs": "设计稿",
  "No design is open. An agent opens one with the tome-design skill.": "还没有打开的设计稿。让 agent 用 tome-design skill 打开一个。",
  "{n} boards": "{n} 张画板",
  "{n} open comments": "{n} 条未解决的评论",
  "All designs": "全部设计稿",
  "This design was removed.": "这个设计稿被删掉了。",
  "The design could not be opened.": "设计稿打不开。",
  "{n} changed": "改了 {n} 张",
  "Comment": "评论",
  "Comments": "评论",
  "Fit": "适应",
  "Zoom out": "缩小",
  "Zoom in": "放大",
  "{n} problems in the files": "文件里有 {n} 个问题",
  "No boards yet.": "还没有画板。",
  "This board's file is missing.": "这张画板的文件不在了。",
  "Click an element, or drag over an area. Esc to stop.": "点一个元素，或者拖出一块区域。Esc 退出。",
  "Back to the canvas": "回到画布",
  "Previous board": "上一张",
  "Next board": "下一张",
  "Double-click a board to see it alone.": "双击画板单独看。",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent 在等评论。发给它时，之前加的注释会一起发出去。",
  "No agent is listening. Notes are saved for it to read.": "没有 Agent 在等。注释会存下来，等它来读。",
  "Ask about this design, or say what to change.": "对这个设计稿提问，或者说要怎么改。",
  "What about this part? Ask, or say what to change.": "这里怎么了？提问，或者说要怎么改。",
  "Send to Agent": "发给 Agent",
  "Add note": "添加注释",
  "Note, not sent": "注释，还没发",
  "Reply": "回复",
  "Resolve": "解决",
  "Sent to Agent": "已发给 Agent",
  "Agent": "Agent",
  "You": "你",
  "Whole design": "整个设计稿",
  "Area": "区域",
  "{n} elements": "{n} 个元素",
  "Drop this place": "不针对这里",
  "No comments yet. Press Comment, then click a board.": "还没有评论。按「评论」，再点画板。",
  "Present": "演示",
  "Exit": "退出",
  "Restart": "重新开始",
  "Click anywhere to see what leads to another board. ← → for the others.": "点空白处会闪出能跳到别的画板的地方。← → 换一张。",
  "Copy path": "复制路径",
  "Copied": "已复制",
};
const ja = {
  "Designs": "デザイン",
  "No design is open. An agent opens one with the tome-design skill.": "開いているデザインはありません。agent が tome-design skill で開きます。",
  "{n} boards": "ボード {n} 枚",
  "{n} open comments": "未解決のコメント {n} 件",
  "All designs": "すべてのデザイン",
  "This design was removed.": "このデザインは削除されました。",
  "The design could not be opened.": "デザインを開けません。",
  "{n} changed": "{n} 枚変更",
  "Comment": "コメント",
  "Comments": "コメント",
  "Fit": "全体",
  "Zoom out": "縮小",
  "Zoom in": "拡大",
  "{n} problems in the files": "ファイルに問題が {n} 件",
  "No boards yet.": "ボードはまだありません。",
  "This board's file is missing.": "このボードのファイルがありません。",
  "Click an element, or drag over an area. Esc to stop.": "要素をクリックするか、範囲をドラッグ。Esc でやめる。",
  "Back to the canvas": "キャンバスに戻る",
  "Previous board": "前のボード",
  "Next board": "次のボード",
  "Double-click a board to see it alone.": "ボードをダブルクリックすると単独で表示。",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent がコメントを待っています。送ると、それまでのメモも一緒に送られます。",
  "No agent is listening. Notes are saved for it to read.": "待っている Agent はいません。メモは保存され、あとで読まれます。",
  "Ask about this design, or say what to change.": "このデザインについて質問するか、どう変えるかを書く。",
  "What about this part? Ask, or say what to change.": "この部分について質問するか、どう変えるかを書く。",
  "Send to Agent": "Agent に送る",
  "Add note": "メモを追加",
  "Note, not sent": "メモ（未送信）",
  "Reply": "返信",
  "Resolve": "解決",
  "Sent to Agent": "Agent に送信済み",
  "Agent": "Agent",
  "You": "あなた",
  "Whole design": "デザイン全体",
  "Area": "範囲",
  "{n} elements": "要素 {n} 個",
  "Drop this place": "この場所を外す",
  "No comments yet. Press Comment, then click a board.": "コメントはまだありません。「コメント」を押してボードをクリック。",
  "Present": "プレゼン",
  "Exit": "終了",
  "Restart": "最初から",
  "Click anywhere to see what leads to another board. ← → for the others.": "空いている所をクリックすると、別のボードへ進める場所が光ります。← → で前後。",
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

const WRITE = { "content-type": "application/json", "x-tome-design": "1" };
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
  designs: () => call("/api/designs"),
  design: (id) => call("/api/design?" + q({ id })),
  wait: (id, rev) => call("/api/wait?" + q({ id, rev })),
  comments: (id) => call("/api/comments?" + q({ id })),
  comment: (id, body) => call("/api/comments?" + q({ id }), { method: "POST", headers: WRITE, body: JSON.stringify(body) }),
};
const fileUrl = (id, file) => `/f/${id}/${file.split("/").map(encodeURIComponent).join("/")}`;

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

// ---- the list ----

async function showList() {
  document.title = t("Designs");
  const load = async () => {
    let designs = [];
    try {
      designs = (await api.designs()).designs;
    } catch (e) {
      root.innerHTML = `<div class="center">${esc(e.message)}</div>`;
      return;
    }
    root.innerHTML =
      `<div class="list"><h1>${esc(t("Designs"))}</h1>` +
      (designs.length === 0 ? `<p class="dim">${esc(t("No design is open. An agent opens one with the tome-design skill."))}</p>` : "") +
      designs
        .map(
          (d) =>
            `<a class="list-row" href="/d/${esc(d.id)}"><b>${esc(d.title)}</b><span class="dim">${esc(t("{n} boards", { n: d.boards }))}</span><span class="dim mono">${esc(d.root)}</span>` +
            (d.open ? `<span class="count">${esc(t("{n} open comments", { n: d.open }))}</span>` : "") +
            `</a>`,
        )
        .join("") +
      `</div>`;
  };
  await load();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && load());
}

// ---- one design ----

async function showDesign(id) {
  let design;
  try {
    design = await api.design(id);
  } catch (e) {
    root.innerHTML = `<div class="center"><div>${esc(t("The design could not be opened."))} ${esc(e.message)}</div><a href="/">${esc(t("All designs"))}</a></div>`;
    return;
  }
  root.innerHTML = `
    <div class="design-page">
      <header class="bar">
        <a href="/" title="${esc(t("All designs"))}">←</a>
        <b class="title"></b>
        <button class="path mono" title="${esc(t("Copy path"))}"></button>
        <span class="problems"></span>
        <span class="grow"></span>
        <button class="changed" hidden></button>
        <button class="out" title="${esc(t("Zoom out"))}">−</button>
        <button class="zoom" title="${esc(t("Fit"))}"></button>
        <button class="in" title="${esc(t("Zoom in"))}">+</button>
        <button class="present-button">${esc(t("Present"))}<kbd>P</kbd></button>
        <button class="pick">${esc(t("Comment"))}<kbd>C</kbd></button>
        <button class="toggle"></button>
      </header>
      <div class="body">
        <div class="stage"><div class="world"></div><div class="empty-canvas" hidden>${esc(t("No boards yet."))}</div><div class="hint" hidden></div></div>
        <aside class="panel"></aside>
      </div>
    </div>`;
  const page = root.firstElementChild;
  const stage = page.querySelector(".stage");
  const world = page.querySelector(".world");
  const panel = page.querySelector(".panel");
  const hint = page.querySelector(".hint");
  const changedButton = page.querySelector(".changed");
  const toggle = page.querySelector(".toggle");
  const pickButton = page.querySelector(".pick");
  const zoomButton = page.querySelector(".zoom");

  /**
   * What the page holds. `view`: the canvas's offset and scale. `focus`: the
   * board shown alone (its file), or null. `draft`: the place of the comment
   * being written (null: the whole design). `sizes`: each board's content
   * size, as its probe tells.
   */
  const state = {
    design,
    view: { x: 0, y: 0, s: 1 },
    focus: null,
    selected: null,
    picking: false,
    changed: new Set(),
    threads: [],
    listening: false,
    active: null,
    draft: null,
    texts: {},
    seen: "",
    sizes: {},
    present: null,
  };
  const boardOf = (file) => state.design.boards.find((b) => b.file === file) ?? null;
  const boardName = (b) => b?.title || b?.file || "";
  const openThreads = () => state.threads.filter((x) => !x.resolved);

  // -- the bar --

  function renderBar() {
    const d = state.design;
    document.title = d.title;
    page.querySelector(".title").textContent = d.title;
    const pathButton = page.querySelector(".path");
    if (!pathButton.dataset.copied) pathButton.textContent = d.root;
    page.querySelector(".problems").textContent = d.problems ? "⚠ " + t("{n} problems in the files", { n: d.problems }) : "";
    changedButton.hidden = state.changed.size === 0;
    changedButton.textContent = t("{n} changed", { n: state.changed.size }) + " ×";
    zoomButton.textContent = Math.round(state.view.s * 100) + "%";
    pickButton.classList.toggle("on", state.picking);
    const n = openThreads().length;
    toggle.innerHTML = `${esc(t("Comments"))} ${n}${state.listening ? '<em class="listening"></em>' : ""}`;
  }

  // -- the canvas --

  function applyView() {
    const { x, y, s } = state.view;
    world.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    world.style.setProperty("--inv", String(1 / s));
    const g = 24 * s;
    stage.style.backgroundSize = `${g}px ${g}px`;
    stage.style.backgroundPosition = `${x}px ${y}px`;
    zoomButton.textContent = Math.round(s * 100) + "%";
  }

  /** What is drawn on the canvas, in its px: {x, y, w, h}. */
  function bounds() {
    const items = [...state.design.boards.map((b) => [b.x, b.y - 30, b.w, b.h + 30]), ...state.design.notes.map((n) => [n.x, n.y, n.w ?? 400, 80])];
    if (items.length === 0) return null;
    const x = Math.min(...items.map((i) => i[0]));
    const y = Math.min(...items.map((i) => i[1]));
    return { x, y, w: Math.max(...items.map((i) => i[0] + i[2])) - x, h: Math.max(...items.map((i) => i[1] + i[3])) - y };
  }

  function fit() {
    const b = bounds();
    const r = stage.getBoundingClientRect();
    if (!b || r.width === 0) return;
    const pad = 48;
    const s = clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h), 0.05, 1);
    state.view = { s, x: (r.width - b.w * s) / 2 - b.x * s, y: (r.height - b.h * s) / 2 - b.y * s };
    applyView();
  }

  /** Zooms by `k` around a point of the stage (its own px). */
  function zoomAt(k, px, py) {
    const { x, y, s } = state.view;
    const ns = clamp(s * k, 0.05, 4);
    state.view = { s: ns, x: px - ((px - x) * ns) / s, y: py - ((py - y) * ns) / s };
    applyView();
  }
  const zoomMid = (k) => {
    const r = stage.getBoundingClientRect();
    zoomAt(k, r.width / 2, r.height / 2);
  };

  /** Brings a place of a board into view on the canvas (zooming in when it is too small to see). */
  function reveal(board, rect) {
    const r = stage.getBoundingClientRect();
    const [rx, ry, rw, rh] = rect ?? [0, 0, board.w, board.h];
    let s = state.view.s;
    if (Math.max(rw, rh) * s < 60 || board.w * s > r.width * 1.5) s = clamp(Math.min((r.width * 0.6) / Math.max(rw, 1), (r.height * 0.6) / Math.max(rh, 1), 1), 0.1, 1);
    const cx = board.x + rx + rw / 2;
    const cy = board.y + ry + rh / 2;
    state.view = { s, x: r.width / 2 - cx * s, y: r.height / 2 - cy * s };
    applyView();
  }

  /** The canvas's frames, kept by file: a frame is drawn again only when its board changed. */
  const frames = new Map();

  function frameSrc(b) {
    return `${fileUrl(id, b.file)}?clip=1&r=${b.rev}-${state.design.assets}`;
  }

  function renderWorld() {
    const d = state.design;
    page.querySelector(".empty-canvas").hidden = d.boards.length > 0;
    for (const [file, f] of frames) {
      if (!boardOf(file)) {
        f.node.remove();
        frames.delete(file);
      }
    }
    for (const b of d.boards) {
      let f = frames.get(b.file);
      if (!f) {
        const node = el(`<div class="frame" data-file="${esc(b.file)}"><div class="strip" title="${esc(t("Double-click a board to see it alone."))}"></div><div class="screen"></div><div class="marks"></div></div>`);
        world.append(node);
        f = { node, src: null, exists: null };
        frames.set(b.file, f);
      }
      const { node } = f;
      node.style.left = b.x + "px";
      node.style.top = b.y + "px";
      node.style.width = b.w + "px";
      const screen = node.querySelector(".screen");
      screen.style.width = b.w + "px";
      screen.style.height = b.h + "px";
      node.querySelector(".strip").innerHTML = b.title ? `<b>${esc(b.title)}</b> <span>${esc(b.file)}</span>` : `<b>${esc(b.file)}</b>`;
      if (!b.exists) {
        if (f.exists !== false) screen.innerHTML = `<div class="missing">${esc(t("This board's file is missing."))}</div>`;
        f.exists = false;
        f.src = null;
      } else {
        const src = frameSrc(b);
        if (f.src !== src) {
          // A new iframe each time: the board starts afresh, as a reload would.
          screen.innerHTML = `<iframe sandbox="allow-scripts" title="${esc(boardName(b))}"></iframe>`;
          screen.firstElementChild.src = src;
          f.src = src;
        }
        f.exists = true;
      }
      node.classList.toggle("selected", state.selected === b.file);
      node.classList.toggle("changed", state.changed.has(b.file));
    }
    // Back to front as the index lists them.
    for (const b of d.boards) world.append(frames.get(b.file).node);
    for (const n of world.querySelectorAll(".cnote")) n.remove();
    for (const n of d.notes) {
      const node = el(`<div class="cnote ${n.kind}"></div>`);
      node.textContent = n.text;
      node.style.left = n.x + "px";
      node.style.top = n.y + "px";
      if (n.w) node.style[n.kind === "title" ? "maxWidth" : "width"] = n.w + "px";
      world.prepend(node);
    }
    renderMarks();
  }

  /** A comment's place, in the board's px: [x, y, w, h]. */
  const placeOf = (anchor) => anchor.rect;

  /** The pins of the open threads and the place in hand, on a board's marks layer. */
  function marksFor(file, layer) {
    layer.innerHTML = "";
    const spot = (r) => {
      const s = el(`<div class="spot"></div>`);
      Object.assign(s.style, { left: r[0] + "px", top: r[1] + "px", width: Math.max(r[2], 4) + "px", height: Math.max(r[3], 4) + "px" });
      layer.append(s);
    };
    if (state.draft && state.draft.board === file) spot(placeOf(state.draft));
    for (const x of openThreads()) {
      if (!x.anchor || x.anchor.board !== file) continue;
      const r = placeOf(x.anchor);
      if (x.id === state.active) spot(r);
      const pin = el(`<button class="pin${x.id === state.active ? " on" : ""}" data-thread="${esc(x.id)}">${x.n}</button>`);
      const b = boardOf(file);
      pin.style.left = clamp(r[0] + r[2], 0, (b?.w ?? 1e9) - 4) + "px";
      pin.style.top = clamp(r[1], 4, 1e9) + "px";
      layer.append(pin);
    }
  }

  function renderMarks() {
    for (const [file, f] of frames) marksFor(file, f.node.querySelector(".marks"));
    if (state.focus) {
      const layer = page.querySelector(".focus .marks");
      if (layer) marksFor(state.focus, layer);
    }
  }

  // Moving and zooming the canvas.
  stage.addEventListener(
    "wheel",
    (e) => {
      if (state.focus) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else {
        state.view.x -= e.deltaX;
        state.view.y -= e.deltaY;
        applyView();
      }
    },
    { passive: false },
  );
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    if (state.focus || e.button !== 0 || e.target.closest(".pin")) return;
    drag = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y, moved: false };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    stage.classList.add("panning");
    state.view.x = drag.vx + dx;
    state.view.y = drag.vy + dy;
    applyView();
  });
  const endDrag = (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    stage.classList.remove("panning");
    if (moved) return;
    // A click: selects the board under it (none: nothing selected).
    const frame = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains("frame") || n.closest?.(".frame"));
    const file = (frame?.classList.contains("frame") ? frame : frame?.closest(".frame"))?.dataset.file ?? null;
    // A second click on the same board soon after: that board alone.
    const twice = file && lastClick.file === file && e.timeStamp - lastClick.at < 450;
    lastClick = twice ? { file: null, at: 0 } : { file, at: e.timeStamp };
    state.selected = file;
    if (twice && boardOf(file)?.exists) return openFocus(file);
    renderWorld();
  };
  let lastClick = { file: null, at: 0 };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", () => {
    drag = null;
    stage.classList.remove("panning");
  });
  world.addEventListener("click", (e) => {
    const pin = e.target.closest(".pin");
    if (pin) show(pin.dataset.thread);
  });

  // -- one board alone --

  function openFocus(file) {
    const b = boardOf(file);
    if (!b) return;
    state.focus = file;
    state.selected = file;
    page.classList.add("focused");
    const url = new URL(location.href);
    url.searchParams.set("b", file);
    history.replaceState(null, "", url);
    renderFocus(true);
  }

  function closeFocus() {
    if (!state.focus) return;
    state.focus = null;
    page.querySelector(".focus")?.remove();
    page.classList.remove("focused");
    const url = new URL(location.href);
    url.searchParams.delete("b");
    history.replaceState(null, "", url);
    renderWorld();
    setPicking(state.picking);
  }

  function step(by) {
    const files = state.design.boards.filter((b) => b.exists).map((b) => b.file);
    const at = files.indexOf(state.focus);
    if (at === -1 || files.length < 2) return;
    openFocus(files[(at + by + files.length) % files.length]);
  }

  /** Draws the board shown alone. `again`: its file or its place changed (a new iframe). */
  function renderFocus(again) {
    const b = boardOf(state.focus);
    if (!b || !b.exists) return closeFocus();
    let node = page.querySelector(".focus");
    if (!node) {
      node = el(`
        <div class="focus">
          <div class="focus-head">
            <button class="back" title="${esc(t("Back to the canvas"))}">←</button>
            <button class="prev" title="${esc(t("Previous board"))}">‹</button>
            <button class="next" title="${esc(t("Next board"))}">›</button>
            <b class="name"></b><span class="dim mono file"></span>
          </div>
          <div class="focus-scroll"><div class="focus-room"><div class="sizer"><div class="screen"></div><div class="marks"></div></div></div></div>
        </div>`);
      stage.parentElement.insertBefore(node, panel);
      node.querySelector(".back").addEventListener("click", closeFocus);
      node.querySelector(".prev").addEventListener("click", () => step(-1));
      node.querySelector(".next").addEventListener("click", () => step(1));
      node.querySelector(".marks").addEventListener("click", (e) => {
        const pin = e.target.closest(".pin");
        if (pin) show(pin.dataset.thread);
      });
      new ResizeObserver(() => layoutFocus()).observe(node.querySelector(".focus-scroll"));
    }
    node.querySelector(".name").textContent = b.title || b.file;
    node.querySelector(".file").textContent = b.title ? b.file : "";
    const many = state.design.boards.filter((x) => x.exists).length > 1;
    node.querySelector(".prev").disabled = !many;
    node.querySelector(".next").disabled = !many;
    const screen = node.querySelector(".screen");
    const src = `${fileUrl(id, b.file)}?r=${b.rev}-${state.design.assets}`;
    if (again || screen.dataset.src !== src) {
      screen.innerHTML = `<iframe sandbox="allow-scripts" title="${esc(boardName(b))}"></iframe>`;
      screen.firstElementChild.src = src;
      screen.dataset.src = src;
    }
    layoutFocus();
    renderMarks();
    setPicking(state.picking);
  }

  /** The board alone at its own width (smaller when the window is narrower), as tall as what it holds. */
  function layoutFocus() {
    const node = page.querySelector(".focus");
    const b = boardOf(state.focus);
    if (!node || !b) return;
    const room = node.querySelector(".focus-room");
    const sizer = node.querySelector(".sizer");
    const screen = node.querySelector(".screen");
    const avail = node.querySelector(".focus-scroll").clientWidth - 48;
    const s = clamp(avail / b.w, 0.1, 1);
    const h = Math.max(b.h, state.sizes[b.file]?.h ?? 0);
    screen.style.width = b.w + "px";
    screen.style.height = h + "px";
    sizer.style.width = b.w + "px";
    sizer.style.transform = `scale(${s})`;
    sizer.style.setProperty("--inv", String(1 / s));
    room.style.width = b.w * s + "px";
    room.style.height = h * s + "px";
  }

  // -- presenting: one board at a time, full window, its links lead on --

  const existing = () => state.design.boards.filter((b) => b.exists).map((b) => b.file);

  function openPresent(file) {
    const start = boardOf(file)?.exists ? file : existing()[0];
    if (!start) return;
    if (state.picking) setPicking(false);
    state.present = { file: null, trail: [], start };
    const node = el(`
      <div class="present">
        <div class="present-bar">
          <button class="exit">${esc(t("Exit"))}<kbd>Esc</kbd></button>
          <span class="grow"></span>
          <b class="name"></b><span class="count"></span>
          <span class="grow"></span>
          <button class="restart">${esc(t("Restart"))}<kbd>R</kbd></button>
        </div>
        <div class="present-stage"><div class="device"></div></div>
        <div class="present-tip">${esc(t("Click anywhere to see what leads to another board. ← → for the others."))}</div>
      </div>`);
    page.append(node);
    node.querySelector(".exit").addEventListener("click", closePresent);
    node.querySelector(".restart").addEventListener("click", () => presentGo(state.present.start, false, true));
    new ResizeObserver(layoutPresent).observe(node.querySelector(".present-stage"));
    setTimeout(() => node.querySelector(".present-tip")?.classList.add("gone"), 4000);
    const url = new URL(location.href);
    url.searchParams.set("present", start);
    history.replaceState(null, "", url);
    presentGo(start, false, true);
  }

  function closePresent() {
    if (!state.present) return;
    state.present = null;
    page.querySelector(".present")?.remove();
    const url = new URL(location.href);
    url.searchParams.delete("present");
    history.replaceState(null, "", url);
  }

  /** Shows a board. `remember`: on the way (Backspace goes back to the one before); `fresh`: the way starts again. */
  function presentGo(file, remember, fresh = false) {
    const p = state.present;
    const b = boardOf(file);
    if (!p || !b?.exists) return;
    if (fresh) p.trail = [];
    else if (remember && p.file && p.file !== file) p.trail.push(p.file);
    p.file = file;
    const node = page.querySelector(".present");
    const files = existing();
    node.querySelector(".name").textContent = boardName(b);
    node.querySelector(".count").textContent = `${files.indexOf(file) + 1} / ${files.length}`;
    const url = new URL(location.href);
    url.searchParams.set("present", file);
    history.replaceState(null, "", url);
    const device = node.querySelector(".device");
    // The new board fades in over the old one; the old one goes when it is in.
    const frame = el(`<iframe sandbox="allow-scripts" title="${esc(boardName(b))}"></iframe>`);
    frame.dataset.file = file;
    frame.dataset.rev = `${b.rev}-${state.design.assets}`;
    frame.addEventListener("load", () => {
      frame.classList.add("in");
      setTimeout(() => {
        for (const old of device.querySelectorAll("iframe")) if (old !== frame && device.lastElementChild === frame) old.remove();
      }, 220);
    });
    frame.src = `${fileUrl(id, file)}?r=${frame.dataset.rev}`;
    device.append(frame);
    layoutPresent();
  }

  /** The board at its own size, smaller when the window is: it scrolls inside, as on the device. */
  function layoutPresent() {
    const node = page.querySelector(".present");
    const b = boardOf(state.present?.file);
    if (!node || !b) return;
    const room = node.querySelector(".present-stage");
    const s = clamp(Math.min((room.clientWidth - 48) / b.w, (room.clientHeight - 72) / b.h), 0.1, 1);
    const device = node.querySelector(".device");
    device.style.width = b.w * s + "px";
    device.style.height = b.h * s + "px";
    device.style.setProperty("--s", String(s));
    device.style.setProperty("--w", b.w + "px");
    device.style.setProperty("--h", b.h + "px");
  }

  function presentKey(e) {
    const p = state.present;
    const files = existing();
    const at = files.indexOf(p.file);
    if (e.key === "Escape") closePresent();
    else if (e.key === "ArrowRight" && at < files.length - 1) presentGo(files[at + 1], true);
    else if (e.key === "ArrowLeft" && at > 0) presentGo(files[at - 1], true);
    else if (e.key === "Backspace" && p.trail.length) presentGo(p.trail.pop(), false);
    else if (e.key === "r" || e.key === "R") presentGo(p.start, false, true);
    else return;
    e.preventDefault();
  }

  // -- taking a comment on a board --

  function iframes() {
    return [...page.querySelectorAll(".screen iframe, .device iframe")];
  }
  function setPicking(on) {
    state.picking = on;
    stage.classList.toggle("picking", on && !state.focus);
    page.querySelector(".focus")?.classList.toggle("picking", on);
    for (const f of iframes()) f.contentWindow?.postMessage({ tome: 1, type: "pick", on }, "*");
    hint.hidden = !on;
    hint.textContent = t("Click an element, or drag over an area. Esc to stop.");
    if (state.focus) {
      // The hint shows over the board alone too.
      const focus = page.querySelector(".focus");
      if (on) focus.append(hint);
      else stage.append(hint);
    } else stage.append(hint);
    renderBar();
  }

  /** The board an iframe shows, from the message's source. */
  function fileOfSource(source) {
    const frame = iframes().find((f) => f.contentWindow === source);
    if (!frame) return null;
    if (frame.closest(".present")) return frame.dataset.file ?? null;
    if (frame.closest(".focus")) return state.focus;
    return frame.closest(".frame")?.dataset.file ?? null;
  }

  addEventListener("message", (e) => {
    const m = e.data;
    if (!m || m.tome !== 1) return;
    const file = fileOfSource(e.source);
    if (!file) return;
    if (m.type === "ready") {
      if (state.present) e.source.postMessage({ tome: 1, type: "hints", on: true }, "*");
      else if (state.picking) e.source.postMessage({ tome: 1, type: "pick", on: true }, "*");
    } else if (m.type === "go" && typeof m.file === "string") {
      // A link to another board: that board, where the link was clicked.
      if (!boardOf(m.file)?.exists) return;
      if (state.present) presentGo(m.file, true);
      else if (state.focus === file) openFocus(m.file);
    } else if (m.type === "size" && Number.isFinite(m.h)) {
      state.sizes[file] = { w: m.w, h: m.h };
      if (state.focus === file) layoutFocus();
    } else if ((m.type === "pick" || m.type === "area") && state.picking && Array.isArray(m.rect)) {
      state.draft = { board: file, rect: m.rect, element: m.type === "pick" ? m.element : null, elements: m.type === "area" ? (m.elements ?? []) : [] };
      state.active = null;
      setPicking(false);
      page.classList.add("panel-open");
      renderMarks();
      renderPanel();
      panel.querySelector('.composer[data-key="new"] textarea')?.focus();
    } else if (m.type === "key") key({ key: m.key, preventDefault() {}, target: document.body });
  });

  // -- the panel --

  /** What a place is, in words: the board, then the element or the area. */
  function aboutHtml(a) {
    const b = boardOf(a.board);
    const name = `<b>${esc(boardName(b) || a.board)}</b>`;
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
        : composer("new", t("Ask about this design, or say what to change."))) +
      `</div>` +
      (threads.length === 0 ? `<p class="dim empty">${esc(t("No comments yet. Press Comment, then click a board."))}</p>` : "") +
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
            (x.anchor ? "" : `<span class="dim">${esc(t("Whole design"))}</span>`) +
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

  /** Shows a thread, and brings its place into view. */
  function show(threadId) {
    state.active = threadId;
    page.classList.add("panel-open");
    const x = state.threads.find((th) => th.id === threadId);
    const a = x?.anchor;
    const b = a ? boardOf(a.board) : null;
    if (b) {
      if (state.focus && state.focus !== b.file) openFocus(b.file);
      if (state.focus) {
        const scroller = page.querySelector(".focus-scroll");
        const s = clamp((scroller.clientWidth - 48) / b.w, 0.1, 1);
        scroller.scrollTo({ top: Math.max(0, a.rect[1] * s - scroller.clientHeight / 3), behavior: "smooth" });
      } else reveal(b, a.rect);
    }
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
    renderWorld();
    renderBar();
  });
  toggle.addEventListener("click", () => page.classList.toggle("panel-open"));
  pickButton.addEventListener("click", () => setPicking(!state.picking));
  page.querySelector(".present-button").addEventListener("click", () => openPresent(state.focus ?? state.selected));
  zoomButton.addEventListener("click", fit);
  page.querySelector(".in").addEventListener("click", () => zoomMid(1.25));
  page.querySelector(".out").addEventListener("click", () => zoomMid(0.8));
  page.querySelector(".path").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    try {
      await navigator.clipboard.writeText(state.design.root);
      b.dataset.copied = "1";
      b.textContent = t("Copied");
      setTimeout(() => {
        delete b.dataset.copied;
        b.textContent = state.design.root;
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
      return openPresent(state.focus ?? state.selected);
    }
    if (e.key === "Escape") {
      if (state.picking) setPicking(false);
      else if (state.draft) {
        state.draft = null;
        renderMarks();
        renderPanel();
      } else if (state.focus) closeFocus();
      return;
    }
    if (e.key === "c" || e.key === "C") setPicking(!state.picking);
    else if (state.focus && e.key === "ArrowLeft") step(-1);
    else if (state.focus && e.key === "ArrowRight") step(1);
    else if (!state.focus && (e.key === "f" || e.key === "F")) fit();
    else if (!state.focus && e.key === "0") {
      const r = stage.getBoundingClientRect();
      zoomAt(1 / state.view.s, r.width / 2, r.height / 2);
    } else if (!state.focus && e.key === "Enter" && state.selected) openFocus(state.selected);
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
      renderBar();
    } catch {
      // The server is away for a moment: what was last read stays.
    }
  }

  renderBar();
  renderWorld();
  renderPanel();
  // The panel first: the canvas fits into what is left beside it.
  if (innerWidth >= 1100) page.classList.add("panel-open");
  fit();
  const asked = new URL(location.href).searchParams.get("b");
  if (asked && boardOf(asked)?.exists) openFocus(asked);
  const presented = new URL(location.href).searchParams.get("present");
  if (presented !== null) openPresent(presented);
  await loadComments();
  setInterval(() => document.visibilityState === "visible" && loadComments(), 1500);
  addEventListener("resize", () => !state.focus && applyView());

  // Follows the design: boards something rewrote show at once, marked.
  for (;;) {
    try {
      const r = await api.wait(id, state.design.rev);
      if (r.rev === null) {
        root.innerHTML = `<div class="center"><div>${esc(t("This design was removed."))}</div><a href="/">${esc(t("All designs"))}</a></div>`;
        return;
      }
      if (r.rev === state.design.rev) continue;
      const before = new Map(state.design.boards.map((b) => [b.file, b]));
      const hadBoards = state.design.boards.length > 0;
      state.design = r;
      for (const b of r.boards) {
        const old = before.get(b.file);
        if (!old || old.rev !== b.rev || old.x !== b.x || old.y !== b.y || old.w !== b.w || old.h !== b.h) state.changed.add(b.file);
      }
      for (const f of [...state.changed]) if (!boardOf(f)) state.changed.delete(f);
      if (state.draft && !boardOf(state.draft.board)) state.draft = null;
      renderWorld();
      renderBar();
      renderPanel();
      if (!hadBoards && r.boards.length) fit();
      if (state.focus) renderFocus(false);
      if (state.present) {
        const shown = page.querySelector(".present .device iframe:last-child");
        const b = boardOf(state.present.file);
        if (!b?.exists) closePresent();
        else if (shown?.dataset.rev !== `${b.rev}-${r.assets}`) presentGo(b.file, false);
      }
    } catch {
      await sleep(2000);
    }
  }
}

const m = location.pathname.match(/^\/d\/([0-9a-f]{16})\/?$/);
if (m) showDesign(m[1]);
else showList();
