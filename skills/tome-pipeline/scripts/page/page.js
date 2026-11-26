// The page: `/` lists the opened pipelines, `/p/<id>` shows one: its steps as
// a graph colored by their state in a run (the latest unless another is
// chosen), and under it the chosen step: what it is, its log, the files it
// made (pictures, sound, video, text and tables shown), and, when it is a
// question for a person that waits, a form to answer it. On the right the
// comments, on a step or the whole pipeline, which an agent that waits takes
// and answers. It follows the files: a running pipeline's graph moves as its
// steps end.

// ---- words ----

const zh = {
  "Pipelines": "流水线",
  "No pipeline is open. An agent opens one with the tome-pipeline skill.": "还没有打开的流水线。让 agent 用 tome-pipeline skill 打开一条。",
  "{n} steps": "{n} 步",
  "never run": "还没跑过",
  "All pipelines": "全部流水线",
  "This pipeline was removed.": "这条流水线被删掉了。",
  "The pipeline could not be opened.": "流水线打不开。",
  "{n} problems in pipeline.json": "pipeline.json 里有 {n} 个问题",
  "Not written yet": "还没实装",
  "Done": "做完",
  "Unchanged, taken": "输入没变，跳过",
  "Running": "运行中",
  "Failed": "失败",
  "Waits for you": "等人",
  "No steps yet.": "还没有步骤。",
  "not written yet": "未实装",
  "not run yet": "还没跑",
  "waiting for {s}": "等 {s}",
  "not reached": "还没轮到",
  "running": "运行中",
  "try {n}": "第 {n} 次",
  "unchanged · {run}": "跳过 · 用 {run} 的",
  "waits for you": "等你回答",
  "interrupted": "中断了",
  "stopped": "停了",
  "not in this run": "这次没跑",
  "done": "做完",
  "failed": "失败",
  "waiting": "等人",
  "Run": "运行",
  "Kind": "种类",
  "Script": "脚本",
  "Prompt": "提示词",
  "Question": "问题",
  "Needs": "需要",
  "Makes": "产出",
  "Retries": "重试",
  "Time limit": "超时",
  "Always runs": "每次都跑",
  "yes (it reads the outside world)": "是（读外面的东西）",
  "Log": "日志",
  "No log.": "没有日志。",
  "Files": "产出的文件",
  "No files.": "没有文件。",
  "Select a step.": "点一个步骤。",
  "Not written yet: {file}": "还没写：{file}",
  "After fixing it, carry the run on:": "修好之后接着跑：",
  "Taken from run {run}: its inputs did not change.": "输入没变，直接用了 {run} 的结果。",
  "Answer": "回答",
  "Or write your own:": "或者自己写：",
  "Send answer": "回答",
  "Sending…": "正在发送…",
  "Answered. The run goes on.": "回答了，流水线接着跑。",
  "Could not answer: {detail}": "回答失败：{detail}",
  "Running now (pid {pid})": "正在运行（pid {pid}）",
  "beginning cut": "前面省略了",
  "Download": "下载",
  "(none)": "（无）",
  "Comments": "评论",
  "Comment": "评论",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent 在等评论。发给它时，之前加的注释会一起发出去。",
  "No agent is listening. Notes are saved for it to read.": "没有 Agent 在等。注释会存下来，等它来读。",
  "Ask about this pipeline, or say what to change.": "对这条流水线提问，或者说要怎么改。",
  "What about this step? Ask, or say what to change.": "这一步怎么了？提问，或者说要怎么改。",
  "Send to Agent": "发给 Agent",
  "Add note": "添加注释",
  "Note, not sent": "注释，还没发",
  "Reply": "回复",
  "Resolve": "解决",
  "Sent to Agent": "已发给 Agent",
  "Agent": "Agent",
  "You": "你",
  "Whole pipeline, not one step": "整条流水线",
  "Drop this place": "不针对这里",
  "No comments yet. Select a step and press Comment.": "还没有评论。选一个步骤，按「评论」。",
  "{n} open comments": "{n} 条未解决的评论",
  "run {run}": "{run} 那次",
};
const ja = {
  "Pipelines": "パイプライン",
  "No pipeline is open. An agent opens one with the tome-pipeline skill.": "開いているパイプラインはありません。agent が tome-pipeline skill で開きます。",
  "{n} steps": "{n} ステップ",
  "never run": "まだ実行していません",
  "All pipelines": "すべてのパイプライン",
  "This pipeline was removed.": "このパイプラインは削除されました。",
  "The pipeline could not be opened.": "パイプラインを開けません。",
  "{n} problems in pipeline.json": "pipeline.json に問題が {n} 件",
  "Not written yet": "未実装",
  "Done": "完了",
  "Unchanged, taken": "入力が同じなのでスキップ",
  "Running": "実行中",
  "Failed": "失敗",
  "Waits for you": "人を待っている",
  "No steps yet.": "ステップはまだありません。",
  "not written yet": "未実装",
  "not run yet": "まだ実行していません",
  "waiting for {s}": "{s} 待ち",
  "not reached": "まだ",
  "running": "実行中",
  "try {n}": "{n} 回目",
  "unchanged · {run}": "スキップ · {run} のもの",
  "waits for you": "回答待ち",
  "interrupted": "中断",
  "stopped": "停止",
  "not in this run": "今回は対象外",
  "done": "完了",
  "failed": "失敗",
  "waiting": "回答待ち",
  "Run": "実行",
  "Kind": "種類",
  "Script": "スクリプト",
  "Prompt": "プロンプト",
  "Question": "質問",
  "Needs": "前提",
  "Makes": "出力",
  "Retries": "リトライ",
  "Time limit": "タイムアウト",
  "Always runs": "毎回実行",
  "yes (it reads the outside world)": "はい（外部を読む）",
  "Log": "ログ",
  "No log.": "ログはありません。",
  "Files": "出力ファイル",
  "No files.": "ファイルはありません。",
  "Select a step.": "ステップを選んでください。",
  "Not written yet: {file}": "未作成：{file}",
  "After fixing it, carry the run on:": "直したら続きから実行：",
  "Taken from run {run}: its inputs did not change.": "入力が同じなので {run} の結果を使いました。",
  "Answer": "回答",
  "Or write your own:": "または自分で書く：",
  "Send answer": "回答する",
  "Sending…": "送信中…",
  "Answered. The run goes on.": "回答しました。続きを実行します。",
  "Could not answer: {detail}": "回答できませんでした: {detail}",
  "Running now (pid {pid})": "実行中（pid {pid}）",
  "beginning cut": "前半は省略",
  "Download": "ダウンロード",
  "(none)": "（なし）",
  "Comments": "コメント",
  "Comment": "コメント",
  "An agent is listening. Sending one comment sends your notes with it.": "Agent がコメントを待っています。送ると、それまでのメモも一緒に送られます。",
  "No agent is listening. Notes are saved for it to read.": "待っている Agent はいません。メモは保存され、あとで読まれます。",
  "Ask about this pipeline, or say what to change.": "このパイプラインについて質問するか、直したい点を書いてください。",
  "What about this step? Ask, or say what to change.": "このステップについて質問するか、直したい点を書いてください。",
  "Send to Agent": "Agent に送る",
  "Add note": "メモを追加",
  "Note, not sent": "メモ（未送信）",
  "Reply": "返信",
  "Resolve": "解決",
  "Sent to Agent": "Agent に送信済み",
  "Agent": "Agent",
  "You": "あなた",
  "Whole pipeline, not one step": "パイプライン全体",
  "Drop this place": "ここに限らない",
  "No comments yet. Select a step and press Comment.": "コメントはまだありません。ステップを選んで「コメント」を押します。",
  "{n} open comments": "未解決のコメント {n} 件",
  "run {run}": "{run} の実行",
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

const WRITE = { "content-type": "application/json", "x-tome-pipeline": "1" };
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
  pipelines: () => call("/api/pipelines"),
  pipeline: (id, run) => call("/api/pipeline?" + q({ id, run })),
  step: (id, run, step) => call("/api/step?" + q({ id, run, step })),
  answer: (id, body) => call("/api/answer?" + q({ id }), { method: "POST", headers: WRITE, body: JSON.stringify(body) }),
  comments: (id) => call("/api/comments?" + q({ id })),
  comment: (id, body) => call("/api/comments?" + q({ id }), { method: "POST", headers: WRITE, body: JSON.stringify(body) }),
};
const fileUrl = (id, run, step, file, params = {}) => `/o/${id}/${encodeURIComponent(run)}/${encodeURIComponent(step)}/${file.split("/").map(encodeURIComponent).join("/")}${Object.keys(params).length ? "?" + q(params) : ""}`;

