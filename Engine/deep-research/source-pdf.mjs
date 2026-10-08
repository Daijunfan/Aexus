/** Local text-layer extraction only; unreadable PDFs are never evidence. */
import {fileURLToPath} from 'node:url';
export const isPdf = data => data.subarray(0, 5).toString() === '%PDF-';

export async function pdfPages(data, {signal} = {}) {
  if (data.length > 8 * 1024 * 1024) throw Error('PDF 超过 8 MiB');
  if (!isPdf(data)) throw Error('PDF 文件头无效');
  signal?.throwIfAborted();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  signal?.throwIfAborted();
  const assets = fileURLToPath(new URL('../../', import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')));
  const loading = pdfjs.getDocument({data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, stopAtErrors: true,
    standardFontDataUrl: assets + 'standard_fonts/', cMapUrl: assets + 'cmaps/', cMapPacked: true, wasmUrl: assets + 'wasm/'});
  let abort;
  const aborted = new Promise((_, reject) => { abort = () => reject(signal.reason || Error('已取消 PDF 解析')); });
  // PDF.js destruction does not settle every pending loading or page promise.
  const wait = promise => signal ? Promise.race([promise, aborted]) : promise;
  signal?.addEventListener('abort', abort, {once: true});
  try {
    const document = await wait(loading.promise);
    if (document.numPages > 80) throw Error('PDF 超过 80 页，无法完成全文核对');
    const pages = []; let chars = 0;
    for (let number = 1; number <= document.numPages; number++) {
      signal?.throwIfAborted();
      const page = await wait(document.getPage(number)), content = await wait(page.getTextContent());
      const text = content.items.map(item => typeof item.str === 'string' ? item.str : '').join(' ').normalize('NFKC').replace(/\s+/g, ' ').trim();
      page.cleanup(); chars += text.length;
      if (chars > 800_000) throw Error('PDF 文本超过 800,000 字符');
      pages.push({number, text});
    }
    signal?.throwIfAborted();
    if (!chars) throw Error('PDF 没有可提取文字，扫描件需要先经过 OCR');
    return pages;
  } catch (error) {
    signal?.throwIfAborted();
    if (error?.name === 'PasswordException') throw Error('受密码保护的 PDF 无法核对，请提供无密码版本');
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    await loading.destroy().catch(() => {});
  }
}
