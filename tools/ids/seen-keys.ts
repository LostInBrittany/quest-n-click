// The `seen` keys of a game's source that name the old place of something that now has an id (#359): the value of
// a `{ seen: '…' }` condition and the keys of a `seen: { … }` object (a checkpoint's), renamed after `rename` (the
// save migration's `renameSeen` plus what the validator knows, tools/ids/plan.ts). Nothing else is read: a line, a
// flag or any other string that only looks like a key stays as it is. A string keeps its own quotes; an identifier
// key becomes a string in the file's quotes (an id-based key has a dot).
import ts from '@typescript/typescript6';
import { encodeString, fileQuote, propKey, unwrap } from '../../studio-server/src/ops/source';

export interface SeenRename {
  line: number;
  from: string;
  to: string;
}

export function renameSeenKeysInSource(
  code: string,
  rename: ReadonlyMap<string, string>,
  fileName: string,
): { code: string; renamed: SeenRename[] } {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const q = fileQuote(sf);
  const edits: { pos: number; end: number; text: string }[] = [];
  const renamed: SeenRename[] = [];
  const swap = (node: ts.Node, key: string, quote: string) => {
    const to = rename.get(key);
    if (to === undefined || to === key) return;
    const pos = node.getStart(sf);
    edits.push({ pos, end: node.getEnd(), text: encodeString(to, quote) });
    renamed.push({ line: sf.getLineAndCharacterOfPosition(pos).line + 1, from: key, to });
  };
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && propKey(n) === 'seen') {
      const v = unwrap(n.initializer);
      if (ts.isStringLiteralLike(v)) swap(v, v.text, code[v.getStart(sf)]!);
      else if (ts.isObjectLiteralExpression(v))
        for (const p of v.properties) {
          const k = ts.isPropertyAssignment(p) ? p.name : undefined;
          if (k && (ts.isStringLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k)))
            swap(k, k.text, code[k.getStart(sf)]!);
          else if (k && ts.isIdentifier(k)) swap(k, k.text, q);
        }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  let out = code;
  for (const e of edits.sort((a, b) => b.pos - a.pos)) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
  return { code: out, renamed };
}
