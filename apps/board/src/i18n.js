// The page's own words: English in the code, 中文 and 日本語 here.
// Excalidraw brings its own translations (`langCode`).

const zh = {
  "Boards": "画板",
  "Search": "搜索",
  "New board": "新画板",
  "Name of the new board": "新画板的名字",
  "Create": "创建",
  "Cancel": "取消",
  "No boards yet.": "还没有画板。",
  "Nothing matches.": "没有匹配的画板。",
  "All boards": "全部画板",
  "Copy picture path": "复制图片路径",
  "Copy file path": "复制文件路径",
  "Copied": "已复制",
  "Saved": "已保存",
  "Saving…": "保存中…",
  "Not saved": "没有保存",
  "There is no board named “{name}”.": "没有叫「{name}」的画板。",
  "Create it": "创建它",
  "{n} changed from outside": "外部改了 {n} 处",
  "Clear": "清除",
  "This board's file was removed.": "这张画板的文件被删掉了。",
  "The board could not be opened.": "画板打不开。",
  "Drawn with Excalidraw.": "画板基于 Excalidraw。",
  "Third-party licenses": "第三方许可",
};

const ja = {
  "Boards": "ボード",
  "Search": "検索",
  "New board": "新しいボード",
  "Name of the new board": "新しいボードの名前",
  "Create": "作成",
  "Cancel": "キャンセル",
  "No boards yet.": "ボードはまだありません。",
  "Nothing matches.": "一致するボードがありません。",
  "All boards": "すべてのボード",
  "Copy picture path": "画像のパスをコピー",
  "Copy file path": "ファイルのパスをコピー",
  "Copied": "コピーしました",
  "Saved": "保存済み",
  "Saving…": "保存中…",
  "Not saved": "保存できていません",
  "There is no board named “{name}”.": "「{name}」というボードはありません。",
  "Create it": "作成する",
  "{n} changed from outside": "外部で {n} か所変更",
  "Clear": "消す",
  "This board's file was removed.": "このボードのファイルは削除されました。",
  "The board could not be opened.": "ボードを開けません。",
  "Drawn with Excalidraw.": "ボードは Excalidraw で動いています。",
  "Third-party licenses": "サードパーティのライセンス",
};

export const tables = { zh, ja };

const language = (typeof navigator !== "undefined" && navigator.language) || "en";
export const lang = language.startsWith("zh") ? "zh" : language.startsWith("ja") ? "ja" : "en";
/** Excalidraw's code for the same language. */
export const excalidrawLang = { zh: "zh-CN", ja: "ja-JP", en: "en" }[lang];

export function t(text, values = {}) {
  let out = tables[lang]?.[text] ?? text;
  for (const [k, v] of Object.entries(values)) out = out.replace(`{${k}}`, String(v));
  return out;
}
