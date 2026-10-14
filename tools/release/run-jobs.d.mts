export interface RunJob {
  id: number;
  name: string;
  started_at?: string | null;
  completed_at?: string | null;
  conclusion?: string | null;
  [k: string]: unknown;
}
export function runJobs(o: {
  api?: string;
  repo: string;
  run: string;
  token: string;
  tries?: number;
  waitMs?: (i: number) => number;
}): Promise<{ total_count: number; jobs: RunJob[] }>;
