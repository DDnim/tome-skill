// The board page: `/` is the list of boards, `/b/<name>` a drawing.
//
// A drawing is Excalidraw over a file of the vault. tome-board hands the
// page the file's text and its rev; a moment after each change the page
// hands back the new text and a png of the whole drawing; and it takes the
// file again when something else wrote it (an agent's edit), marking what
// changed.
import "./asset-path.js";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CaptureUpdateAction,
  Excalidraw,
  FONT_FAMILY,
  MainMenu,
  WelcomeScreen,
  exportToBlob,
  getCommonBounds,
  restoreElements,
  sceneCoordsToViewportCoords,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { api, boardUrl } from "./api.js";
import { Comments, selectionDraft, useComments } from "./comments.jsx";
import { emptyText, parseFile, sceneSignature, sceneToSave, serializeFile } from "./format.js";
import { excalidrawLang, t } from "./i18n.js";
import { Library } from "./library.jsx";
import { overlayBus, useRedraw } from "./overlay.js";
import { changedIds } from "./regions.js";

const SAVE_DELAY = 800;
const THEME_KEY = "tome-board-theme";

/** Excalidraw's font names by id, and the CJK hand-drawn face Excalifont falls back to. */
const FONT_NAMES = Object.fromEntries(Object.entries(FONT_FAMILY).map(([name, id]) => [id, name]));
const CJK_HAND_DRAWN = "Xiaolai";

/**
 * Loads the fonts the text is drawn with: a picture made before they are
 * (just opened, or an agent's new text) falls back to a serif. At most 3s.
 */
async function loadTextFonts(elements) {
  const loads = [];
  for (const e of elements) {
    if (e.type !== "text" || e.isDeleted || !FONT_NAMES[e.fontFamily]) continue;
    const families = [FONT_NAMES[e.fontFamily]];
    if (e.fontFamily === FONT_FAMILY.Excalifont) families.push(CJK_HAND_DRAWN);
    for (const f of families) loads.push(document.fonts.load(`${e.fontSize || 20}px "${f}"`, e.text || "a").catch(() => []));
  }
  if (loads.length === 0) return;
  await Promise.race([Promise.all(loads), new Promise((done) => setTimeout(done, 3000))]);
}

