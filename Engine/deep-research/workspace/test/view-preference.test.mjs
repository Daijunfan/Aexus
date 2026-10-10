import assert from "node:assert/strict";
import { test } from "node:test";
import { readResearchView, rememberResearchView } from "../viewPreference.ts";

test("research view preference is scoped by job and ignores obsolete view names", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  rememberResearchView("job-one", "sources");
  rememberResearchView("job-two", "comparison");
  rememberResearchView("job-one", "unsupported-view");
  assert.equal(readResearchView("job-one"), "sources");
  assert.equal(readResearchView("job-two"), "comparison");
  assert.equal(readResearchView("other"), null);
  values.set("aexus:research:view:job-one", "retired-view");
  assert.equal(readResearchView("job-one"), null);
});

test("workbench remains usable when browser storage is unavailable", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("Storage blocked"); },
  });
  assert.equal(readResearchView("job-one"), null);
  assert.doesNotThrow(() => rememberResearchView("job-one", "graph"));
  delete globalThis.localStorage;
});
