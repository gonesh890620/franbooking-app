/**
 * Tiny in-process TTL cache for expensive Google Sheets reads.
 *
 * Why this exists
 * ---------------
 * Several lookups in `legacyRecruiter.ts` re-read an entire spreadsheet range
 * on every call, and they call each other. One `bootstrapRecruiter` fanned out
 * to roughly six full reads of the Access Control sheet (via `findRecruiter`)
 * and three reads of the recruiter's Daily Assignment tab (via `getClients`),
 * because `getUsage`, `getClients`, `getDailyTasks` and `getClientRatio` each
 * resolved the same data independently.
 *
 * The Sheets API call is the dominant cost in those paths -- far more than any
 * of the computation around it -- so memoizing the read collapses that fan-out
 * to one call each.
 *
 * Safety
 * ------
 * TTLs are deliberately short (seconds). Access Control rows and Daily
 * Assignment tabs change on human timescales -- an admin adding a recruiter, a
 * client being paused -- so a few seconds of staleness is invisible in
 * practice, while a request that spans multiple internal lookups sees one
 * consistent snapshot.
 *
 * Anything a recruiter *writes* must not be cached, and isn't: only
 * `findRecruiter` and `getClients` are wrapped. Follow-up tracker contents,
 * contacts, tasks and every save path still read through fresh.
 *
 * This is a per-instance cache. On Vercel each serverless instance keeps its
 * own copy, which is the desired behaviour -- there is no cross-user leakage
 * because every key is scoped by the caller's email.
 */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

/** Evicts expired keys so the map can't grow without bound. */
function sweep(now: number) {
  if (store.size < 256) return;
  store.forEach((entry, key) => {
    if (entry.expiresAt <= now) store.delete(key);
  });
}

/**
 * Returns the cached value for `key`, or runs `load()` and caches it.
 *
 * In-flight promises are cached too, so N concurrent callers (which is exactly
 * what `Promise.all` in `bootstrapRecruiter` produces) share one underlying
 * request rather than issuing N identical ones.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  sweep(now);

  const promise = load().catch((e) => {
    // Never cache a failure -- the next caller should retry.
    store.delete(key);
    throw e;
  });

  store.set(key, { value: promise, expiresAt: now + ttlMs });
  return promise as Promise<T>;
}

/** Drops cache entries whose key starts with `prefix`. Use after a write. */
export function invalidate(prefix: string) {
  Array.from(store.keys()).forEach((key) => {
    if (key.startsWith(prefix)) store.delete(key);
  });
}

export function clearCache() {
  store.clear();
}
