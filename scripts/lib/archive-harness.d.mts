export const WIN: boolean;
export function transientNpm(stderr: string): string | null;
export const NPM_WAITS: number[];
type Try = { status: number | null; stderr?: string; error?: { code?: string } };
type RetryOptions = {
  /** The pauses before each new try (30, 60, 120 s by default). */
  waits?: number[];
  /** Each new try, said with its reason (stderr by default). */
  tell?: (line: string) => void;
  /** The pause itself (a blocking sleep by default; tests make it instant). */
  wait?: (ms: number) => unknown;
};
export function retryNpm<R extends Try>(once: (i: number) => R, o?: RetryOptions): R;
export function npmInstall(
  args: string[],
  o?: RetryOptions & { cwd?: string; env?: NodeJS.ProcessEnv; capture?: boolean; timeout?: number },
): string;
export function harness(o: { env?: NodeJS.ProcessEnv; base: string }): {
  run: (
    title: string,
    cmd: string,
    a: string[],
    cwd: string,
    o?: { capture?: boolean; env?: NodeJS.ProcessEnv },
  ) => string;
  unpack: (tgz: string, into: string) => string;
  serve: (
    cmd: string,
    a: string[],
    cwd: string,
    o?: { stdio?: unknown },
  ) => { process: unknown; readonly exited: { code: number | null; signal: string | null } | null; stop(): Promise<void> };
  steps: { id: string; title: string; ms: number; status: number | null }[];
};
export function waitFor(url: string, test?: (r: Response) => unknown, tries?: number): Promise<Response>;