// ---- small things ----

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const root = document.getElementById("root");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const el = (html) => {
  const d = document.createElement("template");
  d.innerHTML = html.trim();
  return d.content.firstElementChild;
};
const gone = (text) => (root.innerHTML = `<div class="center"><div>${esc(text)}</div><a href="/">${esc(t("All pipelines"))}</a></div>`);
const shortRun = (r) => (r ? r.replace(/^\d{4}-(\d\d)-(\d\d)_(\d\d)(\d\d)(\d\d)(-\d+)?$/, "$1-$2 $3:$4") : "");
const dur = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`);
const size = (n) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const ext = (f) => (f.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

// ---- the list ----

async function showList() {
  document.title = t("Pipelines");
  let list;
  try {
    list = (await api.pipelines()).pipelines;
  } catch {
    return gone(t("The pipeline could not be opened."));
  }
  root.innerHTML = `<div class="list"><h1>${esc(t("Pipelines"))}</h1>${
    list.length
      ? list
          .map(
            (p) => `<a class="list-row" href="/p/${p.id}"><b>${esc(p.title)}</b><span class="mono dim">${esc(p.root)}</span><span class="dim" style="font-size:12px">${esc(t("{n} steps", { n: p.steps }))} · ${
              p.last ? `<span class="dot ${esc(p.last.state)}"></span>${esc(shortRun(p.last.run))} ${esc(t(p.last.state))}` : esc(t("never run"))
            }${p.open ? ` · <span class="count">${esc(t("{n} open comments", { n: p.open }))}</span>` : ""}</span></a>`,
          )
          .join("")
      : `<p class="dim">${esc(t("No pipeline is open. An agent opens one with the tome-pipeline skill."))}</p>`
  }</div>`;
}

// ---- one pipeline ----

const COL = 236;
const ROW = 92;
const NODE_W = 176;
const NODE_H = 72;
const LANE = 22;

function stepLine(v, s) {
  const st = v.run?.steps?.[s.id];
  if (!s.implemented && (!st || st.state === "pending" || st.state === "failed")) return { cls: "plan", text: t("not written yet") };
  if (!st) return { cls: "", text: t("not run yet") };
  switch (st.state) {
    case "pending": {
      const before = s.needs.find((n) => !["done", "skipped"].includes(v.run.steps[n]?.state));
      return { cls: "", text: before ? t("waiting for {s}", { s: v.steps.find((x) => x.id === before)?.title ?? before }) : t("not reached") };
    }
    case "running":
      return { cls: "running", text: `${t("running")} · ${dur(Date.now() - Date.parse(st.startedAt))}${st.tries > 1 ? ` · ${t("try {n}", { n: st.tries })}` : ""}` };
    case "done":
      return { cls: "done", text: st.ms !== undefined ? dur(st.ms) : t("done") };
    case "skipped":
      return { cls: "skipped", text: t("unchanged · {run}", { run: shortRun(st.from) }) };
    case "failed":
      return { cls: "failed", text: st.error ?? t("failed") };
    case "waiting":
      return { cls: "waiting", text: t("waits for you") };
    case "interrupted":
      return { cls: "interrupted", text: t("interrupted") };
    case "off":
      return { cls: "", text: t("not in this run") };
    default:
      return { cls: "", text: st.state };
  }
}

function graphHtml(v, sel, pins = {}) {
  if (!v.steps.length) return `<p class="empty" style="margin:12px 16px">${esc(t("No steps yet."))}</p>`;
  const cols = Math.max(...v.steps.map((s) => s.at[0])) + 1;
  const lanes = v.lanes ?? {};
  const rows = Math.max(...v.steps.map((s) => s.at[1]), ...Object.values(lanes).flat().map((c) => c[1])) + 1;
  // a row with a box is a box tall; a row that only lines pass through is thin
  const boxRow = new Set(v.steps.map((s) => s.at[1]));
  const top = [0];
  for (let r = 0; r < rows; r++) top.push(top[r] + (boxRow.has(r) ? ROW : LANE));
  const mid = (r) => top[r] + (boxRow.has(r) ? NODE_H / 2 : (LANE - 8) / 2);
  const w = (cols - 1) * COL + NODE_W;
  const h = top[rows] - (boxRow.has(rows - 1) ? ROW - NODE_H : 8);
  const pos = Object.fromEntries(v.steps.map((s) => [s.id, [s.at[0] * COL, top[s.at[1]]]]));
  // each line: from the right of what it needs, straight through each empty cell it passes, to the left of the step
  const lines = [];
  for (const s of v.steps) {
    for (const n of s.needs) {
      if (!pos[n] || n === s.id) continue;
      const via = [];
      for (const [c, r] of lanes[`${n}>${s.id}`] ?? []) via.push([c * COL, mid(r)], [c * COL + NODE_W, mid(r)]);
      lines.push({ from: n, to: s.id, via, ok: ["done", "skipped"].includes(v.run?.steps?.[n]?.state) });
    }
  }
  // the lines that leave or enter one box spread along its side, in the order of where they go or come from
  const port = (key, side, aim) => {
    const group = new Map();
    for (const l of lines) (group.get(l[key]) ?? group.set(l[key], []).get(l[key])).push(l);
    for (const [id, list] of group) {
      list.sort((a, b) => aim(a) - aim(b));
      const gap = list.length > 1 ? Math.min(12, (NODE_H - 28) / (list.length - 1)) : 0;
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
    return `<path class="${l.ok ? "ok" : ""}" d="${d}" marker-end="url(#ah${l.ok ? "ok" : ""})"/>`;
  });
  const nodes = v.steps
    .map((s) => {
      const line = stepLine(v, s);
      return `<button class="node ${line.cls}${s.id === sel ? " sel" : ""}" data-step="${esc(s.id)}" style="left:${pos[s.id][0]}px;top:${pos[s.id][1]}px">${pins[s.id] ? `<span class="pin">${pins[s.id]}</span>` : ""}<span class="k">${esc(s.kind)}</span><div class="t">${esc(s.title)} ${s.title !== s.id ? `<span class="mono">${esc(s.id)}</span>` : ""}</div><div class="s" title="${esc(line.text)}">${esc(line.text)}</div></button>`;
    })
    .join("");
  const marker = (id, color) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill:${color};stroke:none"/></marker>`;
  return `<div class="graph" style="width:${w}px;height:${h}px"><svg width="${w}" height="${h}" aria-hidden="true"><defs>${marker("ah", "var(--edge)")}${marker("ahok", "var(--ok)")}</defs>${edges.join("")}</svg>${nodes}</div>`;
}

