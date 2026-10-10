import assert from "node:assert/strict";
import { test } from "node:test";
import { citationLocator } from "../citationLocator.ts";

const findings = [
  { claim: "第一项直接证据描述研究过程和调度策略。", sourceIds: ["source-a"],
    evidence: [{sourceId:"source-a", locator:"Line 17"}] },
  { claim: "第二项直接证据描述研究结果审核流程。", sourceIds: ["source-a"],
    evidence: [{sourceId:"source-a", locator:"Line 47"}] },
];
const report = findings.map((finding, index) =>
  finding.claim + "\n\n这项分析保留原文出处，以供审查 [" + (index + 1) + "](#source-a)").join("\n\n");

test("inline citations anchor to explicit nearby finding evidence", () => {
  const first = report.indexOf("[1](#source-a)");
  const last = report.indexOf("[2](#source-a)");
  assert.equal(citationLocator(report, first, "source-a", findings), "Line 17");
  assert.equal(citationLocator(report, last, "source-a", findings), "Line 47");
});

test("unknown, missing, and cross-source quotes stay unlocated", () => {
  assert.equal(citationLocator("一段没有论断的报告 [1](#source-a)", 11, "source-a", findings), undefined);
  assert.equal(citationLocator(report, report.indexOf("[2]"), "source-other", findings), undefined);
  assert.equal(citationLocator(report, -1, "source-a", findings), undefined);
  assert.equal(citationLocator(report, undefined, "source-a", findings), undefined);
});

test("multiple different locators for one finding do not pretend precision", () => {
  const ambiguous = [{claim:findings[0].claim, sourceIds:["source-a"], evidence:[
    {sourceId:"source-a",locator:"Line 17"}, {sourceId:"source-a",locator:"Line 47"},
  ]}];
  assert.equal(citationLocator(report, report.indexOf("[1]"), "source-a", ambiguous), undefined);
});
