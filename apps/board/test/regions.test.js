import test from "node:test";
import assert from "node:assert/strict";
import { changedIds, inRegion } from "../src/regions.js";

test("changed: new or different elements, not a new version alone", () => {
  const a = { id: "a", x: 0, version: 1, versionNonce: 5, updated: 1, seed: 1 };
  const b = { id: "b", x: 0, text: "x", version: 1 };
  const after = [
    { ...a, version: 9, versionNonce: 7, updated: 2, seed: 3 },
    { ...b, text: "y" },
    { id: "c", x: 1 },
    { id: "d", x: 1, isDeleted: true },
  ];
  assert.deepEqual(changedIds([a, b], after), ["b", "c"]);
});

test("in region: elements whose bounds meet it", () => {
  const els = [
    { id: "in", b: [10, 10, 20, 20] },
    { id: "edge", b: [100, 0, 120, 5] },
    { id: "out", b: [200, 200, 220, 220] },
    { id: "gone", b: [10, 10, 20, 20], isDeleted: true },
  ];
  const ids = inRegion(els, { x: 0, y: 0, width: 100, height: 100 }, (e) => e.b).map((e) => e.id);
  assert.deepEqual(ids, ["in", "edge"]);
});
