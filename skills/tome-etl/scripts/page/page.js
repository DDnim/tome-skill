// The page: `/` lists the opened projects, `/p/<id>` shows one. On the left
// its models, sources, seeds, snapshots and plans (or what `review` found);
// in the middle the graph of who reads whom, whole when it is small, else
// the chosen model with a few levels around it; under it the chosen model:
// its files, columns, tests with their last result, and its SQL. On the
// right the comments, on a model or one of its columns, which an agent
// answers. It reads what dbt wrote and follows it: a new `dbt parse` shows.

// ---- words ----

const zh = {
  "Projects": "项目",
  "No project is open. An agent opens one with the tome-etl skill.": "还没有打开的项目。让 agent 用 tome-etl skill 打开一个。",
  "{n} models": "{n} 个模型",
  "{n} planned": "{n} 个计划中",
  "{n} to review": "{n} 处待检视",
  "{n} open comments": "{n} 条未解决的评论",
  "not parsed yet": "还没 parse",
  "All projects": "全部项目",
  "This project was removed.": "这个项目被移除了。",
  "The project could not be opened.": "项目打不开。",
  "parsed {when}": "{when} parse",
  "Files changed since: run parse": "之后文件有改动：重新 parse",
  "{n} problems in tome-etl.json": "tome-etl.json 里有 {n} 个问题",
  "Comments": "评论",
  "Models": "模型",
  "Review": "检视",
  "Search": "搜索",
  "All folders": "全部目录",
  "All tags": "全部 tag",
  "Nothing matches.": "没有符合的。",
  "{n} more: narrow the search": "还有 {n} 个：缩小搜索范围",
  "Nothing to review.": "没有要检视的。",
  "Whole project": "整个项目",
  "Around the selected": "选中的上下游",
  "Reads": "上游",
  "Read by": "下游",
  "all": "全部",
  "Planned": "计划中",
  "Passing": "通过",
  "Failing": "失败",
  "To review": "待检视",
  "No manifest yet. Run dbt parse in the project (the agent: parse).": "还没有 manifest。在项目里跑 dbt parse（agent：parse）。",
  "target/manifest.json could not be read. Run dbt parse again.": "target/manifest.json 读不了。重新跑 dbt parse。",
  "{n} models here: too many to draw at once. Pick one on the left, or a folder.": "这里有 {n} 个模型，一次画不下。在左边选一个，或者选一个目录。",
  "Nothing to draw.": "没有可画的。",
  "more beyond": "外面还有",
  "Only the nearest {n} are drawn.": "只画了最近的 {n} 个。",
  "not written yet": "还没写",
  "not found": "找不到",
  "no tests": "没有测试",
  "{n} tests": "{n} 个测试",
  "{n} failing": "{n} 个失败",
  "{n} warn": "{n} 个警告",
  "Select a model.": "点一个模型。",
  "Comment": "评论",
  "Comment on this column": "评论这一列",
  "File": "文件",
  "Properties": "属性文件",
  "Relation": "表",
  "Key": "主键",
  "from a constraint": "来自约束",
  "from unique_key": "来自 unique_key",
  "from its tests": "来自测试",
  "planned": "计划",
  "Tags": "Tag",
  "Last run": "最近一次运行",
  "{n} rows": "{n} 行",
  "Size": "大小",
  "One row": "一行是",
  "Watermark": "水位列",
  "Freshness": "新鲜度",
  "warn after {a}": "超过 {a} 警告",
  "error after {a}": "超过 {a} 报错",
  "not set": "没设",
  "newest row {when}": "最新一行 {when}",
  "Settings": "配置",
  "Note": "备注",
  "Package": "包",
  "(none)": "（无）",
  "Columns": "列",
  "Type": "类型",
  "Description": "说明",
  "Tests": "测试",
  "No columns are described.": "没有写列的说明。",
  "in the warehouse, not described": "库里有，没写说明",
  "SQL": "SQL",
  "Compiled": "编译后",
  "No SQL.": "没有 SQL。",
  "Not written yet. The agent writes {file} from this plan (scaffold).": "还没写。agent 会按这个计划生成 {file}（scaffold）。",
  "Written: this plan can be taken out of tome-etl.json.": "已经写出来了：可以从 tome-etl.json 里去掉这个计划。",
  "Not compiled: dbt compile writes it.": "还没编译：dbt compile 之后才有。",
  "No tests.": "没有测试。",
  "not run": "没跑过",
  "whole model": "整个模型",
  "No tests at all": "完全没有测试",
  "No test of its key": "没有主键测试",
  "Key not tested": "主键没测全",
  "Unique but may be null": "unique 但可能为空",
  "No description": "没有说明",
  "Incremental without a unique key": "增量模型没有 unique_key",
  "Source without freshness": "来源没有 freshness",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent 在等评论。发给它时，之前加的注释会一起发出去。",
  "No agent is listening. Notes are saved for it to read.": "没有 Agent 在等。注释会存下来，等它来读。",
  "Ask about this project, or say what to change.": "对这个项目提问，或者说要怎么改。",
  "What about this model? Ask, or say what to change.": "这个模型怎么了？提问，或者说要怎么改。",
  "Send to Agent": "发给 Agent",
  "Add note": "添加注释",
  "Note, not sent": "注释，还没发",
  "Reply": "回复",
  "Resolve": "解决",
  "Sent to Agent": "已发给 Agent",
  "Agent": "Agent",
  "You": "你",
  "Whole project, not one model": "整个项目",
  "Drop this place": "不针对这里",
  "No comments yet. Select a model and press Comment.": "还没有评论。选一个模型，按「评论」。",
};
const ja = {
  "Projects": "プロジェクト",
  "No project is open. An agent opens one with the tome-etl skill.": "開いているプロジェクトはありません。agent が tome-etl skill で開きます。",
  "{n} models": "モデル {n} 個",
  "{n} planned": "計画中 {n} 個",
  "{n} to review": "要確認 {n} 件",
  "{n} open comments": "未解決のコメント {n} 件",
  "not parsed yet": "まだ parse していません",
  "All projects": "すべてのプロジェクト",
  "This project was removed.": "このプロジェクトは一覧から外されました。",
  "The project could not be opened.": "プロジェクトを開けません。",
  "parsed {when}": "{when} に parse",
  "Files changed since: run parse": "その後ファイルが変わっています：parse し直す",
  "{n} problems in tome-etl.json": "tome-etl.json に問題が {n} 件",
  "Comments": "コメント",
  "Models": "モデル",
  "Review": "レビュー",
  "Search": "検索",
  "All folders": "すべてのフォルダ",
  "All tags": "すべてのタグ",
  "Nothing matches.": "該当なし。",
  "{n} more: narrow the search": "あと {n} 個：検索を絞ってください",
  "Nothing to review.": "確認するものはありません。",
  "Whole project": "プロジェクト全体",
  "Around the selected": "選んだモデルの前後",
  "Reads": "上流",
  "Read by": "下流",
  "all": "すべて",
  "Planned": "計画中",
  "Passing": "成功",
  "Failing": "失敗",
  "To review": "要確認",
  "No manifest yet. Run dbt parse in the project (the agent: parse).": "manifest がまだありません。プロジェクトで dbt parse を実行します（agent：parse）。",
  "target/manifest.json could not be read. Run dbt parse again.": "target/manifest.json を読めません。dbt parse をやり直してください。",
  "{n} models here: too many to draw at once. Pick one on the left, or a folder.": "ここにはモデルが {n} 個あり、一度に描けません。左で 1 つ選ぶか、フォルダを選んでください。",
  "Nothing to draw.": "描くものがありません。",
  "more beyond": "この先にもあります",
  "Only the nearest {n} are drawn.": "近い {n} 個だけ描いています。",
  "not written yet": "未作成",
  "not found": "見つかりません",
  "no tests": "テストなし",
  "{n} tests": "テスト {n} 個",
  "{n} failing": "失敗 {n} 個",
  "{n} warn": "警告 {n} 個",
  "Select a model.": "モデルを選んでください。",
  "Comment": "コメント",
  "Comment on this column": "この列にコメント",
  "File": "ファイル",
  "Properties": "プロパティファイル",
  "Relation": "テーブル",
  "Key": "キー",
  "from a constraint": "制約から",
  "from unique_key": "unique_key から",
  "from its tests": "テストから",
  "planned": "計画",
  "Tags": "タグ",
  "Last run": "直近の実行",
  "{n} rows": "{n} 行",
  "Size": "サイズ",
  "One row": "1 行は",
  "Watermark": "ウォーターマーク列",
  "Freshness": "鮮度",
  "warn after {a}": "{a} を超えたら警告",
  "error after {a}": "{a} を超えたらエラー",
  "not set": "未設定",
  "newest row {when}": "最新の行 {when}",
  "Settings": "設定",
  "Note": "メモ",
  "Package": "パッケージ",
  "(none)": "（なし）",
  "Columns": "列",
  "Type": "型",
  "Description": "説明",
  "Tests": "テスト",
  "No columns are described.": "列の説明がありません。",
  "in the warehouse, not described": "DB にはあるが説明なし",
  "SQL": "SQL",
  "Compiled": "コンパイル後",
  "No SQL.": "SQL はありません。",
  "Not written yet. The agent writes {file} from this plan (scaffold).": "未作成です。agent がこの計画から {file} を作ります（scaffold）。",
  "Written: this plan can be taken out of tome-etl.json.": "作成済み：この計画は tome-etl.json から外せます。",
  "Not compiled: dbt compile writes it.": "未コンパイル：dbt compile で作られます。",
  "No tests.": "テストはありません。",
  "not run": "未実行",
  "whole model": "モデル全体",
  "No tests at all": "テストが 1 つもない",
  "No test of its key": "キーのテストがない",
  "Key not tested": "キーのテストが足りない",
  "Unique but may be null": "unique だが null があり得る",
  "No description": "説明がない",
  "Incremental without a unique key": "増分モデルに unique_key がない",
  "Source without freshness": "ソースに freshness がない",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent がコメントを待っています。送ると、それまでのメモも一緒に送られます。",
  "No agent is listening. Notes are saved for it to read.": "待っている Agent はいません。メモは保存され、あとで読まれます。",
  "Ask about this project, or say what to change.": "このプロジェクトについて質問するか、直したい点を書いてください。",
  "What about this model? Ask, or say what to change.": "このモデルについて質問するか、直したい点を書いてください。",
  "Send to Agent": "Agent に送る",
  "Add note": "メモを追加",
  "Note, not sent": "メモ（未送信）",
  "Reply": "返信",
  "Resolve": "解決",
  "Sent to Agent": "Agent に送信済み",
  "Agent": "Agent",
  "You": "あなた",
  "Whole project, not one model": "プロジェクト全体",
  "Drop this place": "ここに限らない",
  "No comments yet. Select a model and press Comment.": "コメントはまだありません。モデルを選んで「コメント」を押します。",
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

const WRITE = { "content-type": "application/json", "x-tome-etl": "1" };
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
const q = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined)).toString();
const api = {
  projects: () => call("/api/projects"),
  project: (id, rev) => call("/api/project?" + q({ id, rev })),
  graph: (id, params) => call("/api/graph?" + q({ id, ...params })),
  node: (id, node) => call("/api/node?" + q({ id, node })),
  comments: (id) => call("/api/comments?" + q({ id })),
  comment: (id, body) => call("/api/comments?" + q({ id }), { method: "POST", headers: WRITE, body: JSON.stringify(body) }),
};

