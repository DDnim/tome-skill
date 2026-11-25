// Comments on a region of a drawing: the person picks elements or drags
// over an area and writes what an agent should change there, or asks. The
// server keeps the threads; an agent that waits for them gets the ones sent.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getCommonBounds, sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { api } from "./api.js";
import { t } from "./i18n.js";
import { useRedraw } from "./overlay.js";
import { inRegion } from "./regions.js";

const POLL_MS = 1500;
/** A drag shorter than this (px) is a click: the thing under it, or a small area around it. */
const CLICK_PX = 6;
const CLICK_AREA = 80;

/** A drawing's threads and whether an agent is listening, asked again every moment the tab shows. */
export function useComments(path) {
  const [state, setState] = useState({ threads: [], listening: false });
  const seen = useRef("");
  const load = useCallback(async () => {
    try {
      const r = await api.comments(path);
      const sig = JSON.stringify(r);
      if (sig === seen.current) return;
      seen.current = sig;
      setState({ threads: r.threads, listening: r.listening });
    } catch {
      // The server is away for a moment: what was last read stays.
    }
  }, [path]);
  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);
  return { ...state, reload: load };
}

const bounds = (e) => getCommonBounds([e]);
const brief = (e) => ({ id: e.id, type: e.type, ...(e.type === "text" && e.text ? { text: e.text } : {}) });
const rectOf = (elements) => {
  const [x1, y1, x2, y2] = getCommonBounds(elements);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};

/** What a comment would be about now: the selected elements (with the text inside them); null: nothing is selected. */
export function selectionDraft(a) {
  const selected = a.getAppState().selectedElementIds || {};
  const all = a.getSceneElements();
  const ids = new Set();
  for (const e of all) {
    if (!selected[e.id]) continue;
    ids.add(e.id);
    for (const b of e.boundElements || []) if (b.type === "text") ids.add(b.id);
  }
  const elements = all.filter((e) => ids.has(e.id));
  return elements.length ? { rect: rectOf(elements), ids: elements.map((e) => e.id) } : null;
}

/** The draft a drag (or a click) over the canvas makes, both corners in viewport px. */
function areaDraft(a, from, to) {
  const appState = a.getAppState();
  const p1 = viewportCoordsToSceneCoords({ clientX: Math.min(from.x, to.x), clientY: Math.min(from.y, to.y) }, appState);
  const p2 = viewportCoordsToSceneCoords({ clientX: Math.max(from.x, to.x), clientY: Math.max(from.y, to.y) }, appState);
  const all = a.getSceneElements();
  if (Math.hypot(to.x - from.x, to.y - from.y) < CLICK_PX) {
    const hit = inRegion(all, { x: p1.x, y: p1.y, width: 0, height: 0 }, bounds);
    if (hit.length) {
      // The smallest thing under the click.
      const area = (e) => {
        const [x1, y1, x2, y2] = bounds(e);
        return (x2 - x1) * (y2 - y1);
      };
      const one = hit.reduce((m, e) => (area(e) < area(m) ? e : m));
      return { rect: rectOf([one]), ids: [one.id] };
    }
    const half = CLICK_AREA / 2 / appState.zoom.value;
    return { rect: { x: p1.x - half, y: p1.y - half, width: half * 2, height: half * 2 }, ids: [] };
  }
  const rect = { x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y };
  return { rect, ids: inRegion(all, rect, bounds).map((e) => e.id) };
}

/** Over the canvas while an area is picked: a drag draws it. */
function Picker({ apiRef, onPick, onCancel }) {
  const [drag, setDrag] = useState(null);
  useEffect(() => {
    const key = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onCancel]);
  const at = (e) => ({ x: e.clientX, y: e.clientY });
  return (
    <div
      className="board-picker"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ from: at(e), to: at(e) });
      }}
      onPointerMove={(e) => drag && setDrag({ from: drag.from, to: at(e) })}
      onPointerUp={(e) => {
        if (!drag || !apiRef.current) return;
        onPick(areaDraft(apiRef.current, drag.from, at(e)));
        setDrag(null);
      }}
    >
      <div className="board-picker-hint">{t("Drag over an area, or click something. Esc cancels.")}</div>
      {drag && (
        <div className="board-region" style={{ left: Math.min(drag.from.x, drag.to.x), top: Math.min(drag.from.y, drag.to.y), width: Math.abs(drag.to.x - drag.from.x), height: Math.abs(drag.to.y - drag.from.y) }} />
      )}
    </div>
  );
}

/** A region of the drawing, where it shows now. */
function place(rect, appState) {
  const zoom = appState.zoom.value;
  const p = sceneCoordsToViewportCoords({ sceneX: rect.x, sceneY: rect.y }, appState);
  return { left: p.x, top: p.y, width: rect.width * zoom, height: rect.height * zoom };
}

