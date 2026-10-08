/** Independent public-source acquisition. Native employees supply candidate excerpts only. */
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {parse} from 'parse5';
import {isIndependentSource} from './evidence.mjs';
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
export function pageText(body) {
  const parts = [];
  const visit = node => {
    if (['script', 'style', 'noscript', 'template', 'svg'].includes(node.tagName)) return;
    if (node.nodeName === '#text') parts.push(node.value);
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parse(String(body)));
  return normalize(parts.join(' '));
}

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
        const data = Buffer.concat(chunks), body = data.toString('utf8');
        resolve({url, body: pdf ? '' : body, data, mediaType, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), accessedAt: Date.now(), text: pdf ? undefined : /html/.test(mediaType) ? pageText(body) : normalize(body)});
      });
    });
    const deadline = setTimeout(() => request.destroy(Error('资料读取超过 20 秒')), 20000);
    deadline.unref?.(); request.once('close', () => clearTimeout(deadline));
    request.on('error', reject); request.setTimeout(15000, () => request.destroy(Error('资料读取超时'))); request.end();
  });
}

/** Reuse a checked excerpt, or read a URL once within this bounded candidate batch. */
export async function acquireSources(state, candidates, {signal, read = readSource} = {}) {
  const cache = new Map(), results = new Array(candidates.length);
  let index = 0;
  const workers = await Promise.allSettled(Array.from({length: Math.min(4, candidates.length)}, async () => {
    while (index < candidates.length) {
      signal?.throwIfAborted();
      const at = index++, candidate = candidates[at], submitted = candidate.acquisition?.excerpt || '';
      const old = state.sources.find(source => source.id === candidate.id);
      const known = old && isIndependentSource(old) && old.acquisition.excerpts.find(item => item.excerpt === submitted);
      if (known) { results[at] = {...candidate, acquisition: {status: 'read', method: 'independent-http', excerpts: [known]}}; continue; }
      if (!submitted) { results[at] = {...candidate, acquisition: {status: 'discovered', method: 'agent-reported', reason: '尚未提供需独立核对的原文片段'}}; continue; }
      try {
        const url = publicURL(candidate.url);
        if (!cache.has(url)) cache.set(url, Promise.resolve().then(() => read(url, {signal})).then(async response => {
          const data = response.data || Buffer.from(response.body || '', 'utf8'), body = data.toString('utf8');
          const pdf = isPdf(data) || ['application/pdf', 'application/octet-stream', 'binary/octet-stream'].includes(response.mediaType);
          return {data, finalUrl: publicURL(response.url || url), accessedAt: response.accessedAt || Date.now(), mediaType: pdf ? 'application/pdf' : response.mediaType,
            pages: pdf ? await pdfPages(data, {signal}) : null, text: pdf ? '' : /html/.test(response.mediaType || '') ? pageText(body) : normalize(body)};
        }));
        const response = await cache.get(url);
        signal?.throwIfAborted();
        const page = response.pages?.find(page => page.text.includes(normalize(submitted)));
        if (response.pages ? !page : !response.text.includes(normalize(submitted))) throw Error('独立取得的原文未找到完整提交片段，该片段不能作为证据或引用');
        const proof = {excerpt: submitted, locator: page ? 'Page ' + page.number : candidate.acquisition.locator || '', sha256: createHash('sha256').update(response.data).digest('hex'), accessedAt: response.accessedAt, finalUrl: response.finalUrl, match: 'normalized-text', mediaType: response.mediaType,
          ...(page ? {pages: [page.number]} : {})};
        results[at] = {...candidate, acquisition: {status: 'read', method: 'independent-http', excerpts: [proof]}};
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
