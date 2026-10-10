/// <reference types="vite/client" />
import type { PDFDocumentProxy } from "pdfjs-dist";

/** Browser-side background material extraction. Contents stay explicitly user-supplied, never independently verified evidence. */
export type ResearchMaterial = { name: string; content: string };
export type ReadPdfPages = (data: Uint8Array, signal?: AbortSignal) => Promise<string[]>;

const TEXT_BYTES = 200_000;
const DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_PDF_PAGES = 80;
const MAX_CONTENT_CHARS = 200_000;
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json"]);

function extension(name: string): string {
  return (name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
}

/** PDF.js loads only when PDF import is requested; it doesn't enlarge the normal research UI startup. */
async function readPdfPages(data: Uint8Array, signal?: AbortSignal): Promise<string[]> {
  signal?.throwIfAborted();
  const [{getDocument, GlobalWorkerOptions}, workerAsset] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  signal?.throwIfAborted();
  GlobalWorkerOptions.workerSrc = workerAsset.default;
  const documentOptions = {
    data, isEvalSupported: false, useSystemFonts: false,
    disableFontFace: true, stopAtErrors: true,
  };
  const loading = getDocument(documentOptions);

  let cancel: ((error: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => { cancel = reject; });
  const onAbort = () => {
    cancel?.(signal?.reason ?? new Error("PDF 读取已取消"));
    void loading.destroy().catch(() => {});
  };
  const wait = <T,>(promise: Promise<T>) =>
    signal ? Promise.race([promise, aborted]) : promise;
  signal?.addEventListener("abort", onAbort, {once: true});

  try {
    const pdf = await wait(loading.promise as Promise<PDFDocumentProxy>);
    if (pdf.numPages > MAX_PDF_PAGES) throw Error("PDF 超过 80 页");
    const pages: string[] = [];
    let total = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      signal?.throwIfAborted();
      const page = await wait(pdf.getPage(number));
      try {
        const content = await wait(page.getTextContent());
        const text = content.items
          .map(item => ("str" in item && typeof item.str === "string")
            ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ") : "")
          .join("")
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        total += text.length;
        if (total > MAX_CONTENT_CHARS) throw Error("PDF 文本超过背景材料 200,000 字符上限");
        pages.push(text);
      } finally {
        page.cleanup();
      }
    }
    signal?.throwIfAborted();
    if (!pages.some(page => page.trim())) throw Error("PDF 没有可提取的文字；扫描件暂不支持 OCR");
    return pages;
  } catch (error) {
    signal?.throwIfAborted();
    if (error && typeof error === "object" && "name" in error && error.name === "PasswordException") {
      throw Error("受密码保护的 PDF 暂不支持，请提供无密码版本");
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await loading.destroy().catch(() => {});
  }
}

/**
 * Parse a single browser File into the existing workflow's {name, content} shape.
 * Public-web proof status remains unchanged; local materials are context, not citation evidence.
 */
export async function parseResearchMaterial(
  file: Pick<File, "name" | "size" | "text" | "arrayBuffer">,
  {signal, readPdf = readPdfPages}: {signal?: AbortSignal; readPdf?: ReadPdfPages} = {},
): Promise<ResearchMaterial> {
  const kind = extension(file.name);
  if (!TEXT_EXTENSIONS.has(kind) && !["pdf", "docx"].includes(kind)) {
    throw Error("背景材料支持 TXT、Markdown、CSV、JSON、DOCX 和带文本层的 PDF");
  }
  const binary = kind === "pdf" || kind === "docx";
  const limit = binary ? DOCUMENT_BYTES : TEXT_BYTES;
  if (!Number.isSafeInteger(file.size) || file.size > limit || file.size < 0) {
    throw Error(binary ? "PDF/DOCX 文件大小不能超过 8 MiB" : "文本文件大小不能超过 200KB");
  }
  signal?.throwIfAborted();
  if (!binary) {
    const data = new Uint8Array(await file.arrayBuffer());
    signal?.throwIfAborted();
    if (data.length > TEXT_BYTES) throw Error("文本文件大小不能超过 200KB");
    const encoding = data[0] === 0xff && data[1] === 0xfe ? "utf-16le" :
      data[0] === 0xfe && data[1] === 0xff ? "utf-16be" : "utf-8";
    let content: string;
    try { content = new TextDecoder(encoding, {fatal: true}).decode(data); }
    catch { throw Error("文本编码无法读取；请另存为 UTF-8 或带 BOM 的 UTF-16"); }
    if (content.includes("\u0000")) throw Error("文本文件包含二进制内容，请提供纯文本格式");
    if (content.length > MAX_CONTENT_CHARS) throw Error("单份背景材料不能超过 200,000 字符");
    return {name: file.name, content};
  }

  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  if (data.length > DOCUMENT_BYTES) throw Error("PDF/DOCX 文件大小不能超过 8 MiB");
  if (kind === "docx") {
    const {readDocxText} = await import("./docx.ts");
    signal?.throwIfAborted();
    const content = await readDocxText(data, signal);
    signal?.throwIfAborted();
    return {name: file.name, content};
  }
  if (data.length < 5 || String.fromCharCode(...data.subarray(0, 5)) !== "%PDF-") {
    throw Error("PDF 文件头无效");
  }
  const pages = await readPdf(data, signal);
  signal?.throwIfAborted();
  if (pages.length > MAX_PDF_PAGES) throw Error("PDF 超过 80 页");
  if (!pages.some(page => page.trim())) throw Error("PDF 没有可提取的文字；扫描件暂不支持 OCR");
  const content = pages.map((text, index) => "【PDF 第 " + (index + 1) + " 页】\n" + text).join("\n\n");
  if (content.length > MAX_CONTENT_CHARS) throw Error("PDF 文本超过背景材料 200,000 字符上限");
  return {name: file.name, content};
}
