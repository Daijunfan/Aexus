/** Minimal browser-side DOCX text reader. No network, Office execution, or extra dependency. */
const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MAX_XML_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;
const MAX_ZIP_ENTRIES = 5_000;

const invalidZip = () => Error("DOCX 文件损坏或不是有效的 Word 文档");
const dataWithin = (bytes: Uint8Array, position: number, size: number) =>
  Number.isSafeInteger(position) && Number.isSafeInteger(size) &&
  position >= 0 && size >= 0 && position <= bytes.length - size;

const crcTable = Uint32Array.from({length: 256}, (_, index) => {
  let value = index;
  for (let i = 0; i < 8; i++) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = {
  method: number;
  flags: number;
  compressedSize: number;
  extractedSize: number;
  offset: number;
  crc: number;
  name: string;
};

/** ZIP central directory identifies exact entry extents, including data-descriptor archives. */
function documentEntry(data: Uint8Array): ZipEntry {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  let footer = -1;
  // End-of-central-directory allows at most 65,535 bytes of ZIP comment.
  for (let at = data.length - 22; at >= Math.max(0, data.length - 65_557); at--) {
    if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === data.length) {
      footer = at; break;
    }
  }
  if (footer < 0 || u16(footer + 4) || u16(footer + 6)) throw invalidZip();
  const count = u16(footer + 10), size = u32(footer + 12), start = u32(footer + 16);
  if (!count || count > MAX_ZIP_ENTRIES || count === 0xffff || size === 0xffffffff ||
    start === 0xffffffff || !dataWithin(data, start, size) || start + size > footer) throw invalidZip();

  let cursor = start, hasContentTypes = false;
  let result: ZipEntry | undefined;
  for (let i = 0; i < count; i++) {
    if (!dataWithin(data, cursor, 46) || u32(cursor) !== 0x02014b50) throw invalidZip();
    const nameSize = u16(cursor + 28), extraSize = u16(cursor + 30), commentSize = u16(cursor + 32);
    const length = 46 + nameSize + extraSize + commentSize;
    if (!dataWithin(data, cursor, length) || cursor + length > start + size) throw invalidZip();
    const name = new TextDecoder("utf-8", {fatal: true})
      .decode(data.subarray(cursor + 46, cursor + 46 + nameSize));
    if (name === "[Content_Types].xml") hasContentTypes = true;
    if (name === "word/document.xml") {
      if (result) throw Error("DOCX 包含重复的正文，无法安全解析");
      result = {name, method: u16(cursor + 10), flags: u16(cursor + 8),
        crc: u32(cursor + 16), compressedSize: u32(cursor + 20),
        extractedSize: u32(cursor + 24), offset: u32(cursor + 42)};
    }
    cursor += length;
  }
  if (!result || !hasContentTypes) throw Error("DOCX 缺少 Word 正文或内容类型");
  if ((result.flags & 1) !== 0) throw Error("加密的 DOCX 暂不支持");
  if (![0, 8].includes(result.method)) throw Error("DOCX 使用不支持的压缩格式");
  if (result.extractedSize === 0xffffffff || result.extractedSize > MAX_XML_BYTES ||
      result.compressedSize === 0xffffffff) throw Error("DOCX 正文解压大小超过 4 MiB 上限");
  return result;
}

async function extractEntry(data: Uint8Array, entry: ZipEntry, signal?: AbortSignal): Promise<Uint8Array> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const at = entry.offset;
  if (!dataWithin(data, at, 30) || view.getUint32(at, true) !== 0x04034b50) throw invalidZip();
  const method = view.getUint16(at + 8, true);
  const filenameSize = view.getUint16(at + 26, true);
  const extraSize = view.getUint16(at + 28, true);
  const begin = at + 30 + filenameSize + extraSize;
  if (method !== entry.method || !dataWithin(data, begin, entry.compressedSize)) throw invalidZip();
  const filename = new TextDecoder("utf-8", {fatal: true})
    .decode(data.subarray(at + 30, at + 30 + filenameSize));
  if (filename !== entry.name) throw invalidZip();
  signal?.throwIfAborted();
  const compressed = data.subarray(begin, begin + entry.compressedSize);
  let raw: Uint8Array;
  if (entry.method === 0) {
    if (compressed.length > MAX_XML_BYTES) throw Error("DOCX 正文解压大小超过 4 MiB 上限");
    raw = compressed;
  } else {
    if (typeof DecompressionStream !== "function") throw Error("当前浏览器不支持 DOCX 解压");
    let unzip: DecompressionStream;
    try { unzip = new DecompressionStream("deflate-raw"); }
    catch { throw Error("当前浏览器不支持 DOCX 的 ZIP 解压格式"); }
    const reader = new Blob([Uint8Array.from(compressed)]).stream().pipeThrough(unzip).getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
    signal?.addEventListener("abort", abort, {once: true});
    try {
      while (true) {
        signal?.throwIfAborted();
        const {done, value} = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_XML_BYTES) throw Error("DOCX 正文解压大小超过 4 MiB 上限");
        chunks.push(value);
      }
      raw = new Uint8Array(length);
      let cursor = 0;
      for (const chunk of chunks) { raw.set(chunk, cursor); cursor += chunk.length; }
    } finally {
      signal?.removeEventListener("abort", abort);
      await reader.cancel().catch(() => {});
    }
  }
  signal?.throwIfAborted();
  if (raw.length !== entry.extractedSize || crc32(raw) !== entry.crc) throw Error("DOCX 正文校验失败");
  return raw;
}

