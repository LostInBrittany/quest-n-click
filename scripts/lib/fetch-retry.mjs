// A download tried again on a transient answer (4.1.20 PR 3): GitHub's release downloads answer a 504 now and then
// (candidate 38236552662, two runners at once), and a gate failed on a download a second try would have made. A 5xx, a
// 429 or a network error is tried again, `tries` times in all, waiting `waitMs(i)` after the i-th try; any other answer
// (a 404 names a wrong URL) comes back at once, and the last answer or error comes back when every try is spent.

/** 5 s after the first try, 10 s after the second… */
export const backoff = (i) => 5000 * i;

const transient = (status) => status === 429 || status >= 500;

/** `fetch(url, init)`, tried again on a transient answer. */
export async function fetchRetry(url, { tries = 5, waitMs = backoff, timeoutMs = 60_000, init = {} } = {}) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), ...init });
      if (!transient(r.status) || i >= tries) return r;
      await r.body?.cancel();
    } catch (e) {
      if (i >= tries) throw e;
    }
    await new Promise((ok) => setTimeout(ok, waitMs(i)));
  }
}
