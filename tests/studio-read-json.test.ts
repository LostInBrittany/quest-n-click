// The local Studio's one body reader (#513): the API, the Assistant and the Assets tab answer a body the same way, each
// with its own size bound.
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readJson } from '../tools/studio/security';

const req = (body: string) => Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;
const refusal = (body: string, max = 64) =>
  readJson(req(body), max).then(
    () => null,
    (e: { status: number; message: string }) => [e.status, e.message],
  );

describe('readJson (#513)', () => {
  it('reads a JSON object; an empty or blank body is {}', async () => {
    await expect(readJson(req('{"a":1}'), 64)).resolves.toEqual({ a: 1 });
    await expect(readJson(req(''), 64)).resolves.toEqual({});
    await expect(readJson(req(' \n'), 64)).resolves.toEqual({});
  });

  it('answers 413 over the bound, 400 for what is not JSON or not an object', async () => {
    expect(await refusal(`{"a":"${'x'.repeat(64)}"}`)).toEqual([413, 'body too large']);
    expect(await refusal('{nope')).toEqual([400, 'the body is not valid JSON']);
    for (const b of ['[1]', 'null', '3', '"s"'])
      expect(await refusal(b)).toEqual([400, 'the body must be a JSON object']);
  });
});
