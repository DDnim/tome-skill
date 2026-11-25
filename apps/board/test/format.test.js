import { test } from "node:test";
import assert from "node:assert/strict";
import LZString from "lz-string";
import { parseFile, serializeFile, sceneToSave, NEW_FILE_HEAD, textElements, sceneText } from "../src/format.js";

const rect = { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10, version: 3 };
const text = { id: "t1abcdef", type: "text", x: 0, y: 0, text: "你好\nworld", originalText: "你好\nworld", version: 2 };
const scene = { type: "excalidraw", version: 2, source: "x", elements: [rect, text], appState: { viewBackgroundColor: "#fff" }, files: {} };

// What the plugin writes for a drawing (text elements commented out with %%).
const pluginFile = (drawing) => NEW_FILE_HEAD + "%%\n# Excalidraw Data\n\n## Text Elements\n你好\nworld ^t1abcdef\n\n" +
  "## Embedded Files\nabc123: [[Pasted Image 1.png]]\n\n" + drawing + "\n%%";

test("reads the plugin's json drawing and keeps what is around it", () => {
  const f = pluginFile("## Drawing\n```json\n" + JSON.stringify(scene, null, "\t") + "\n```");
  const p = parseFile(f, "a.excalidraw.md");
  assert.equal(p.scene.elements.length, 2);
  assert.equal(p.head, NEW_FILE_HEAD);
  assert.equal(p.embedded, "## Embedded Files\nabc123: [[Pasted Image 1.png]]\n\n");
  const out = serializeFile(p, p.scene);
  assert.equal(out, f + "\n");
});

test("reads compressed-json (the plugin's default) and writes plain json", () => {
  const packed = LZString.compressToBase64(JSON.stringify(scene)).replace(/(.{256})/g, "$1\n\n");
  const f = pluginFile("## Drawing\n```compressed-json\n" + packed + "\n```");
  const p = parseFile(f, "a.excalidraw.md");
  assert.deepEqual(p.scene.elements.map((e) => e.id), ["r1", "t1abcdef"]);
  const out = serializeFile(p, sceneToSave(p.scene.elements, p.scene.appState, p.scene.files));
  assert.match(out, /## Drawing\n```json\n\{/);
  assert.doesNotMatch(out, /compressed-json/);
  assert.equal(parseFile(out, "a.excalidraw.md").scene.elements.length, 2);
});

test("an older layout: the data not commented out, %% before the drawing", () => {
  const f = "---\nexcalidraw-plugin: parsed\n---\nnotes above\n\n# Excalidraw Data\n## Text Elements\nhi ^t1abcdef\n\n%%\n## Drawing\n```json\n" +
    JSON.stringify(scene) + "\n```\n%%\nbelow the drawing\n";
  const p = parseFile(f, "b.excalidraw.md");
  assert.equal(p.head, "---\nexcalidraw-plugin: parsed\n---\nnotes above\n\n");
  assert.equal(p.tail, "below the drawing\n");
  const out = serializeFile(p, p.scene);
  assert.ok(out.startsWith(p.head + "%%\n# Excalidraw Data"));
  assert.ok(out.endsWith("%%\nbelow the drawing\n"));
});

test("the plugin's blank drawing: frontmatter then the Drawing block", () => {
  const f = NEW_FILE_HEAD + "\n## Drawing\n```json\n" + JSON.stringify({ type: "excalidraw", elements: [] }) + "\n```\n%%";
  const p = parseFile(f, "c.excalidraw.md");
  assert.equal(p.scene.elements.length, 0);
  assert.equal(p.head.trim(), NEW_FILE_HEAD.trim());
});

test("an empty or new file becomes a drawing with the plugin's head", () => {
  const p = parseFile("", "new.excalidraw.md");
  const out = serializeFile(p, sceneToSave([rect], {}, {}));
  assert.ok(out.startsWith(NEW_FILE_HEAD + "%%\n# Excalidraw Data\n\n## Text Elements\n## Drawing\n```json\n"));
});

test("a bare .excalidraw stays JSON", () => {
  const p = parseFile(JSON.stringify(scene), "d.excalidraw");
  assert.equal(p.markdown, false);
  assert.equal(JSON.parse(serializeFile(p, p.scene)).elements.length, 2);
});

test("unreadable data throws instead of being written over", () => {
  assert.throws(() => parseFile(NEW_FILE_HEAD + "%%\n## Drawing\n```json\n{oops\n```\n%%", "e.excalidraw.md"));
  assert.throws(() => parseFile(NEW_FILE_HEAD + "%%\n## Drawing\n```compressed-json\n!!!\n```\n%%", "e.excalidraw.md"));
});

test("text elements and the words in a scene", () => {
  assert.equal(textElements([rect, text, { ...text, id: "gone", isDeleted: true }]), "你好\nworld ^t1abcdef\n\n");
  assert.equal(sceneText(scene), "你好\nworld");
});

test("saving drops deleted elements and images no longer used", () => {
  const img = { id: "i1", type: "image", fileId: "f1", version: 1 };
  const s = sceneToSave([rect, { ...text, isDeleted: true }, img], { viewBackgroundColor: "#fff", zoom: 2 }, { f1: { id: "f1" }, f2: { id: "f2" } });
  assert.deepEqual(s.elements.map((e) => e.id), ["r1", "i1"]);
  assert.deepEqual(Object.keys(s.files), ["f1"]);
  assert.deepEqual(s.appState, { viewBackgroundColor: "#fff" });
});