/** Over the canvas: a numbered pin at each open thread, and the region of the one in hand. */
function Pins({ apiRef, threads, active, draft, onOpen }) {
  useRedraw();
  const a = apiRef.current;
  if (!a) return null;
  const appState = a.getAppState();
  const shown = active ? threads.find((x) => x.id === active) : null;
  const region = draft?.rect ?? shown?.rect;
  return (
    <div className="board-overlay">
      {region && <div className="board-region" style={place(region, appState)} />}
      {threads.map((x) => {
        const p = place(x.rect, appState);
        return (
          <button key={x.id} className={"board-pin" + (x.id === active ? " on" : "")} style={{ left: p.left + p.width, top: p.top }} onClick={() => onOpen(x.id)}>
            {x.n}
          </button>
        );
      })}
    </div>
  );
}

function Composer({ placeholder, send, onSubmit, onCancel, autoFocus }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text);
      setText("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="board-composer">
      <textarea
        autoFocus={autoFocus}
        rows={3}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape" && onCancel) onCancel();
        }}
      />
      <div className="board-composer-actions">
        {onCancel && <button onClick={onCancel}>{t("Cancel")}</button>}
        <button className="primary" disabled={!text.trim() || busy} onClick={submit}>{send ? t("Send to Agent") : t("Save")}</button>
      </div>
    </div>
  );
}

/**
 * The comments of one drawing: the pins, the picker, and the panel.
 * `ui`: {open, picking, draft, active}; `picture(elements)`: a png (base64) of them.
 */
export function Comments({ apiRef, path, theme, comments, ui, setUi, picture }) {
  const { threads, listening, reload } = comments;
  const open = threads.filter((x) => !x.resolved);
  const act = async (body) => {
    await api.comment(path, body);
    await reload();
  };

  const create = async (text) => {
    const a = apiRef.current;
    const live = new Map(a.getSceneElements().map((e) => [e.id, e]));
    const elements = ui.draft.ids.map((id) => live.get(id)).filter(Boolean);
    let png = "";
    try {
      png = elements.length ? await picture(elements) : "";
    } catch (e) {
      console.error("region png", e);
    }
    await act({ op: "new", rect: ui.draft.rect, elements: elements.map(brief), text, png, send: listening });
    setUi((u) => ({ ...u, draft: null, open: true }));
  };

  /** Shows a thread, and brings what it is about into view. */
  const show = (id) => {
    setUi((u) => ({ ...u, open: true, draft: null, active: id }));
    const thread = threads.find((x) => x.id === id);
    const a = apiRef.current;
    if (!thread || !a) return;
    const ids = new Set(thread.elements.map((e) => e.id));
    const elements = a.getSceneElements().filter((e) => ids.has(e.id));
    if (elements.length) a.scrollToContent(elements, { fitToContent: false, animate: true });
  };

  return (
    <>
      <Pins apiRef={apiRef} threads={open} active={ui.active} draft={ui.draft} onOpen={show} />
      {ui.picking && (
        <Picker apiRef={apiRef} onCancel={() => setUi((u) => ({ ...u, picking: false }))} onPick={(draft) => setUi((u) => ({ ...u, picking: false, draft, open: true, active: null }))} />
      )}
      {ui.open && (
        <div className={"board-comments " + theme}>
          <div className="board-comments-head">
            <b>{t("Comments")}</b>
            <button onClick={() => setUi((u) => ({ ...u, open: false, draft: null, active: null }))} title={t("Close")}>×</button>
          </div>
          <div className={"board-comments-agent" + (listening ? " on" : "")}>
            {listening ? t("An agent is listening.") : t("No agent is listening. Comments are saved for it to read.")}
          </div>
          {ui.draft && (
            <div className="board-thread on">
              <div className="board-thread-head">{t("New comment")}{ui.draft.ids.length > 0 && <span> · {t("{n} elements", { n: ui.draft.ids.length })}</span>}</div>
              <Composer autoFocus send={listening} placeholder={t("What should change here? Or ask.")} onSubmit={create} onCancel={() => setUi((u) => ({ ...u, draft: null }))} />
            </div>
          )}
          {open.length === 0 && !ui.draft && <div className="board-comments-empty">{t("No comments yet.")}</div>}
          {open.map((x) => {
            const last = x.messages[x.messages.length - 1];
            const mine = last?.from === "user";
            return (
              <div key={x.id} className={"board-thread" + (x.id === ui.active ? " on" : "")} onClick={() => x.id !== ui.active && show(x.id)}>
                <div className="board-thread-head">
                  <span className="board-pin static">{x.n}</span>
                  {mine && x.sent && <span>{t("Sent to Agent")}</span>}
                  <button onClick={(e) => { e.stopPropagation(); act({ op: "resolve", id: x.id }); }}>{t("Resolve")}</button>
                </div>
                {x.messages.map((m, i) => (
                  <div key={i} className={"board-message " + m.from}>
                    <i>{m.from === "agent" ? t("Agent") : t("You")}</i>
                    <div>{m.text}</div>
                  </div>
                ))}
                {x.id === ui.active && (
                  <>
                    {mine && !x.sent && listening && (
                      <div className="board-composer-actions"><button className="primary" onClick={() => act({ op: "send", id: x.id })}>{t("Send to Agent")}</button></div>
                    )}
                    <Composer send={listening} placeholder={t("Reply")} onSubmit={(text) => act({ op: "say", id: x.id, text, send: listening })} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
