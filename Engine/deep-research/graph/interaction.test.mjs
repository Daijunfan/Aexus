import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { build } from "esbuild";
import { chromium } from "playwright";

test("research canvas preserves reading anchor, focuses same selection and supports keyboard navigation", async () => {
  const root = path.resolve(import.meta.dirname);
  const artifacts = path.resolve(root, "../../../.aexus/artifacts/deep-research-graph");
  await fs.mkdir(artifacts, { recursive: true });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-graph-ui-"));
  await build({
    stdin: {
      contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ResearchGraph } from './ResearchGraph';
        import '../style.css';
        const initial = Array.from({length: 20}, (_, i) => ({
          id: 'n' + i, label: '节点 ' + i, kind: 'search',
          status: 'completed', dependencies: i ? ['n' + (i - 1)] : [],
        }));
        const knowledge = {
          entities:[], relationships:[], findings:[],
          topics:Array.from({length:12}, (_, i) => ({
            id:'topic-' + i, title:'研究方向 ' + i,
            nodeIds:['n' + (i * 4)], status:'unassessed',
            candidateSourceIds:[], readSourceIds:[], verifiedSourceIds:[], findingIds:[],
          })),
        };
        function App() {
          const [selected, setSelected] = useState('n10');
          const [nodes, setNodes] = useState(initial);
          const [direction, setDirection] = useState('horizontal');
          const [workflowStatus, setWorkflowStatus] = useState('running');
          window.setGraphWorkflowStatus = setWorkflowStatus;
          window.replanGraph = () => setNodes(old => [
            {id:'extra',label:'新增源任务',kind:'search',status:'completed',dependencies:[]},
            ...old.map(node => node.id === 'n0' ? {...node, dependencies:['extra']} : node),
          ]);
          window.loadGraph = count => setNodes(Array.from({length: count}, (_, i) => ({
            id: 'n' + i, label: '真实任务 ' + i, kind: i % 4 === 0 ? 'search' : 'verify',
            status: i % 13 === 0 ? 'running' : 'completed',
            dependencies: i ? ['n' + (i - 1)] : [],
            resultSummary: i === 20 ? '检索得到的真实原文证据已关联此任务' : '',
            sourceIds: i === 20 ? ['source-1', 'source-2'] : [],
          })));
          return <div className="dr-app" style={{ display:'flex', height:'650px', width:'min(1100px, 100%)', minHeight:0 }}>
            <section className="dr-map-section" style={{flex:1, width:'100%', minWidth:0}}>
            <ResearchGraph nodes={nodes} selectedId={selected} onSelect={setSelected}
              workers={[]} inspectorOpen={false} onToggleInspector={() => {}}
              discovery={null} direction={direction} onDirection={setDirection}
              workflow={{status:workflowStatus}} knowledge={knowledge}/>
            </section>
          </div>;
        }
        createRoot(document.getElementById('root')).render(<App/>);
      `,
      resolveDir: root, sourcefile: "graph-test.tsx", loader: "tsx",
    },
    outfile: path.join(temp, "app.js"), bundle: true,
    platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: {width: 1200, height: 760} });
  try {
    await page.setContent('<!doctype html><html><meta charset="utf-8"><div id="root"></div></html>');
    await page.addStyleTag({path: path.join(temp, "app.css")});
    await page.addScriptTag({path: path.join(temp, "app.js")});
    const node = id => page.locator('[data-node-id="' + id + '"]');
    const centerX = async id => {
      const box = await node(id).boundingBox();
      return box.x + box.width / 2;
    };
    await node("n10").waitFor();
    await page.waitForFunction(() => document.querySelector('.dr-graph-viewport')?.clientWidth > 400);
    await page.getByRole("button", {name:"放大研究地图"}).click();
    const selectedX = await centerX("n10");
    await page.getByRole("button", {name:"缩小研究地图"}).click();
    assert.ok(Math.abs(await centerX("n10") - selectedX) < 3, "toolbar zoom retains viewport center");

    const area = page.locator(".dr-graph-viewport");
    await area.evaluate(element => new Promise(resolve => {
      element.addEventListener("scroll", () => resolve(), { once: true });
      element.scrollLeft += 500;
    }));
    const readingX = await centerX("n12");
    await page.evaluate(() => window.replanGraph());
    await node("extra").waitFor();
    assert.ok(Math.abs(await centerX("n12") - readingX) < 3,
      "replanning preserves the viewed node position, even when another node remains selected");

    await page.getByRole("button", {name:"适应研究地图画布"}).click();
    assert.equal(await page.locator(".dr-graph-canvas").getAttribute("data-compact"), "true");
    await node("n10").click();
    assert.ok(Number.parseInt(await page.getByRole("button", {name:"重置研究地图缩放"}).innerText()) >= 85,
      "clicking the already-selected compact node restores a readable focus");

    await node("n10").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await node("n11").getAttribute("aria-pressed"), "true");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-node-id')), "n11");

    await page.getByRole("button", {name:"从上到下排列"}).click();
    assert.equal(await node("n11").getAttribute("aria-pressed"), "true");

    const pointerBefore = await node("n11").boundingBox();
    const at = { x: pointerBefore.x + pointerBefore.width / 2, y: pointerBefore.y + pointerBefore.height / 2 };
    const zoomBefore = Number.parseInt(await page.getByRole("button", {name:"重置研究地图缩放"}).innerText());
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -36);
    await page.keyboard.up("Control");
    await page.waitForFunction(previous => Number.parseInt(document.querySelector('[aria-label="重置研究地图缩放"]')?.textContent) > previous, zoomBefore);
    const pointerAfter = await node("n11").boundingBox();
    assert.ok(Math.abs(pointerAfter.x + pointerAfter.width / 2 - at.x) < 3 &&
      Math.abs(pointerAfter.y + pointerAfter.height / 2 - at.y) < 3,
      "ctrl/trackpad zoom keeps the pointer on the same node");

    const errors = await page.evaluate(() => [...document.querySelectorAll('.dr-graph-node')].filter(el => !el.getAttribute('aria-label')).length);
    assert.equal(errors, 0);

    await page.evaluate(() => window.loadGraph(512));
    await page.waitForFunction(() => document.querySelector('.dr-graph-toolbar')?.textContent?.includes('512'));
    await page.waitForTimeout(50);
    assert.ok(await node("n11").count(), "focused selection survives graph expansion");
    assert.ok(await page.locator("[data-node-id]").count() < 70,
      "512-node canvas only mounts the visible neighborhood");
    assert.ok(await page.locator(".dr-graph-lines > path").count() < 100,
      "offscreen edges are also skipped");
    const minimap = page.getByRole("button", { name: /研究地图缩略导航，点击定位/ });
    await minimap.waitFor();
    assert.ok(await minimap.locator("circle.dr-graph-mini-dot").count() < 40,
      "dense full-length DAG is summarized in the minimap");

    const map = await minimap.locator("svg").boundingBox();
    await page.mouse.click(map.x + map.width / 2, map.y + map.height * .86);
    await page.waitForFunction(() => document.querySelector(".dr-graph-viewport")?.scrollTop > 10000);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-node-id]')]
      .some(el => Number(el.dataset.nodeId?.slice(1)) > 380));
    const distant = page.locator('[data-node-id]').filter({ visible: true })
      .filter({ hasText: '真实任务' }).last();
    await distant.click();
    const selectedFar = await page.locator('[data-node-id][aria-pressed="true"]').getAttribute('data-node-id');
    assert.ok(Number(selectedFar.slice(1)) > 350, "minimap leads to actionable distant nodes");
    assert.ok(await page.locator("[data-node-id]").count() < 70,
      "node focus does not mount all offscreen tasks");
    await page.screenshot({ path: path.join(artifacts, "research-dag-512.png") });

    await page.evaluate(() => window.loadGraph(48));
    await page.waitForFunction(() => document.querySelector('.dr-graph-toolbar')?.textContent?.includes('48'));
    await page.getByRole("button", { name: "适应研究地图画布" }).click();
    const overview = page.getByRole("region", { name: "研究地图区域总览" });
    await overview.waitFor();
    assert.equal(await overview.getByRole("button", { name: /进入研究区域/ }).count(), 5);
    assert.ok((await overview.innerText()).includes("48 个真实任务"));
    assert.ok((await overview.innerText()).includes("跨区依赖 · 上游"),
      "semantic regions display true cross-area task dependencies");
    await page.screenshot({ path: path.join(artifacts, "research-semantic-overview.png") });
    const topicGuide = overview.getByRole("region", { name: "按真实研究方向探索" });
    await topicGuide.waitFor();
    assert.equal(await topicGuide.getByRole("button", { name: /进入研究方向/ }).count(), 8);
    await topicGuide.getByRole("button", { name: "查看其余 4 个研究方向" }).click();
    assert.equal(await topicGuide.getByRole("button", { name: /进入研究方向/ }).count(), 12);
    await page.screenshot({ path: path.join(artifacts, "research-semantic-topics.png") });
    await topicGuide.getByRole("button", { name: "进入研究方向 研究方向 9" }).click();
    assert.equal(await overview.count(), 0);
    assert.equal(await node("n36").getAttribute("aria-pressed"), "true",
      "knowledge-backed topic navigation points to the canonical task ID");
    await page.getByRole("button", { name: "适应研究地图画布" }).click();
    await overview.waitFor();
    await overview.getByRole("button", { name: /进入研究区域 3/ }).click();
    assert.equal(await overview.count(), 0, "opening region exits far zoom");
    const focusedFromRegion = await page.locator('[data-node-id][aria-pressed="true"]').getAttribute("data-node-id");
    assert.ok(Number(focusedFromRegion.slice(1)) >= 20 && Number(focusedFromRegion.slice(1)) <= 29,
      "the region opens a real task from its own range");
    assert.ok(Number.parseInt(await page.getByRole("button", {name:"重置研究地图缩放"}).innerText()) >= 85);
    await page.getByRole("button", { name: "适应研究地图画布" }).click();
    await overview.getByRole("button", { name: "查看原始连线" }).click();
    assert.equal(await overview.count(), 0, "the full original graph remains directly accessible");
    await node("n20").hover();
    const preview = page.getByLabel("节点快速预览");
    await preview.waitFor();
    assert.ok((await preview.innerText()).includes("真实任务 20"));
    assert.ok((await preview.innerText()).includes("检索得到的真实原文证据"));
    assert.ok((await preview.innerText()).includes("2 个关联来源"));
    await page.screenshot({ path: path.join(artifacts, "research-dag-peek.png") });
    await preview.getByRole("button", { name: /打开任务详情/ }).click();
    assert.equal(await node("n20").getAttribute("aria-pressed"), "true");
    assert.ok(Number.parseInt(await page.getByRole("button", {name:"重置研究地图缩放"}).innerText()) >= 85,
      "compact preview drills into readable node details");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "适应研究地图画布" }).click();
    await overview.waitFor();
    await page.evaluate(() => window.setGraphWorkflowStatus('paused'));
    await page.waitForFunction(() =>
      document.querySelector('.dr-graph-semantic-summary')?.textContent?.includes('4 暂停/其他状态'));
    assert.ok((await overview.innerText()).includes('4 暂停/其他状态'),
      "global pause is reflected in overview status, without claiming tasks remain running");
    await page.evaluate(() => window.setGraphWorkflowStatus('running'));
    await page.waitForFunction(() =>
      document.querySelector('.dr-graph-semantic-summary')?.textContent?.includes('4 进行中'));
    assert.ok((await overview.innerText()).includes('4 进行中'),
      "resumed workflow restores active counts");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "semantic overview does not create mobile page overflow");
    const mobile = await overview.boundingBox();
    assert.ok(mobile.width >= 300 && mobile.width <= 390 && mobile.height > 250,
      "mobile regions stay independently readable");
    await page.screenshot({ path: path.join(artifacts, "research-semantic-overview-mobile.png") });
    await overview.getByRole("button", { name: /进入研究区域 5/ }).click();
    await overview.waitFor({ state: "hidden" });
    const mobileSelected = await page.locator('[data-node-id][aria-pressed="true"]').getAttribute('data-node-id');
    assert.ok(Number(mobileSelected.slice(1)) >= 40, "mobile overview navigates to a real distant task");

  } finally {
    await browser.close();
  }
});
