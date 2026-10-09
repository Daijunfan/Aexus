/** Independent public-source acquisition. Native employees supply candidate excerpts only. */
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {parse} from 'parse5';
import {canonicalUrl, isIndependentSource} from './evidence.mjs';
import {isPdf, pdfPages} from './source-pdf.mjs';

const blocked = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10], ['192.0.0.0', 24], ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32]]) blocked.addSubnet(address, prefix, 'ipv6');
export const publicAddress = address => !!net.isIP(address) && !blocked.check(address, net.isIP(address) === 6 ? 'ipv6' : 'ipv4');
export function publicURL(value) {
  const url = new URL(value), literal = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port) || /(^|\.)(localhost|local)$/i.test(url.hostname) || net.isIP(literal) && !publicAddress(literal)) throw Error('仅允许公开 HTTP(S) 来源，拒绝私网地址或凭据');
  return url.href;
}
const normalize = value => String(value).normalize('NFKC').replace(/\s+/g, ' ').trim();
const blocks = new Set(['body', 'title', 'p', 'div', 'section', 'article', 'li', 'ul', 'ol', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'td', 'th', 'nav', 'header', 'footer', 'main', 'blockquote', 'pre', 'table']);
export function pageDocument(body) {
  const parts = [];
  let title = '';
  const visit = node => {
    if (['script', 'style', 'noscript', 'template', 'svg'].includes(node.tagName)) return;
    if (node.tagName === 'title' && !title) title = normalize((node.childNodes || []).map(child => child.value || '').join(' '));
    const block = blocks.has(node.tagName);
    if (block) parts.push(' ');
    if (node.nodeName === '#text') parts.push(node.value);
    for (const child of node.childNodes || []) visit(child);
    if (block) parts.push(' ');
  };
  visit(parse(String(body)));
  return {text: normalize(parts.join('')), title};
}
export const pageText = body => pageDocument(body).text;

/** DNS is checked in the actual socket lookup, including each redirect. */
export function readSource(value, {signal} = {}, redirects = 0) {
  const url = publicURL(value);
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const request = (url.startsWith('https:') ? https : http).request(url, {
      method: 'GET', signal,
      headers: {'user-agent': 'Aexus-DeepResearch/2.0 (+source-verification)', accept: 'text/html,text/plain,application/json,application/pdf', 'accept-encoding': 'identity'},
      lookup: (hostname, options, callback) => dns.lookup(hostname, {all: true}, (error, addresses) => {
        if (error) return callback(error);
        if (!addresses.length || addresses.some(item => !publicAddress(item.address))) return callback(Error('资料主机解析到私网地址'));
        if (options?.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      })
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (redirects >= 3 || !response.headers.location) { reject(Error('资料重定向过多')); return; }
        try { resolve(readSource(new URL(response.headers.location, url).href, {signal}, redirects + 1)); }
        catch (error) { reject(error); }
        return;
      }
      if (response.statusCode !== 200) { response.destroy(); reject(Error('资料请求返回 HTTP ' + response.statusCode)); return; }
      const mediaType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const pdf = ['application/pdf', 'application/octet-stream', 'binary/octet-stream'].includes(mediaType);
      if (!pdf && !/^(text\/(html|plain)|application\/(json|xhtml\+xml))$/.test(mediaType)) { response.destroy(); reject(Error('暂不能独立读取此格式，请提供 HTML、文本或带文本层的 PDF')); return; }
      let size = 0; const chunks = [];
      response.on('data', chunk => {
        size += chunk.length;
        if (size > (pdf ? 8 : 4) * 1024 * 1024) { request.destroy(Error(pdf ? 'PDF 超过 8 MiB' : '资料页面超过 4 MiB')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const data = Buffer.concat(chunks);
        resolve({url, body: pdf ? '' : data.toString('utf8'), data, mediaType, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), accessedAt: Date.now()});
      });
    });
    const deadline = setTimeout(() => request.destroy(Error('资料读取超过 20 秒')), 20000);
    deadline.unref?.(); request.once('close', () => clearTimeout(deadline));
    request.on('error', reject); request.setTimeout(15000, () => request.destroy(Error('资料读取超时'))); request.end();
  });
}

