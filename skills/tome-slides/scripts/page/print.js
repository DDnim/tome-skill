// The print page (/print/<id>): every slide a page. On the screen the pages
// are shown smaller; printed, at their size. `?auto=1` opens the print
// dialog once every slide has loaded.
const words = {
  zh: { wait: "正在准备幻灯片……", ready: "在打印对话框里选「存为 PDF」。", print: "打印" },
  ja: { wait: "スライドを準備しています…", ready: "印刷ダイアログで「PDF として保存」を選んでください。", print: "印刷" },
  en: { wait: "Getting the slides ready…", ready: "In the print dialog, choose Save as PDF.", print: "Print" },
};
const lang = (navigator.language || "en").slice(0, 2);
const say = words[lang] ?? words.en;
const state = document.querySelector(".print-state");
const go = document.querySelector(".print-go");
state.textContent = say.wait;
go.textContent = say.print;
const width = Number(document.documentElement.dataset.width) || 1920;
const fit = () => document.querySelector(".print-pages").style.setProperty("--s", String(Math.min(1, (innerWidth - 48) / width)));
fit();
addEventListener("resize", fit);
// Each slide tells its ground: it goes under the slide's page, since a printed frame leaves it out.
addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.tome !== 1 || m.type !== "ready" || !m.paper) return;
  const frame = [...document.querySelectorAll(".print-page iframe")].find((f) => f.contentWindow === e.source);
  if (!frame) return;
  const p = m.paper;
  const ok = (v) => typeof v === "string" && v.length < 2000 && !/[;{}]|\\|javascript:/i.test(v);
  const s = frame.parentElement.style;
  if (ok(p.color)) s.backgroundColor = p.color;
  if (ok(p.image) && /^(none|(url\("http:\/\/(127\.0\.0\.1|localhost):\d+\/f\/|(repeating-)?(linear|radial|conic)-gradient\().*)$/.test(p.image)) s.backgroundImage = p.image;
  for (const [k, v] of [["backgroundSize", p.size], ["backgroundPosition", p.position], ["backgroundRepeat", p.repeat]]) if (ok(v)) s[k] = v;
});
const ready = () => {
  state.textContent = say.ready;
  go.disabled = false;
  go.addEventListener("click", () => print());
  if (new URLSearchParams(location.search).get("auto") === "1") setTimeout(() => print(), 300);
};
if (document.readyState === "complete") ready();
else addEventListener("load", ready, { once: true });
