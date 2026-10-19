// The scenario map (4.2.3 PR 2, plan H1): groupings a team declares (a character, a puzzle, a chapter), each only a
// list of references to what the game already names (the IR's provenance keys: a room, a rule or topic or listener id,
// `item:<id>`, `char:<id>`, `<room>.<entity>`, `objective:<id>`, `checkpoint:<id>`), kept in `groupings.json`, a span of
// its own. A grouping never writes what it names. The map is never stored: it is derived from the IR and the groupings,
// the same bytes for the same revision; a reference the IR does not know is said "not declared", never guessed.
import type { GameIR, IrSource } from '../../src/engine/core/ir';

export const GROUPING_KINDS = ['character', 'puzzle', 'chapter'] as const;
export type GroupingKind = (typeof GROUPING_KINDS)[number];

export interface Grouping {
  id: string;
  kind: GroupingKind;
  title: string;
  /** The IR's provenance keys it names, in the team's order. */
  refs: string[];
}

export interface GroupingsFile {
  groupings: Grouping[];
}

/** What a reference names, as the IR says it: its kind, and the `file:line` that writes it. */
export interface MapRef {
  ref: string;
  kind: string;
  /** Undefined: the IR does not know it ("not declared": a typo, an id written by code, something removed). */
  at?: IrSource;
}

export interface ScenarioMap {
  groupings: (Omit<Grouping, 'refs'> & { refs: MapRef[] })[];
  /** What no grouping names yet, by kind: rooms, characters, items, objectives, checkpoints. */
  ungrouped: Record<string, string[]>;
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX = { groupings: 500, refs: 500, title: 200, ref: 200 };

/** Why a groupings file is refused, or nothing: ids unique, kinds known, titles and references plain. */
export function groupingsProblems(v: unknown): string[] {
  const o = v as GroupingsFile;
  if (!o || typeof o !== 'object' || !Array.isArray(o.groupings)) return ['`groupings` must be a list'];
  if (o.groupings.length > MAX.groupings) return [`at most ${MAX.groupings} groupings`];
  const out: string[] = [];
  const seen = new Set<string>();
  o.groupings.forEach((g, n) => {
    const at = `groupings[${n}]`;
    if (!g || typeof g !== 'object') return void out.push(`${at} must be an object`);
    if (typeof g.id !== 'string' || !ID.test(g.id)) out.push(`${at}.id must be lowercase letters, digits and -`);
    else if (seen.has(g.id)) out.push(`${at}.id "${g.id}" is used twice`);
    else seen.add(g.id);
    if (!GROUPING_KINDS.includes(g.kind)) out.push(`${at}.kind must be one of ${GROUPING_KINDS.join(', ')}`);
    if (typeof g.title !== 'string' || !g.title.trim() || g.title.length > MAX.title)
      out.push(`${at}.title must be a text of 1 to ${MAX.title} characters`);
    if (!Array.isArray(g.refs) || g.refs.length > MAX.refs)
      out.push(`${at}.refs must be a list of at most ${MAX.refs}`);
    else
      g.refs.forEach((r, k) => {
        if (typeof r !== 'string' || !r || r.length > MAX.ref || /\s/.test(r))
          out.push(`${at}.refs[${k}] must be a reference without spaces`);
      });
    for (const k of Object.keys(g)) if (!['id', 'kind', 'title', 'refs'].includes(k)) out.push(`${at}.${k} is unknown`);
  });
  return out;
}

/** The kind of a provenance key, read from its shape and the IR. */
function kindOf(ir: GameIR, ref: string): string {
  if (ref.startsWith('objective:')) return 'objective';
  if (ref.startsWith('checkpoint:')) return 'checkpoint';
  if (ref.startsWith('item:')) return 'item';
  if (ref.startsWith('char:')) return 'character';
  if (ir.rooms.some((r) => r.id === ref)) return 'room';
  if (ir.entities.some((e) => e.key === ref)) return 'entity';
  const rule = ir.rules.find((r) => r.id === ref);
  if (rule) return rule.kind;
  if (ir.scripts.some((s) => s.id === ref)) return 'script';
  return 'unknown';
}

/** The map: every grouping with its references resolved, then what no grouping names, by kind. Sorted, stable. */
export function scenarioMap(ir: GameIR, file: GroupingsFile): ScenarioMap {
  const named = new Set<string>();
  const groupings = [...file.groupings]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((g) => ({
      id: g.id,
      kind: g.kind,
      title: g.title,
      refs: g.refs.map((ref): MapRef => {
        named.add(ref);
        const at = ir.provenance[ref];
        return at ? { ref, kind: kindOf(ir, ref), at: { file: at.file, line: at.line } } : { ref, kind: 'unknown' };
      }),
    }));
  const ungrouped: Record<string, string[]> = {};
  for (const ref of Object.keys(ir.provenance).sort()) {
    const kind = kindOf(ir, ref);
    if (named.has(ref) || !['room', 'character', 'item', 'objective', 'checkpoint'].includes(kind)) continue;
    (ungrouped[kind] ??= []).push(ref);
  }
  return { groupings, ungrouped };
}