// ---- small things ----

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const root = document.getElementById("root");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const gone = (text) => (root.innerHTML = `<div class="center"><div>${esc(text)}</div><a href="/">${esc(t("All projects"))}</a></div>`);
const pad = (n) => String(n).padStart(2, "0");
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const bytes = (n) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const count = (n) => Number(n).toLocaleString("en-US");
const FAILED = ["fail", "error", "runtime error"];
const PASSED = ["pass", "success"];

/** A finding's rule in the reader's words. */
const ruleText = (rule) =>
  ({
    "no-tests": t("No tests at all"),
    "no-key-test": t("No test of its key"),
    "key-not-tested": t("Key not tested"),
    "unique-without-not-null": t("Unique but may be null"),
    "no-description": t("No description"),
    "incremental-no-unique-key": t("Incremental without a unique key"),
    "source-no-freshness": t("Source without freshness"),
  })[rule] ?? rule;

/** What a node is, as the small label on it: a model's materialization, or its type. */
const chip = (n) => (n.type === "plan" ? (n.plan === "source" ? "source" : n.materialized ?? "model") : n.type === "unknown" ? "?" : n.materialized ?? n.type);

/** A node's state as its box and its list row show it: {cls, text}. */
function stateOf(n) {
  if (n.type === "plan") return { cls: "plan", text: t("not written yet") };
  if (n.type === "unknown") return { cls: "unknown", text: t("not found") };
  if (n.failing || FAILED.includes(n.status)) return { cls: "failed", text: n.failing ? t("{n} failing", { n: n.failing }) : n.status };
  const tests = n.tests ? t("{n} tests", { n: n.tests }) : n.type === "model" || n.type === "snapshot" ? t("no tests") : "";
  if (n.warned) return { cls: "warn", text: t("{n} warn", { n: n.warned }) };
  if (PASSED.includes(n.status)) return { cls: "ok", text: tests || n.status };
  return { cls: "", text: tests };
}

