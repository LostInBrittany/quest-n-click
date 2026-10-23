// read_doc's exact compatibility (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3.2, phase A4), through the real stdio
// MCP server (tools/mcp/server.ts) and the SDK's client, in the repository. The fixture
// tests/fixtures/mcp/read_doc-4.4.0.json holds read_doc's input schema as the 4.4.0 server (c00b44fc) served it, the
// eight calls a 4.4.0 client makes, and each page's size at 4.4.0.
//   - The 4.4.0 schema is included in today's: the same properties keep their type and enum, and `required` is not
//     widened. `name` stops being required: a client that always sends it (every 4.4.0 client, since the schema
//     required it) is served exactly as before; a client that sends nothing now gets an explicit tool error ("give
//     either name … or id") instead of a schema error. Both are refusals; neither is a silent choice.
//   - Each of the eight calls is accepted and answers one text block, byte for byte docs/en/<NAME>.md (until C2), within
//     1.5 × its 4.4.0 size, with no structured content (the 4.4.0 result shape) and no provenance in the text; arguments
//     beside `name` are ignored, as 4.4.0's schema stripped them.
//   - search_docs and list_docs are offered; read_doc by id reads the wiki through the loader.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/mcp/read_doc-4.4.0.json'), 'utf8')) as {
  inputSchema: { properties: Record<string, Record<string, unknown>>; required: string[] };
  calls: { name: string }[];
  bytes4_4_0: Record<string, number>;
};
type Result = {
  content: { type: string; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};
let client: Client;

beforeAll(async () => {
  client = new Client({ name: 'docs-compat-test', version: '0' });
  await client.connect(
    new StdioClientTransport({
      command: join(ROOT, 'node_modules', '.bin', 'tsx'),
      args: [join(ROOT, 'tools', 'mcp', 'server.ts')],
      cwd: ROOT,
      env: { ...getDefaultEnvironment(), GAME: 'demo' },
      stderr: 'pipe',
    }),
  );
}, 30000);
afterAll(async () => {
  await client?.close();
});
const call = async (name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })) as Result;

describe('read_doc, compatible with 4.4.0', () => {
  it('includes the 4.4.0 schema: same properties, same types and enum, required not widened', async () => {
    const { tools } = await client.listTools();
    const now = tools.find((t) => t.name === 'read_doc')!.inputSchema as {
      properties: Record<string, Record<string, unknown>>;
      required?: string[];
    };
    for (const [key, old] of Object.entries(FIXTURE.inputSchema.properties)) {
      expect(now.properties[key]?.type, key).toBe(old.type);
      expect(now.properties[key]?.enum, key).toEqual(old.enum);
    }
    for (const r of now.required ?? []) expect(FIXTURE.inputSchema.required).toContain(r);
    expect(Object.keys(now.properties).sort()).toEqual(['cursor', 'id', 'lang', 'maxChars', 'name', 'section']);
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['search_docs', 'list_docs', 'read_doc']));
  }, 30000);

  it('answers the eight 4.4.0 calls with one text block, docs/en/<NAME>.md byte for byte', async () => {
    expect(FIXTURE.calls).toHaveLength(8);
    for (const args of FIXTURE.calls) {
      const r = await call('read_doc', args);
      expect(r.isError, args.name).toBeFalsy();
      expect(r.content).toHaveLength(1);
      expect(r.content[0]!.type).toBe('text');
      const text = r.content[0]!.text;
      expect(text).toBe(readFileSync(join(ROOT, 'docs', 'en', `${args.name}.md`), 'utf8'));
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(1.5 * FIXTURE.bytes4_4_0[args.name]!);
      expect(text).not.toContain("quest'n'click documentation ·");
      expect(r.structuredContent).toBeUndefined();
    }
  }, 60000);

  it('ignores the arguments beside name, as 4.4.0 did', async () => {
    const engine = readFileSync(join(ROOT, 'docs', 'en', 'ENGINE.md'), 'utf8');
    for (const extra of [{ lang: 'fr' }, { maxChars: 10 }]) {
      const r = await call('read_doc', { name: 'ENGINE', ...extra });
      expect(r.isError).toBeFalsy();
      expect(r.content).toEqual([{ type: 'text', text: engine }]);
    }
  }, 30000);

  it('refuses nothing silently: neither, or both, is an explicit tool error', async () => {
    for (const args of [{}, { name: 'ENGINE', id: 'create.rooms' }]) {
      const r = await call('read_doc', args);
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toContain('give either name (one of the 8 legacy pages) or id, not both');
    }
  }, 30000);
});

describe('the new tools on the repository', () => {
  it('list_docs and search_docs answer from wiki/, a repository preview', async () => {
    const list = await call('list_docs', {});
    expect(list.isError).toBeFalsy();
    expect(list.structuredContent).toMatchObject({ provenance: { source: 'repository' } });
    const search = await call('search_docs', { query: 'zzzz qqqq xxyyzz' });
    expect(search.structuredContent).toMatchObject({ results: [], note: 'no confident match' });
    const byId = await call('read_doc', { id: 'create.no-such-page' });
    expect(byId.isError).toBe(true);
    expect(byId.content[0]!.text).toContain('no page "create.no-such-page"');
  }, 30000);
});
