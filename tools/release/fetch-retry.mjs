// A download tried again on a transient answer (4.1.20 PR 3): GitHub's release downloads answer a 504 now and then
// (candidate 38236552662, two runners at once), and a gate failed on a download a second try would have made. A 5xx, a
// 429 or a network error is tried again, `tries` times in all, waiting `waitMs(i)` after the i-th try; any other answer
// (a 404 names a wrong URL) comes back at once, and the last answer or error comes back when every try is spent.
// (4.7.1, #410): the 4.7.0 candidate's external-consumer met five 504s in a minute and stopped without a word, its
// re-run 18 minutes later passed. Each failed try is now said, and the default budget is about three minutes.

/** 5 s after the first try, then doubled, at most a minute: 5, 10, 20, 40, 60, 60 s (about three minutes for 7 tries). */
export const backoff = (i) => Math.min(5000 * 2 ** (i - 1), 60_000);

const transient = (status) => status === 429 || status >= 500;

const say = (line) => console.error(`  ⚠  ${line}`);
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** `fetch(url, init)`, tried again on a transient answer, each failed try said (`tell`, stderr by default); `wait` sleeps. */
export async function fetchRetry(
  url,
  { tries = 7, waitMs = backoff, timeoutMs = 60_000, init = {}, tell = say, wait = pause } = {},
) {
  for (let i = 1; ; i++) {
    let why;
    try {
      // The timeout bounds the wait for an answer (its headers), not the read of a large body after it; a caller's own
      // signal still aborts either.
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(new Error(`no answer in ${timeoutMs} ms`)), timeoutMs);
      const signal = init.signal ? AbortSignal.any([init.signal, ctl.signal]) : ctl.signal;
      let r;
      try {
        r = await fetch(url, { ...init, signal });
      } finally {
        clearTimeout(timer);
      }
      if (!transient(r.status) || i >= tries) return r;
      await r.body?.cancel();
      why = `answered ${r.status}`;
    } catch (e) {
      if (i >= tries) throw e;
      const cause = e?.cause?.code ?? e?.cause?.message;
      why = `failed (${e?.message ?? e}${cause ? `: ${cause}` : ''})`;
    }
    const ms = waitMs(i);
    tell(`${url} ${why}, try ${i}/${tries}: again in ${Math.round(ms / 1000)} s`);
    await wait(ms);
  }
}

/** The body of `url` as bytes, through `fetchRetry`; any answer that is not a 2xx in the end throws `<url>: <status>`. */
export async function download(url, o) {
  const r = await fetchRetry(url, o);
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error(`${url}: ${r.status}`);
  }
  return Buffer.from(await r.arrayBuffer());
}
