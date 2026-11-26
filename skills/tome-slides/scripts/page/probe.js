// Runs inside each slide (a sandbox of its own origin). It shows the
// slide's steps (elements with data-step) as far as the page says, tells
// the page how many there are, and, while the page is taking a comment,
// what the person clicked or which area they dragged over. It talks to
// the page by messages only; it reads nothing outside the slide.
(() => {
  if (window.parent === window) return;
  const send = (msg) => window.parent.postMessage({ tome: 1, ...msg }, "*");
  const MAX_TEXT = 600;
  const MAX_HTML = 1200;
  const query = new URLSearchParams(location.search);
  let picking = false;
  let presenting = false;
  // In the page a slide is a frame of its own size: what is larger is cut, not scrolled.
  const css = document.createElement("style");
  css.setAttribute("data-tome-probe", "");
  css.textContent =
    (query.get("clip") === "1" ? "html,body{overflow:hidden!important}" : "") +
    "*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}[data-tome-hidden]{opacity:0!important;visibility:hidden!important}[data-step]{transition:opacity .35s ease-out,visibility .35s}";
  document.head?.append(css);

  // -- steps: what shows on which press --
  const stepOf = (el) => Number(el.getAttribute("data-step")) || 0;
  const steps = () => Math.max(0, ...[...document.querySelectorAll("[data-step]")].map(stepOf).filter((n) => n <= 99));
  /** Shows the steps up to `at` (null: all of them). */
  function showSteps(at) {
    for (const el of document.querySelectorAll("[data-step]")) {
      if (at !== null && stepOf(el) > at) el.setAttribute("data-tome-hidden", "");
      else el.removeAttribute("data-tome-hidden");
    }
  }
  const asked = query.get("step");
  if (asked !== null && /^\d+$/.test(asked)) showSteps(Number(asked));

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

  // -- what the person points at --
  const box = document.createElement("div");
  box.setAttribute("data-tome-probe", "");
  box.style.cssText = "position:absolute;z-index:2147483647;pointer-events:none;border:3px solid #e0892b;background:rgba(224,137,43,.12);border-radius:4px;display:none;box-sizing:border-box";
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
        if (r[2] > 8 || r[3] > 8) place(r);
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
      if (r[2] > 8 || r[3] > 8) send({ type: "area", rect: r, elements: within(r).map((el) => describe(el, false)) });
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

  // The page's keys work while the slide has the focus.
  const KEYS = ["c", "C", "p", "P", "s", "S", "b", "B", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Backspace", "Enter"];
  addEventListener(
    "keydown",
    (e) => {
      const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
      if (e.key === "Escape" || (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && KEYS.includes(e.key))) {
        e.preventDefault();
        send({ type: "key", key: e.key, shift: e.shiftKey });
      }
    },
    true,
  );

  // -- links to other slides: the page shows that slide --
  const own = location.pathname.match(/^\/f\/([0-9a-f]{16})\//);
  /** The slide a link goes to (its path in the deck), or null. */
  function slideOfLink(a) {
    const href = a.getAttribute("href");
    if (!own || !href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
    let u;
    try {
      u = new URL(href, location.href);
    } catch {
      return null;
    }
    if (!u.pathname.startsWith(own[0])) return null;
    let rel;
    try {
      rel = decodeURIComponent(u.pathname.slice(own[0].length));
    } catch {
      return null;
    }
    return /\.html?$/i.test(rel) ? rel : null;
  }
  addEventListener("click", (e) => {
    if (picking) return;
    const a = e.target.closest?.("a[href]");
    const to = a ? slideOfLink(a) : null;
    if (to) {
      e.preventDefault();
      send({ type: "go", file: to });
      return;
    }
    if (a && a.getAttribute("href").startsWith("#")) e.preventDefault();
    // Presenting, a click on nothing that does anything moves on.
    if (presenting && !a && !e.target.closest?.("button, input, select, textarea, label, summary, video, audio, [onclick], [tabindex]")) send({ type: "next" });
  });

  addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data || e.data.tome !== 1) return;
    const m = e.data;
    if (m.type === "present") presenting = Boolean(m.on);
    if (m.type === "step") showSteps(Number.isFinite(m.at) ? m.at : null);
    if (m.type === "pick") {
      picking = Boolean(m.on);
      start = null;
      document.documentElement.style.cursor = picking ? "crosshair" : "";
      if (!picking) hide();
    }
  });
  /** The slide's ground (the page's own background, which a printed frame leaves out): its parts, as CSS. */
  function paper() {
    const clear = (cs) => /^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor) && cs.backgroundImage === "none";
    let cs = getComputedStyle(document.documentElement);
    if (clear(cs) && document.body) cs = getComputedStyle(document.body);
    return { color: cs.backgroundColor, image: cs.backgroundImage, size: cs.backgroundSize, position: cs.backgroundPosition, repeat: cs.backgroundRepeat };
  }
  const ready = () => send({ type: "ready", steps: steps(), paper: paper() });
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", ready);
  else ready();
})();
