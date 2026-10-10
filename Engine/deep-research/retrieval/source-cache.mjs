/** Small per-research-run cache for independently fetched public content.
 * The cache never manufactures reading proof; returned metadata stays from the original fetch.
 * Callers treat cached response objects as read-only.
 */
export function cacheSourceReader(read, {
  maxEntries = 32, maxBytes = 24 * 1024 * 1024, ttlMs = 90_000, now = Date.now,
} = {}) {
  if (typeof read !== 'function') throw TypeError('source reader must be a function');
  if (![maxEntries, maxBytes, ttlMs].every(value => Number.isSafeInteger(value) && value >= 0))
    throw RangeError('cache limits must be nonnegative safe integers');
  if (typeof now !== 'function') throw TypeError('cache clock must be a function');

  const completed = new Map(), running = new Map();
  let usedBytes = 0;

  const weight = response => {
    // HTTP readers often hold both raw Buffer and a separate decoded string.
    const rawBytes = response?.data?.byteLength || 0;
    const textBytes = typeof response?.body === 'string' ? Buffer.byteLength(response.body, 'utf8') : 0;
    return rawBytes + textBytes;
  };
  const remove = key => {
    const entry = completed.get(key);
    if (entry) {usedBytes -= entry.bytes; completed.delete(key);}
  };
  const remember = (key, response) => {
    const bytes = weight(response);
    if (!maxEntries || !maxBytes || !ttlMs || bytes > maxBytes || !response) return;
    remove(key);
    completed.set(key, {response, bytes, expires: now() + ttlMs});
    usedBytes += bytes;
    while (completed.size > maxEntries || usedBytes > maxBytes) remove(completed.keys().next().value);
  };

  return function readCachedSource(url, options = {}) {
    const signal = options.signal;
    try {signal?.throwIfAborted();} catch (error) {return Promise.reject(error);}
    // Reader options other than the run-level AbortSignal may change the representation.
    if (Object.keys(options).some(name => name !== 'signal'))
      return Promise.resolve().then(() => read(url, options));
    const key = String(url);
    const existing = completed.get(key);
    if (existing) {
      if (existing.expires >= now()) {
        // LRU: a frequently reused source stays warm without changing its provenance.
        completed.delete(key); completed.set(key, existing);
        return Promise.resolve(existing.response);
      }
      remove(key);
    }

    // Only share a pending request when the owner cancellation identity is identical.
    const inFlight = running.get(key);
    if (inFlight && inFlight.signal === signal) return inFlight.promise;
    const current = {signal, promise: null};
    const promise = Promise.resolve().then(() => {
      signal?.throwIfAborted();
      return read(url, options);
    }).then(response => {
      signal?.throwIfAborted();
      remember(key, response);
      return response;
    }).finally(() => {
      if (running.get(key) === current) running.delete(key);
    });
    current.promise = promise;
    running.set(key, current);
    return promise;
  };
}
