/** Reserve source capacity across concurrent DAG branches before network acquisition. */
import {canonicalUrl} from '../evidence.mjs';

const urlOf = source => canonicalUrl(source.url);

/**
 * The provided acquire function must merge its results into state before it
 * resolves. Reservations are ephemeral: recovery reads only persisted sources.
 */
export function createSourceAcquisitionCoordinator(state, acquire, signal, onSkipped) {
  const inFlight = new Map(), reservedNew = new Set();
  const allowed = state.input.sourceUrls?.length ? new Set(state.input.sourceUrls) : null;

  async function collect(candidates, node) {
    signal?.throwIfAborted();
    const known = new Set(state.sources.flatMap(source => {
      try { return [urlOf(source)]; } catch { return []; }
    }));
    const local = new Map(), batch = [], waiting = [];
    let skipped = 0;
    const reserve = (url, fresh) => {
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      inFlight.set(url, promise);
      if (fresh) reservedNew.add(url);
      local.set(url, {release, fresh});
    };

    for (const candidate of candidates) {
      const url = urlOf(candidate);
      if (allowed && !allowed.has(url)) continue;
      if (local.has(url)) {
        batch.push(candidate);
      } else if (inFlight.has(url)) {
        waiting.push({candidate, promise: inFlight.get(url)});
      } else if (known.has(url)) {
        reserve(url, false);
        batch.push(candidate);
      } else if (state.sources.length + reservedNew.size < state.input.maxSources) {
        reserve(url, true);
        batch.push(candidate);
      } else {
        skipped++;
      }
    }
    if (skipped) onSkipped?.(node, skipped);

    let ids = [];
    try {
      if (batch.length) ids = await acquire(batch, node);
    } finally {
      for (const [url, reservation] of local) {
        inFlight.delete(url);
        if (reservation.fresh) reservedNew.delete(url);
        reservation.release();
      }
    }

    if (waiting.length) {
      await Promise.all(waiting.map(item => item.promise));
      signal?.throwIfAborted();
      ids.push(...await collect(waiting.map(item => item.candidate), node));
    }
    return [...new Set(ids)];
  }

  return collect;
}