/** SQL with its Jinja and its comments marked. */
function sqlHtml(text) {
  return esc(text).replace(/(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\})|(--[^\n]*)/g, (m, jinja, note) => (jinja ? `<span class="jinja">${jinja}</span>` : `<span class="note">${note}</span>`));
}

// ---- the list ----

async function showList() {
  document.title = t("Projects");
  let list;
  try {
    list = (await api.projects()).projects;
  } catch {
    return gone(t("The project could not be opened."));
  }
  root.innerHTML = `<div class="list"><h1>${esc(t("Projects"))}</h1>${
    list.length
      ? list
          .map(
            (p) =>
              `<a class="list-row" href="/p/${p.id}"><b>${esc(p.title)}</b><span class="mono dim">${esc(p.root)}</span><span class="dim small">${esc(p.missing ? t("not parsed yet") : t("{n} models", { n: p.models }))}${p.plans ? ` · ${esc(t("{n} planned", { n: p.plans }))}` : ""}${p.findings ? ` · ${esc(t("{n} to review", { n: p.findings }))}` : ""}${p.open ? ` · <span class="count">${esc(t("{n} open comments", { n: p.open }))}</span>` : ""}</span></a>`,
          )
          .join("")
      : `<p class="dim">${esc(t("No project is open. An agent opens one with the tome-etl skill."))}</p>`
  }</div>`;
}

// ---- one project ----

const COL = 244;
const ROW = 78;
const NODE_W = 192;
const NODE_H = 60;
const LANE = 20;
const LIST_MAX = 400;

