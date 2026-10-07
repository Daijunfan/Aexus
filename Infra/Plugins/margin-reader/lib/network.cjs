'use strict';
// Single-document HTTP retrieval. Private addresses are rejected before a connection is made.
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns/promises');
const zlib = require('node:zlib');
const ipaddr = require('ipaddr.js');
const { ReaderError, assert, fail } = require('./safety.cjs');
function publicAddress(address) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === 'unicast';
  } catch { return false; }
}
async function resolvePublic(input) {
  let url;
  try { url = new URL(input); } catch { fail('INVALID_URL', 'Enter a complete HTTP or HTTPS URL.'); }
  assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'URL_BLOCKED', 'Only HTTP(S) URLs without embedded credentials are accepted.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  assert(hostname !== 'localhost' && !hostname.endsWith('.localhost') && !hostname.endsWith('.local'), 'URL_BLOCKED', 'Local network URLs are not allowed.');
  const addresses = ipaddr.isValid(hostname)
    ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv6' ? 6 : 4 }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  assert(addresses.length && addresses.every(a => publicAddress(a.address)), 'URL_BLOCKED', 'This URL resolves to a non-public address.');
  return { url, address: addresses[0], addresses };
}
async function download(input, options = {}) {
  const maxBytes = options.maxBytes ?? 128 * 1024 * 1024;
  const redirects = options.redirects ?? 5;
  const timeout = options.timeout ?? 30000;
  const { url, address, addresses } = await resolvePublic(input);
  const result = await new Promise((resolve, reject) => {
    let stream, timer, request, complete = false;
    const finish = (error, value) => {
      if (complete) return;
      complete = true; clearTimeout(timer);
      if (error) { stream?.destroy(); request?.destroy(); reject(error); }
      else resolve(value);
    };
    request = (url.protocol === 'https:' ? https : http).get(url, {
      headers: { 'user-agent': 'MarginReader/0.1 (offline document reader)', accept: 'text/html,application/pdf,application/epub+zip,*/*;q=0.5', 'accept-encoding': 'gzip, deflate, br' },
      // Allow IPv4/IPv6 fallback, but ONLY among this request's already-validated
      // addresses. Never resolve again or bypass the private-address guard.
      agent: false, autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250,
      lookup: (_host, lookupOptions, callback) => lookupOptions?.all ? callback(null, addresses) : callback(null, address.address, address.family)
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location) return finish(new ReaderError('HTTP_ERROR', 'Redirect response has no Location header.'));
        return finish(null, { redirect: response.headers.location, url: url.href });
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        return finish(new ReaderError('HTTP_ERROR', `Server returned HTTP ${response.statusCode}. Access restrictions are not bypassed.`));
      }
      const encoding = response.headers['content-encoding'];
      stream = encoding === 'gzip' ? response.pipe(zlib.createGunzip())
        : encoding === 'deflate' ? response.pipe(zlib.createInflate())
          : encoding === 'br' ? response.pipe(zlib.createBrotliDecompress()) : response;
      response.on('error', e => finish(new ReaderError('NETWORK_ERROR', e.message)));
      response.on('aborted', () => finish(new ReaderError('NETWORK_ERROR', 'Remote response was interrupted before the download completed.')));
      const chunks = []; let total = 0;
      stream.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) return finish(new ReaderError('TOO_LARGE', 'Downloaded response exceeded the size limit.'));
        chunks.push(chunk);
      });
      stream.on('end', () => finish(null, { bytes: Buffer.concat(chunks), url: url.href, contentType: String(response.headers['content-type'] || '').toLowerCase() }));
      stream.on('error', e => finish(e));
    });
    timer = setTimeout(() => finish(new ReaderError('FETCH_TIMEOUT', 'Remote server did not finish responding in time.')), timeout);
    request.on('error', e => finish(e instanceof ReaderError ? e : new ReaderError('NETWORK_ERROR', e.message)));
  });
  if (result.redirect) {
    assert(redirects > 0, 'TOO_MANY_REDIRECTS', 'URL exceeded the redirect limit.');
    return download(new URL(result.redirect, result.url).href, { maxBytes, redirects: redirects - 1, timeout });
  }
  return result;
}
module.exports = { publicAddress, resolvePublic, download };
