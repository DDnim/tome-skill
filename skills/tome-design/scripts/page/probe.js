// Runs inside each board (a sandbox of its own origin). It tells the page
// how large the board's content is, and, while the page is taking a
// comment, what the person clicked or which area they dragged over. It
// talks to the page by messages only; it reads nothing outside the board.
(() => {
  if (window.parent === window) return;
  const send = (msg) => window.parent.postMessage({ tome: 1, ...msg }, "*");
  const MAX_TEXT = 600;
  const MAX_HTML = 1200;
  let picking = false;
  // On the canvas a board is a frame of its own size: what is taller is cut, not scrolled.
  if (new URLSearchParams(location.search).get("clip") === "1") {
    const css = document.createElement("style");
    css.textContent = "html,body{overflow:hidden!important}";
    document.head?.append(css);
  }

  /** A CSS path to the element, short enough to read, exact enough to find. */
  function cssPath(el) {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) {
        parts.unshift(`#${e.id}`);
        break;
      }
      let part = e.tagName.toLowerCase();
      const cls = [...e.classList].filter((c) => /^[A-Za-z][\w-]*$/.test(c)).slice(0, 2);
      if (cls.length) part += "." + cls.join(".");
      const parent = e.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === e.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(e) + 1})`;
      }
      parts.unshift(part);
      if (e === document.body) break;
    }
    return parts.join(" > ");
  }

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return [r.left + scrollX, r.top + scrollY, r.width, r.height];
  };
  const textOf = (el) => (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  const describe = (el, html) => ({ path: cssPath(el), tag: el.tagName.toLowerCase(), text: textOf(el) || el.getAttribute("aria-label") || el.getAttribute("alt") || "", ...(html ? { html: el.outerHTML.slice(0, MAX_HTML) } : {}) });

  // -- the size --
  let last = "";
  function size() {
    const d = document.documentElement;
    const b = document.body;
    const w = Math.max(d.scrollWidth, b?.scrollWidth ?? 0);
    const h = Math.max(d.scrollHeight, b?.scrollHeight ?? 0);
    const sig = `${w}x${h}`;
    if (sig !== last) {
      last = sig;
      send({ type: "size", w, h });
    }
  }
  addEventListener("load", size);
  new ResizeObserver(size).observe(document.documentElement);
  setTimeout(size, 0);

  // -- what the person points at --
  const box = document.createElement("div");
  box.setAttribute("data-tome-probe", "");
  box.style.cssText = "position:absolute;z-index:2147483647;pointer-events:none;border:2px solid #e0892b;background:rgba(224,137,43,.12);border-radius:3px;display:none;box-sizing:border-box";
  const place = (r) => {
    Object.assign(box.style, { display: "block", left: r[0] + "px", top: r[1] + "px", width: r[2] + "px", height: r[3] + "px" });
    if (!box.isConnected) document.body.append(box);
  };
  const hide = () => (box.style.display = "none");
  const target = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el && el !== box && el !== document.documentElement ? el : document.body;
  };

  let start = null;
  const dragRect = (e) => {
    const x = e.clientX + scrollX;
    const y = e.clientY + scrollY;
    return [Math.min(start[0], x), Math.min(start[1], y), Math.abs(x - start[0]), Math.abs(y - start[1])];
  };
  /** The elements a dragged area holds, the outermost first (an element and what is inside it: only the element). */
  function within(r) {
    const out = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el === box || el.closest("[data-tome-probe]") || ["SCRIPT", "STYLE", "LINK", "META"].includes(el.tagName)) continue;
      const [x, y, w, h] = rectOf(el);
      if (w === 0 || h === 0) continue;
      if (x >= r[0] - 1 && y >= r[1] - 1 && x + w <= r[0] + r[2] + 1 && y + h <= r[1] + r[3] + 1 && !out.some((o) => o.contains(el))) out.push(el);
      if (out.length >= 20) break;
    }
    return out;
  }

  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  addEventListener(
    "pointerdown",
    (e) => {
      if (!picking) return;
      stop(e);
      start = [e.clientX + scrollX, e.clientY + scrollY];
    },
    true,
  );
  addEventListener(
    "pointermove",
    (e) => {
      if (!picking) return;
      if (start) {
        const r = dragRect(e);
        if (r[2] > 6 || r[3] > 6) place(r);
        return;
      }
      place(rectOf(target(e)));
    },
    true,
  );
  addEventListener(
    "pointerup",
    (e) => {
      if (!picking || !start) return;
      stop(e);
      const r = dragRect(e);
      start = null;
      hide();
      if (r[2] > 6 || r[3] > 6) send({ type: "area", rect: r, elements: within(r).map((el) => describe(el, false)) });
      else {
        const el = target(e);
        send({ type: "pick", rect: rectOf(el), element: describe(el, true) });
      }
    },
    true,
  );
  for (const name of ["click", "mousedown", "mouseup", "dblclick", "contextmenu", "submit"]) {
    addEventListener(name, (e) => picking && stop(e), true);
  }
  addEventListener("pointerleave", () => picking && !start && hide());

  // The page's keys work while the board has the focus.
  addEventListener(
    "keydown",
    (e) => {
      const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
      if (e.key === "Escape" || (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && ["c", "f", "0", "ArrowLeft", "ArrowRight"].includes(e.key))) {
        if (picking || e.key === "Escape") e.preventDefault();
        send({ type: "key", key: e.key });
      }
    },
    true,
  );

  addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data || e.data.tome !== 1) return;
    if (e.data.type === "pick") {
      picking = Boolean(e.data.on);
      start = null;
      document.documentElement.style.cursor = picking ? "crosshair" : "";
      if (!picking) hide();
    }
  });
  send({ type: "ready" });
})();
