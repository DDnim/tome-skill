// Pieces of 区域批注 that need no Excalidraw: which elements a region holds,
// and which elements an outside edit changed.

/** What an element is, without what changes on every save (version, nonce, time, seed). */
function essence(e) {
  const { version, versionNonce, updated, seed, ...rest } = e;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/** The ids of elements that are new or differ after an edit (deleted ones left out). */
export function changedIds(before, after) {
  const old = new Map(before.map((e) => [e.id, essence(e)]));
  return after.filter((e) => !e.isDeleted && old.get(e.id) !== essence(e)).map((e) => e.id);
}

/** The live elements whose bounds (`bounds(e)` → [x1, y1, x2, y2]) meet the region. */
export function inRegion(elements, rect, bounds) {
  const rx2 = rect.x + rect.width;
  const ry2 = rect.y + rect.height;
  return elements.filter((e) => {
    if (e.isDeleted) return false;
    const [x1, y1, x2, y2] = bounds(e);
    return x1 <= rx2 && x2 >= rect.x && y1 <= ry2 && y2 >= rect.y;
  });
}