function defHtml(s) {
  const rows = [[t("Kind"), `<code>${esc(s.kind)}</code>`]];
  if (s.kind === "sh") rows.push([t("Script"), `<code>${esc(s.run)}</code>`]);
  if (s.kind === "agent") rows.push([t("Prompt"), `<code>${esc(s.prompt)}</code>${s.model ? ` · <code>${esc(s.model)}</code>` : ""}`]);
  if (s.kind === "human") rows.push([t("Question"), esc(s.ask)]);
  rows.push([t("Needs"), s.needs.length ? s.needs.map((n) => `<code>${esc(n)}</code>`).join(" ") : esc(t("(none)"))]);
  rows.push([t("Makes"), s.out.length ? s.out.map((n) => `<code>${esc(n)}</code>`).join(" ") : esc(t("(none)"))]);
  if (s.retry) rows.push([t("Retries"), String(s.retry)]);
  if (s.timeoutMs) rows.push([t("Time limit"), dur(s.timeoutMs)]);
  if (s.fresh) rows.push([t("Always runs"), esc(t("yes (it reads the outside world)"))]);
  const note = s.note ? `<p class="note">${esc(s.note)}</p>` : "";
  return `${note}<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
}

/** A CSV or TSV's first rows as a table. */
function tableHtml(text, sep) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
        else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"' && cur === "") quoted = true;
      else if (c === sep) cells.push(cur), (cur = "");
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
    if (rows.length > 60) break;
  }
  if (!rows.length) return "";
  const [head, ...body] = rows;
  return `<table><thead><tr>${head.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

async function previewInto(box, url, file, bytes) {
  const e = ext(file);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) box.innerHTML = `<img src="${esc(url)}" alt="${esc(file)}">`;
  else if (["mp3", "wav", "m4a", "ogg"].includes(e)) box.innerHTML = `<audio controls preload="metadata" src="${esc(url)}"></audio>`;
  else if (["mp4", "webm", "mov"].includes(e)) box.innerHTML = `<video controls preload="metadata" src="${esc(url)}"></video>`;
  else if (/^(txt|md|json|jsonl|ndjson|csv|tsv|srt|vtt|log|ya?ml|toml|xml|sql|html?|css|js|mjs|py|sh)$/.test(e) && bytes <= 512 * 1024) {
    try {
      const res = await fetch(url);
      let text = await res.text();
      if (e === "csv" || e === "tsv") {
        box.innerHTML = tableHtml(text, e === "csv" ? "," : "\t");
        return;
      }
      if (e === "json") {
        try {
          text = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          // as it is
        }
      }
      box.innerHTML = `<pre>${esc(text.length > 6000 ? text.slice(0, 6000) + "\n…" : text)}</pre>`;
    } catch {
      box.innerHTML = "";
    }
  }
}

async function showPipeline(id) {
  let v;
  try {
    v = await api.pipeline(id, null);
  } catch (e) {
    return gone(e.code === "NotFound" ? t("This pipeline was removed.") : t("The pipeline could not be opened."));
  }
  let sel = new URLSearchParams(location.search).get("step");
  let chosenRun = null; // null: follow the latest
  let lowerKey = "";
  let stepData = null;
  // The comments: the threads, whether an agent waits, the one opened, the place of the one being written, what is typed.
  const cm = { threads: [], listening: false, seen: "", active: null, draft: null, texts: {} };
  const openThreads = () => cm.threads.filter((x) => !x.resolved);

  root.innerHTML = `<div class="pipe">
    <header class="bar"><a href="/" aria-label="${esc(t("All pipelines"))}">←</a><span class="name"></span><span class="path mono"></span><span class="grow"></span><span class="warn"></span><span class="busy dim"></span><div class="runs"></div><button class="toggle"></button></header>
    <div class="body">
      <main class="main">
        <div class="legend"><span class="plan">${esc(t("Not written yet"))}</span><span class="done">${esc(t("Done"))}</span><span class="skipped">${esc(t("Unchanged, taken"))}</span><span class="running">${esc(t("Running"))}</span><span class="failed">${esc(t("Failed"))}</span><span class="waiting">${esc(t("Waits for you"))}</span></div>
        <div class="graph-wrap"></div>
        <div class="lower"><section class="pane left"></section><section class="pane right"></section></div>
      </main>
      <aside class="panel"></aside>
    </div>
  </div>`;
  const page = root.querySelector(".pipe");
  const $ = (s) => root.querySelector(s);
  const panel = $(".panel");

  const renderTop = () => {
    document.title = v.title;
    $(".name").textContent = v.title;
    $(".path").textContent = v.root;
    $(".warn").textContent = v.problems.length ? t("{n} problems in pipeline.json", { n: v.problems.length }) : "";
    $(".warn").title = v.problems.join("\n");
    $(".busy").textContent = v.busy ? t("Running now (pid {pid})", { pid: v.busy.pid }) : "";
    const runName = v.run?.run ?? null;
    $(".runs").innerHTML = v.runs.map((r) => `<button data-run="${esc(r.run)}" class="${r.run === runName ? "on" : ""}"><span class="dot ${esc(r.state ?? "")}"></span>${esc(shortRun(r.run))}${r.state && r.state !== "done" ? ` ${esc(t(r.state))}` : ""}</button>`).join("");
    const n = openThreads().length;
    $(".toggle").innerHTML = `${esc(t("Comments"))}${n ? ` ${n}` : ""}${cm.listening ? '<em class="listening"></em>' : ""}`;
    const pins = {};
    for (const x of openThreads()) if (x.anchor) pins[x.anchor.step] = x.n;
    const wrap = $(".graph-wrap");
    const sx = wrap.scrollLeft;
    wrap.innerHTML = graphHtml(v, sel, pins);
    wrap.scrollLeft = sx;
  };

  const renderLower = async (force) => {
    const left = $(".left");
    const right = $(".right");
    const s = v.steps.find((x) => x.id === sel);
    if (!s) {
      left.innerHTML = `<p class="empty">${esc(t("Select a step."))}</p>`;
      right.innerHTML = "";
      lowerKey = "";
      return;
    }
    const st = v.run?.steps?.[s.id] ?? null;
    const runName = v.run?.run ?? null;
    const key = JSON.stringify([s, st, runName]);
    if (key === lowerKey && !force && st?.state !== "running") return;
    const keepAnswer = key === lowerKey && left.querySelector(".answer");
    lowerKey = key;
    stepData = runName && st && st.state !== "off" ? await api.step(id, runName, s.id).catch(() => null) : null;
    const line = stepLine(v, s);
    let hint = "";
    if (!s.implemented) hint = `<div class="hint">${esc(t("Not written yet: {file}", { file: s.kind === "sh" ? s.run.split(/\s/)[0] : s.prompt }))}</div>`;
    else if (st && ["failed", "interrupted"].includes(st.state)) hint = `<div class="hint">${esc(t("After fixing it, carry the run on:"))}<br><code>pipeline.mjs resume "${esc(v.root)}"</code></div>`;
    else if (st?.state === "skipped") hint = `<div class="hint">${esc(t("Taken from run {run}: its inputs did not change.", { run: st.from }))}</div>`;
    const log = stepData?.log;
    const logHtml = log && log.text ? `<pre class="log">${log.cut ? `<span style="color:var(--log-dim)">… ${esc(t("beginning cut"))}</span>\n` : ""}${esc(log.text)}</pre>` : `<p class="empty">${esc(t("No log."))}</p>`;
    const form = s.kind === "human" && st?.state === "waiting" ? answerHtml(s) : "";
    if (keepAnswer && form) {
      left.querySelector(".log-box").innerHTML = logHtml;
    } else {
      left.innerHTML = `<div class="headline"><h2>${esc(s.title)}${s.title !== s.id ? ` <span class="mono dim">${esc(s.id)}</span>` : ""}</h2><span class="st ${esc(line.cls)}">${esc(line.text)}</span><span class="grow"></span><button class="comment-here">${esc(t("Comment"))}</button></div>${form}${hint}${defHtml(s)}${s.kind !== "human" ? `<h3>${esc(t("Log"))}</h3><div class="log-box">${logHtml}</div>` : ""}`;
      const pre = left.querySelector("pre.log");
      if (pre) pre.scrollTop = pre.scrollHeight;
      if (form) wireAnswer(left, s, runName);
    }
    const files = (stepData?.files ?? []).filter((f) => !f.file.startsWith("_"));
    right.innerHTML = `<h3 style="margin-top:0">${esc(t("Files"))}</h3>${
      files.length
        ? `<ul class="files">${files.map((f) => `<li><div class="row"><a href="${esc(fileUrl(id, runName, s.id, f.file))}" target="_blank" rel="noopener">${esc(f.file)}</a><span>${esc(size(f.size))} · <a href="${esc(fileUrl(id, runName, s.id, f.file, { download: 1 }))}">${esc(t("Download"))}</a></span></div><div class="preview" data-file="${esc(f.file)}" data-size="${f.size}"></div></li>`).join("")}</ul>`
        : `<p class="empty">${esc(t("No files."))}</p>`
    }${stepData?.prompt ? `<h3>${esc(t("Prompt"))}</h3><a class="mono" href="${esc(fileUrl(id, runName, s.id, "_prompt.md"))}" target="_blank" rel="noopener">_prompt.md</a>` : ""}`;
    for (const box of right.querySelectorAll(".preview")) previewInto(box, fileUrl(id, runName, s.id, box.dataset.file), box.dataset.file, Number(box.dataset.size));
  };

  const answerHtml = (s) => {
    const choices = s.choicesList ?? [];
    return `<form class="answer" style="margin-top:12px"><p style="margin:0 0 8px;font-weight:600">${esc(s.ask)}</p>${choices.map((c, i) => `<label class="choice"><input type="radio" name="c" value="${esc(c)}"> <span class="mono dim">${i + 1}</span> <span>${esc(c)}</span></label>`).join("")}${choices.length ? `<div class="dim" style="font-size:12px;margin:6px 0 4px">${esc(t("Or write your own:"))}</div>` : ""}<textarea name="text" aria-label="${esc(t("Answer"))}"></textarea><div class="go"><button class="primary" type="submit">${esc(t("Send answer"))}</button><span class="msg dim" style="font-size:12px"></span></div></form>`;
  };
  const wireAnswer = (left, s, runName) => {
    const form = left.querySelector(".answer");
    form.addEventListener("change", (e) => {
      if (e.target.name === "c") form.elements.text.value = e.target.value;
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = form.elements.text.value.trim();
      if (!text) return form.elements.text.focus();
      const button = form.querySelector("button");
      const msg = form.querySelector(".msg");
      button.disabled = true;
      msg.textContent = t("Sending…");
      try {
        await api.answer(id, { step: s.id, text, run: runName });
        msg.textContent = t("Answered. The run goes on.");
      } catch (err) {
        button.disabled = false;
        msg.textContent = t("Could not answer: {detail}", { detail: err.message });
      }
    });
  };

  const select = (step) => {
    sel = step;
    history.replaceState(null, "", `?step=${encodeURIComponent(sel)}`);
    renderTop();
    renderLower(true);
  };
  root.addEventListener("click", (e) => {
    const node = e.target.closest(".node");
    if (node) return void select(node.dataset.step);
    const r = e.target.closest(".runs button");
    if (r) {
      chosenRun = r.dataset.run === v.runs[0]?.run ? null : r.dataset.run;
      return void refresh(true);
    }
    if (e.target.closest(".toggle")) return void page.classList.toggle("panel-open");
    const s = e.target.closest(".comment-here") && v.steps.find((x) => x.id === sel);
    if (s) {
      cm.draft = { step: s.id, title: s.title, run: v.run?.run ?? null };
      page.classList.add("panel-open");
      renderPanel();
      panel.querySelector('.composer[data-key="new"] textarea')?.focus();
    }
  });

  // -- the comments --

  const aboutHtml = (a) => `<b>${esc(a.title)}</b>${a.run ? ` · <span class="dim">${esc(t("run {run}", { run: shortRun(a.run) }))}</span>` : ""}`;
  const composer = (key, placeholder) => `
    <div class="composer" data-key="${esc(key)}">
      <textarea rows="3" placeholder="${esc(placeholder)}">${esc(cm.texts[key] ?? "")}</textarea>
      <div class="actions"><button class="note">${esc(t("Add note"))}</button>${cm.listening ? `<button class="primary submit">${esc(t("Send to Agent"))}</button>` : ""}</div>
    </div>`;

  function renderPanel() {
    const focused = document.activeElement?.closest?.(".composer")?.dataset.key;
    const caret = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const threads = openThreads();
    panel.innerHTML =
      `<div class="agent${cm.listening ? " on" : ""}">${esc(cm.listening ? t("An agent is listening. Sending one comment sends your notes with it.") : t("No agent is listening. Notes are saved for it to read."))}</div>` +
      `<div class="new">` +
      (cm.draft
        ? `<div class="about">${aboutHtml(cm.draft)}<button class="drop" title="${esc(t("Drop this place"))}">×</button></div>` + composer("new", t("What about this step? Ask, or say what to change."))
        : composer("new", t("Ask about this pipeline, or say what to change."))) +
      `</div>` +
      (threads.length === 0 ? `<p class="dim empty">${esc(t("No comments yet. Select a step and press Comment."))}</p>` : "") +
      threads
        .slice()
        .reverse()
        .map((x) => {
          const last = x.messages[x.messages.length - 1];
          const mine = last?.from === "user";
          const on = x.id === cm.active;
          return (
            `<div class="thread${on ? " on" : ""}" data-thread="${esc(x.id)}">` +
            `<div class="thread-head"><span class="pin">${x.n}</span>` +
            (x.anchor ? "" : `<span class="dim">${esc(t("Whole pipeline, not one step"))}</span>`) +
            (mine ? `<span class="dim">${esc(x.sent ? t("Sent to Agent") : t("Note, not sent"))}</span>` : "") +
            `<button class="resolve">${esc(t("Resolve"))}</button></div>` +
            (x.anchor ? `<div class="about">${aboutHtml(x.anchor)}</div>` : "") +
            x.messages.map((m) => `<div class="message ${esc(m.from)}"><i>${esc(m.from === "agent" ? t("Agent") : t("You"))}</i><div>${esc(m.text)}</div></div>`).join("") +
            (on && mine && !x.sent && cm.listening ? `<div class="actions"><button class="primary send">${esc(t("Send to Agent"))}</button></div>` : "") +
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
    const text = (cm.texts[key] ?? "").trim();
    if (!text) return;
    cm.texts[key] = "";
    const draft = cm.draft;
    try {
      if (key === "new") {
        cm.draft = null;
        await act({ op: "new", anchor: draft ? { step: draft.step, run: draft.run } : null, text, send });
      } else await act({ op: "say", id: key.slice("reply:".length), text, send });
    } catch (e) {
      cm.texts[key] = text;
      if (key === "new") cm.draft = draft;
      console.error(e);
      renderPanel();
    }
  }

  panel.addEventListener("input", (e) => {
    const k = e.target.closest(".composer")?.dataset.key;
    if (k) cm.texts[k] = e.target.value;
  });
  panel.addEventListener("keydown", (e) => {
    const k = e.target.closest(".composer")?.dataset.key;
    if (k && e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(k, cm.listening);
  });
  panel.addEventListener("click", (e) => {
    const thread = e.target.closest(".thread")?.dataset.thread;
    if (e.target.closest(".submit")) return void submit(e.target.closest(".composer").dataset.key, true);
    if (e.target.closest(".note")) return void submit(e.target.closest(".composer").dataset.key, false);
    if (e.target.closest(".drop")) {
      cm.draft = null;
      return void renderPanel();
    }
    if (e.target.closest(".resolve")) return void act({ op: "resolve", id: thread });
    if (e.target.closest(".send")) return void act({ op: "send", id: thread });
    if (thread && thread !== cm.active) {
      cm.active = thread;
      const a = cm.threads.find((x) => x.id === thread)?.anchor;
      renderPanel();
      if (a && v.steps.some((x) => x.id === a.step)) select(a.step);
    }
  });

  async function loadComments() {
    try {
      const r = await api.comments(id);
      const sig = JSON.stringify(r);
      if (sig === cm.seen) return;
      cm.seen = sig;
      cm.threads = r.threads;
      cm.listening = r.listening;
      if (cm.active && !openThreads().some((x) => x.id === cm.active)) cm.active = null;
      renderPanel();
      renderTop();
    } catch {
      // The server is away for a moment: what was last read stays.
    }
  }

  let lastRev = "";
  const refresh = async (force) => {
    try {
      v = await api.pipeline(id, chosenRun);
    } catch (e) {
      if (e.code === "NotFound") return gone(t("This pipeline was removed."));
      return;
    }
    const running = v.run?.state === "running";
    if (v.rev !== lastRev || force || running) {
      lastRev = v.rev;
      renderTop();
      await renderLower(force);
    }
  };
  if (!sel) sel = v.steps.find((s) => ["failed", "waiting", "running", "interrupted"].includes(v.run?.steps?.[s.id]?.state))?.id ?? v.steps[0]?.id ?? null;
  if (innerWidth >= 1500) page.classList.add("panel-open");
  renderPanel();
  await Promise.all([refresh(true), loadComments()]);
  for (;;) {
    await sleep(document.hidden ? 4000 : 1500);
    await refresh(false);
    await loadComments();
  }
}

const m = location.pathname.match(/^\/p\/([0-9a-f]{16})\/?$/);
if (m) showPipeline(m[1]);
else showList();
