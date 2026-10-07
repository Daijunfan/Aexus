import { requestRpc } from './rpc-client.mjs';
export const base = new URL('.', location.href);
export const token = location.pathname.split('/')[1];
const pending = new Set();
export function api(method, params = {}) {
  const work=requestRpc(new URL('rpc',base),method,params);
  // Disposable cover rendering must not hold up the host's save-before-close handshake.
  if (method !== 'document.preview') pending.add(work);
  work.then(() => pending.delete(work), () => pending.delete(work));
  return work;
}
export async function flushRequests() {
  while (pending.size) {
    const replies = await Promise.allSettled([...pending]);
    const failed = replies.find(r => r.status === 'rejected');
    if (failed) throw failed.reason;
  }
}
export function notifyHost(type, values = {}) { parent.postMessage({ type: `agents-plugin:${type}`, token, ...values }, '*'); }
export function external(url) {
  let target; try { target = new URL(url); } catch { return; }
  if (!['http:', 'https:'].includes(target.protocol)) return;
  if (new URLSearchParams(location.search).has('hosted')) notifyHost('external', { url: target.href });
  else window.open(target.href, '_blank', 'noopener,noreferrer');
}
export function subscribe(callback) {
  const source = new EventSource(new URL('events', base));
  source.onmessage = () => callback();
  source.onopen = () => callback(); // Reconnects reload domain state even after an event gap.
  return () => source.close();
}
