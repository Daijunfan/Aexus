import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const entry = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ResearchHistory } from "./workspace/ResearchHistory";
import { useResearchHistory } from "./workspace/useResearchHistory";
const records = Array.from({length: 65}, (_, index) => ({
  id: "id-" + index, revision: 2, createdAt: 900 - index,
  updatedAt: 0, engineId: "deep-research", engineVersion: "2.0.0",
  status: index % 2 === 0 ? "completed" : "running",
  summary: { topic: "历史研究 " + index }, files: [],
}));
const requests = [];
let completeInitial;
let failSecond = true;
const client = {
  invoke: async (command, args) => {
    if (command !== "workflow.list") throw Error("Unexpected " + command);
    requests.push(args.offset);
    if (args.offset === 0) return new Promise(resolve => {
      completeInitial = () => resolve({ jobs: records.slice(0, 30), hasMore: true });
    });
    if (args.offset === 30 && failSecond) {
      failSecond = false;
      throw Error("暂时无法读取");
    }
    return { jobs: records.slice(args.offset, args.offset + 30),
      hasMore: args.offset + 30 < records.length };
  },
};
function App() {
  const [error, setError] = useState("");
  const { history, hasMore, loading, updateHistory, loadMoreHistory } = useResearchHistory(client, setError);
  window.fixture = {
    requests,
    release() { completeInitial?.(); },
    seed() {updateHistory({...records[5], revision: 6, status: "paused"});
      updateHistory({...records[0], id: "fresh", createdAt: 999});},
  };
  return (
    <>
      <ResearchHistory history={history} hasMore={hasMore} loading={loading}
        busy={false} onOpen={() => {}} onMore={() => loadMoreHistory().catch(e => setError(e.message))} />
      <p id="loaded">{history.length}</p>
      <p id="revision">{history.find(item => item.id === "id-5")?.revision ?? ""}</p>
      <p id="error">{error}</p>
      <p id="more">{String(hasMore)}</p>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "history-ui.tsx", loader: "tsx" },
  write: false, bundle: true, platform: "browser", format: "iife",
  jsx: "automatic", define: {"process.env.NODE_ENV": '"production"'},
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => !!window.fixture);
  await page.evaluate(() => window.fixture.seed());
  assert.equal(await page.locator("#loaded").textContent(), "2");
  await page.evaluate(() => window.fixture.release());
  await page.waitForFunction(() => document.querySelector("#loaded")?.textContent === "31");
  assert.equal(await page.locator("#revision").textContent(), "6");

  const more = page.locator(".dr-history-more");
  await more.click();
  await page.locator("#error").getByText("暂时无法读取").waitFor();
  assert.equal(await page.locator("#loaded").textContent(), "31");
  await more.click();
  await page.waitForFunction(() => document.querySelector("#loaded")?.textContent === "61");
  await more.click();
  await page.waitForFunction(() => document.querySelector("#loaded")?.textContent === "66");
  assert.equal(await page.locator("#more").textContent(), "false");
  assert.deepEqual(await page.evaluate(() => window.fixture.requests), [0, 30, 30, 60]);
  assert.equal(await page.locator("#revision").textContent(), "6");
  assert.deepEqual(errors, []);
  console.log("Workspace history: concurrent live revision, server-offset pagination, retry and dedup passed.");
} finally {
  await browser.close();
}
