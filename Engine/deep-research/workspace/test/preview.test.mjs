import assert from "node:assert/strict";
import { test } from "node:test";
import { sameActivityPreviews } from "../useWorkflowUpdates.ts";

const preview = (text = "正在读取来源", messageId = "task-one") =>
  [{ nodeId: "node-one", messageId, preview: {kind: "tool", text, detail: "已获取", tool: "browser"} }];

test("unchanged agent previews are recognized without false rerenders", () => {
  assert.equal(sameActivityPreviews(preview(), preview()), true);
  assert.equal(sameActivityPreviews([], []), true);
  assert.equal(sameActivityPreviews(preview(), []), false);
});

test("changed text, task identity, and details trigger fresh rendering", () => {
  assert.equal(sameActivityPreviews(preview(), preview("检查文献")), false);
  assert.equal(sameActivityPreviews(preview(), preview("正在读取来源", "new-message")), false);
  const changed = preview();
  changed[0].preview.detail = "出现错误";
  assert.equal(sameActivityPreviews(preview(), changed), false);
});
