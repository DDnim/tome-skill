// The calls to the board's server (skills/tome-board/scripts/board.mjs). Errors carry a
// code (`NotFound`, `Conflict`, …) as `code`.

const WRITE = { "content-type": "application/json", "x-tome-board": "1" };

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

export const api = {
  /** {dir, boards: [{path, name, mtime, png}]}, the last changed first. */
  boards: () => call("/api/boards"),
  /** {path, text, rev, file, png} of the drawing a name (its address) says. */
  board: (name) => call("/api/board?" + q({ name })),
  /** A new drawing called `title` holding `text`: {path, name}. */
  create: (title, text) => call("/api/boards", { method: "POST", headers: WRITE, body: JSON.stringify({ title, text }) }),
  /** Saves `text` made from rev `base`, with the picture (base64, "" for none): {rev}. */
  save: (path, text, base, png) => call("/api/board?" + q({ path }), { method: "PUT", headers: WRITE, body: JSON.stringify({ text, base, png }) }),
  /** Answers when the drawing is not at `rev` any more ({rev, text}; {rev: null}: gone), or with the same rev after a while. */
  wait: (path, rev, signal) => call("/api/wait?" + q({ path, rev }), { signal }),
  pngUrl: (path, mtime) => "/api/png?" + q({ path, t: mtime }),
};

/** A drawing's address on this page. */
export const boardUrl = (name) => "/b/" + name.split("/").map(encodeURIComponent).join("/");
