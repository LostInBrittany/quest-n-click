// The email connector reads a subject that is one 8-letter word as a pairing code (#491): a word that only looks like
// one ("Treasure") from a sender it already knows is that sender's answer, not a refused pairing. An explicit
// `PAIR …` stays a pairing, and a letter outside the Bridge's code alphabet (L) is never read as a code.
import { afterAll, expect, it } from 'vitest';
import { EmailConnector } from '../connectors/src/email/connector';
import { contextFor, startBridge } from './fixtures/connectors/harness';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterAll(async () => {
  for (const f of cleanup.reverse()) await f();
});

let n = 0;
const mail = (subject: string, text = 'Hello.', to = 'gate@garden.example') =>
  new Uint8Array(
    Buffer.from(
      `From: Robin <robin@player.example>\r\nTo: Gate <${to}>\r\nSubject: ${subject}\r\n` +
        `Message-ID: <bare${++n}@player.example>\r\nContent-Type: text/plain\r\n\r\n${text}\r\n`,
    ),
  );

it('reads a refused bare-word subject from a known sender as its answer, and keeps PAIR a pairing', async () => {
  const t = await startBridge();
  cleanup.push(() => t.close());
  const { ctx } = await contextFor(t, 'email');
  const c = new EmailConnector({ mode: 'webhook', domain: 'garden.example', webhook: { port: 0, secret: 's' } });
  await c.start(ctx);
  cleanup.push(() => c.stop());
  // A stranger: a letter outside the code alphabet is no code, so no pairing is tried; nobody is linked yet.
  expect(await c.handle(mail('PAIR LLLLLLLL'))).toEqual({ kind: 'rejected', reason: 'no-player' });
  const paired = await c.handle(mail(`PAIR ${await t.code()}`));
  expect(paired.kind).toBe('paired');
  const playerId = paired.kind === 'paired' ? paired.playerId : '';
  // The linked sender answers with a subject that looks like a code: the answer is proposed.
  const linked = await c.handle(mail('Treasure', 'please open the door'));
  expect(linked).toMatchObject({ kind: 'proposed', signal: 'letter.door', result: { ok: true } });
  // A tagged recipient, same.
  const tagged = await c.handle(mail('Thursday', 'open the door', `gate+${playerId}@garden.example`));
  expect(tagged).toMatchObject({ kind: 'proposed', signal: 'letter.door', result: { ok: true } });
  // An explicit prefix is a pairing whatever the sender: refused, it is rejected.
  expect(await c.handle(mail('PAIR TREASURE', 'open the door'))).toEqual({
    kind: 'rejected',
    reason: 'pairing-pairing',
  });
  expect(t.count(playerId)).toBe(2);
}, 60_000);
