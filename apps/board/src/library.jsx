// The list of boards: the vault's drawings, the last changed first; search
// by name; a new board.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, boardUrl } from "./api.js";
import { emptyText } from "./format.js";
import { lang, t } from "./i18n.js";

function when(ms) {
  try {
    return new Date(ms).toLocaleString(lang === "en" ? undefined : lang, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

/** The boards whose name has every word of `query` (case ignored). */
export function matching(boards, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return boards.filter((b) => words.every((w) => b.name.toLowerCase().includes(w)));
}

export function Library() {
  const [boards, setBoards] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const nameField = useRef(null);

  useEffect(() => {
    document.title = t("Boards");
    const load = () => api.boards().then((r) => setBoards(r.boards), (e) => setError(String(e.message || e)));
    load();
    // Back on this tab: what was drawn meanwhile shows.
    const again = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, []);
  useEffect(() => {
    if (naming) nameField.current?.focus();
  }, [naming]);

  const shown = useMemo(() => matching(boards || [], query), [boards, query]);

  const create = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const made = await api.create(title, emptyText());
      location.assign(boardUrl(made.name));
    } catch (err) {
      setError(String(err.message || err));
      setBusy(false);
    }
  };

  return (
    <div className="library">
      <div className="library-head">
        <h1>{t("Boards")}</h1>
        <input type="search" placeholder={t("Search")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="primary" onClick={() => setNaming(true)} disabled={naming}>{t("New board")}</button>
        {naming && (
          <form className="library-new" onSubmit={create}>
            <input ref={nameField} placeholder={t("Name of the new board")} value={title} maxLength={80}
                   onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setNaming(false)} />
            <button className="primary" type="submit" disabled={!title.trim() || busy}>{t("Create")}</button>
            <button type="button" onClick={() => setNaming(false)}>{t("Cancel")}</button>
          </form>
        )}
      </div>
      {error && <div className="library-error">{error}</div>}
      {boards && shown.length === 0 && <div className="library-empty">{boards.length ? t("Nothing matches.") : t("No boards yet.")}</div>}
      <div className="library-grid">
        {shown.map((b) => (
          <a key={b.path} className="library-card" href={boardUrl(b.name)}>
            <div className="library-thumb">
              {b.png ? <img src={api.pngUrl(b.path, b.mtime)} alt="" loading="lazy" /> : <span>✎</span>}
            </div>
            <div className="library-name">{b.name}</div>
            <div className="library-time">{when(b.mtime)}</div>
          </a>
        ))}
      </div>
      <div className="library-foot">
        {t("Drawn with Excalidraw.")} <a href="/THIRD_PARTY_LICENSES.txt">{t("Third-party licenses")}</a>
      </div>
    </div>
  );
}
