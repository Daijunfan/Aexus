import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { chromium } from "playwright";
import { create, describe, respond } from "../model.mjs";
import { amend } from "../runtime.mjs";
import { acquireSources } from "../source-read.mjs";
import { normalizeNodes } from "../graph.mjs";
import {
  normalizeVerification,
  mergeVerification,
  validateReport,
} from "../evidence.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.resolve(root, "../../.aexus/artifacts/deep-research-ui");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-research-ui-"));
await fs.mkdir(out, { recursive: true });
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import Page from ${JSON.stringify(path.join(root, "Page.tsx"))};import '@vscode/codicons/dist/codicon.css';const client={invoke:async(command,args={})=>{const response=await fetch('/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command,args})});const data=await response.json();if(!data.ok)throw Error(data.error);return data.data},info:async()=>({}),describe:async()=>({})};createRoot(document.getElementById('root')).render(React.createElement(Page,{client}));`;
await build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "ui-entry.tsx",
    loader: "tsx",
  },
  outfile: path.join(temp, "app.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  loader: { ".ttf": "file" },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const workers = [
  {
    id: "m1",
    specId: "manager-one",
    label: "技术研究负责人",
    role: "manager",
    managementRole: "manager",
    engine: "fixture",
    status: "working",
  },
  {
    id: "m2",
    specId: "manager-two",
    label: "证据质量负责人",
    role: "manager",
    managementRole: "manager",
    engine: "fixture",
    status: "working",
  },
  ...Array.from({ length: 6 }, (_, index) => ({
    id: "w" + index,
    label: "研究员 " + (index + 1),
    role: "researcher",
    engine: "fixture",
    status: index < 3 ? "working" : "idle",
  })),
];
const acquisition = JSON.parse(
  await fs.readFile(
    path.resolve(
      out,
      "../deep-research-independent/real-sources/acquisition.json",
    ),
    "utf8",
  ),
);
const { sources, findings, report } = acquisition.reportState;
const historicalSource = structuredClone(sources[0]);
for (const source of sources) {
  const record = acquisition.sources.find(
    (record) => record.sourceId === source.id,
  );
  const data = await fs.readFile(
    path.resolve(
      out,
      "../deep-research-independent/real-sources",
      record.name + ".txt",
    ),
  );
  const [checked] = await acquireSources({ sources: [] }, [source], {
    read: async (url) => ({
      url,
      data,
      body: data.toString("utf8"),
      mediaType: "text/plain",
      accessedAt: Date.parse(record.accessedAt),
    }),
  });
  source.acquisition = {
    ...checked.acquisition,
    provenance: source.acquisition.provenance,
  };
}
report.sections[0].content += `\n\n| 维度 | 直接证据 |\n| --- | --- |\n| 调度 | asyncio.gather 等待研究任务 |\n\n[1](#${sources[0].id})`;
const longState = create({
  topic: "公开研究引擎源码与文档：20 项直接证据",
  maxSources: 20,
});
longState.sources = structuredClone(sources);
const lineNumbers = [
  [179, 181, 291, 292, 305, 353, 715],
  [53, 61, 66, 72, 79, 152, 169],
  [17, 19, 20, 21, 42, 47],
];
for (const [index, source] of longState.sources.entries()) {
  const bytes = await fs.readFile(
    path.resolve(
      out,
      "../deep-research-independent/real-sources",
      source.acquisition.provenance.file,
    ),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    source.acquisition.provenance.sha256,
  );
  const text = bytes.toString("utf8"),
    lines = text.split("\n");
  const claims = lineNumbers[index].map((number) => ({
    text: `${source.title} 第 ${number} 行直接记载：${lines[number - 1].trim()}`,
    excerpt: lines[number - 1].trim(),
    locator: `Raw source line ${number}`,
    confidence: 1,
  }));
  const fragments = await acquireSources(
    { sources: [] },
    claims.map((claim) => ({
      ...source,
      acquisition: { excerpt: claim.excerpt, locator: claim.locator },
    })),
    {
      read: async (url) => ({
        url,
        data: bytes,
        body: text,
        mediaType: "text/plain",
      }),
    },
  );
  source.acquisition = {
    status: "read",
    method: "independent-http",
    excerpts: fragments.flatMap((fragment) => fragment.acquisition.excerpts),
  };
  mergeVerification(
    longState,
    normalizeVerification(
      {
        verifications: [
          {
            sourceId: source.id,
            credibilityScore: 1,
            claims,
            notes: "核验直接源码和文档描述，运行效果须另行验证。",
          },
        ],
      },
      longState.sources,
    ),
  );
}
longState.report = validateReport(
  {
    report: {
      title: "公开研究引擎源码与文档的直接证据",
      abstract:
        "本报告基于三个实际获取并保存 SHA-256 的公开源码或文档，共 20 项直接论断。",
      sections: Array.from({ length: 6 }, (_, section) => {
        const rows = longState.findings.slice(
          section * 3,
          section === 5 ? 20 : section * 3 + 3,
        );
        return {
          id: "evidence-" + section,
          heading: "直接证据比较 " + (section + 1),
          content:
            rows
              .map(
                (finding, index) =>
                  `${finding.claim}\n\n这条记录用于比较已公开的设计描述，并保留对应位置以便逐项审阅。证据范围只包含保存的源码或文档，不能由此推断运行可靠性、模型研究效果、速度或成本。后续实测需要独立数据与实际执行记录。 [${section * 3 + index + 1}](#${finding.sourceIds[0]})`,
              )
              .join("\n\n") +
            (section === 0
              ? "\n\n| 序号 | 直接证据 | 原文位置 |\n| --- | --- | --- |\n" +
                longState.findings
                  .map(
                    (finding, index) =>
                      `| ${index + 1} | ${finding.claim.replaceAll("|", "\\|")} | ${finding.evidence[0].locator} |`,
                  )
                  .join("\n")
              : ""),
          citations: [...new Set(rows.flatMap((finding) => finding.sourceIds))],
        };
      }),
      limitations: [
        "三个独立资料来源，共用 raw.githubusercontent.com；不是 20 个网站。",
        "未运行收费模型或竞品应用。",
      ],
    },
  },
  longState,
);
const graph = {
  version: 2,
  nodes: Array.from({ length: 48 }, (_, index) => ({
    id: "node-" + index,
    kind: index < 8 ? "search" : "verify",
    label:
      index === 0
        ? "核实多智能体研究引擎的真实调度机制"
        : "研究任务 " + (index + 1),
    status: "pending",
    dependencies: index < 8 ? [] : ["node-" + (index - 8)],
    employeeId: "w" + (index % 6),
    managerIds: ["m" + ((index % 2) + 1)],
    sourceIds: index === 0 ? [sources[0].id] : [],
  })),
  edges: [],
};
const core = [
  ["初步调研与来源地图", "search", []],
  ["调查原生调度机制", "search", [0]],
  ["调查引用与证据质量", "search", [0]],
  ["调查开源研究方法", "search", [0]],
  ["交叉核验调度与开源证据", "verify", [1, 3]],
  ["核验来源与引用一致性", "verify", [1, 2]],
  ["综合可共享研究结论", "synthesize", [4, 5]],
  ["研究实际成本与性能", "search", [6]],
  ["研究用户交互与干预", "search", [6, 2]],
  ["交叉核验成本和交互结论", "verify", [7, 8, 3]],
  ["汇合证据形成研究报告", "write", [6, 9]],
  ["独立审阅最终报告", "review", [10]],
];
for (let index = 0; index < core.length; index++) {
  const [label, kind, parents] = core[index];
  Object.assign(graph.nodes[index], {
    label,
    kind,
    dependencies: parents.map((parent) => "node-" + parent),
    objective: [
      "定位三份公开源码或架构文档，记录其研究角色、计划生成位置与证据获取方式。",
      "追踪主管如何分派任务、限制并发并等待结果；标明共享分析被哪些后继任务使用。",
      "逐项核对论断、已获取原文与行号，分清直接记载和需要实测的推断。",
      "比较初步研究、编辑规划、审阅和修订职责，保留各项目的实际边界。",
      "对照调度源码与方法文档，核验并行、汇合和共享任务是否有直接证据。",
      "逐项检验引用是否落在保存全文中，排除未经阅读或定位缺失的来源。",
      "汇合经过核验的调度与来源结论，列出共识、差异和无法从公开资料判断的部分，供成本与交互研究共同复用。",
      "梳理公开资料能够确认的并发限制与执行成本；对未公开的性能指标标记待实测。",
      "追踪用户何时能够改变研究方向、审阅计划和核验证据，明确在途任务与重规划的关系。",
      "交叉比较成本与干预结论，并核对它们是否得到开源方法说明的支持。",
      "按研究问题组织完整报告，每章引用已核验论断并明确研究局限。",
      "独立审阅报告的证据覆盖与结论边界；发现缺口时给出具体修订要求。",
    ][index],
    sourceIds: index < 7 ? sources.map((source) => source.id) : [],
    inputSourceIds: index > 0 ? sources.map((source) => source.id) : [],
    planVersion: 2,
    status: index < 7 ? "completed" : index < 9 ? "running" : "pending",
    startedAt: index < 9 ? Date.now() - 120000 : undefined,
    finishedAt: index < 7 ? Date.now() - 60000 : undefined,
    resultSummary:
      index < 7 ? "已读取来源并完成证据比较，结果供后继任务复用。" : undefined,
  });
}
for (let index = core.length; index < graph.nodes.length; index++) {
  graph.nodes[index].dependencies = [
    "node-" + (index < 20 ? (index % 3) + 1 : index - 8),
  ];
  if (index >= 40) graph.nodes[10].dependencies.push("node-" + index);
}
graph.edges = graph.nodes.flatMap((node) =>
  node.dependencies.map((from) => ({ from, to: node.id })),
);
graph.nodes = normalizeNodes(graph.nodes).map((node, index) => ({
  ...node,
  ...graph.nodes[index],
  weight: node.weight,
}));
let job = null;
let historyFixtures = null;
let parentJobForFork = null;
let state;
let unrelatedActivity = false;
let pauseIncomplete = false;
let cancelIncomplete = false;
const calls = [],
  errors = [],
  checks = [];
function update(status, phase, extra = {}) {
  Object.assign(state, extra, { phase });
  state.tasks = Object.fromEntries(
    state.graph.nodes
      .filter((node) =>
        ["running", "completed", "failed"].includes(node.status),
      )
      .map((node) => [
        node.id,
        { ...node, receipt: { messageId: "message-" + node.id } },
      ]),
  );
  job = {
    ...job,
    status,
    revision: (job?.revision ?? 0) + 1,
    updatedAt: Date.now(),
    summary: describe(state),
  };
}
async function call(command, args) {
  calls.push({ command, args });
  if (command === "workflow.list") {
    const jobs = historyFixtures ?? (job ? [job] : []);
    const offset = args.offset ?? 0,
      limit = args.limit ?? 100;
    return {
      jobs: jobs.slice(offset, offset + limit),
      total: jobs.length,
      hasMore: offset + limit < jobs.length,
    };
  }
  if (command === "workflow.start") {
    state = create(args.input);
    state.phase = "scouting";
    state.workers = workers.slice(0, 1);
    state.tasks = {
      "initial-scout": {
        label: "定位公开原始来源并梳理现有研究缺口",
        role: "coordinator",
        employeeId: workers[0].id,
        status: "running",
        receipt: { messageId: "message-initial-scout" },
        startedAt: Date.now(),
      },
    };
    job = {
      id: "wf_00000000-0000-0000-0000-000000000001",
      engineId: "deep-research",
      engineVersion: "2.0.0",
      status: "running",
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [],
      summary: describe(state),
    };
    return job;
  }
  if (command === "workflow.fork") {
    assert.equal(job.status, "completed");
    assert.equal(args.id, job.id);
    assert.equal(args.expectedRevision, job.revision);
    parentJobForFork = job;
    state = create(args.input);
    state.phase = "scouting";
    job = {
      ...job,
      id: "wf_00000000-0000-0000-0000-000000000002",
      status: "running",
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parent: {id: parentJobForFork.id, revision: parentJobForFork.revision, engineVersion: parentJobForFork.engineVersion},
      summary: describe(state),
      files: [],
    };
    return job;
  }
  if (command === "workflow.get" && historyFixtures)
    return historyFixtures.find((item) => item.id === args.id);
  if (command === "workflow.get" && args.id === parentJobForFork?.id)
    return parentJobForFork;
  if (command === "workflow.get")
    return args.ifRevision === job.revision
      ? { id: job.id, revision: job.revision, unchanged: true }
      : job;
  if (command === "workflow.pause") {
    update("paused", job.summary.phase);
    job.controlPending = pauseIncomplete;
    if (pauseIncomplete) job.error = "Pause cleanup incomplete";
    else delete job.error;
    return job;
  }
  if (command === "workflow.amend") {
    assert.equal(job.status, "paused");
    assert.equal(args.expectedRevision, job.revision);
    assert.equal(!!job.controlPending, false);
    state = amend(state, args.update);
    update("paused", state.phase);
    return job;
  }
  if (command === "workflow.resume") {
    assert.ok(["paused", "failed"].includes(job.status));
    assert.equal(args.expectedRevision, job.revision);
    assert.equal(!!job.controlPending, false);
    update("running", job.summary.phase);
    return job;
  }
  if (command === "workflow.respond") {
    assert.equal(job.status, "waiting");
    assert.equal(args.expectedRevision, job.revision);
    assert.equal(!!job.controlPending, false);
    state = respond(state, args.answer);
    update(
      args.answer.action === "approve-report" ? "completed" : "running",
      args.answer.action === "approve-report" ? "complete" : "research",
    );
    return job;
  }
  if (command === "workflow.cancel") {
    update("cancelled", job.summary.phase);
    job.controlPending = cancelIncomplete;
    if (cancelIncomplete)
      job.error = "Some owned tasks could not be interrupted";
    else delete job.error;
    return job;
  }
  if (command === "view.open") return {};
  if (command === "session.status") {
    const task = Object.values(state.tasks).find(
      (task) => task.employeeId === args.employee && task.status === "running",
    );
    return [
      {
        busy: true,
        currentTask: {
          messageId: unrelatedActivity
            ? "unrelated-message"
            : task?.receipt?.messageId,
        },
        activityPreview: {
          kind: "tool",
          text: "Inspecting saved public source",
          tool: "read_file",
          detail: "langchain.txt · saved source lines 285-305",
        },
      },
    ];
  }
  if (command === "workflow.file")
    return { content: "# Real fixture delivery", mediaType: "text/markdown" };
  throw Error("Unsupported fixture command: " + command);
}
const server = http.createServer(async (request, response) => {
  try {
    if (request.url === "/api") {
      let body = "";
      for await (const part of request) body += part;
      const { command, args } = JSON.parse(body);
      try {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({ ok: true, data: await call(command, args) }),
        );
      } catch (error) {
        response.statusCode = 400;
        response.end(JSON.stringify({ ok: false, error: error.message }));
      }
      return;
    }
    if (request.url === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deep Research UI fixture</title><link rel="stylesheet" href="/app.css"><style>body{margin:0}#root{min-height:100vh}</style><div id="root"></div><script src="/app.js"></script></html>',
      );
      return;
    }
    const name = path.basename(
      new URL(request.url, "http://localhost").pathname,
    );
    if (!/^(app\.(js|css)|codicon-.*\.ttf)$/.test(name)) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader(
      "content-type",
      name.endsWith(".css")
        ? "text/css"
        : name.endsWith(".ttf")
          ? "font/ttf"
          : "text/javascript",
    );
    response.end(await fs.readFile(path.join(temp, name)));
  } catch (error) {
    response.statusCode = 500;
    response.end(error.message);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (error) => errors.push(error.message));
const screen = (name) =>
  page.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
const fits = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "page width fits viewport",
  );
async function waitPhase(text) {
  await page.getByText(text, { exact: true }).first().waitFor();
}
async function embedHost(width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.evaluate(
    ({ width, height }) => {
      const root = document.getElementById("root");
      const top = width === 1440 ? 72 : 116;
      root.classList.add("engine-surface");
      root.style.cssText = `height:${height - top}px;min-height:0;margin:${top}px 0 0 64px;width:${width - 64}px;overflow:auto`;
      if (root.querySelector(".engine-context")) return;
      const chrome = document.createElement("header");
      chrome.className = "engine-context";
      chrome.style.cssText =
        "height:60px;box-sizing:border-box;border-bottom:1px solid #dfe5e7";
      root.prepend(chrome);
    },
    { width, height },
  );
}
async function resetHost() {
  await page.evaluate(() => {
    const root = document.getElementById("root");
    root.classList.remove("engine-surface");
    root.removeAttribute("style");
    root.querySelector(".engine-context")?.remove();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
}
try {
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.evaluate(() => document.fonts.ready);
  assert.ok(
    await page.evaluate(() => document.fonts.check("16px codicon")),
    "icon font rendered",
  );
  assert.equal(await page.locator('.dr-sidebar').count(), 0, 'Research history has no left sidebar');
  const topicInput = page.getByLabel("研究目标");
  await topicInput.click();
  await page.keyboard.type("301");
  assert.equal(await topicInput.inputValue(), "301");
  assert.equal(await page.getByRole("button", {name: "开始研究", exact: true}).isEnabled(), true);
  const topicBox = await topicInput.boundingBox();
  const historyBox = await page.getByRole("region", {name: "研究记录"}).boundingBox();
  assert.ok(historyBox.y > topicBox.y + topicBox.height, 'History is below the research input');
  await topicInput.fill("比较当前多智能体研究引擎的动态规划与证据质量");
  await page.locator(".dr-segment label.active").hover();
  await page.getByText("全面调查：覆盖主要问题", { exact: false }).waitFor();
  await page.mouse.move(0, 0);
  await fits();
  await screen("01-intake");
  for (const width of [1440, 768, 390]) {
    const height = width === 390 ? 844 : 900;
    await embedHost(width, height);
    const intake = await page.locator(".dr-app").boundingBox();
    await screen("01a-embedded-intake-" + width);
    assert.ok(
      intake.y + intake.height <= height + 1,
      "embedded intake subtracts the context bar from host height",
    );
    assert.ok(
      await page.locator(".engine-surface").evaluate(
        (root) => root.scrollHeight <= root.clientHeight + 1,
      ),
      "embedded intake has no empty extra scroll range",
    );
    assert.deepEqual(
      await page
        .locator(".dr-main,.dr-intake-page,.dr-intake,.dr-intake-controls,.dr-segment")
        .evaluateAll((elements) =>
          elements
            .filter(element => element.scrollWidth > element.clientWidth + 1)
            .map(element => element.className),
        ),
      [],
      "hidden scope tooltips cannot enlarge intake scroll widths",
    );
    const options = page.locator(".dr-segment label");
    for (let index = 0; index < await options.count(); index++) {
      const selectedScope = await page
        .locator(".dr-segment input:checked")
        .evaluate(element => element.parentElement.textContent);
      const option = options.nth(index);
      await option.hover();
      const tooltip = option.locator(".dr-scope-help");
      const tipBox = await tooltip.boundingBox();
      const segmentBox = await page.locator(".dr-segment").boundingBox();
      assert.ok(
        tipBox.x >= segmentBox.x &&
          tipBox.x + tipBox.width <= segmentBox.x + segmentBox.width,
        "visible scope tooltip stays inside the segmented control width",
      );
      assert.ok(
        await tooltip.evaluate(element => element.scrollWidth <= element.clientWidth + 1),
        "scope tooltip wraps its text without clipping",
      );
      assert.equal(
        await page.locator(".dr-segment input:checked").evaluate(element => element.parentElement.textContent),
        selectedScope,
        "hovering a scope does not change the selection",
      );
      await option.click();
      assert.equal(await option.locator("input").isChecked(), true);
    }
    await options.last().locator("input").focus();
    await page.locator(".dr-scope-help").last().waitFor({ state: "visible" });
    await page.keyboard.press("ArrowLeft");
    assert.equal(await options.nth(2).locator("input").isChecked(), true);
    await options.nth(2).locator(".dr-scope-help").waitFor({ state: "visible" });
    await options.nth(1).click();
    await screen("01b-embedded-scope-help-" + width);
    await page.getByLabel("研究目标").focus();
    await page.mouse.move(0, 0);
  }
  await resetHost();
  checks.push(
    "actual block-scrolling host intake fits 1440, 768 and 390 viewports without an extra context-bar scroll range",
  );
  assert.equal(await page.getByText(/超越|90%|5 个专业/).count(), 0);
  await page.locator(".dr-segment label").first().click();
  assert.equal(await page.getByLabel("来源预算").inputValue(), "6");
  await page.locator(".dr-segment label").nth(1).click();
  assert.equal(await page.getByLabel("来源预算").inputValue(), "80");
  await page.locator(".dr-settings summary").click();
  await page.getByLabel("来源预算").fill("2");
  await page.locator(".dr-segment label").first().click();
  assert.equal(await page.getByLabel("来源预算").inputValue(), "2");
  await page.locator(".dr-segment label").nth(1).click();
  assert.equal(await page.getByLabel("来源预算").inputValue(), "2");
  await page.getByLabel("来源预算").fill("80");
  checks.push("quick scope defaults to six sources while a custom limit persists across scope changes");
  await page.getByRole("button", { name: "开始研究", exact: true }).click();
  await waitPhase("进度尚未确定");
  assert.equal(
    await page.getByRole("progressbar").getAttribute("aria-valuenow"),
    null,
  );
  await screen("02-scouting");
  assert.equal(
    await page
      .getByRole("button", { name: "从左到右排列", exact: true })
      .count(),
    0,
  );
  await page.locator(".dr-live-activity").waitFor();
  await screen("02a-scouting-owned-activity");
  checks.push("scouting has no invented percentage or ETA");
  update("running", "scouting", {
    sources: [{id: "discovered-only", title: "未读取网页", url: "https://unread.example/original", acquisition: {status: "discovered"}, verified: false}],
  });
  await page.getByText("1 来源 · 0 实读网站", { exact: true }).waitFor();
  update("running", "scouting", {sources: []});
  checks.push("discovered URLs do not inflate independently read website breadth");
  update("running", "research", {
    workers,
    graph,
    sources,
    findings,
    report,
    planRevisions: [
      {
        version: 1,
        reason: "初始研究范围",
        addedNodeIds: graph.nodes.map((node) => node.id),
        retainedNodeIds: [],
        removedNodeIds: [],
      },
      {
        version: 2,
        reason: "证据揭示新的调度问题，扩大核验范围",
        addedNodeIds: ["node-47"],
        retainedNodeIds: ["node-0"],
        removedNodeIds: [],
      },
    ],
  });
  await waitPhase(job.summary.progress.percent + "%");
  await page.getByRole("tab", { name: /^发现/ }).click();
  await page
    .getByRole("heading", { name: findings[0].claim, exact: true })
    .waitFor({ timeout: 5000 });
  assert.deepEqual(errors, []);
  assert.equal(
    await page.locator(".dr-findings .dr-evidence").count(),
    findings.length,
  );
  await page
    .getByText(findings[0].evidence[0].locator, { exact: true })
    .first()
    .waitFor();
  await screen("02b-real-findings");
  checks.push(
    "backend describe finding object arrays render excerpt, locator and source navigation without React crash",
  );
  assert.equal(await page.locator(".dr-contradictions").count(), 0);
  const disagreement = create({ topic: "两份测试资料中的并发上限存在分歧" });
  const conflictingText = [
    "The concurrent research limit is 4.",
    "The concurrent research limit is 8.",
  ];
  disagreement.sources = await acquireSources(
    { sources: [] },
    conflictingText.map((excerpt, index) => ({
      id: "conflict-source-" + index,
      title: "并发上限测试资料 " + (index + 1),
      url: "https://fixture.invalid/limit-" + index,
      acquisition: { excerpt },
    })),
    {
      read: async (url) => ({
        url,
        data: Buffer.from(conflictingText[Number(url.at(-1))]),
        mediaType: "text/plain",
      }),
    },
  );
  mergeVerification(
    disagreement,
    normalizeVerification({
      verifications: disagreement.sources.map((source, index) => ({
        sourceId: source.id,
        credibilityScore: 0.8,
        claims: [{ text: conflictingText[index], excerpt: conflictingText[index] }],
        contradictions: index === 0 ? [{
          sourceIds: disagreement.sources.map(source => source.id),
          description: "资料一将并发上限记为 4，资料二将并发上限记为 8；尚未确认适用版本。",
          severity: "warning",
        }] : [],
      })),
    }, disagreement.sources),
  );
  update("running", "research", {
    sources: disagreement.sources,
    findings: disagreement.findings,
    contradictions: disagreement.contradictions,
  });
  await page.getByRole("heading", { name: "来源存在分歧", exact: true }).waitFor();
  assert.deepEqual(job.summary.contradictions[0].sources, disagreement.sources.map(source => source.id));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const conflicting = page.locator(".dr-contradictions");
    assert.ok(
      (await conflicting.boundingBox()).y < 900,
      "source disagreement is shown before findings in the initial view",
    );
    await fits();
    await screen("02c-source-disagreement-" + width);
    for (const [index, source] of disagreement.sources.entries()) {
      await conflicting.getByRole("button", { name: source.title, exact: true }).click();
      await page.locator(".dr-source-detail > h3").filter({ hasText: source.title }).waitFor();
      await page.locator(".dr-source-detail").getByText(conflictingText[index], { exact: true }).first().waitFor();
      await page.getByRole("tab", { name: /^发现/ }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  update("running", "research", { sources, findings, contradictions: [] });
  await page.locator(".dr-contradictions").waitFor({ state: "hidden" });
  checks.push(
    "backend-normalized disagreement between two independently matched fixture sources is visible before claims, links each source to its original quote, and renders no empty section across three widths",
  );
  await page.getByRole("tab", { name: "研究地图", exact: true }).click();
  assert.equal(await page.locator("[data-node-id]").count(), 48);
  await page.locator('[data-node-id="node-0"]').click();
  await page.getByText("技术研究负责人", { exact: true }).first().waitFor();
  await fits();
  await screen("03-dag-48-nodes");
  await page.locator(".dr-live-activity").waitFor();
  assert.ok(
    calls.some((call) => call.command === "session.status"),
    "native status activity was read",
  );
  unrelatedActivity = true;
  await page.waitForFunction(
    () => !document.querySelector(".dr-live-activity"),
  );
  unrelatedActivity = false;
  await page.locator(".dr-live-activity").waitFor();
  await page
    .getByRole("button", { name: "适应研究地图画布", exact: true })
    .click();
  await screen("03b-dag-fit");
  await page.locator('[data-node-id="node-6"]').click();
  assert.ok(
    parseInt(
      await page
        .getByRole("button", { name: "重置研究地图缩放", exact: true })
        .innerText(),
    ) >= 85,
    "selected neighborhood retains readable zoom",
  );
  assert.equal(await page.locator(".dr-graph-lines>path.selected").count(), 5);
  assert.equal(await page.locator(".dr-task-links").count(), 2);
  await page
    .locator(".dr-task-links")
    .filter({ hasText: "后继任务" })
    .getByRole("button", { name: /研究用户交互与干预/ })
    .click();
  await page
    .locator(".dr-task-detail")
    .getByRole("heading", { name: "研究用户交互与干预", exact: true })
    .waitFor();
  await screen("03c-dag-selected-join");
  update("running", "research", {
    graph: {
      version: 2,
      nodes: graph.nodes.slice(0, 12).map((node) => ({
        ...node,
        dependencies: node.dependencies.filter(
          (id) => Number(id.slice(5)) < 12,
        ),
      })),
      edges: graph.edges.filter(
        (edge) =>
          Number(edge.from.slice(5)) < 12 && Number(edge.to.slice(5)) < 12,
      ),
    },
  });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-node-id]").length === 12,
  );
  await page
    .getByRole("button", { name: "适应研究地图画布", exact: true })
    .click();
  await screen("03d-arbitrary-dag-core-overview");
  await page.locator('[data-node-id="node-6"]').click();
  assert.ok(
    parseInt(
      await page
        .getByRole("button", { name: "重置研究地图缩放", exact: true })
        .innerText(),
    ) >= 85,
    "selected neighborhood retains readable zoom",
  );
  const selectedBox = await page
    .locator('[data-node-id="node-6"]')
    .boundingBox();
  const viewportBox = await page.locator(".dr-graph-viewport").boundingBox();
  assert.ok(
    selectedBox.y >= viewportBox.y &&
      selectedBox.y + selectedBox.height <= viewportBox.y + viewportBox.height,
    "selected task is visible at readable zoom",
  );
  await screen("03d-arbitrary-dag-core");
  for (const id of ["node-4", "node-5", "node-7", "node-8"]) {
    const nodeBox = await page.locator(`[data-node-id="${id}"]`).boundingBox();
    assert.equal(
      await page.locator(`[data-node-id="${id}"] .dr-cloud-shape path`).count(),
      1,
      "research task has a cloud outline",
    );
    assert.ok(
      nodeBox.width > nodeBox.height,
      "cloud gives the task label more horizontal room",
    );
    assert.ok(
      nodeBox.y >= viewportBox.y &&
        nodeBox.y + nodeBox.height <= viewportBox.y + viewportBox.height,
      "selected task's immediate fork and join context is visible",
    );
  }
  await page.getByRole("button", { name: "从左到右排列", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "从左到右排列", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.locator('[data-node-id="node-6"]').getAttribute("aria-pressed"),
    "true",
  );
  await screen("03j-horizontal-focused");
  update("running", "research");
  await page.waitForFunction(
    (revision) =>
      document.querySelector(".dr-app")?.dataset.revision === String(revision),
    job.revision,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "从左到右排列", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "从上到下排列", exact: true }).click();
  await screen("03k-vertical-focused");
  const completionStrokes = await page.evaluate(() =>
    [
      document.querySelector('[data-node-id="node-6"] .dr-cloud-shape path'),
      document.querySelector(
        ".dr-graph-node.completed:not(.selected) .dr-cloud-shape path",
      ),
    ].map((element) => getComputedStyle(element).stroke),
  );
  assert.equal(
    completionStrokes[0],
    completionStrokes[1],
    "selection preserves the node's completion color",
  );
  checks.push(
    "user chooses horizontal or vertical DAG direction; selection and readable focus retained across direction change and checkpoint",
  );
  await embedHost();
  const embedded = await page.locator(".dr-app").boundingBox();
  assert.ok(
    embedded.y + embedded.height <= 901,
    "embedded workspace fits actual 1440x900 host chrome dimensions",
  );
  assert.ok(
    (await page.locator(".dr-graph-viewport").boundingBox()).height >= 300,
    "embedded graph retains usable canvas height",
  );
  await screen("03h-embedded-host-geometry");
  await page.evaluate(
    () =>
      (document.documentElement.style.cssText =
        "color-scheme:dark;--bg:#202424;--bg-elev:#262b2b;--fg:#e6eaea;--fg-dim:#aebaba;--border-soft:#3b4545"),
  );
  await page.waitForTimeout(250);
  await screen("03i-embedded-dark-theme");
  await page.evaluate(() => document.documentElement.removeAttribute("style"));
  await resetHost();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
    "running workspace stays within one screen",
  );
  await page.getByRole("button", { name: "收起任务详情", exact: true }).click();
  await screen("03g-map-expanded");
  await page.getByRole("button", { name: "展开任务详情", exact: true }).click();
  const coreGraph = structuredClone(state.graph);
  const shapes = [
    [
      "36-same-layer",
      [
        ...Array.from({ length: 36 }, (_, index) => ({
          id: `wide-${index}`,
          kind: "search",
          label: `同层独立调查 ${index + 1}`,
          dependencies: [],
        })),
        {
          id: "wide-report",
          kind: "write",
          label: "汇合 36 项研究",
          dependencies: Array.from(
            { length: 36 },
            (_, index) => `wide-${index}`,
          ),
        },
        {
          id: "wide-review",
          kind: "review",
          label: "独立审查",
          dependencies: ["wide-report"],
        },
      ],
    ],
    [
      "36-deep-layers",
      [
        ...Array.from({ length: 36 }, (_, index) => ({
          id: `deep-${index}`,
          kind: "search",
          label: `递进调查 ${index + 1}`,
          dependencies: index ? [`deep-${index - 1}`] : [],
        })),
        {
          id: "deep-report",
          kind: "write",
          label: "汇合递进研究",
          dependencies: ["deep-35"],
        },
        {
          id: "deep-review",
          kind: "review",
          label: "独立审查",
          dependencies: ["deep-report"],
        },
      ],
    ],
  ];
  for (const [name, shape] of shapes) {
    update("running", "research", {
      graph: { version: 3, nodes: normalizeNodes(shape) },
    });
    await page.waitForFunction(
      (id) => !!document.querySelector(`[data-node-id="${id}"]`),
      shape[0].id,
    );
    await page
      .getByRole("button", { name: "适应研究地图画布", exact: true })
      .click();
    await fits();
    await screen("03e-" + name + "-overview");
    await page.locator(`[data-node-id="${shape.at(-2).id}"]`).click();
    assert.ok(
      parseInt(
        await page
          .getByRole("button", { name: "重置研究地图缩放", exact: true })
          .innerText(),
      ) >= 85,
      "extreme graph selection retains readable zoom",
    );
    await screen("03f-" + name + "-focused");
  }
  update("running", "research", { graph: coreGraph });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-node-id]").length === 12,
  );
  checks.push(
    "36 same-layer fan-in and 36 deep levels render complete overview and focused readable task without page overflow",
  );
  checks.push(
    "48-node arbitrary DAG with fan-out, cross-branch joins, shared synthesis, cross-layer dependencies, fit, selected edge highlighting and predecessor/successor navigation",
  );
  await page.getByRole("button", { name: "缩小研究地图", exact: true }).click();
  await page
    .getByRole("button", { name: "重置研究地图缩放", exact: true })
    .click();
  await page.getByRole("tab", { name: "报告", exact: true }).click();
  await page
    .getByRole("heading", { name: report.title, exact: true })
    .waitFor();
  await page.getByRole("tab", { name: "研究地图", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "从上到下排列", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("tab", { name: "报告", exact: true }).click();
  await screen("04-report");
  for (const width of [1440, 768, 390]) {
    const height = width === 390 ? 844 : 900;
    await embedHost(width, height);
    const chapter = page.locator(".dr-report-document > section h2").last();
    await chapter.scrollIntoViewIfNeeded();
    const chapterBox = await chapter.boundingBox();
    const hostBox = await page.locator(".engine-surface").boundingBox();
    assert.ok(
      chapterBox.y >= hostBox.y && chapterBox.y + chapterBox.height <= height,
      "embedded report remains scrollable to its final chapter",
    );
    await fits();
    await screen("04a-embedded-report-" + width);
    await page.getByRole("tab", { name: /^来源/ }).click();
    await page.locator(".dr-evidence-layout").waitFor();
    await page.locator(".dr-source-row").first().click();
    const sourceTitle = page.locator(".dr-source-detail > h3");
    await sourceTitle.scrollIntoViewIfNeeded();
    const sourceBox = await sourceTitle.boundingBox();
    assert.ok(
      sourceBox.y >= hostBox.y && sourceBox.y + sourceBox.height <= height,
      "embedded source details are readable inside the host viewport",
    );
    if (width === 1440) {
      const evidence = await page.locator(".dr-app").boundingBox();
      assert.ok(
        evidence.y + evidence.height <= 901,
        "embedded source workspace retains its fixed viewport height",
      );
    }
    await fits();
    await screen("04b-embedded-sources-" + width);
    await page.getByRole("tab", { name: "报告", exact: true }).click();
  }
  await resetHost();
  checks.push(
    "embedded report final chapter and source workspace remain reachable in the actual host at desktop, tablet and mobile widths",
  );
  await page
    .locator(".dr-report-document")
    .getByRole("button", { name: "1", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "来源详情", exact: true })
    .getByRole("heading", { name: sources[0].title })
    .waitFor();
  await page
    .getByText(sources[0].acquisition.excerpts[0].excerpt, { exact: true })
    .first()
    .waitFor();
  await screen("05-citation-evidence");
  checks.push(
    "report Markdown table and citation navigate to supporting quote with locator",
  );
  const sourceBeforeProofAudit = structuredClone(sources[0]);
  const firstProof = sources[0].acquisition.excerpts[0];
  const record = acquisition.sources[0];
  const data = await fs.readFile(
    path.resolve(
      out,
      "../deep-research-independent/real-sources",
      record.name + ".txt",
    ),
  );
  const secondExcerpt =
    "allowed_conduct_research_calls = conduct_research_calls[:configurable.max_concurrent_research_units]";
  const [second] = await acquireSources(
    { sources: [] },
    [
      {
        ...sources[0],
        acquisition: { excerpt: secondExcerpt, locator: "Raw source line 291" },
      },
    ],
    { read: async (url) => ({ url, data, mediaType: "text/plain" }) },
  );
  const [rejected] = await acquireSources(
    { sources: [] },
    [
      {
        ...sources[0],
        acquisition: {
          excerpt:
            "This fabricated passage is absent from the acquired document.",
          locator: "Fabricated location",
        },
      },
    ],
    { read: async (url) => ({ url, data, mediaType: "text/plain" }) },
  );
  sources[0].acquisition.excerpts.push(...second.acquisition.excerpts);
  sources[0].acquisition.rejections = rejected.acquisition.rejections;
  update("running", "research", { sources: structuredClone(sources) });
  await page.waitForFunction(
    (revision) =>
      document.querySelector(".dr-app")?.dataset.revision === String(revision),
    job.revision,
  );
  const sourceDetail = page.getByRole("complementary", {
    name: "来源详情",
    exact: true,
  });
  await sourceDetail
    .getByText("已独立获取原文并匹配引用片段", { exact: true })
    .waitFor();
  await sourceDetail.getByText("已读取原文", { exact: true }).click();
  await sourceDetail.getByText(secondExcerpt, { exact: true }).waitFor();
  await sourceDetail
    .getByText("片段未通过核对 · 提交位置：Fabricated location", {
      exact: true,
    })
    .click();
  await sourceDetail
    .getByText(rejected.acquisition.rejections[0].reason, { exact: true })
    .waitFor();
  await screen("05i-independent-proof-and-rejection");
  await sourceDetail.getByText("获取记录", { exact: true }).click();
  assert.equal(
    await sourceDetail.locator(".dr-acquisition-metadata code").count(),
    2,
  );
  update("running", "research", {
    sources: [historicalSource, sources[1], sources[2]],
  });
  await sourceDetail
    .getByText("历史来源 · 未独立验证", { exact: true })
    .waitFor();
  assert.equal(
    await sourceDetail.locator(".dr-acquisition-metadata").count(),
    0,
  );
  await screen("05j-historical-source");
  update("running", "research", {
    sources: [{ ...rejected, verified: false }, sources[1], sources[2]],
  });
  await sourceDetail.getByText("无法读取", { exact: true }).waitFor();
  assert.equal(
    await sourceDetail
      .getByText("已独立获取原文并匹配引用片段", { exact: true })
      .count(),
    0,
  );
  await screen("05k-unavailable-source");
  const sourceFilters = page.getByRole("group", {name: "来源状态"});
  await sourceFilters.getByRole("button", {name: /未取得原文/}).click();
  assert.equal(await page.locator(".dr-source-row").count(), 1);
  await sourceFilters.getByRole("button", {name: /已核验/}).click();
  assert.equal(await page.locator(".dr-source-row").count(), 2);
  await sourceFilters.getByRole("button", {name: /全部/}).click();
  assert.equal(await page.locator(".dr-source-row").count(), 3);
  sources[0] = sourceBeforeProofAudit;
  update("running", "research", { sources, findings, report });
  checks.push(
    "canonical independently matched fragments retain separate locators and hashes; rejected fragment reason remains visible, and historical flags cannot claim independent reading",
  );
  checks.push("source status filters separate verified evidence from unavailable originals");
  update("running", "research", {
    sources: longState.sources,
    findings: longState.findings,
    report: longState.report,
  });
  await page.getByRole("tab", { name: "报告", exact: true }).click();
  await page
    .getByRole("heading", { name: longState.report.title, exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".dr-report-document .dr-inline-citation").count(),
    20,
  );
  assert.equal(
    await page.locator(".dr-report-document table tbody tr").count(),
    20,
  );
  assert.ok(
    await page
      .locator(".dr-report-document")
      .evaluate((element) => element.scrollHeight > 3000),
    "long report remains fully rendered",
  );
  await fits();
  await screen("05b-long-report");
  await page.locator(".dr-report-document .dr-inline-citation").last().click();
  await page
    .getByRole("complementary", { name: "来源详情", exact: true })
    .getByRole("heading", { name: longState.sources[2].title, exact: true })
    .waitFor();
  await page
    .getByText(longState.findings.at(-1).evidence[0].locator, { exact: true })
    .last()
    .waitFor();
  assert.equal(
    await page.locator(".dr-source-detail details[open]").count(),
    0,
  );
  await screen("05c-long-citation-locator");
  await page.getByRole("button", { name: "返回报告", exact: true }).click();
  const reportSection = page.locator("#report-evidence-5");
  await reportSection.locator("details > summary").click();
  const preciseEvidence = reportSection
    .locator("blockquote")
    .filter({ hasText: longState.findings.at(-1).evidence[0].locator });
  await preciseEvidence
    .getByRole("button", { name: longState.sources[2].title, exact: true })
    .click();
  await page
    .locator(".dr-linked-claim")
    .getByText(longState.findings.at(-1).evidence[0].locator, { exact: true })
    .waitFor();
  assert.equal(await page.locator(".dr-linked-claim").count(), 1);
  const claimBox = await page.locator(".dr-linked-claim").boundingBox();
  const detailBox = await page.locator(".dr-source-detail").boundingBox();
  assert.ok(
    claimBox.y >= detailBox.y &&
      claimBox.y + claimBox.height <= detailBox.y + detailBox.height,
    "exact claim is visible inside the source detail viewport",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
    "source view remains within one screen",
  );
  await page.screenshot({
    path: path.join(out, "05g-precise-claim-location.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "返回报告", exact: true }).click();
  await reportSection.waitFor();
  await page.waitForFunction(
    () => document.activeElement?.id === "report-evidence-5",
  );
  checks.push(
    "report evidence follows exact source locator, highlights one claim, and returns to original chapter and reading position",
  );
  await page.getByRole("tab", { name: /^发现/ }).click();
  assert.equal(await page.locator(".dr-findings article").count(), 20);
  assert.deepEqual(errors, []);
  await screen("05d-real-20-findings");
  checks.push(
    "three hashed acquired full texts derive 20 backend-normalized claims, six report chapters, 20 table rows and 20 linked citations with exact locator; raw text collapsed",
  );
  await page.getByRole("button", { name: "调整研究方向", exact: true }).click();
  await page
    .getByRole("textbox", { name: "调整研究方向", exact: true })
    .fill("增加失败恢复机制的独立研究");
  await page.getByRole("button", { name: "重新规划", exact: true }).click();
  await waitPhase("制定计划");
  assert.deepEqual(
    calls
      .filter((item) =>
        ["workflow.pause", "workflow.amend", "workflow.resume"].includes(
          item.command,
        ),
      )
      .map((item) => item.command),
    ["workflow.pause", "workflow.amend", "workflow.resume"],
  );
  checks.push("mid-run revision uses pause, amend and resume in order");
  for (const [phase, label, action] of [
    ["planning", "开始执行", "approve-plan"],
    ["synthesis", "继续撰写", "approve-synthesis"],
    ["review", "确认交付", "approve-report"],
  ]) {
    if (phase === "planning") {
      state.plan = { strategy: "根据初步调研分配调查与核验任务" };
      state.managerReviews = [
        {
          managerId: "m2",
          planVersion: state.graph.version,
          verdict: "revise",
          summary: "补充已获取正文的证据覆盖",
          issues: [
            {
              description: "存在未定位的论断",
              suggestion: "为每项论断保留原文行号",
            },
          ],
        },
        {
          managerId: "m1",
          planVersion: state.graph.version,
          verdict: "pass",
          summary: "当前执行依赖可用于计划审阅",
          issues: [],
        },
      ];
    }
    update("waiting", phase);
    await page.getByRole("button", { name: label, exact: true }).waitFor();
    if (phase === "planning") {
      assert.equal(await page.locator(".dr-manager-review").count(), 2);
      await page.locator(".dr-manager-review.revise > summary").click();
      await page
        .getByText("为每项论断保留原文行号", { exact: false })
        .waitFor();
      await screen("05h-manager-plan-review");
      checks.push(
        "same-version Manager approval and revision opinions show actor, reason and requested correction",
      );
    }
    await page.getByRole("button", { name: label, exact: true }).click();
    assert.ok(
      calls.some(
        (item) =>
          item.command === "workflow.respond" &&
          item.args.answer.action === action,
      ),
    );
  }
  checks.push("all three approval states have functional actions");
  await page
    .getByRole("button", { name: "返回研究首页", exact: true })
    .click();
  await page.getByRole("button", { name: "开始研究", exact: true }).click();
  pauseIncomplete = true;
  await page.getByRole("button", { name: "暂停研究", exact: true }).click();
  await page
    .getByText("Pause cleanup incomplete", { exact: true })
    .first()
    .waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "恢复研究", exact: true })
      .isDisabled(),
  );
  assert.ok(
    await page
      .getByRole("button", { name: "调整研究方向", exact: true })
      .isDisabled(),
  );
  await screen("05e-paused-cleanup");
  pauseIncomplete = false;
  await page.getByRole("button", { name: "重试暂停", exact: true }).click();
  await page.getByRole("button", { name: "恢复研究", exact: true }).click();
  cancelIncomplete = true;
  await page.getByRole("button", { name: "停止研究", exact: true }).click();
  await page
    .getByText("Some owned tasks could not be interrupted", { exact: true })
    .waitFor();
  await screen("05f-stop-cleanup");
  cancelIncomplete = false;
  await page
    .getByRole("alert")
    .getByRole("button", { name: "重试停止", exact: true })
    .click();
  await page
    .getByRole("button", { name: "重试停止", exact: true })
    .first()
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.getByRole("button", { name: "重试停止", exact: true }).count(),
    0,
  );
  checks.push(
    "real Host state restrictions: pending pause blocks resume/amend, retry pause releases controls; cancelled pending cleanup shows error and retry Stop",
  );
  await page
    .getByRole("button", { name: "返回研究首页", exact: true })
    .click();
  await page.getByRole("button", { name: "开始研究", exact: true }).click();
  graph.nodes[20].status = "failed";
  update("failed", "research", {
    workers,
    graph,
    sources,
    findings,
    report,
  });
  job.error = "独立核验任务失败";
  await waitPhase("独立核验任务失败");
  assert.equal(await page.locator(".dr-status.completed").count(), 0);
  await page.getByRole("tab", { name: "研究地图", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await fits();
  await screen("06-mobile-dag");
  await page.getByRole("tab", { name: "报告", exact: true }).click();
  await fits();
  await screen("07-mobile-report");
  await page.setViewportSize({ width: 768, height: 1000 });
  await fits();
  await screen("08-tablet");
  checks.push(
    "failed task does not show completion; 390px and 768px pages fit with graph scrolling",
  );
  const archivedNode = { ...graph.nodes[3], active: false };
  update("running", "research", {
    graph: {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === archivedNode.id ? archivedNode : node,
      ),
    },
    visualization: {
      timeline: [
        {
          timestamp: Date.now(),
          type: "search",
          description: archivedNode.label,
          data: { nodeId: archivedNode.id },
        },
      ],
    },
  });
  await page
    .getByRole("button", { name: "返回研究首页", exact: true })
    .click();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 1440) await page.locator(".dr-recent button").first().click();
    await page.getByRole("tab", { name: "研究地图", exact: true }).click();
    const log = page.locator(".dr-activity-log");
    if ((await log.getAttribute("open")) === null)
      await log.locator("summary").click();
    await log
      .getByRole("button", { name: new RegExp(archivedNode.label) })
      .click();
    await page
      .getByRole("heading", { name: "历史任务", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".dr-task-detail h3").innerText(),
      archivedNode.label,
    );
    assert.equal(
      await page.locator(`[data-node-id="${archivedNode.id}"]`).count(),
      0,
    );
    await screen("09-history-" + width);
  }
  checks.push(
    "archived research activity selects its original result and version while current DAG excludes archived node across 1440, 768 and 390 views",
  );
  await page.getByRole("button", { name: "停止研究", exact: true }).click();
  await page.locator('.dr-app[data-status="cancelled"]').waitFor();
  assert.equal(await page.locator(".dr-graph-node.running").count(), 0);
  assert.equal(await page.locator(".dr-graph-node.cancelled").count(), 2);
  assert.equal(
    job.summary.graph.nodes.filter((node) => node.status === "running").length,
    2,
    "display must preserve the last execution checkpoint",
  );
  await screen("10-stopped-clouds");
  checks.push(
    "confirmed stopped workflow displays stopped nodes and no running animation while preserving the original execution checkpoint",
  );
  historyFixtures = Array.from({ length: 65 }, (_, index) => ({
    ...job,
    id: "wf-history-" + index,
    createdAt: Date.now() - index * 1000,
    summary: { ...job.summary, topic: "历史研究 " + index },
  }));
  await page.reload();
  const historyRows = page.locator(".dr-recent > button:not(.dr-history-more)");
  await historyRows.first().waitFor();
  assert.equal(await historyRows.count(), 30);
  await page.getByRole("button", { name: "查看更多研究记录" }).click();
  await historyRows.nth(59).waitFor();
  assert.equal(await historyRows.count(), 60);
  await page.getByRole("button", { name: "查看更多研究记录" }).click();
  await historyRows.nth(64).waitFor();
  assert.equal(await historyRows.count(), 65);
  assert.equal(
    await page.getByRole("button", { name: "查看更多研究记录" }).count(),
    0,
  );
  await historyRows.last().click();
  await page.getByRole("heading", { name: "历史研究 64" }).waitFor();
  checks.push(
    "research history below the input loads every page without duplicate rows",
  );
  historyFixtures = null;
  job = {
    ...job,
    status: "completed",
    revision: job.revision + 1,
    summary: {...job.summary, topic: "已完成的原研究", phase: "complete", progress: {...job.summary.progress, mode: "determinate", percent: 100}, deliverable: longState.report},
  };
  await page.reload();
  await page.locator(".dr-recent > button").first().click();
  await page.getByRole("button", {name: "继续研究", exact: true}).click();
  assert.equal(await page.getByText("基于已完成研究", {exact: true}).count(), 1);
  assert.equal(await page.getByLabel("关键节点由我确认").isChecked(), true);
  await page.locator(".dr-segment label").first().click();
  assert.equal(await page.getByLabel("来源预算").inputValue(), "6");
  await page.locator(".dr-segment label").nth(1).click();
  assert.equal(await page.getByLabel("来源预算").inputValue(), "80");
  await screen("11-follow-up-intake");
  await page.getByLabel("后续问题").fill("上次结论中哪项假设已经变化？");
  await page.getByRole("button", {name: "开始后续研究"}).click();
  await page.getByRole("button", {name: "查看上次报告"}).waitFor();
  const forkCall = calls.findLast(item => item.command === "workflow.fork");
  assert.equal(forkCall.args.id, parentJobForFork.id);
  assert.equal(forkCall.args.expectedRevision, parentJobForFork.revision);
  assert.equal(forkCall.args.input.autoApprove, false);
  assert.equal(forkCall.args.input.topic, "上次结论中哪项假设已经变化？");
  await screen("11-follow-up-child");
  await page.getByRole("button", {name: "查看上次报告"}).click();
  await page.locator(".dr-job-header h1").getByText("已完成的原研究").waitFor();
  assert.equal(await page.getByRole("tab", {name: "报告", exact: true}).getAttribute("aria-selected"), "true");
  checks.push("completed research starts a linked follow-up with a fresh approval and a return path to the prior report");
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(out, "verification.json"),
    JSON.stringify(
      {
        passed: true,
        checks,
        errors,
        scope:
          "Real Chromium rendering and interaction against deterministic Contract fixture; 48 DAG nodes, 8 employees, 2 Managers; no Core or billed model execution",
        modelCalls: 0,
        independentSources: acquisition.sources.length,
        acquiredContentUsed: true,
        sourceReadTransport:
          "HTTP fixture using independently GET-acquired archival bytes; actual acquireSources matching and hashing",
        findings: longState.findings.length,
        productionDataUsed: false,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks, out }, null, 2));
} catch (error) {
  await screen("failure").catch(() => {});
  console.error(error);
  console.error({ errors });
  process.exitCode = 1;
} finally {
  await page.close();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
