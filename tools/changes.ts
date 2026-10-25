// npm run changes -- --check [--base origin/main] | --assemble [--date YYYY-MM-DD] (4.1.9, lot 0 "cadence"): the
// CHANGELOG and the LOG written as fragments per branch, assembled on main. A branch that changes the code writes
// `changes/<slug>.md` (its CHANGELOG bullets under `### Breaking`, `### Fixed` or `### Changes`) and, when it has a
// LOG entry, `changes/<slug>.log.md` (first line `## <title>`, then the entry's body, its `→ next:` line last).
// `--check` fails a pull request that touches src/, bridge/, tools/, scripts/, cli/, connectors/ or games/ without a
// fragment (or a direct CHANGELOG edit: a release branch). `--assemble` folds every fragment into CHANGELOG.md's
// `Unreleased` and numbers the LOG entries after the last one, in the order the fragments reached main (their first
// commit's date: a rebase reorders them), then removes them. Two branches no longer conflict on the CHANGELOG, the LOG
// or their entry numbers. Only the `Unreleased` block is rewritten: the rest of the page is byte for byte the same.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './game';

export const SECTIONS = ['Breaking', 'Fixed', 'Changes'] as const;
export type Section = (typeof SECTIONS)[number];
/** A path under one of these folders is code (the bundled games included): it needs a fragment, or a CHANGELOG edit. */
export const CODE_ROOTS = ['src/', 'bridge/', 'tools/', 'scripts/', 'cli/', 'connectors/', 'games/'];

export interface Fragment {
  slug: string;
  /** The CHANGELOG part: `### Section` headings and their bullets, as written. */
  changelog: string;
  /** The LOG part, or nothing: the first line is `## <title>`, the rest the body. */
  log?: string;
  /** ISO date of the fragment's first commit (the order of assembly). */
  date: string;
  /** Whether it has a `.md` (a `.log.md` alone has none, 4.5.4). */
  md?: boolean;
}

const isSection = (s: string): s is Section => (SECTIONS as readonly string[]).includes(s);

const HEADINGS = SECTIONS.map((s) => `### ${s}`).join(' | ');

/**
 * Why a fragment's CHANGELOG part cannot be filed, each at its 1-based line: a heading the CHANGELOG does not use
 * (`### Added`), or text before the first heading. `sectionsOf` (so `--assemble`) and `fragmentProblems` (so
 * `--check`, #335) both read it, with the one list SECTIONS: the two cannot disagree.
 */
function sectionProblems(text: string): { line: number; problem: string }[] {
  const out: { line: number; problem: string }[] = [];
  // `started`: a heading was seen; `stray`: text before it was already said (once, at its first line).
  let started = false;
  let stray = false;
  text.split('\n').forEach((line, i) => {
    const m = /^### (.+?)\s*$/.exec(line);
    if (m) {
      started = true;
      if (!isSection(m[1]!)) out.push({ line: i + 1, problem: `"### ${m[1]}" is not a fragment heading: ${HEADINGS}` });
    } else if (!started && !stray && line.trim()) {
      stray = true;
      out.push({
        line: i + 1,
        problem: `a fragment starts with its heading (${HEADINGS}), not with "${line.slice(0, 40)}"`,
      });
    }
  });
  return out;
}

/** Why a `.log.md` fragment cannot be filed (its first line is not `## <title>`), at its 1-based line. */
function logProblem(text: string): { line: number; problem: string } | undefined {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.trim());
  const first = (lines[i] ?? '').trimStart();
  if (/^## .+$/.test(first)) return undefined;
  return { line: i + 1, problem: `a .log.md fragment starts with "## <title>", not with "${first.slice(0, 40)}"` };
}

/**
 * Why `--assemble` would refuse these files of `changes/` (#335): every problem of every fragment, as
 * `changes/<name>:<line>: <problem>`. `changes/README.md` is not a fragment. `--check` runs it on the whole folder,
 * so a heading the release would stop on fails the pull request that adds it.
 */
export function fragmentProblems(files: readonly { name: string; text: string }[]): string[] {
  const out: string[] = [];
  for (const { name, text } of files) {
    if (name === 'README.md' || !name.endsWith('.md')) continue;
    const problems = name.endsWith('.log.md') ? [logProblem(text)].filter((p) => !!p) : sectionProblems(text);
    for (const p of problems) out.push(`changes/${name}:${p.line}: ${p.problem}`);
  }
  return out;
}

/**
 * The sections of a fragment: `{ Fixed: '- …', Changes: '- …' }`, each the text under its heading, blank lines inside
 * kept, the ends trimmed. A heading the CHANGELOG does not use (`### Added`), or text before the first heading, is an
 * error: nothing is filed silently.
 */
