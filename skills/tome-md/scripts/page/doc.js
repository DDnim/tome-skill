// A Markdown file as the page shows it: its top-level blocks, each with
// the lines of the file it came from, so a comment can say where it is.
// No DOM here: the page and the tests both use it.
import { marked } from "./vendor/marked.esm.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

marked.use({
  gfm: true,
  renderer: {
    // HTML written in the file is shown as text, not run.
    html(token) {
      return esc(token.raw ?? token.text ?? "");
    },
    // The page sets where a picture comes from (the server hands out the file's own pictures only).
    image({ href, title, text }) {
      return `<img data-src="${esc(href ?? "")}" alt="${esc(text ?? "")}"${title ? ` title="${esc(title)}"` : ""}>`;
    },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      const safe = /^(https?:|mailto:|#)/i.test(href ?? "") ? href : null;
      return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ""}>${inner}</a>` : `<span class="dead-link">${inner}</span>`;
    },
  },
});

const newlines = (s) => (s.match(/\n/g) || []).length;

/**
 * {front, blocks}: `front` is the YAML at the top (null: none); a block is
 * {raw, html, line, end, heading}: its text in the file, how it shows, its
 * first and last line (from 1) and the heading it is under.
 */
export function split(text) {
  let body = text.replace(/\r\n/g, "\n");
  let front = null;
  let line = 1;
  const m = body.match(/^---\n([\s\S]*?)\n---[ \t]*(\n|$)/);
  if (m) {
    front = m[1];
    line += newlines(m[0]);
    body = body.slice(m[0].length);
  }
  const tokens = marked.lexer(body);
  const blocks = [];
  let heading = null;
  for (const token of tokens) {
    const raw = token.raw ?? "";
    if (token.type !== "space") {
      if (token.type === "heading") heading = token.text;
      const one = [token];
      one.links = tokens.links;
      blocks.push({ raw, html: marked.parser(one), line, end: line + newlines(raw.replace(/\n+$/, "")), heading });
    }
    line += newlines(raw);
  }
  return { front, blocks };
}

/** The indexes of the blocks of `after` that `before` did not have (new or rewritten). */
export function changedBlocks(before, after) {
  const had = new Map();
  for (const b of before) had.set(b.raw.trim(), (had.get(b.raw.trim()) ?? 0) + 1);
  const out = [];
  after.forEach((b, i) => {
    const n = had.get(b.raw.trim()) ?? 0;
    if (n > 0) had.set(b.raw.trim(), n - 1);
    else out.push(i);
  });
  return out;
}

const squash = (s) => s.replace(/\s+/g, " ").trim();

/**
 * The block a comment's anchor is at now (the file may have changed since):
 * the one that still holds the start of what was quoted, the nearest to its
 * old line; else the one at that line. -1: nowhere. `textOf(i)`: block i's shown text.
 */
export function locate(blocks, anchor, textOf) {
  if (!anchor || blocks.length === 0) return -1;
  const head = squash(anchor.quote).slice(0, 24);
  const line = anchor.lines?.[0] ?? 1;
  let best = -1;
  if (head) {
    blocks.forEach((b, i) => {
      if (!squash(textOf(i)).includes(head)) return;
      if (best === -1 || Math.abs(b.line - line) < Math.abs(blocks[best].line - line)) best = i;
    });
  }
  if (best !== -1) return best;
  const at = blocks.findIndex((b) => b.line <= line && line <= b.end);
  if (at !== -1) return at;
  const after = blocks.findIndex((b) => b.line > line);
  return after === -1 ? blocks.length - 1 : after;
}