/** Extract user-authored paragraphs and table cells only. No macros, image loading, links, or external parts. */
export async function readDocxText(data: Uint8Array, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const entry = documentEntry(data);
  const raw = await extractEntry(data, entry, signal);
  signal?.throwIfAborted();
  let xml: string;
  const encoding = raw[0] === 0xff && raw[1] === 0xfe ? "utf-16le" :
    raw[0] === 0xfe && raw[1] === 0xff ? "utf-16be" : "utf-8";
  try { xml = new TextDecoder(encoding, {fatal: true}).decode(raw); }
  catch { throw Error("DOCX 正文不是可读取的 UTF-8/UTF-16 XML"); }
  if (/<!\s*(doctype|entity)/i.test(xml)) throw Error("DOCX 包含不支持的 XML 声明");
  if (typeof DOMParser !== "function") throw Error("当前环境不支持 Word XML 解析");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const root = document.documentElement;
  if (document.getElementsByTagName("parsererror").length ||
    root?.localName !== "document" || root.namespaceURI !== WORD_NAMESPACE) throw invalidZip();
  const body = document.getElementsByTagNameNS(WORD_NAMESPACE, "body")[0];
  if (!body) throw invalidZip();

  const content: string[] = [];
  let count = 0;
  const append = (value: string) => {
    count += value.length;
    if (count > MAX_TEXT_CHARS) throw Error("DOCX 正文超过背景材料 200,000 字符上限");
    content.push(value);
  };
  const visit = (node: Node, insideCell = false) => {
    if (node.nodeType !== 1) return;
    const item = node as Element;
    if (item.namespaceURI === WORD_NAMESPACE) {
      if (item.localName === "del" || item.localName === "moveFrom") return;
      if (item.localName === "t") {append(item.textContent ?? ""); return;}
      if (item.localName === "tab") {append("\t"); return;}
      if (item.localName === "br" || item.localName === "cr") {append("\n"); return;}
    }
    const isCell = item.namespaceURI === WORD_NAMESPACE && item.localName === "tc";
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child, insideCell || isCell);
    if (item.namespaceURI === WORD_NAMESPACE) {
      if (item.localName === "p") append(insideCell ? " " : "\n");
      if (item.localName === "tr") append("\n");
      if (isCell) append("\t");
    }
  };
  visit(body);
  signal?.throwIfAborted();
  const text = content.join("").replace(/ +\t/g, "\t").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw Error("DOCX 没有可提取的正文，图片内容暂不支持 OCR");
  return text;
}
