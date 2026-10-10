import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeResearchHistory } from "../useResearchHistory.ts";

const view = (id, revision, createdAt = 1) => ({
  id, revision, createdAt, status: "running", engineId: "deep-research",
  engineVersion: "2.0.0", updatedAt: revision, summary: { topic: id }, files: [],
});

test("newer local workflow checkpoints survive stale history pages", () => {
  assert.deepEqual(
    mergeResearchHistory([view("a", 9)], [view("a", 7), view("b", 1, 5)])
      .map(({id,revision}) => [id,revision]),
    [["b",1],["a",9]],
  );
});

test("repeated pages and live updates merge by identity, not list length", () => {
  const merged = mergeResearchHistory(
    [view("latest", 1, 99), view("a", 1, 4)],
    [view("a", 2, 4), view("b", 1, 3), view("b", 2, 3)],
  );
  assert.deepEqual(merged.map(({id,revision}) => [id,revision]),
    [["latest",1],["a",2],["b",2]]);
});

test("equal revisions retain current local presentation state", () => {
  const local = {...view("a", 2), status: "paused"};
  assert.equal(mergeResearchHistory([local], [view("a", 2)])[0].status, "paused");
});
