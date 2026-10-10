import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const entry = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ResearchIntake } from "./workspace/ResearchIntake";
let pendingUpload = null;
function Demo() {
  const [topic, setTopic] = useState("");
  const [scope, setScope] = useState("comprehensive");
  const [maxSources, setMaxSources] = useState(80);
  const [urlText, setUrlText] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [materials, setMaterials] = useState([]);
  const [busy, setBusy] = useState(false);
  const [readingMaterials, setReadingMaterials] = useState(false);
  const [submitted, setSubmitted] = useState(0);
  window.fixture = {
    finishUpload() { pendingUpload?.(); },
  };
  return <>
    <ResearchIntake
      parent={null}
      values={{topic,scope,sourceBudget:maxSources,sourceUrlsText:urlText,autoApprove,materials}}
      onChange={{
        topic:setTopic,scope:setScope,sourceBudget:setMaxSources,
        sourceUrlsText:setUrlText,autoApprove:setAutoApprove,
        removeMaterial:index=>setMaterials(items=>items.filter((_,i)=>i!==index)),
      }}
      engines={{selected:"pi",options:[{engine:"pi",label:"Pi",configuration:{hasApiKey:true,sharedPiConfig:true}}],loading:false,onSelect:()=>{}}}
      busy={busy}
      readingMaterials={readingMaterials}
      onCancelFollowUp={()=>{}}
      onStart={event => {event.preventDefault();setSubmitted(value=>value+1);}}
      onUpload={files => {
        setBusy(true);setReadingMaterials(true);
        pendingUpload=()=>{
          setMaterials(old=>[...old,...files.map(file=>({name:file.name,content:"模拟内容"}))]);
          setBusy(false);setReadingMaterials(false);
        };
      }}
    />
    <p id="submits">{submitted}</p>
  </>;
}
createRoot(document.getElementById("root")).render(<Demo />);
`;

const bundle = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "intake-test.tsx", loader: "tsx" },
  write: false, bundle: true, platform: "browser", format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.setContent('<div id="root" class="dr-app"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const input = page.getByLabel("添加背景材料");
  assert.ok((await input.getAttribute("accept")).includes(".docx"));
  await page.getByLabel("研究目标").fill("调研边缘计算发展趋势");
  await page.locator(".dr-settings summary").click();
  await input.setInputFiles({
    name: "材料.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("fixture"),
  });
  await page.getByText("正在解析背景材料…").waitFor();
  assert.equal(await input.isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "开始研究" }).isDisabled(), true);
  await page.evaluate(() => window.fixture.finishUpload());
  await page.getByLabel("移除 材料.docx").waitFor();
  assert.equal(await input.isEnabled(), true);
  assert.equal(await page.getByText("正在解析背景材料…").count(), 0);
  const topic = page.getByLabel("研究目标");
  await topic.focus();
  await page.keyboard.press("Control+Enter");
  assert.equal(await page.locator("#submits").textContent(), "1");
  await page.getByLabel("移除 材料.docx").click();
  assert.equal(await page.getByLabel("移除 材料.docx").count(), 0);
  assert.deepEqual(errors, []);
  console.log("Workspace intake: DOCX UI, busy indication, keyboard submit and material removal passed.");
} finally {
  await browser.close();
}
