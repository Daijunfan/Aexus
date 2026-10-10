import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const entry = `
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ResearchHistory } from "./workspace/ResearchHistory";
import { ResearchTabs } from "./workspace/ResearchTabs";
import { useWorkflowUpdates, useAgentActivityPreviews } from "./workspace/useWorkflowUpdates";

const history = Array.from({ length: 6 }, (_, i) => ({
  id: "history-" + i, engineId: "deep-research", engineVersion: "2.0.0",
  createdAt: Date.UTC(2026, 9, i + 1), updatedAt: 0, revision: 1, files: [],
  status: i % 3 === 0 ? "running" : "completed",
  summary: { topic: (i % 2 === 0 ? "策略调研 " : "行业观察 ") + i },
}));
const jobFor = (id, revision) => ({
  id, engineId: "deep-research", engineVersion: "2.0.0", revision,
  createdAt: 1, updatedAt: revision, status: "running", files: [],
  summary: {
    topic: id, graph: { nodes: [{
      id: "node-1", status: "running", employeeId: "employee-1", messageId: "message-1",
    }] },
  },
});
const server = { a: jobFor("a", 1), b: jobFor("b", 3) };
const watchers = new Map();
const calls = [];
let delayA = false;
let releaseA;
let pendingA = false;
const client = {
  invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === "workflow.get") {
      const response = structuredClone(server[args.id]);
      if (args.id === "a" && delayA) {
        delayA = false;
        pendingA = true;
        return new Promise(resolve => {
          releaseA = () => { pendingA = false; resolve(response); };
        });
      }
      if (response.revision === args.ifRevision) {
        return { id: response.id, engineId: response.engineId,
          revision: response.revision, unchanged: true };
      }
      return response;
    }
    if (command === "session.status") return [{
      currentTask: { messageId: "message-1" },
      activityPreview: { kind: "tool", text: "正在读取材料" },
    }];
    throw Error("Unexpected call " + command);
  },
  watchWorkflow: (id, cb) => {
    if (!watchers.has(id)) watchers.set(id, new Set());
    watchers.get(id).add(cb);
    return () => watchers.get(id).delete(cb);
  },
};
function Demo() {
  const [tab, setTab] = useState("graph");
  const [job, setJob] = useState(jobFor("a", 1));
  const [opened, setOpened] = useState("");
  const [error, setError] = useState("");
  const selected = useRef("a");
  const current = useRef(job);
  const apply = value => { current.current = value; setJob(value); };
  useWorkflowUpdates({ client, job, selected, current, onUpdate: apply, onError: setError });
  const activities = useAgentActivityPreviews({ client, job, tab, selectedNodeId: "node-1" });
  window.workbenchFixture = {
    calls,
    emit(id) { watchers.get(id)?.forEach(cb => cb()); },
    bump(id) {
      server[id] = { ...server[id], revision: server[id].revision + 1 };
      watchers.get(id)?.forEach(cb => cb());
    },
    switchTo(id) {
      selected.current = id;
      current.current = structuredClone(server[id]);
      setJob(current.current);
    },
    delayNextA() { delayA = true; },
    hasPendingA() { return pendingA; },
    releaseA() { releaseA?.(); },
    watcherCount(id) { return watchers.get(id)?.size ?? 0; },
  };
  return (
    <>
      <ResearchHistory history={history} hasMore={false} loading={false}
        busy={false} onOpen={setOpened} onMore={() => {}} />
      <p id="opened">{opened}</p>
      <ResearchTabs active={tab} jobId={job.id} sourceCount={2}
        findingCount={3} onChange={setTab} />
      <button id="detail" onClick={() => setTab("board")}>详情视图</button>
      <button id="sources" onClick={() => setTab("sources")}>来源视图</button>
      <p id="revision">{job.id}:{job.revision}</p>
      <p id="activity">{activities.map(item => item.preview.text).join(",")}</p>
      <p id="errors">{error}</p>
    </>
  );
}
createRoot(document.getElementById("root")).render(<Demo />);
`;

const bundle = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "workspace-test.tsx", loader: "tsx" },
  bundle: true, platform: "browser", format: "iife", write: false,
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator("#revision").getByText("a:1").waitFor();

  const search = page.getByLabel("搜索研究记录");
  await search.fill("策略");
  assert.equal(await page.locator(".dr-recent > button:not(.dr-history-more)").count(), 3);
  await page.getByLabel("筛选研究状态").selectOption("completed");
  assert.equal(await page.locator(".dr-recent > button:not(.dr-history-more)").count(), 2);
  await page.getByText("策略调研 2").click();
  assert.equal(await page.locator("#opened").textContent(), "history-2");

  const graph = page.getByRole("tab", { name: "研究地图" });
  await graph.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: "比较矩阵" }).getAttribute("aria-selected"), "true");
  await page.locator("#detail").click();
  assert.equal(await page.getByRole("tab", { name: "成果总览" }).getAttribute("aria-selected"), "true");
  await page.getByRole("button", { name: "返回成果总览" }).click();
  assert.equal(await page.getByRole("tab", { name: "成果总览" }).getAttribute("aria-selected"), "true");

  await page.evaluate(() => window.workbenchFixture.bump("a"));
  await page.waitForFunction(() => document.querySelector("#revision")?.textContent === "a:2");
  assert.equal(
    await page.evaluate(() =>
      window.workbenchFixture.calls.some(call =>
        call.command === "workflow.get" && call.args.id === "a" && call.args.ifRevision === 1)),
    true,
  );
  assert.equal(await page.evaluate(() => window.workbenchFixture.watcherCount("a")), 1);

  await page.evaluate(() => window.workbenchFixture.delayNextA());
  await page.evaluate(() => window.workbenchFixture.bump("a"));
  await page.waitForFunction(() => window.workbenchFixture.hasPendingA());
  await page.evaluate(() => window.workbenchFixture.switchTo("b"));
  await page.waitForFunction(() => document.querySelector("#revision")?.textContent === "b:3");
  await page.evaluate(() => window.workbenchFixture.releaseA());
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#revision").textContent(), "b:3");
  assert.equal(await page.evaluate(() => window.workbenchFixture.watcherCount("a")), 0);
  assert.equal(await page.evaluate(() => window.workbenchFixture.watcherCount("b")), 1);

  await page.evaluate(() => window.workbenchFixture.bump("b"));
  await page.waitForFunction(() => document.querySelector("#revision")?.textContent === "b:4");
  await page.getByRole("tab", { name: "研究地图" }).click();
  await page.locator("#activity").getByText("正在读取材料").waitFor();
  await page.locator("#sources").click();
  assert.equal(await page.locator("#activity").textContent(), "");
  assert.equal(await page.locator("#errors").textContent(), "");
  assert.deepEqual(errors, []);
  console.log("Workspace UI: history search/filter, keyboard tabs, event sync, stale-job guard and activity preview passed.");
} finally {
  await browser.close();
}
