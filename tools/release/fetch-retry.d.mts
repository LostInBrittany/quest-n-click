export function backoff(i: number): number;
export function fetchRetry(
  url: string | URL,
  o?: { tries?: number; waitMs?: (i: number) => number; timeoutMs?: number; init?: RequestInit },
): Promise<Response>;
