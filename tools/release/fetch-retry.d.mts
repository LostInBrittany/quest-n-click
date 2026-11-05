export function backoff(i: number): number;
type RetryOptions = {
  tries?: number;
  waitMs?: (i: number) => number;
  timeoutMs?: number;
  init?: RequestInit;
  /** Each failed try, said (stderr by default). */
  tell?: (line: string) => void;
  /** The wait between two tries (a timer by default; tests make it instant). */
  wait?: (ms: number) => Promise<void>;
};
export function fetchRetry(url: string | URL, o?: RetryOptions): Promise<Response>;
export function download(url: string | URL, o?: RetryOptions): Promise<Buffer>;