function graphHtml(g, sel, lit) {
  const cols = Math.max(...g.nodes.map((s) => s.at[0])) + 1;
  const lanes = g.lanes ?? {};
  const rows = Math.max(...g.nodes.map((s) => s.at[1]), ...Object.values(lanes).flat().map((c) => c[1])) + 1;
  // a row with a box is a box tall; a row that only lines pass through is thin
  const boxRow = new Set(g.nodes.map((s) => s.at[1]));
  const top = [0];
  for (let r = 0; r < rows; r++) top.push(top[r] + (boxRow.has(r) ? ROW : LANE));
  const mid = (r) => top[r] + (boxRow.has(r) ? NODE_H / 2 : (LANE - 8) / 2);
  const w = (cols - 1) * COL + NODE_W;
  const h = top[rows] - (boxRow.has(rows - 1) ? ROW - NODE_H : 8);
  const pos = Object.fromEntries(g.nodes.map((s) => [s.id, [s.at[0] * COL, top[s.at[1]]]]));
  const lines = [];
  for (const s of g.nodes) {
    for (const n of s.deps) {
      if (!pos[n] || n === s.id) continue;
      const via = [];
      for (const [c, r] of lanes[`${n}>${s.id}`] ?? []) via.push([c * COL, mid(r)], [c * COL + NODE_W, mid(r)]);
      lines.push({ from: n, to: s.id, via, on: lit ? lit.has(n) && lit.has(s.id) : false });
    }
  }
  // the lines that leave or enter one box spread along its side, in the order of where they go or come from
  const port = (key, side, aim) => {
    const group = new Map();
    for (const l of lines) (group.get(l[key]) ?? group.set(l[key], []).get(l[key])).push(l);
    for (const [id, list] of group) {
      list.sort((a, b) => aim(a) - aim(b));
      const gap = list.length > 1 ? Math.min(10, (NODE_H - 24) / (list.length - 1)) : 0;
      list.forEach((l, i) => (l[side] = pos[id][1] + NODE_H / 2 + (i - (list.length - 1) / 2) * gap));
    }
  };
  const yOf = (id) => pos[id][1];
  port("from", "y1", (l) => (l.via.length ? l.via[0][1] : yOf(l.to)));
  port("to", "y2", (l) => (l.via.length ? l.via.at(-1)[1] : yOf(l.from)));
  const edges = lines.map((l) => {
    const pts = [[pos[l.from][0] + NODE_W, l.y1], ...l.via, [pos[l.to][0] - 3, l.y2]];
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [[x1, y1], [x2, y2]] = [pts[i - 1], pts[i]];
      const k = (x2 - x1) / 2;
      d += i % 2 === 0 ? ` L${x2} ${y2}` : ` C${x1 + k} ${y1} ${x2 - k} ${y2} ${x2} ${y2}`;
    }
    return `<path class="${l.on ? "on" : lit ? "off" : ""}" d="${d}" marker-end="url(#ah${l.on ? "on" : ""})"/>`;
  });
  const nodes = g.nodes
    .map((s) => {
      const st = stateOf(s);
      const cls = ["node", st.cls, s.type, s.id === sel ? "sel" : "", lit && !lit.has(s.id) ? "faint" : "", s.own === false ? "pkg" : ""].filter(Boolean).join(" ");
      const more = (side, on) => (on ? `<i class="more ${side}" title="${esc(t("more beyond"))}"></i>` : "");
      return `<button class="${cls}" data-node="${esc(s.id)}" style="left:${pos[s.id][0]}px;top:${pos[s.id][1]}px" title="${esc(s.name)}">${more("up", s.moreUp)}${more("down", s.moreDown)}<span class="k ${esc(s.type)}">${esc(chip(s))}</span>${s.findings ? `<span class="flag" title="${esc(t("{n} to review", { n: s.findings }))}">${s.findings}</span>` : ""}<div class="t">${esc(s.name)}</div><div class="s">${esc(st.text)}</div></button>`;
    })
    .join("");
  const marker = (id, color) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill:${color};stroke:none"/></marker>`;
  return `<div class="graph" style="width:${w}px;height:${h}px"><svg width="${w}" height="${h}" aria-hidden="true"><defs>${marker("ah", "var(--edge)")}${marker("ahon", "var(--sel)")}</defs>${edges.join("")}</svg>${nodes}</div>`;
}

/** The ids on the way into and out of `id` in a drawn graph. */
function lineage(g, id) {
  if (!g.nodes.some((n) => n.id === id)) return null;
  const lit = new Set([id]);
  const deps = new Map(g.nodes.map((n) => [n.id, n.deps]));
  const kids = new Map(g.nodes.map((n) => [n.id, []]));
  for (const n of g.nodes) for (const d of n.deps) kids.get(d)?.push(n.id);
  for (const next of [deps, kids]) {
    const todo = [id];
    while (todo.length) for (const n of next.get(todo.pop()) ?? []) if (!lit.has(n)) lit.add(n), todo.push(n);
  }
  return lit;
}

