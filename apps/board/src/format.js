// A board's files: the Obsidian Excalidraw plugin's `.excalidraw.md` (what the
// vault's plugin makes, in the folder it uses) and a bare `.excalidraw` (JSON).
//
// The md layout, as the plugin (2.x) writes it:
//
//   ---                                  ← frontmatter (the plugin's, or the note's own)
//   excalidraw-plugin: parsed
//   ---
//   ==⚠  Switch to EXCALIDRAW VIEW …==   ← and any text the note has above the data
//   %%
//   # Excalidraw Data
//   ## Text Elements
//   <text> ^<id>                         ← one per text element
//   ## Element Links / ## Embedded Files ← kept as they were
//   ## Drawing
//   ```json  (or ```compressed-json: LZString base64, read only)
//   {scene}
//   ```
//   %%
//
// Reading takes the scene from the Drawing block; writing keeps everything
// around the data, writes the Text Elements again from the scene (the plugin
// reads the text from there) and the scene as plain json, so an agent can
// edit it. The plugin reads both json and compressed-json.

import LZString from "lz-string";

/** What the plugin puts on top of a new drawing (its FRONTMATTER). */
export const NEW_FILE_HEAD = [
  "---",
  "",
  "excalidraw-plugin: parsed",
  "tags: [excalidraw]",
  "",
  "---",
  "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'",
  "",
  "",
].join("\n");

const DRAWING_JSON = /\n##? Drawing\n[^`]*```json\n([\s\S]*?)```\n?/m;
const DRAWING_COMPRESSED = /\n##? Drawing\n[^`]*```compressed-json\n([\s\S]*?)```\n?/m;

export function emptyScene() {
  return { type: "excalidraw", version: 2, source: "agent-tome", elements: [], appState: {}, files: {} };
}

/** The text of a new, empty drawing (an `.excalidraw.md`). */
export function emptyText() {
  return serializeFile(parseFile("", "new.excalidraw.md"), emptyScene());
}

/** The scene's JSON from the Drawing block's text (compressed or not); null when it doesn't parse. */
function sceneFrom(json) {
  try {
    const scene = JSON.parse(json.slice(0, json.lastIndexOf("}") + 1));
    return scene && typeof scene === "object" ? scene : null;
  } catch {
    return null;
  }
}

