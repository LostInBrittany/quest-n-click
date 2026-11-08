// A Studio Server's API as a `ToolBackend` (tools/studio/tools.ts; 4.2.3 PR 5, plan H4, ADR 0029): the tools of the MCP
// server run as requests to `/api`, with a Bearer token, so a tool meets exactly the API's checks (who, which role,
// whose span, the journal, a retry applied once). Used by the Studio Server's own `/mcp` (on the loopback, with the
// caller's token) and by the local MCP server pointed at a hosted Studio (`npm run mcp -- --server <url>`).
import { randomUUID } from 'node:crypto';
import type {
  AddEntity,
  CoverageData,
  GameInfo,
  GraphData,
  LintData,
  NewNote,
  NotesFile,
  PlaytestsData,
  PuzzleData,
  ReportData,
  RoomData,
  SolveData,
  ValidateResult,
} from './types';
import type { Layout } from '../../src/engine/core/types';
import type { ToolBackend } from './tools';

export interface HttpBackendOptions {
  /** The API's root, `https://studio.example.fr/api` (no trailing slash). */
  api: string;
  /** The `Authorization` header's token, asked for each request (a CLI refreshes it when it nears its end). */
  token: () => string | Promise<string>;
  /** Default author of add_note (the server records the token's member anyway). */
  author?: () => string;
  /** Extra headers on every request. */
  headers?: Record<string, string>;
  /** Ends the requests under way (the MCP client gone); each also gives up after `timeoutMs` (default 5 min). */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** How a request is made (default `fetch`; `/mcp`'s loopback names the Studio's host). */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /**
   * The revision each whole file was last read or written at (the storyboard, a room's layout), sent as `x-studio-base`
   * with its next whole-file write: a teammate's write since is a 409, never lost. Kept by the caller when the backend
   * lives one request only (`/mcp`); one per backend otherwise.
   */
  revisions?: Map<string, string>;
}

/** What the API answered when it refused: its status and message, as the tool's error says them. */
export class ApiRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function httpBackend(o: HttpBackendOptions): ToolBackend {
  const revisions = o.revisions ?? new Map<string, string>();
  /** `file`: the whole file this request reads or replaces, whose revision is kept for its next write. */
  const call = async <T>(method: string, path: string, body?: unknown, file?: string): Promise<T> => {
    const write = method !== 'GET';
    const timeout = AbortSignal.timeout(o.timeoutMs ?? 300_000);
    const base = write && file ? revisions.get(file) : undefined;
    const r = await (o.fetch ?? fetch)(`${o.api}/${path}`, {
      signal: o.signal ? AbortSignal.any([o.signal, timeout]) : timeout,
      method,
      headers: {
        authorization: `Bearer ${await o.token()}`,
        ...(write ? { 'content-type': 'application/json', 'x-studio-op': randomUUID() } : {}),
        ...(base ? { 'x-studio-base': base } : {}),
        ...o.headers,
      },
      body: write ? JSON.stringify(body ?? {}) : undefined,
    });
    const data = (await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }))) as Record<string, unknown>;
    if (!r.ok) throw new ApiRefusal(`${r.status}: ${String(data.error ?? r.statusText)}`, r.status);
    const rev = r.headers.get('x-studio-revision');
    if (file && rev) revisions.set(file, rev);
    return data as T;
  };
  const room = (id: string) => `room/${encodeURIComponent(id)}`;
  return {
    game: () => call<GameInfo>('GET', 'game'),
    room: (id) => call<RoomData>('GET', room(id), undefined, `layout:${id}`),
    setLayout: (id, layout: Layout) => call('PUT', `${room(id)}/layout`, layout, `layout:${id}`),
    setText: (id, path, value) => call('PUT', `${room(id)}/text`, { path, value }),
    setValue: (id, path, value, dry) => call('PUT', `${room(id)}/value`, { path, value, dry }),
    add: (id, e: AddEntity) => call('POST', `${room(id)}/add`, e),
    storyboardRaw: () => call('GET', 'storyboard', undefined, 'storyboard'),
    setStoryboard: (sb) => call('PUT', 'storyboard', sb, 'storyboard'),
    notes: () => call<NotesFile>('GET', 'notes'),
    addNote: (n: NewNote) => call('POST', 'notes', { ...n, author: n.author ?? o.author?.() }),
    validate: () => call<ValidateResult>('POST', 'validate'),
    solve: (from, prove, reality) => {
      // The API's solver takes no policy for the world's signals: said, never answered as if it had.
      if (reality) return Promise.reject(new ApiRefusal('501: a reality policy needs a local Studio', 501));
      return call<SolveData>('POST', 'solve', { from, prove });
    },
    report: () => call<ReportData>('POST', 'report'),
    graph: () => call<GraphData>('GET', 'graph'),
    puzzle: (id) => call<PuzzleData>('POST', 'puzzle', { id }),
    coverage: () => call<CoverageData>('POST', 'coverage'),
    playtests: () => call<PlaytestsData>('POST', 'playtests'),
    ir: () => call('GET', 'ir'),
    lint: (prove) => call<LintData>('POST', 'lint', { prove }),
    author: o.author,
  };
}