/** Give a scoped scout readable page text; citations still require acquireSources. */
export async function previewSource(url, {signal, read = readSource} = {}) {
  const response = await read(publicURL(url), {signal});
  const data = response.data || Buffer.from(response.body || '', 'utf8');
  const pdf = isPdf(data) || response.mediaType === 'application/pdf';
  const document = !pdf && /html/.test(response.mediaType || '') ? pageDocument(data.toString('utf8')) : null;
  const text = pdf ? (await pdfPages(data, {signal})).map(page => `Page ${page.number}: ${page.text}`).join('\n') : document?.text ?? normalize(data.toString('utf8'));
  return {url: canonicalUrl(url), title: document?.title || '', text: text.slice(0, 6000), truncated: text.length > 6000};
}

/** Reuse a checked excerpt, or read a URL once within this bounded candidate batch. */
export async function acquireSources(state, candidates, {signal, read = readSource} = {}) {
  const cache = new Map(), results = new Array(candidates.length);
  let index = 0;
  const workers = await Promise.allSettled(Array.from({length: Math.min(4, candidates.length)}, async () => {
    while (index < candidates.length) {
      signal?.throwIfAborted();
      const at = index++, candidate = candidates[at], submitted = candidate.acquisition?.excerpt || '';
      const old = state.sources.find(source => source.id === candidate.id) || state.sources.find(source => { try { return canonicalUrl(source.url) === candidate.url; } catch { return false; } });
      const segments = submitted.split(/\s+\/\s+/).filter(Boolean);
      const saved = old && isIndependentSource(old) ? old.acquisition.excerpts : [];
      const exact = saved.find(item => item.excerpt === submitted);
      const known = exact ? [exact] : segments.length > 1 ? segments.map(part => saved.find(item => item.excerpt === part)) : [];
      if (known.length && known.every(Boolean)) { results[at] = {...candidate, title: old.acquisition.pageTitle || candidate.title, acquisition: {status: 'read', method: 'independent-http', excerpts: known, ...(old.acquisition.pageTitle ? {pageTitle: old.acquisition.pageTitle} : {})}}; continue; }
      if (!submitted) { results[at] = {...candidate, acquisition: {status: 'discovered', method: 'agent-reported', reason: '尚未提供需独立核对的原文片段'}}; continue; }
      try {
        const url = publicURL(candidate.url);
        if (!cache.has(url)) cache.set(url, Promise.resolve().then(() => read(url, {signal})).then(async response => {
          const data = response.data || Buffer.from(response.body || '', 'utf8');
          const pdf = isPdf(data) || ['application/pdf', 'application/octet-stream', 'binary/octet-stream'].includes(response.mediaType);
          const body = pdf ? '' : data.toString('utf8');
          const document = !pdf && /html/.test(response.mediaType || '') ? pageDocument(body) : null;
          return {data, finalUrl: publicURL(response.url || url), accessedAt: response.accessedAt || Date.now(), mediaType: pdf ? 'application/pdf' : response.mediaType,
            pages: pdf ? await pdfPages(data, {signal}) : null, text: pdf ? '' : document?.text ?? normalize(body), pageTitle: document?.title || ''};
        }));
        const response = await cache.get(url);
        signal?.throwIfAborted();
        const locate = excerpt => response.pages?.find(page => page.text.includes(normalize(excerpt))) || (!response.pages && response.text.includes(normalize(excerpt)) ? {} : null);
        const excerpts = locate(submitted) ? [submitted] : segments.length > 1 ? segments : [submitted];
        const locations = excerpts.map(locate);
        if (locations.some(page => !page)) throw Error('独立取得的原文未找到完整提交片段，该片段不能作为证据或引用');
        const sha256 = createHash('sha256').update(response.data).digest('hex');
        const proofs = excerpts.map((excerpt, index) => {
          const page = locations[index];
          return {excerpt, locator: page.number ? 'Page ' + page.number : candidate.acquisition.locator || '', sha256, accessedAt: response.accessedAt, finalUrl: response.finalUrl, match: 'normalized-text', mediaType: response.mediaType,
            ...(page.number ? {pages: [page.number]} : {})};
        });
        results[at] = {...candidate, title: response.pageTitle || candidate.title, acquisition: {status: 'read', method: 'independent-http', excerpts: proofs, ...(response.pageTitle ? {pageTitle: response.pageTitle} : {})}};
      } catch (error) {
        signal?.throwIfAborted();
        results[at] = {...candidate, acquisition: {status: 'unavailable', method: 'agent-reported', rejections: [{excerpt: submitted, locator: candidate.acquisition.locator || '', reason: error.message}]}};
      }
    }
  }));
  const failure = workers.find(worker => worker.status === 'rejected');
  if (failure) throw failure.reason;
  return results;
}