/** A png (base64) of the whole drawing on a light background; "" when nothing is drawn. */
async function pngBase64(elements, appState, files) {
  const live = elements.filter((e) => !e.isDeleted);
  if (live.length === 0) return "";
  await loadTextFonts(live);
  const blob = await exportToBlob({
    elements: live,
    appState: { ...appState, exportBackground: true, exportWithDarkMode: false, viewBackgroundColor: appState.viewBackgroundColor || "#ffffff" },
    files,
    mimeType: "image/png",
    exportPadding: 24,
    getDimensions: (w, h) => {
      // Big enough to read, not a huge file: the longer side at most 2400px.
      const scale = Math.min(2, 2400 / Math.max(w, h, 1));
      return { width: w * scale, height: h * scale, scale };
    },
  });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

function savedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // No storage (a private window): the system's.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Over the canvas: green frames around the elements changed from outside. */
function Overlay({ apiRef, changed }) {
  useRedraw();
  const a = apiRef.current;
  if (!a || changed.length === 0) return null;
  const appState = a.getAppState();
  const zoom = appState.zoom.value;
  const live = new Map(a.getSceneElements().map((e) => [e.id, e]));
  return (
    <div className="board-overlay">
      {changed.map((id) => live.get(id)).filter(Boolean).map((e) => {
        const [x1, y1, x2, y2] = getCommonBounds([e]);
        const p = sceneCoordsToViewportCoords({ sceneX: x1 - 6 / zoom, sceneY: y1 - 6 / zoom }, appState);
        return <div key={e.id} className="board-changed" style={{ left: p.x, top: p.y, width: (x2 - x1) * zoom + 12, height: (y2 - y1) * zoom + 12 }} />;
      })}
    </div>
  );
}

/** One drawing: `file` is {path, text, rev, file, png} as tome-board read it. */
function Board({ name, file }) {
  const [api_, setApi] = useState(null);
  const [changed, setChanged] = useState([]);
  const [status, setStatus] = useState({ kind: "saved" });
  const [gone, setGone] = useState(false);
  const comments = useComments(file.path);
  const [commentUi, setCommentUi] = useState({ open: false, picking: false, draft: null, active: null });
  const [theme, setTheme] = useState(savedTheme);
  const [opened, setOpened] = useState(() => ({ parsed: parseFile(file.text, file.path), key: 1 }));
  const apiRef = useRef(null);
  apiRef.current = api_;
  const parsedRef = useRef(opened.parsed);
  const revRef = useRef(file.rev);
  /** The text last handed to tome-board: the wait's answer with it is our own save. */
  const sentRef = useRef(file.text);
  const savedSig = useRef("");
  const timer = useRef(null);
  const saving = useRef(Promise.resolve());

  /** The file as something else wrote it: its scene replaces ours, keeping the view; ⌘Z undoes it. */
  const takeOutside = useCallback((text, rev) => {
    revRef.current = rev;
    sentRef.current = text;
    clearTimeout(timer.current);
    timer.current = null;
    const a = apiRef.current;
    let parsed;
    try {
      parsed = parseFile(text, file.path);
    } catch (e) {
      setStatus({ kind: "error", message: String(e.message || e) });
      return;
    }
    parsedRef.current = parsed;
    if (!a) {
      // Still opening: open the new text instead.
      savedSig.current = "";
      setOpened((o) => ({ parsed, key: o.key + 1 }));
      return;
    }
    const before = a.getSceneElements();
    // An agent edits text without measuring it: the widths are measured again here.
    const elements = restoreElements(parsed.scene.elements || [], null, { refreshDimensions: true, repairBindings: true });
    const files = Object.values(parsed.scene.files || {});
    if (files.length) a.addFiles(files);
    a.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    // By what they are, not their version: an agent rarely bumps it.
    setChanged(changedIds(before, a.getSceneElements()));
    savedSig.current = sceneSignature(a.getSceneElementsIncludingDeleted(), a.getFiles());
    setStatus({ kind: "saved" });
    // Written again in this page's shape (the Text Elements from the scene) and with a new picture.
    savedSig.current = "";
    save();
  }, [file.path]);

  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    // One save at a time, each from the rev the one before it made.
    saving.current = saving.current.then(async () => {
      const a = apiRef.current;
      if (!a) return;
      const elements = a.getSceneElementsIncludingDeleted();
      const files = a.getFiles();
      const sig = sceneSignature(elements, files);
      if (sig === savedSig.current) return;
      const appState = a.getAppState();
      const text = serializeFile(parsedRef.current, sceneToSave(elements, appState, files));
      setStatus({ kind: "saving" });
      let png = "";
      try {
        png = await pngBase64(elements, appState, files);
      } catch (e) {
        console.error("png", e);
      }
      sentRef.current = text;
      try {
        const { rev } = await api.save(file.path, text, revRef.current, png);
        revRef.current = rev;
        savedSig.current = sig;
        setStatus({ kind: "saved" });
      } catch (e) {
        if (e.code === "Conflict") {
          // Someone else wrote it first: theirs is taken (the wait hands it over).
          sentRef.current = "";
          return;
        }
        setStatus({ kind: "error", message: String(e.message || e) });
      }
    });
    return saving.current;
  }, [file.path]);

  // Waits for the file to change under the page.
  useEffect(() => {
    const stop = new AbortController();
    (async () => {
      while (!stop.signal.aborted) {
        try {
          const r = await api.wait(file.path, revRef.current, stop.signal);
          if (stop.signal.aborted) return;
          if (r.rev === null) return setGone(true);
          if (r.rev === revRef.current) continue;
          if (r.text === sentRef.current) revRef.current = r.rev;
          else takeOutside(r.text, r.rev);
        } catch {
          if (stop.signal.aborted) return;
          await new Promise((done) => setTimeout(done, 2000));
        }
      }
    })();
    return () => stop.abort();
  }, [file.path, takeOutside]);

  useEffect(() => {
    document.title = name.split("/").pop();
    document.body.classList.add("drawing");
    // Leaving with a change not yet handed over: now.
    const leave = () => timer.current && save();
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", leave);
    return () => {
      document.body.classList.remove("drawing");
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", leave);
    };
  }, [name, save]);
  useEffect(() => overlayBus.emit(), [changed, comments.threads, commentUi]);

  /** A comment on what is selected; nothing selected: on the area dragged next. */
  const startComment = () => {
    const draft = apiRef.current ? selectionDraft(apiRef.current) : null;
    setCommentUi((u) => (draft ? { ...u, open: true, picking: false, draft, active: null } : { ...u, picking: !u.picking, draft: null }));
  };
  const openComments = comments.threads.filter((x) => !x.resolved).length;

  const copy = (text) => navigator.clipboard?.writeText(text).then(() => setStatus((s) => ({ ...s, note: t("Copied") })), () => {});
  useEffect(() => {
    if (!status.note) return;
    const id = setTimeout(() => setStatus((s) => ({ ...s, note: "" })), 1500);
    return () => clearTimeout(id);
  }, [status.note]);

  if (gone) return <Missing message={t("This board's file was removed.")} />;

  const initial = {
    elements: restoreElements(opened.parsed.scene.elements || [], null, { refreshDimensions: true, repairBindings: true }),
    appState: { ...(opened.parsed.scene.appState || {}), theme: savedTheme() },
    files: opened.parsed.scene.files || {},
    scrollToContent: true,
  };

  return (
    <>
      <Excalidraw
        key={opened.key}
        initialData={initial}
        excalidrawAPI={(a) => {
          setApi(a);
          apiRef.current = a;
          // What was opened counts as saved.
          setTimeout(() => {
            savedSig.current = sceneSignature(a.getSceneElementsIncludingDeleted(), a.getFiles());
          }, 0);
        }}
        langCode={excalidrawLang}
        onScrollChange={() => overlayBus.emit()}
        onChange={(elements, appState, files) => {
          overlayBus.emit();
          setTheme(appState.theme);
          try {
            localStorage.setItem(THEME_KEY, appState.theme);
          } catch {
            // No storage: not remembered.
          }
          if (sceneSignature(elements, files) === savedSig.current) return;
          clearTimeout(timer.current);
          timer.current = setTimeout(save, SAVE_DELAY);
        }}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: true, saveAsImage: true } }}
        renderTopRightUI={() => (
          <div className="board-status">
            <b>{name.split("/").pop()}</b>
            {status.note ? <span>{status.note}</span>
              : status.kind === "saving" ? <span>{t("Saving…")}</span>
              : status.kind === "error" ? <span className="bad" title={status.message}>{t("Not saved")}</span>
              : <span>{t("Saved")}</span>}
            {changed.length > 0 && (
              <button onClick={() => setChanged([])} title={t("Clear")}>{t("{n} changed from outside", { n: changed.length })} ×</button>
            )}
            <button className={"plain" + (commentUi.picking ? " on" : "")} onClick={startComment}>{t("Comment")}</button>
            <button className={"plain" + (commentUi.open ? " on" : "")} onClick={() => setCommentUi((u) => ({ ...u, open: !u.open, draft: null, active: null }))} title={t("Comments")}>
              {openComments}{comments.listening && <em className="board-listening" />}
            </button>
          </div>
        )}
      >
        <MainMenu>
          <MainMenu.ItemLink href="/">{t("All boards")}</MainMenu.ItemLink>
          <MainMenu.Item onSelect={() => copy(file.png)}>{t("Copy picture path")}</MainMenu.Item>
          <MainMenu.Item onSelect={() => copy(file.file)}>{t("Copy file path")}</MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.Help />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Hints.ToolbarHint />
          <WelcomeScreen.Hints.MenuHint />
          <WelcomeScreen.Hints.HelpHint />
        </WelcomeScreen>
      </Excalidraw>
      <Overlay apiRef={apiRef} changed={changed} />
      <Comments
        apiRef={apiRef}
        path={file.path}
        theme={theme}
        comments={comments}
        ui={commentUi}
        setUi={setCommentUi}
        picture={(elements) => pngBase64(elements, apiRef.current.getAppState(), apiRef.current.getFiles())}
      />
    </>
  );
}

