import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyText, parseFile } from "../src/format.js";
import { tables } from "../src/i18n.js";

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");

test("a new board's text reads back as an empty drawing the plugin knows", () => {
  const text = emptyText();
  assert.match(text, /^---\n\nexcalidraw-plugin: parsed\n/);
  const parsed = parseFile(text, "a.excalidraw.md");
  assert.equal(parsed.markdown, true);
  assert.deepEqual(parsed.scene.elements, []);
});

test("every word the page says has its 中文 and 日本語", () => {
  const said = new Set();
  for (const f of fs.readdirSync(src).filter((f) => /\.jsx?$/.test(f) && f !== "i18n.js")) {
    for (const m of fs.readFileSync(path.join(src, f), "utf8").matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) said.add(m[1]);
  }
  assert.ok(said.size > 10);
  for (const [lang, table] of Object.entries(tables)) {
    assert.deepEqual([...said].filter((s) => !(s in table)), [], `missing in ${lang}`);
    assert.deepEqual(Object.keys(table).filter((s) => !said.has(s)), [], `unused in ${lang}`);
  }
});