export function sectionsOf(text: string): Partial<Record<Section, string>> {
  const problem = sectionProblems(text)[0];
  if (problem) throw new Error(problem.problem);
  const out: Partial<Record<Section, string[]>> = {};
  let current: Section | undefined;
  for (const line of text.split('\n')) {
    const m = /^### (.+?)\s*$/.exec(line);
    if (m) {
      current = m[1] as Section;
      out[current] ??= [];
      continue;
    }
    if (current !== undefined) out[current]!.push(line);
  }
  const trimmed: Partial<Record<Section, string>> = {};
  for (const [s, lines] of Object.entries(out) as [Section, string[]][]) {
    const body = lines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    if (body) trimmed[s] = body;
  }
  return trimmed;
}

/**
 * The CHANGELOG with the fragments' bullets added to `## Unreleased`, each under its `### Section` (created in the
 * order Breaking, Fixed, Changes when absent), the fragments in the order given. Only the `Unreleased` block is
 * rebuilt; a heading it holds that is not one of the three is an error.
 */
export function mergeChangelog(changelog: string, fragments: readonly Pick<Fragment, 'changelog'>[]): string {
  const lines = changelog.split('\n');
  let start = lines.findIndex((l) => /^## Unreleased\s*$/.test(l));
  // A CHANGELOG just released has none (4.5.4): one is made above the last release, as a release branch did by hand.
  if (start < 0) {
    const first = lines.findIndex((l) => /^## /.test(l));
    start = first < 0 ? lines.length : first;
    lines.splice(start, 0, '## Unreleased', '');
  }
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const bySection: Record<Section, string[]> = { Breaking: [], Fixed: [], Changes: [] };
  const intro: string[] = [];
  let current: Section | undefined;
  for (const l of lines.slice(start + 1, end)) {
    const m = /^### (.+?)\s*$/.exec(l);
    if (m) {
      if (!isSection(m[1]!))
        throw new Error(
          `Unreleased holds "### ${m[1]}", which the fragments cannot extend: ### ${SECTIONS.join(', ### ')} only`,
        );
      current = m[1];
      continue;
    }
    (current ? bySection[current] : intro).push(l);
  }
  const trim = (a: string[]) => {
    while (a.length && a[0]!.trim() === '') a.shift();
    while (a.length && a[a.length - 1]!.trim() === '') a.pop();
    return a;
  };
  for (const f of fragments)
    for (const [s, text] of Object.entries(sectionsOf(f.changelog)) as [Section, string][]) {
      const target = trim(bySection[s]);
      if (target.length) target.push('');
      target.push(...text.split('\n'));
    }
  const block: string[] = [];
  const introLines = trim(intro);
  if (introLines.length) block.push('', ...introLines);
  for (const s of SECTIONS) {
    const body = trim(bySection[s]);
    if (body.length) block.push('', `### ${s}`, '', ...body);
  }
  block.push('');
  return [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join('\n');
}

/** The number of the last `## #n ·` entry of the LOG. */
export function lastLogNumber(log: string): number {
  let n = 0;
  for (const m of log.matchAll(/^## #(\d+) ·/gm)) n = Math.max(n, Number(m[1]));
  return n;
}

/** The LOG with the entries appended, numbered from the last one, each as `## #n · date · Claude · proposal · title`. */
export function appendLog(log: string, entries: readonly { title: string; body: string; date: string }[]): string {
  let n = lastLogNumber(log);
  let out = log.replace(/\n+$/, '');
  for (const e of entries) {
    n++;
    out += `\n\n## #${n} · ${e.date.slice(0, 10)} · Claude · proposal · ${e.title.trim()}\n\n${e.body.trim()}\n`;
  }
  return `${out.replace(/\n+$/, '')}\n`;
}

/** The title and body of a `.log.md` fragment (first line `## <title>`). */
export function logEntryOf(text: string): { title: string; body: string } {
  const problem = logProblem(text);
  if (problem) throw new Error(problem.problem);
  const [first = '', ...rest] = text.trimStart().split('\n');
  const m = /^## (.+)$/.exec(first)!;
  return { title: m[1]!, body: rest.join('\n').trim() };
}

/**
 * Whether a pull request that changed these files must carry a fragment: code moved (CODE_ROOTS), no `changes/<slug>.md`
 * (a `.log.md` alone is not one), and no direct CHANGELOG edit (a release branch's).
 */
export function needsFragment(changed: readonly string[]): boolean {
  const code = changed.some((f) => CODE_ROOTS.some((r) => f.startsWith(r)));
  const fragment = changed.some(
    (f) => /^changes\/[^/]+\.md$/.test(f) && !f.endsWith('.log.md') && f !== 'changes/README.md',
  );
  const direct = changed.includes('CHANGELOG.md');
  return code && !fragment && !direct;
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** Today, or the file's time, as a local `YYYY-MM-DD` (the LOG's dates are the maintainer's days). */
const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The fragments on disk, with the date of their first commit (or the file's local day when uncommitted), oldest first. */
/**
 * The fragments in `changes/`, by slug: its `.md` (the CHANGELOG part) and its `.log.md` (the LOG part). A `.log.md`
 * alone is a fragment with a LOG entry and no bullet (4.5.4; 4.5.3's release folded two by hand).
 */
export function fragmentFiles(names: readonly string[]): { slug: string; md: boolean; log: boolean }[] {
  const by = new Map<string, { slug: string; md: boolean; log: boolean }>();
  for (const name of names) {
    if (name === 'README.md' || !name.endsWith('.md')) continue;
    const log = name.endsWith('.log.md');
    const slug = name.slice(0, log ? -7 : -3);
    const f = by.get(slug) ?? { slug, md: false, log: false };
    f[log ? 'log' : 'md'] = true;
    by.set(slug, f);
  }
  return [...by.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** The `.md` files of `changes/` with their text, as `fragmentProblems` reads them (none without the folder). */
export function fragmentTexts(): { name: string; text: string }[] {
  const dir = resolve(ROOT, 'changes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, text: readFileSync(resolve(dir, name), 'utf8') }));
}

export function readFragments(): Fragment[] {
  const dir = resolve(ROOT, 'changes');
  if (!existsSync(dir)) return [];
  const out: Fragment[] = [];
  for (const { slug, md } of fragmentFiles(readdirSync(dir))) {
    const name = md ? `${slug}.md` : `${slug}.log.md`;
    const file = resolve(dir, name);
    let date = '';
    try {
      date = git('log', '--diff-filter=A', '--format=%cI', '--', `changes/${name}`).split('\n').pop() ?? '';
    } catch {
      /* no git: the file's day below */
    }
    if (!date) date = localDay(statSync(file).mtime);
    const logFile = resolve(dir, `${slug}.log.md`);
    out.push({
      slug,
      changelog: md ? readFileSync(file, 'utf8') : '',
      md,
      log: existsSync(logFile) ? readFileSync(logFile, 'utf8') : undefined,
      date,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug));
}

if (process.argv[1]?.endsWith('changes.ts')) {
  const args = process.argv.slice(2);
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  if (args.includes('--check')) {
    const base = opt('base') ?? 'origin/main';
    // The three-dot diff needs the merge base (a full history); a shallow checkout falls back to the two-dot one.
    let changed: string[];
    try {
      git('merge-base', base, 'HEAD');
      changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
    } catch {
      changed = git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean);
    }
    // Every fragment on the branch, not only its own: the ones `--assemble` will fold at the release (#335).
    const problems = fragmentProblems(fragmentTexts());
    if (problems.length) {
      for (const p of problems) console.error(`✖  ${p}`);
      console.error(`✖  ${problems.length} fragment problem(s): --assemble would stop on them (changes/README.md)`);
      process.exit(1);
    }
    if (needsFragment(changed)) {
      console.error(
        `✖  this branch changes the code and carries no fragment: write changes/<slug>.md (### Fixed | ### Changes | ### Breaking, then the bullets) and, for a LOG entry, changes/<slug>.log.md (## <title>, then the body). changes/README.md says how.`,
      );
      process.exit(1);
    }
    console.log(
      `✔  ${changed.length} file(s) changed against ${base}: a fragment or a CHANGELOG edit is there, or no code moved`,
    );
    process.exit(0);
  }
  if (args.includes('--assemble')) {
    if (git('rev-parse', '--is-shallow-repository') === 'true') {
      console.error(
        '✖  --assemble needs the full history (a shallow clone dates every fragment at its boundary): git fetch --unshallow',
      );
      process.exit(1);
    }
    const fragments = readFragments();
    if (!fragments.length) {
      console.log('✔  no fragment to assemble');
      process.exit(0);
    }
    const changelogFile = resolve(ROOT, 'CHANGELOG.md');
    writeFileSync(changelogFile, mergeChangelog(readFileSync(changelogFile, 'utf8'), fragments));
    const withLog = fragments.filter((f) => f.log);
    if (withLog.length) {
      const logFile = resolve(ROOT, 'docs/dev/LOG.md');
      writeFileSync(
        logFile,
        appendLog(
          readFileSync(logFile, 'utf8'),
          withLog.map((f) => ({ ...logEntryOf(f.log!), date: opt('date') ?? f.date })),
        ),
      );
    }
    for (const f of fragments) {
      if (f.md !== false) unlinkSync(resolve(ROOT, 'changes', `${f.slug}.md`));
      if (f.log) unlinkSync(resolve(ROOT, 'changes', `${f.slug}.log.md`));
    }
    const last = lastLogNumber(readFileSync(resolve(ROOT, 'docs/dev/LOG.md'), 'utf8'));
    console.log(
      `✔  ${fragments.length} fragment(s) assembled into CHANGELOG.md${withLog.length ? ` and ${withLog.length} LOG entr${withLog.length > 1 ? 'ies' : 'y'} (#${last - withLog.length + 1}…#${last})` : ''}: ${fragments.map((f) => `${f.slug} (${f.date.slice(0, 10)})`).join(', ')}`,
    );
    process.exit(0);
  }
  console.error('usage: npm run changes -- --check [--base=origin/main] | --assemble [--date=YYYY-MM-DD]');
  process.exit(2);
}