/** A section of the data (`## Element Links`, `## Embedded Files`): its text up to the next `#` heading, or "". */
function section(data, heading) {
  const at = data.indexOf(`\n${heading}\n`);
  if (at < 0) return "";
  const from = at + 1;
  const rest = data.slice(from + heading.length + 1);
  const next = rest.search(/^##? /m);
  return data.slice(from, from + heading.length + 1 + (next < 0 ? rest.length : next));
}

/**
 * A file's text → { scene, head, links, embedded, tail, markdown }.
 * `head`: what comes before the data (kept), `tail`: after its closing `%%`.
 * `markdown` false: a bare .excalidraw (JSON) file.
 * Throws when the file has data that can't be read (so it is never written over).
 */
export function parseFile(text, path = "") {
  const trimmed = text.trim();
  if (!path.endsWith(".md") && (trimmed === "" || trimmed.startsWith("{"))) {
    const scene = trimmed === "" ? emptyScene() : sceneFrom(trimmed);
    if (!scene) throw new Error("not an Excalidraw file");
    return { scene, head: "", links: "", embedded: "", tail: "", markdown: false };
  }
  if (trimmed === "") return { scene: emptyScene(), head: NEW_FILE_HEAD, links: "", embedded: "", tail: "", markdown: true };

  const padded = text.startsWith("\n") ? text : "\n" + text;
  const shift = padded.length - text.length;
  let match = padded.match(DRAWING_JSON);
  let scene;
  if (match) {
    scene = sceneFrom(match[1]);
  } else if ((match = padded.match(DRAWING_COMPRESSED))) {
    const json = LZString.decompressFromBase64(match[1].replace(/[\r\n]/g, ""));
    scene = json ? sceneFrom(json) : null;
  }
  if (!match) {
    // A note with no drawing yet: the data goes after its text.
    return { scene: emptyScene(), head: text.endsWith("\n") ? text : text + "\n", links: "", embedded: "", tail: "", markdown: true };
  }
  if (!scene) throw new Error("the Drawing block can't be read");

  const drawingAt = match.index + 1 - shift;
  // The data starts at `# Excalidraw Data` (with the `%%` before it), else at the Drawing block.
  let dataAt = drawingAt;
  const dataHead = text.lastIndexOf("# Excalidraw Data", drawingAt);
  if (dataHead >= 0) dataAt = dataHead;
  let head = text.slice(0, dataAt);
  head = head.replace(/%%\s*$/, "");
  const data = text.slice(dataAt, drawingAt);

  // After the block: its closing `%%`, then whatever the note has below.
  let end = match.index + match[0].length - shift;
  let tail = text.slice(end);
  tail = tail.replace(/^\s*%%\n?/, "");

  return {
    scene,
    head,
    links: section("\n" + data, "## Element Links"),
    embedded: section("\n" + data, "## Embedded Files"),
    tail,
    markdown: true,
  };
}

/** The text elements as the plugin lists them: `<text> ^<id>`, a blank line after each. */
export function textElements(elements) {
  let out = "";
  for (const e of elements) {
    if (e.type !== "text" || e.isDeleted) continue;
    out += `${e.rawText || e.originalText || e.text || ""} ^${e.id}\n\n`;
  }
  return out;
}

/** The scene as it is saved: deleted elements dropped, the app state the plugin keeps. */
export function sceneToSave(elements, appState = {}, files = {}) {
  const live = elements.filter((e) => !e.isDeleted);
  const used = new Set(live.filter((e) => e.type === "image" && e.fileId).map((e) => e.fileId));
  const keptFiles = {};
  for (const [id, f] of Object.entries(files || {})) if (used.has(id)) keptFiles[id] = f;
  const state = {};
  for (const k of ["gridSize", "gridStep", "gridModeEnabled", "viewBackgroundColor", "currentItemFontFamily"]) {
    if (appState[k] !== undefined) state[k] = appState[k];
  }
  return { type: "excalidraw", version: 2, source: "agent-tome", elements: live, appState: state, files: keptFiles };
}

/** The file's text for `scene`, keeping what `parsed` (from parseFile) had around the data. */
export function serializeFile(parsed, scene) {
  const json = JSON.stringify(scene, null, "\t");
  if (!parsed.markdown) return json + "\n";
  let head = parsed.head || NEW_FILE_HEAD;
  if (!head.endsWith("\n")) head += "\n";
  let out = head + "%%\n# Excalidraw Data\n\n## Text Elements\n" + textElements(scene.elements || []);
  if (parsed.links) out += parsed.links.endsWith("\n") ? parsed.links : parsed.links + "\n";
  if (parsed.embedded) out += parsed.embedded.endsWith("\n") ? parsed.embedded : parsed.embedded + "\n";
  out += "## Drawing\n```json\n" + json + "\n```\n%%";
  if (parsed.tail && parsed.tail.trim()) out += "\n" + parsed.tail.replace(/^\n+/, "");
  else out += "\n";
  return out;
}

/** The text in a scene (for search and the agent): the text elements' words, one per line. */
export function sceneText(scene) {
  return (scene.elements || [])
    .filter((e) => e.type === "text" && !e.isDeleted)
    .map((e) => (e.originalText || e.text || "").trim())
    .filter(Boolean)
    .join("\n");
}

/** A number that changes whenever the scene does (elements' versions, files). */
export function sceneSignature(elements, files = {}) {
  let n = 0;
  for (const e of elements) n = (n * 31 + (e.version || 0) + (e.isDeleted ? 7 : 0)) % 2147483647;
  return `${elements.length}:${n}:${Object.keys(files || {}).length}`;
}
