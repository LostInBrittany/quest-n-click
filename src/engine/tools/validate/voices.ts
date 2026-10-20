// The validator's check of voices by value (4.3, PLAN-4.3-HERO-CHOICE §3.4, core/voice-key.ts): a voiced line (a clip
// under its id or under one of its keyed ids, `<id>~<flag>=<value>`) whose text has switches needs a clip per
// combination of the values they list. A warning, not an error: the plain id is the fallback, so a game ships before
// every recording exists. Checked in `audio.voices` and in each language of `audio.voicesByLang`.
import { lineIds } from '../../core/content-ids';
import type { GameDef } from '../../core/types';
import { voiceBase, voiceVariants } from '../../core/voice-key';

export function voiceValueChecks(game: GameDef, warn: (where: string, msg: string) => void): void {
  const a = game.audio;
  const maps: [string, Record<string, string>][] = [
    ['', a?.voices ?? {}],
    ...Object.entries(a?.voicesByLang ?? {}).map(([l, m]): [string, Record<string, string>] => [` (${l})`, m]),
  ];
  for (const [lang, clips] of maps) {
    const voiced = new Set(Object.keys(clips).map(voiceBase));
    if (!voiced.size) continue;
    for (const l of lineIds(game)) {
      if (!voiced.has(l.id)) continue;
      const keyed = voiceVariants(l.id, l.text).filter((v) => v.values);
      const missing = keyed.filter((v) => !clips[v.key]).map((v) => v.key);
      if (missing.length)
        warn(
          `voice:${l.id}`,
          `voiced line with text switches lacks ${missing.length} of ${keyed.length} clip(s) by value${lang}: ${missing.join(', ')} (the plain id plays instead${clips[l.id] ? '' : ', and it has no clip either'})`,
        );
    }
  }
}