async function showProject(id) {
  let p;
  try {
    p = await api.project(id, null);
  } catch (e) {
    return gone(e.code === "NotFound" ? t("This project was removed.") : t("The project could not be opened."));
  }
  const asked = new URLSearchParams(location.search).get("node");
  const state = {
    sel: asked && p.nodes.some((n) => n.id === asked) ? asked : null,
    mode: p.nodes.length > p.maxDraw || asked ? "focus" : "all",
    up: 2,
    down: 2,
    folder: "",
    tag: "",
    q: "",
    side: "models",
    tab: "sql",
    graph: null,
    graphKey: "",
    node: null,
    nodeKey: "",
    threads: [],
    listening: false,
    seen: "",
    active: null,
    draft: null, // the place of the comment being written: {node, name, column} or null (the whole project)
    texts: {},
  };

  root.innerHTML = `<div class="etl">
    <header class="bar"><a href="/" aria-label="${esc(t("All projects"))}">←</a><span class="name"></span><span class="path mono"></span><span class="meta dim"></span><span class="stale"></span><span class="grow"></span><span class="warn"></span><button class="toggle"></button></header>
    <div class="body">
      <aside class="side">
        <div class="tabs side-tabs"><button data-side="models"></button><button data-side="review"></button></div>
        <div class="filters"><input class="search" type="search" placeholder="${esc(t("Search"))}" aria-label="${esc(t("Search"))}"><select class="folder" aria-label="${esc(t("All folders"))}"></select><select class="tag" aria-label="${esc(t("All tags"))}"></select></div>
        <div class="rows"></div>
      </aside>
      <main class="main">
        <div class="tools">
          <div class="seg mode"><button data-mode="all">${esc(t("Whole project"))}</button><button data-mode="focus">${esc(t("Around the selected"))}</button></div>
          <div class="depth"><span class="dim">${esc(t("Reads"))}</span><div class="seg up">${[1, 2, 3, "all"].map((n) => `<button data-up="${n}">${n === "all" ? esc(t("all")) : n}</button>`).join("")}</div><span class="dim">${esc(t("Read by"))}</span><div class="seg down">${[1, 2, 3, "all"].map((n) => `<button data-down="${n}">${n === "all" ? esc(t("all")) : n}</button>`).join("")}</div></div>
          <span class="grow"></span>
          <div class="legend"><span class="plan">${esc(t("Planned"))}</span><span class="ok">${esc(t("Passing"))}</span><span class="failed">${esc(t("Failing"))}</span><span class="flagged">${esc(t("To review"))}</span></div>
        </div>
        <div class="graph-wrap"></div>
        <div class="lower"><section class="pane left"></section><section class="pane right"></section></div>
      </main>
      <aside class="panel"></aside>
    </div>
  </div>`;
  const page = root.querySelector(".etl");
  const $ = (s) => root.querySelector(s);
  const panel = $(".panel");
  const byId = () => new Map(p.nodes.map((n) => [n.id, n]));
  const openThreads = () => state.threads.filter((x) => !x.resolved);

  // -- the bar and the side --

  function renderBar() {
    document.title = p.project;
    $(".name").textContent = p.project;
    $(".path").textContent = p.root;
    $(".meta").textContent = p.missing ? "" : [p.tool.version ? `${p.tool.name} ${p.tool.version}` : p.tool.name, p.tool.adapter, p.parsedAt ? t("parsed {when}", { when: when(p.parsedAt) }) : ""].filter(Boolean).join(" · ");
    $(".stale").textContent = p.stale ? t("Files changed since: run parse") : "";
    $(".stale").title = (p.changed ?? []).join("\n");
    $(".warn").textContent = p.problems.length ? t("{n} problems in tome-etl.json", { n: p.problems.length }) : "";
    $(".warn").title = p.problems.join("\n");
    const n = openThreads().length;
    $(".toggle").innerHTML = `${esc(t("Comments"))}${n ? ` ${n}` : ""}${state.listening ? '<em class="listening"></em>' : ""}`;
    for (const b of root.querySelectorAll(".side-tabs button")) {
      b.classList.toggle("on", b.dataset.side === state.side);
      b.textContent = b.dataset.side === "models" ? `${t("Models")} ${p.nodes.length}` : `${t("Review")} ${p.findings.length}`;
    }
  }

  function renderFilters() {
    const options = (list, all, chosen) => `<option value="">${esc(all)}</option>${list.map((x) => `<option value="${esc(x.name)}"${x.name === chosen ? " selected" : ""}>${esc(x.name)} (${x.n})</option>`).join("")}`;
    $(".folder").innerHTML = options(p.folders, t("All folders"), state.folder);
    $(".tag").innerHTML = options(p.tags, t("All tags"), state.tag);
    $(".tag").hidden = p.tags.length === 0;
    $(".filters").hidden = state.side !== "models";
  }

  const matches = (n) => {
    if (state.folder && n.folder !== state.folder && !n.folder.startsWith(state.folder + "/")) return false;
    if (state.tag && !(n.tags ?? []).includes(state.tag)) return false;
    return !state.q || n.name.toLowerCase().includes(state.q);
  };

  function renderRows() {
    const box = $(".rows");
    if (state.side === "review") {
      if (!p.findings.length) return void (box.innerHTML = `<p class="empty">${esc(t("Nothing to review."))}</p>`);
      const groups = new Map();
      for (const f of p.findings) (groups.get(f.rule) ?? groups.set(f.rule, []).get(f.rule)).push(f);
      box.innerHTML = [...groups]
        .map(([rule, list]) => `<h4>${esc(ruleText(rule))} <span class="dim">${list.length}</span></h4>${list.slice(0, LIST_MAX).map((f) => `<button class="row${f.node === state.sel ? " sel" : ""}" data-node="${esc(f.node)}" title="${esc(f.detail)}"><span class="t">${esc(f.name)}</span><span class="d">${esc(f.detail)}</span></button>`).join("")}`)
        .join("");
      return;
    }
    const list = p.nodes.filter(matches);
    if (!list.length) return void (box.innerHTML = `<p class="empty">${esc(t("Nothing matches."))}</p>`);
    let folder = null;
    let html = "";
    for (const n of list.slice(0, LIST_MAX)) {
      if (n.folder !== folder) html += `<h4 class="mono">${esc((folder = n.folder) || "·")}</h4>`;
      const st = stateOf(n);
      html += `<button class="row ${st.cls}${n.id === state.sel ? " sel" : ""}" data-node="${esc(n.id)}"><span class="k ${esc(n.type)}">${esc(chip(n))}</span><span class="t">${esc(n.name)}</span>${n.findings ? `<span class="flag">${n.findings}</span>` : ""}</button>`;
    }
    if (list.length > LIST_MAX) html += `<p class="empty">${esc(t("{n} more: narrow the search", { n: list.length - LIST_MAX }))}</p>`;
    box.innerHTML = html;
  }

  // -- the graph --

  async function loadGraph(force) {
    const focus = state.mode === "focus" ? state.sel : null;
    const params = focus ? { focus, up: state.up, down: state.down } : { folder: state.folder || null, tag: state.tag || null };
    const key = JSON.stringify([params, p.rev, state.mode]);
    if (key === state.graphKey && !force) return renderGraph();
    state.graphKey = key;
    if (state.mode === "focus" && !focus) state.graph = { pick: true };
    else {
      try {
        state.graph = await api.graph(id, params);
      } catch {
        state.graph = { nodes: [] };
      }
      if (key !== state.graphKey) return; // a newer one was asked meanwhile
    }
    renderGraph();
  }

  function renderGraph() {
    for (const b of root.querySelectorAll(".mode button")) b.classList.toggle("on", b.dataset.mode === state.mode);
    for (const b of root.querySelectorAll(".up button")) b.classList.toggle("on", b.dataset.up === String(state.up));
    for (const b of root.querySelectorAll(".down button")) b.classList.toggle("on", b.dataset.down === String(state.down));
    $(".depth").hidden = state.mode !== "focus";
    const wrap = $(".graph-wrap");
    const g = state.graph;
    const say = (text) => (wrap.innerHTML = `<p class="empty big">${esc(text)}</p>`);
    if (p.missing && !p.nodes.length) return say(p.unreadable ? t("target/manifest.json could not be read. Run dbt parse again.") : t("No manifest yet. Run dbt parse in the project (the agent: parse)."));
    if (!g) return;
    if (g.pick) return say(t("Select a model."));
    if (g.tooMany) return say(t("{n} models here: too many to draw at once. Pick one on the left, or a folder.", { n: g.tooMany }));
    if (!g.nodes?.length) return say(t("Nothing to draw."));
    const [sx, sy] = [wrap.scrollLeft, wrap.scrollTop];
    const lit = state.mode === "all" && state.sel ? lineage(g, state.sel) : null;
    wrap.innerHTML = graphHtml(g, state.sel, lit) + (g.cut?.trimmed ? `<p class="empty">${esc(t("Only the nearest {n} are drawn.", { n: g.nodes.length }))}</p>` : "");
    wrap.scrollLeft = sx;
    wrap.scrollTop = sy;
  }

  const reveal = () => $(".graph-wrap .node.sel")?.scrollIntoView({ block: "nearest", inline: "nearest" });

  // -- the chosen model --

  async function loadNode(force) {
    const key = JSON.stringify([state.sel, p.rev]);
    if (key === state.nodeKey && !force) return;
    state.nodeKey = key;
    if (!state.sel) state.node = null;
    else {
      try {
        state.node = await api.node(id, state.sel);
      } catch {
        state.node = null;
        state.sel = null;
      }
      if (key !== state.nodeKey) return;
    }
    renderNode();
  }

  const link = (x) => `<button class="ref" data-node="${esc(x.id)}">${esc(x.name)}</button>`;

  function renderNode() {
    const left = $(".left");
    const right = $(".right");
    const d = state.node;
    if (!d) {
      left.innerHTML = `<p class="empty">${esc(t("Select a model."))}</p>`;
      right.innerHTML = "";
      return;
    }
    const st = stateOf(d);
    const rows = [];
    if (d.pkg) rows.push([t("Package"), `<code>${esc(d.pkg)}</code>`]);
    if (d.path) rows.push([t("File"), `<code>${esc(d.path)}</code>`]);
    if (d.patch && d.patch !== d.path) rows.push([t("Properties"), `<code>${esc(d.patch)}</code>`]);
    if (d.relation) rows.push([t("Relation"), `<code>${esc(d.relation)}</code>`]);
    if (d.grain) rows.push([t("One row"), esc(d.grain)]);
    if (d.key) rows.push([t("Key"), `${d.key.columns.map((c) => `<code>${esc(c)}</code>`).join(" ")} <span class="dim">${esc({ constraint: t("from a constraint"), unique_key: t("from unique_key"), tests: t("from its tests"), plan: t("planned") }[d.key.from] ?? "")}</span>`]);
    if (d.watermark) rows.push([t("Watermark"), `<code>${esc(d.watermark)}</code>`]);
    if (d.freshness) {
      const f = d.freshness;
      const parts = [f.warn ? t("warn after {a}", { a: f.warn }) : null, f.error ? t("error after {a}", { a: f.error }) : null].filter(Boolean);
      rows.push([t("Freshness"), `${esc(parts.length ? parts.join(" · ") : t("not set"))}${f.loadedAt ? ` · <code>${esc(f.loadedAt)}</code>` : ""}${f.status ? ` · <span class="res ${esc(f.status)}">${esc(f.status)}</span>` : ""}${f.maxLoadedAt ? ` <span class="dim">${esc(t("newest row {when}", { when: when(f.maxLoadedAt) }))}</span>` : ""}`]);
    }
    if (d.tags?.length) rows.push([t("Tags"), d.tags.map((x) => `<code>${esc(x)}</code>`).join(" ")]);
    const settings = Object.entries(d.config ?? {});
    if (settings.length) rows.push([t("Settings"), settings.map(([k, v]) => `<code>${esc(k)}: ${esc(typeof v === "string" ? v : JSON.stringify(v))}</code>`).join(" ")]);
    rows.push([t("Reads"), d.reads.length ? d.reads.map(link).join(" ") : esc(t("(none)"))]);
    rows.push([t("Read by"), d.readBy.length ? d.readBy.map(link).join(" ") : esc(t("(none)"))]);
    if (d.result) rows.push([t("Last run"), `<span class="res ${esc(d.result.status)}">${esc(d.result.status)}</span>${d.result.seconds !== null ? ` · ${d.result.seconds}s` : ""}${d.result.rows !== null ? ` · ${esc(t("{n} rows", { n: count(d.result.rows) }))}` : ""}${d.result.at ? ` · <span class="dim">${esc(when(d.result.at))}</span>` : ""}${d.result.message && FAILED.includes(d.result.status) ? `<pre class="msg">${esc(d.result.message)}</pre>` : ""}`]);
    if (d.stats && (d.stats.rows !== null || d.stats.bytes !== null)) rows.push([t("Size"), [d.stats.rows !== null ? t("{n} rows", { n: count(d.stats.rows) }) : null, d.stats.bytes !== null ? bytes(d.stats.bytes) : null].filter(Boolean).map(esc).join(" · ")]);
    if (d.note) rows.push([t("Note"), esc(d.note)]);
    const hint = d.type === "plan" ? `<div class="hint">${esc(t("Not written yet. The agent writes {file} from this plan (scaffold).", { file: d.path }))}</div>` : d.planned ? `<div class="hint">${esc(t("Written: this plan can be taken out of tome-etl.json."))}</div>` : "";
    const review = d.review.length ? `<ul class="review">${d.review.map((f) => `<li><b>${esc(ruleText(f.rule))}</b> <span class="dim">${esc(f.detail)}</span></li>`).join("")}</ul>` : "";
    const cols = d.columns.length
      ? `<table class="cols"><thead><tr><th>${esc(t("Columns"))}</th><th>${esc(t("Type"))}</th><th>${esc(t("Tests"))}</th><th>${esc(t("Description"))}</th><th></th></tr></thead><tbody>${d.columns
          .map((c) => `<tr><td class="mono">${esc(c.name)}${d.key?.columns.some((k) => k.toLowerCase() === c.name.toLowerCase()) ? ' <span class="keymark" title="key">◆</span>' : ""}</td><td class="mono dim">${esc(c.type ?? "")}</td><td>${c.tests.map((x) => `<span class="tchip">${esc(x)}</span>`).join("")}</td><td>${c.undocumented ? `<span class="dim">${esc(t("in the warehouse, not described"))}</span>` : esc(c.description)}</td><td><button class="col-comment" data-column="${esc(c.name)}" title="${esc(t("Comment on this column"))}" aria-label="${esc(t("Comment on this column"))}">＋</button></td></tr>`)
          .join("")}</tbody></table>`
      : d.type === "unknown" ? "" : `<p class="empty">${esc(t("No columns are described."))}</p>`;
    left.innerHTML = `<div class="headline"><h2>${esc(d.name)}</h2><span class="k ${esc(d.type)}">${esc(chip(d))}</span><span class="st ${esc(st.cls)}">${esc(st.text)}</span><span class="grow"></span><button class="comment-here">${esc(t("Comment"))}</button></div>${d.description ? `<p class="desc">${esc(d.description)}</p>` : ""}${hint}${review}<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>${cols}`;

    const tabs = [["sql", t("SQL")], ["compiled", t("Compiled")], ["tests", `${t("Tests")} ${d.testList.length}`]].filter(([k]) => k !== "compiled" || d.type === "model");
    if (!tabs.some(([k]) => k === state.tab)) state.tab = "sql";
    let content;
    if (state.tab === "tests") {
      content = d.testList.length
        ? `<ul class="tests">${d.testList
            .map((x) => `<li><div class="row"><span class="res ${esc(x.status ?? "none")}">${esc(x.status ?? t("not run"))}</span><b>${esc(x.kind)}</b><span class="mono">${esc(x.column ?? (x.columns?.length ? x.columns.join(", ") : t("whole model")))}</span><span class="dim">${esc(x.detail ?? "")}</span>${x.failures ? `<span class="res fail">${x.failures}</span>` : ""}</div>${x.message && x.status && !PASSED.includes(x.status) ? `<pre class="msg">${esc(x.message)}</pre>` : ""}</li>`)
            .join("")}</ul>`
        : `<p class="empty">${esc(t("No tests."))}</p>`;
    } else {
      const text = state.tab === "compiled" ? d.compiled : d.sql;
      content = text ? `<pre class="sql">${sqlHtml(text)}</pre>` : `<p class="empty">${esc(state.tab === "compiled" ? t("Not compiled: dbt compile writes it.") : d.type === "plan" ? t("not written yet") : t("No SQL."))}</p>`;
    }
    right.innerHTML = `<div class="tabs node-tabs">${tabs.map(([k, label]) => `<button data-tab="${k}" class="${k === state.tab ? "on" : ""}">${esc(label)}</button>`).join("")}</div>${content}`;
  }

  // -- choosing --

  async function select(nodeId, { refocus = true } = {}) {
    if (!byId().has(nodeId)) return;
    state.sel = nodeId;
    history.replaceState(null, "", `?node=${encodeURIComponent(nodeId)}`);
    renderRows();
    // A model that is not on the drawing: the drawing moves to it.
    if (state.mode === "all" && state.graph?.nodes && !state.graph.nodes.some((n) => n.id === nodeId)) state.mode = "focus";
    if (state.mode === "focus" && refocus) await loadGraph(false);
    else renderGraph();
    reveal();
    await loadNode(false);
  }

  root.addEventListener("click", (e) => {
    const node = e.target.closest("[data-node]");
    if (node && !e.target.closest(".panel")) return void select(node.dataset.node);
    const side = e.target.closest("[data-side]");
    if (side) {
      state.side = side.dataset.side;
      renderBar();
      renderFilters();
      return void renderRows();
    }
    const mode = e.target.closest("[data-mode]");
    if (mode) {
      state.mode = mode.dataset.mode;
      return void loadGraph(false).then(reveal);
    }
    const depth = e.target.closest("[data-up], [data-down]");
    if (depth) {
      const k = depth.dataset.up !== undefined ? "up" : "down";
      state[k] = depth.dataset[k] === "all" ? "all" : Number(depth.dataset[k]);
      return void loadGraph(false);
    }
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      state.tab = tab.dataset.tab;
      return void renderNode();
    }
    if (e.target.closest(".toggle")) return void page.classList.toggle("panel-open");
    const here = e.target.closest(".comment-here, .col-comment");
    if (here && state.node) {
      state.draft = { node: state.node.id, name: state.node.name, column: here.dataset.column ?? null };
      page.classList.add("panel-open");
      renderPanel();
      panel.querySelector('.composer[data-key="new"] textarea')?.focus();
    }
  });
  root.addEventListener("dblclick", (e) => {
    const node = e.target.closest(".graph .node");
    if (node && state.mode === "all") {
      state.mode = "focus";
      loadGraph(false).then(reveal);
    }
  });
  $(".search").addEventListener("input", (e) => {
    state.q = e.target.value.trim().toLowerCase();
    renderRows();
  });
  for (const k of ["folder", "tag"]) {
    $("." + k).addEventListener("change", (e) => {
      state[k] = e.target.value;
      renderRows();
      if (state.mode === "all") loadGraph(false);
    });
  }

  // -- the comments --

  const aboutHtml = (a) => `<b>${esc(a.name)}</b>${a.column ? ` · <span class="mono">${esc(a.column)}</span>` : ""}`;
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
        ? `<div class="about">${aboutHtml(state.draft)}<button class="drop" title="${esc(t("Drop this place"))}">×</button></div>` + composer("new", t("What about this model? Ask, or say what to change."))
        : composer("new", t("Ask about this project, or say what to change."))) +
      `</div>` +
      (threads.length === 0 ? `<p class="dim empty">${esc(t("No comments yet. Select a model and press Comment."))}</p>` : "") +
      threads
        .slice()
        .reverse()
        .map((x) => {
          const last = x.messages[x.messages.length - 1];
          const mine = last?.from === "user";
          const on = x.id === state.active;
          return (
            `<div class="thread${on ? " on" : ""}" data-thread="${esc(x.id)}">` +
            `<div class="thread-head"><span class="pin">${x.n}</span>` +
            (x.anchor ? "" : `<span class="dim">${esc(t("Whole project, not one model"))}</span>`) +
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
    const draft = state.draft;
    try {
      if (key === "new") {
        state.draft = null;
        await act({ op: "new", anchor: draft ? { node: draft.node, column: draft.column } : null, text, send });
      } else await act({ op: "say", id: key.slice("reply:".length), text, send });
    } catch (e) {
      state.texts[key] = text;
      if (key === "new") state.draft = draft;
      console.error(e);
      renderPanel();
    }
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
      return void renderPanel();
    }
    if (e.target.closest(".resolve")) return void act({ op: "resolve", id: thread });
    if (e.target.closest(".send")) return void act({ op: "send", id: thread });
    if (thread && thread !== state.active) {
      state.active = thread;
      const a = state.threads.find((x) => x.id === thread)?.anchor;
      renderPanel();
      if (a) select(a.node);
    }
  });

  async function loadComments() {
    try {
      const r = await api.comments(id);
      const sig = JSON.stringify(r);
      if (sig === state.seen) return;
      state.seen = sig;
      state.threads = r.threads;
      state.listening = r.listening;
      if (state.active && !openThreads().some((x) => x.id === state.active)) state.active = null;
      renderPanel();
      renderBar();
    } catch {
      // The server is away for a moment: what was last read stays.
    }
  }

  // -- keeping up --

  if (!state.sel && p.nodes.length <= p.maxDraw) state.sel = (p.nodes.find((n) => n.failing) ?? p.nodes.find((n) => n.type === "plan"))?.id ?? null;
  if (innerWidth >= 1700) page.classList.add("panel-open");
  renderBar();
  renderFilters();
  renderRows();
  renderPanel();
  await Promise.all([loadGraph(true), loadNode(true), loadComments()]);
  reveal();
  for (;;) {
    await sleep(document.hidden ? 4000 : 1500);
    try {
      const next = await api.project(id, p.rev);
      if (!next.same) {
        p = next;
        if (state.sel && !byId().has(state.sel)) {
          // A plan that was written is now the model of that name.
          const name = state.node?.name;
          state.sel = p.nodes.find((n) => n.name === name)?.id ?? null;
        }
        renderBar();
        renderFilters();
        renderRows();
        await Promise.all([loadGraph(false), loadNode(false)]);
      }
    } catch (e) {
      if (e.code === "NotFound") return gone(t("This project was removed."));
    }
    await loadComments();
  }
}

const m = location.pathname.match(/^\/p\/([0-9a-f]{16})\/?$/);
if (m) showProject(m[1]);
else showList();