function Missing({ message, onCreate }) {
  return (
    <div className="missing">
      <div>{message}</div>
      <div className="missing-actions">
        {onCreate && <button className="primary" onClick={onCreate}>{t("Create it")}</button>}
        <a href="/">{t("All boards")}</a>
      </div>
    </div>
  );
}

/** `/b/<name>`: the drawing of that name, or the offer to make it. */
function BoardRoute({ name }) {
  const [state, setState] = useState({ kind: "loading" });
  useEffect(() => {
    api.board(name).then(
      (file) => setState({ kind: "open", file }),
      (e) => setState(e.code === "NotFound" ? { kind: "missing" } : { kind: "error", message: String(e.message || e) }),
    );
  }, [name]);
  if (state.kind === "loading") return null;
  if (state.kind === "open") return <Board name={name} file={state.file} />;
  if (state.kind === "error") return <Missing message={`${t("The board could not be opened.")} ${state.message}`} />;
  const create = async () => {
    try {
      const made = await api.create(name.split("/").pop(), emptyText());
      location.replace(boardUrl(made.name));
    } catch (e) {
      setState({ kind: "error", message: String(e.message || e) });
    }
  };
  return <Missing message={t("There is no board named “{name}”.", { name })} onCreate={create} />;
}

function nameFromPath(pathname) {
  if (!pathname.startsWith("/b/")) return null;
  try {
    return pathname.slice(3).split("/").map(decodeURIComponent).filter(Boolean).join("/") || null;
  } catch {
    return null;
  }
}

const name = nameFromPath(location.pathname);
createRoot(document.getElementById("root")).render(name ? <BoardRoute name={name} /> : <Library />);
