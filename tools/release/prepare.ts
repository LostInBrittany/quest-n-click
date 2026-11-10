// npm run release -- prepare <x.y.z> --name="<name>" [--date=YYYY-MM-DD] [--no-pr] [--dry-run]
// npm run release -- check <x.y.z>
// (4.5.5) Before it pushes, `prepare` checks what the pull request's CI would fail on: a `TODO(release)` left (each with
// its brief, for a person or their assistant to write) and the docs' human gates (a claim or a pair still to review,
// each with its command for a person to type), in one stop, nothing pushed. The tool never writes prose nor records a
// review; the same command, run again on `release/<x.y.z>` once they are committed, resumes there.
// (4.5.5, #331; next, #410 PR 4) It no longer starts the warm-up of main's mutation cache when it pushes: on 4.6.0 and
// 4.7.0 it was still running when the merge started the candidate, which measured the same long shards beside it. The
// candidate's own cache step is the warm-up; the pull request's body gives the command for a review expected long.
// (4.5.4, part B of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md.) `prepare` makes the release pull request: the branch
// `release/<x.y.z>`, every file the tools already generate (version, CHANGELOG and LOG from the fragments, transition
// pages, golden save, reference run, quality baseline), the files a release branch used to write by hand (the passes
// sheet, passIssues, the CHANGELOG's heading, the LOG's release entry, the upgrade notes' section, the README's current
// release), and the pull request. It never invents prose: every part that needs a sentence carries `TODO(release)`,
// and `check` fails while one is left. The helpers below are pure and tested against 4.5.3's release commit
// (tests/release-prepare.test.ts); the commands they run are the ones 4.5.3's release ran by hand, in its order.
// (#410, PR 6) It writes the facts it holds instead of a marker: the LOG entry's bullets (the pull requests merged since
// the previous tag, the fragments and main's commit, the upgrade notes' section, the acks folded, the fixtures, the
// passes, the signature), the passes sheet's intro when no pass changed, and the CHANGELOG's intro and the README lines
// from the fragments' `### Release` lines (changes/README.md). What only a person knows stays a marker: the LOG entry's
// title, its request and its next, the upgrade notes' opener, and an intro or a README line no fragment gave a line for.
// (#443) It writes the version in place of the mark `next` (tools/next-mark.ts): in the fragments as it assembles them,
// in the wiki and the code's comments in the step `next mark`, the docs' records carried over. `check`, and the stop
// before the push, run the tests that depend on the version (VERSION_TESTS), which pull requests cannot run.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error: a plain .mjs module without declarations
import { LOCKED, lockWithPeers } from '../../scripts/pack-manifests.mjs';
import { releaseNotes } from '../../scripts/release-notes.mjs';
import { fragmentFiles, lastLogNumber, proseLines, readFragments, releaseSummary } from '../changes';
import { checkKnown, type KnownSurvivor } from '../mutate';
import { passesFor } from '../field/schema';
import { rewriteMarkdown } from '../next-mark';
import { type PendingFile, readPending } from '../wiki/pending';
import { formatJson } from '../wiki/json';
import { releaseBudget, withInitialJsBudget } from '../first-visit';
import { gameId } from '../game';
// @ts-expect-error: a plain .mjs module without declarations
import { gitRetried, REPO, releaseRemote } from './lib.mjs';
import { humanGates, type Run } from './gates';

const TODO = 'TODO(release)';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const parts = (v: string) => SEMVER.exec(v)!.slice(1).map(Number) as [number, number, number];

/** Why `next` cannot be prepared after `current` (package.json's), or nothing. */
export function nextVersionProblem(current: string, next: string): string | undefined {
  if (!SEMVER.test(next))
    return `${next} is not x.y.z (a release candidate is a tag of a prepared release, not a release)`;
  const [a, b] = [parts(current), parts(next)];
  const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (cmp >= 0) return `${next} is not greater than ${current}, the version package.json is at`;
  return undefined;
}

/** The wiki page that holds the upgrade notes of a version's minor line. */
export const upgradeNotesPage = (version: string) => {
  const [major, minor] = parts(version);
  return `install.upgrade-notes-${major}-${minor}`;
};

/** The CHANGELOG heading of a release. */
export const releaseHeading = (version: string, date: string) => `## ${version} — ${date}`;

/**
 * The paragraph that opens a release's CHANGELOG section: the LOG range, the name, what it follows; then the fragments'
 * release lines (`summary`, #410) and where a game reads what to do, or the rest to write when no fragment gave one.
 */
export function changelogIntro(o: {
  version: string;
  name: string;
  previous: string;
  first: number;
  last: number;
  summary?: string;
}) {
  const [, minor, patch] = parts(o.version);
  const kind = patch > 0 ? 'a patch on' : minor > 0 ? 'a minor release after' : 'a major release after';
  // One LOG entry (the release's own) is `LOG #N`, never `LOG #N–#N` (#348).
  const range = o.first === o.last ? `#${o.first}` : `#${o.first}–#${o.last}`;
  const head = `LOG ${range}: "${o.name}", ${kind} ${o.previous}.`;
  if (o.summary) return `${head} ${o.summary} The upgrade notes say what a game has to do.`;
  return `${head} ${TODO}: what it changes, for whom, and what a game has to do (Upgrade notes).`;
}

const WIDTH = 120;

/**
 * `text` wrapped at 120 columns as the CHANGELOG and the LOG are, each line after the first starting with `indent`; a
 * code span is never cut (a marker in a span cut over two lines would count, #364).
 */
export function wrap(text: string, indent: string, width = WIDTH) {
  const atoms: string[] = [];
  let open = false;
  for (const word of text.split(' ')) {
    if (open) atoms[atoms.length - 1] += ` ${word}`;
    else atoms.push(word);
    if ((word.match(/`/g) ?? []).length % 2) open = !open;
  }
  const lines: string[] = [];
  let line = '';
  for (const atom of atoms) {
    const lead = lines.length ? indent : '';
    if (line && lead.length + line.length + 1 + atom.length > width) {
      lines.push(lead + line);
      line = atom;
    } else line = line ? `${line} ${atom}` : atom;
  }
  lines.push((lines.length ? indent : '') + line);
  return lines.join('\n');
}

/**
 * Why `name` cannot name a release, or nothing (#348). It is written as is into the README's release link
 * (`[v4.5.5 (name)](…)`, read back by the next prepare), the CHANGELOG's and the LOG's quotes, the French « », and the
 * command `prepare` says to run again (`--name="…"`): a character any of them uses is refused, never escaped.
 */
export function releaseNameProblem(name: string): string | undefined {
  if (!name.trim()) return '--name="<the release\'s name>" is required (4.5.3 was "One pass")';
  const bad = [...new Set(name.match(/[()[\]"«»`\\$<>|\n\r\t]/g) ?? [])];
  if (!bad.length) return undefined;
  return `the release name ${JSON.stringify(name)} has ${bad.map((c) => JSON.stringify(c)).join(' ')}: the README's release link, the CHANGELOG's quotes and the command line cannot hold it; choose a name without ( ) [ ] " « » \` \\ $ < > |`;
}

const LOG_BULLETS = [
  'The request',
  'What ships',
  'Fragments',
  'Upgrade notes',
  'Reviews',
  'Fixtures',
  'Passes',
  'Signature',
] as const;
export type LogBullet = (typeof LOG_BULLETS)[number];

/** A bullet of the LOG's release entry, wrapped. */
const logBullet = (b: LogBullet, text: string) => wrap(`- **${b}**: ${text}`, '  ');

/**
 * The LOG's release entry: its heading and the bullets 4.5.3's had, each the fact `facts` gives (#410) or to fill. The
 * title, the request and the next are a person's.
 */
export function logReleaseEntry(o: {
  n: number;
  date: string;
  version: string;
  name: string;
  facts?: Partial<Record<LogBullet, string>>;
}) {
  return [
    `## #${o.n} · ${o.date} · Claude · release · ${o.version} "${o.name}": ${TODO}`,
    '',
    ...LOG_BULLETS.map((b) => logBullet(b, o.facts?.[b] ?? TODO)),
    '',
    `→ next: ${TODO}`,
    '',
  ].join('\n');
}

/** The LOG with one bullet of `version`'s release entry, still to fill, given its fact (a later step's, #410). */
export function withLogFact(log: string, version: string, bullet: LogBullet, text: string) {
  const lines = log.split('\n');
  const head = lines.findLastIndex((l) => /^## #\d+ · /.test(l) && l.includes(` · release · ${version} "`));
  if (head < 0) return log;
  const at = lines.findIndex((l, i) => i > head && l === `- **${bullet}**: ${TODO}`);
  if (at < 0) return log;
  lines.splice(at, 1, logBullet(bullet, text));
  return lines.join('\n');
}

/**
 * The pull requests merged on main, oldest first, from `git log --first-parent --format=%s%x1f%b%x1e <range>`: a merge
 * commit's (`Merge pull request #n from <owner>/<branch>`, its title the body's first line) or a squash's (`<title>
 * (#n)`). A release branch's merge is the previous release's, not a change of this one.
 */
export function mergedPulls(log: string): { n: number; title: string }[] {
  const out: { n: number; title: string }[] = [];
  for (const record of log.split('\x1e')) {
    const [subject = '', body = ''] = record.replace(/^\n+/, '').split('\x1f');
    const merge = /^Merge pull request #(\d+) from \S+?\/(\S+)/.exec(subject);
    if (merge) {
      if (merge[2]!.startsWith('release/')) continue;
      out.push({
        n: Number(merge[1]),
        title:
          body
            .split('\n')
            .find((l) => l.trim())
            ?.trim() ?? '',
      });
      continue;
    }
    const squash = /^(.*\S) \(#(\d+)\)$/.exec(subject.trim());
    if (squash) out.push({ n: Number(squash[2]), title: squash[1]! });
  }
  return out.reverse();
}

/** The LOG's "What ships": the pull requests by number and title, or a marker when the previous tag is not here. */
export function shipsFact(previous: string, pulls: readonly { n: number; title: string }[] | undefined) {
  if (!pulls)
    return `${TODO}: the pull requests merged since v${previous}, by number and title (no tag v${previous} in this clone: git fetch --tags).`;
  if (!pulls.length) return `no pull request merged since v${previous}.`;
  return `the pull requests merged since v${previous}, oldest first: ${pulls.map((p) => (p.title ? `#${p.n} (${p.title})` : `#${p.n}`)).join(', ')}.`;
}

const ticks = (xs: readonly string[]) => xs.map((x) => `\`${x}\``).join(', ');

/** The LOG's "Fragments": how many, main's commit, which, and which gave the release lines. */
export function fragmentsFact(version: string, sha: string, slugs: readonly string[], release: readonly string[]) {
  const lines = release.length
    ? `the intro and the README line from the \`### Release\` lines of ${ticks(release)}`
    : 'no `### Release` line';
  return `${slugs.length} assembled by \`npm run release -- prepare ${version}\`, on main at \`${sha.slice(0, 8)}\`: ${ticks(slugs)}; ${lines}.`;
}

/** The LOG's "Upgrade notes": the release's section, written ahead or appended by prepare. */
export function upgradeNotesFact(o: { previous: string; version: string; ahead: boolean }) {
  const where = `"From ${o.previous} to ${o.version}" in \`${upgradeNotesPage(o.version)}\`, both languages`;
  return o.ahead
    ? `${where}, written ahead; the release's CHANGELOG bullets in a comment at its end, to check it against.`
    : `${where}, appended by \`prepare\` from the release's CHANGELOG bullets, to rewrite for a reader upgrading.`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The LOG's "Reviews": what the fold took in from the pending files (#360), a person's named, what it could not keep. */
export function reviewsFact(
  files: readonly Pick<PendingFile, 'file' | 'pairs' | 'claims'>[],
  notKept: readonly string[],
) {
  if (!files.length) return 'no pending ack nor claim review to fold (`changes/*.acks.json`).';
  const part = (kind: 'pairs' | 'claims', one: string, aiOnly: string) => {
    const records = new Map<string, { kind: string; name: string }[]>();
    for (const f of files)
      for (const [id, r] of Object.entries(f[kind])) records.set(id, [...(records.get(id) ?? []), ...r.reviewers]);
    if (!records.size) return '';
    const all = [...records.values()];
    const human = all.filter((rs) => rs.some((r) => r.kind === 'human'));
    const names = [...new Set(human.flatMap((rs) => rs.filter((r) => r.kind === 'human').map((r) => r.name)))].sort();
    const ai = all.length - human.length;
    const said = [
      human.length ? `${human.length} read by a person, ${names.join(', ')}` : '',
      ai ? `${ai} ${aiOnly}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    return `${plural(all.length, one)} (${said})`;
  };
  const what = [
    part('pairs', 'translation pair', "with an AI's record only, D56"),
    part('claims', 'claim', 'checked by an AI only'),
  ]
    .filter(Boolean)
    .join(', ');
  const lost = notKept.length
    ? `; ${plural(notKept.length, 'pending ack')} not kept, ${notKept.length === 1 ? 'its text changed since it was' : 'their text changed since they were'} read (listed by \`prepare\`)`
    : '';
  return `folded by \`prepare\` from ${ticks(files.map((f) => f.file))}: ${what || 'no record'}${lost}.`;
}

/** The LOG's "Fixtures": what prepare writes. */
export const fixturesFact = (version: string) =>
  `golden save demo-${version}, reference run, quality baseline, written by \`prepare\` (the release's own write, \`quality:baseline -- --release --dist\`).`;

/** The LOG's "Signature": the release command signs with a key `.github/allowed_signers` names, or refuses. */
export const signatureFact = (version: string) =>
  `the tag is signed with an SSH key \`.github/allowed_signers\` names (\`npm run release -- ${version}\` refuses any other).`;

/** The passes `now` asks that `before` did not, and the other way round. */
const passesDiff = (now: readonly string[], before: readonly string[]) => ({
  added: now.filter((p) => !before.includes(p)),
  removed: before.filter((p) => !now.includes(p)),
});

/** The LOG's "Passes": the sheet, against the previous version's passes. */
export function passesFact(version: string, previous: string, now: readonly string[], before: readonly string[]) {
  const { added, removed } = passesDiff(now, before);
  if (!added.length && !removed.length) return `sheet ${version}, the ${now.length} of ${previous}, none new.`;
  const kept = now.length - added.length;
  const said = [
    `the ${kept} of ${previous}`,
    removed.length ? `${removed.length} of its no longer asked (${ticks(removed)})` : '',
    added.length ? `${added.length} new (${ticks(added)})` : '',
  ].filter(Boolean);
  return `sheet ${version}, ${plural(now.length, 'pass', 'passes')}: ${said.slice(0, -1).join(', ')} and ${said.at(-1)}.`;
}

/** The passes sheet's intro: written when no pass changed (4.6.0's and 4.7.0's), else the change named, to write. */
export function passesIntro(version: string, previous: string, now: readonly string[], before: readonly string[]) {
  const { added, removed } = passesDiff(now, before);
  if (!added.length && !removed.length)
    return `${version} adds no pass (\`passesFor('${version}')\` equals ${previous}'s, ${now.length}, and \`docs/dev/contracts.json\`'s \`passIssues\` gives ${version} each pass's ${previous} issue). The ${now.length} stay open and are made on the ${version} candidate.`;
  const change = [
    added.length ? `${ticks(added)} new, each with its issue in \`passIssues\`` : '',
    removed.length ? `${ticks(removed)} no longer asked` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return `${TODO}: what ${version} changes for the passes (${change}; \`passesFor('${version}')\` against ${previous}'s), which stay open and which are carried.`;
}

/** The upgrade-notes page with `version` added to its lead's list of versions (`… 4.5.1 and 4.5.2 changed.`). */
export function upgradeNotesLead(page: string, previous: string, version: string, lang: 'en' | 'fr') {
  // A lead that names the version already (a new minor's page, written ahead as #394 did) is left alone (#410).
  const lead = page.split(/^<a name=|^## /m)[0]!;
  if (new RegExp(`(?<![\\d.])${version.replace(/\./g, '\\.')}(?![\\d])`).test(lead)) return page;
  const p = previous.replace(/\./g, '\\.');
  const out =
    lang === 'en'
      ? page.replace(new RegExp(`\\s+and\\s+${p}\\s+changed\\.`), `, ${previous} and ${version} changed.`)
      : page.replace(
          new RegExp(`\\s+et\\s+la\\s+${p}\\s+ont\\s+changé\\.`),
          `, la ${previous} et la ${version} ont changé.`,
        );
  if (out !== page) return out;
  // A lead worded otherwise (a new minor's page, a rewrite): said where it is, for a person to write.
  const lines = page.split('\n');
  const note =
    lang === 'en'
      ? `${TODO}: name ${version} in this lead.`
      : `${TODO} : nommer la ${version} dans cette introduction.`;
  lines.splice(1, 0, '', note);
  return lines.join('\n');
}

/** A release's section of its upgrade notes: anchor, scope, heading, the text to write, the assembled bullets to start from. */
export function upgradeNotesSection(o: {
  previous: string;
  version: string;
  name: string;
  lang: 'en' | 'fr';
  bullets: readonly string[];
}) {
  const anchor = upgradeNotesAnchor(o.previous, o.version);
  const heading =
    o.lang === 'en'
      ? `## From ${o.previous} to ${o.version} "${o.name}"`
      : `## De la ${o.previous} à la ${o.version} « ${o.name} »`;
  const opener =
    o.lang === 'en'
      ? `${TODO}: what changes in a game ("Nothing to change in a game: it builds, plays and saves as on ${o.previous}" when nothing does), then for a host or a maintainer. The release's CHANGELOG bullets, to rewrite for a reader upgrading:`
      : `${TODO} : ce qui change dans un jeu (« Rien à changer dans un jeu : il se construit, se joue et se sauvegarde comme en ${o.previous} » quand rien ne change), puis pour un hébergeur ou un mainteneur. Les entrées du CHANGELOG de la release, à réécrire pour qui met à jour :`;
  return [
    `<a name="${anchor}"></a>`,
    `<!-- applies: ${o.version}.. -->`,
    '',
    heading,
    '',
    opener,
    '',
    ...o.bullets,
    '',
  ].join('\n');
}

/** The anchor of a release's section of its upgrade notes. */
const upgradeNotesAnchor = (previous: string, version: string) =>
  `from-${previous.replace(/\./g, '-')}-to-${version.replace(/\./g, '-')}`;

/** The comment that gives a section written ahead the release's CHANGELOG bullets, for its author (#410). */
function aheadComment(lang: 'en' | 'fr', bullets: readonly string[]) {
  const opener =
    lang === 'en'
      ? "<!-- prepare (#410): this section was written before the release. The release's CHANGELOG bullets, to check it against; delete this comment once read:"
      : '<!-- prepare (#410) : cette section a été écrite avant la release. Les entrées du CHANGELOG de la release, pour la relire ; supprimer ce commentaire une fois lu :';
  // `-->` in a bullet would close the comment early.
  return [opener, '', ...bullets.map((b) => b.replaceAll('-->', '-- >')), '-->'].join('\n');
}

/**
 * The upgrade-notes page with the release's section (#410): appended when the page has none (`upgradeNotesSection`, its
 * lead extended); kept as written when the page has its anchor already (written ahead, as #394 and #399 did for 4.6.0),
 * the CHANGELOG bullets then in a comment at that section's end, before the next `##` section and its anchor.
 */
export function withUpgradeNotes(
  page: string,
  o: { previous: string; version: string; name: string; lang: 'en' | 'fr'; bullets: readonly string[] },
) {
  const text = upgradeNotesLead(page, o.previous, o.version, o.lang);
  const lines = text.split('\n');
  const at = lines.indexOf(`<a name="${upgradeNotesAnchor(o.previous, o.version)}"></a>`);
  if (at < 0) return text.replace(/\n*$/, '\n\n') + upgradeNotesSection(o);
  const heading = lines.findIndex((l, i) => i > at && l.startsWith('## '));
  let end = lines.findIndex((l, i) => i > heading && heading >= 0 && l.startsWith('## '));
  if (end < 0) end = lines.length;
  // The next section's anchor, scope comment and blank lines belong to it.
  while (end > heading + 1 && /^(\s*$|<a name=|<!-- applies:)/.test(lines[end - 1]!)) end--;
  const head = lines.slice(0, end).join('\n');
  const tail = lines.slice(end).join('\n').replace(/^\n*/, '');
  return `${head}\n\n${aheadComment(o.lang, o.bullets)}\n${tail ? `\n${tail}` : ''}`;
}

const FIELD_BEGIN = '<!-- field:begin -->';

/** Why the previous passes sheet cannot be copied, or nothing: its table starts at the field:begin marker (#348). */
export const passesSheetProblem = (sheet: string, previous: string) =>
  sheet.includes(FIELD_BEGIN)
    ? undefined
    : `docs/dev/passes/${previous}.md has no ${FIELD_BEGIN} marker: the table prepare copies starts there (docs/dev/passes/TEMPLATE.md has it); put it back above the table`;

/** The passes sheet of `version`: the previous one's table and `field:` lines, its heading, its intro (`passesIntro`) or the one to write. */
export function passesSheet(previousSheet: string, previous: string, version: string, opening?: string) {
  const problem = passesSheetProblem(previousSheet, previous);
  if (problem) throw new Error(problem);
  const start = previousSheet.indexOf(FIELD_BEGIN);
  const intro = previousSheet.slice(0, start).split('\n').slice(1);
  const field = intro
    .filter((l) => l.startsWith('`npm run field:'))
    .map((l) => l.replaceAll(`--release=${previous}`, `--release=${version}`));
  return [
    `# Passes, ${version}`,
    '',
    opening ??
      `${TODO}: what ${version} changes for the passes (\`passesFor('${version}')\` against ${previous}'s), which stay open and which are carried.`,
    ...field,
    '',
    previousSheet.slice(start),
  ].join('\n');
}

interface Contracts {
  passIssues: Record<string, Record<string, number>>;
  [k: string]: unknown;
}

/** contracts.json with `version` given, for every pass of `previous`, the same issue. */
export function withPassIssues<T extends Contracts>(contracts: T, previous: string, version: string): T {
  const passIssues = Object.fromEntries(
    Object.entries(contracts.passIssues).map(([pass, by]) => [
      pass,
      previous in by ? { ...by, [version]: by[previous]! } : by,
    ]),
  );
  return { ...contracts, passIssues };
}

const LABEL = { en: 'Current release:', fr: 'Release actuelle :' } as const;

/** The README's current-release line: its summary the fragments' release lines in its language (#410), or to write. */
export function currentReleaseLine(lang: 'en' | 'fr', version: string, name: string, summary?: string) {
  const link = `[v${version} (${name})](https://github.com/${REPO}/releases/tag/v${version})`;
  return lang === 'en' ? `${LABEL.en} ${link}: ${summary ?? TODO}` : `${LABEL.fr} ${link} : ${summary ?? TODO}`;
}

/**
 * The README with the new release's line in place of the previous one (4.7.0): the README names the current release
 * only, the releases' history is the CHANGELOG's. Until 4.6.0 the previous line's summary was kept below it, so the
 * paragraph grew by a release each time.
 */
export function withCurrentRelease(readme: string, lang: 'en' | 'fr', version: string, name: string, summary?: string) {
  const lines = readme.split('\n');
  const at = lines.findIndex((l) => l.startsWith(LABEL[lang]));
  if (at < 0) throw new Error(`no "${LABEL[lang]}" line`);
  if (!/\[v(\d+\.\d+\.\d+) \(([^)]+)\)\]\([^)]*\)\s*:\s*(.*)$/.test(lines[at]!))
    throw new Error(`the "${LABEL[lang]}" line names no release`);
  lines.splice(at, 1, currentReleaseLine(lang, version, name, summary));
  return lines.join('\n');
}

/** The CHANGELOG with `## Unreleased` become the release's heading, then its intro; the lines around kept. */
export function withReleaseSection(changelog: string, heading: string, intro: string) {
  const lines = changelog.split('\n');
  const at = lines.findIndex((l) => /^## Unreleased[ \t]*$/.test(l));
  if (at < 0) throw new Error('CHANGELOG.md has no "## Unreleased" section (npm run changes -- --assemble makes it)');
  lines.splice(at, 1, heading, '', intro);
  return lines.join('\n');
}

const BRIEF = 200;

/**
 * Every `TODO(release)` left: its `file:line` and its line, the brief of what to write there (cut at 200 characters).
 * One quoted in code (`` `TODO(release)` ``, a fenced block) is a quotation, not a marker (#364): a CHANGELOG bullet
 * about the markers, copied into the upgrade notes, could never be written away.
 */
export function todoBrief(files: readonly { path: string; text: string }[]) {
  return files.flatMap(({ path, text }) => {
    const lines = text.split('\n');
    return proseLines(text).flatMap((prose, i) => {
      if (!prose.includes(TODO)) return [];
      const what = lines[i]!.trim();
      return [{ at: `${path}:${i + 1}`, what: what.length > BRIEF ? `${what.slice(0, BRIEF - 1)}…` : what }];
    });
  });
}

/** Every `TODO(release)` left, as `file:line` (what `check` counts, and `prepare` before it pushes). */
export function todoMarkers(files: readonly { path: string; text: string }[]) {
  return todoBrief(files).map((t) => t.at);
}

/**
 * Where the release branch is pushed, from `git remote -v`: the fork (`origin` when it is one, else the only one), or
 * the organisation's repository when no fork is a remote (a branch, never main). `head` prefixes the branch for
 * `gh pr create --head`.
 */
export function pushTarget(remotes: string, repo: string): { remote: string; head: string } | { problem: string } {
  const [org, name] = repo.toLowerCase().split('/');
  const github = remotes
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter(([, , kind]) => kind === '(fetch)')
    .flatMap(([n, url]) => {
      const m = /github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url ?? '');
      return m && m[2]!.toLowerCase() === name ? [{ remote: n!, owner: m[1]! }] : [];
    });
  const forks = github.filter((g) => g.owner.toLowerCase() !== org);
  const fork = forks.find((g) => g.remote === 'origin') ?? (forks.length === 1 ? forks[0] : undefined);
  if (fork) return { remote: fork.remote, head: `${fork.owner}:` };
  if (forks.length > 1)
    return {
      problem: `two forks could take the release branch (${forks.map((f) => f.remote).join(', ')}): make one of them origin`,
    };
  const own = github.find((g) => g.remote === 'origin') ?? github[0];
  if (own) return { remote: own.remote, head: '' };
  return { problem: `no remote is ${repo} or a fork of it on GitHub (git remote -v)` };
}

/** What `prepare` refuses before it writes anything, each with what to do. */
export function prepareRefusals(o: {
  current: string;
  version: string;
  dirty: boolean;
  branch: string;
  shallow: boolean;
  upToDate: boolean;
  upgradeNotes: boolean;
  /** The fragments in changes/: a release with none has nothing to say. */
  fragments: number;
  /** Why the pull request could not be opened at the end (no push target, gh not signed in), or nothing. */
  pr: string | undefined;
  /** The release's name (`--name`): refused when a file or the command line could not hold it (#348). */
  name?: string;
  /** Why the newest passes sheet cannot be copied (`passesSheetProblem`), or nothing. */
  passes?: string | undefined;
}): string[] {
  const out: string[] = [];
  const v = nextVersionProblem(o.current, o.version);
  if (v) out.push(v);
  if (o.dirty) out.push('the checkout has uncommitted changes: commit or set them aside first');
  if (o.branch !== 'main') out.push(`the checkout is on ${o.branch}: prepare runs on main (git switch main)`);
  if (o.shallow) out.push('a shallow clone dates every fragment at its boundary: git fetch --unshallow');
  if (!o.upToDate) out.push("main is not up to date with the organisation's: git pull first");
  if (o.fragments === 0) out.push('changes/ holds no fragment: a release with nothing to say is not prepared');
  if (o.pr) out.push(o.pr);
  if (!v && !o.upgradeNotes)
    out.push(
      `${upgradeNotesPage(o.version)} does not exist: a new minor needs its upgrade-notes page first (wiki/en and wiki/fr, wiki/manifest.json)`,
    );
  const name = o.name === undefined ? undefined : releaseNameProblem(o.name);
  if (name) out.push(name);
  if (o.passes) out.push(o.passes);
  return out;
}

/**
 * Why a run on `release/<version>` cannot resume the release `prepare` made there (the reviews committed since), or
 * undefined on any other branch: a first run, whose refusals are `prepareRefusals`'.
 */
export function resumeRefusals(o: {
  current: string;
  version: string;
  branch: string;
  dirty: boolean;
  /** The branch holds the prepared commit (`preparedSubject`) over main. */
  prepared: boolean;
  shallow: boolean;
  pr: string | undefined;
}): string[] | undefined {
  if (o.branch !== `release/${o.version}`) return undefined;
  const out: string[] = [];
  const back = `start again from main (git switch main && git branch -D ${o.branch})`;
  if (!o.prepared) out.push(`${o.branch} holds no prepared commit of ${o.version} over main: ${back}`);
  else if (o.current !== o.version) out.push(`package.json is at ${o.current}, not ${o.version}: ${back}`);
  if (o.dirty)
    out.push(
      `${o.branch} has uncommitted changes: commit the prose and the reviews (git add, git commit), then run again`,
    );
  if (o.shallow) out.push('a shallow clone dates every fragment at its boundary: git fetch --unshallow');
  if (o.pr) out.push(o.pr);
  return out;
}

/** Where the step `wiki acks` keeps the fold's list for the stop before the push (gitignored, beside the ship records). */
const foldedFile = (version: string) => `.cache/release/${version}.acks-folded.txt`;

/** The subject of the commit `prepare` makes. */
export const preparedSubject = (version: string) => `${version}: the release (prepared by npm run release -- prepare)`;

/** Whether the commit subjects (`git log --format=%s main..HEAD`, one per line) hold the prepared commit. */
export const isPrepared = (subjects: string, version: string) =>
  subjects.split('\n').some((l) => l.trim() === preparedSubject(version));

// humanGates lives in ./gates (#348): release-run.ts needs it too, and importing it from here made a cycle with the
// dispatch's top-level `await import('./release-run')` below, which never settled.
export { humanGates };

/**
 * What `prepare` says when it cannot push yet, or undefined when it can: the `TODO(release)` prose left (each marker
 * with its brief) and the docs' human gates still red, in one stop, then the same command to run again. It never
 * writes the prose nor records a review: a person does, or their assistant writes the prose from these briefs.
 */
export function beforePushStop(o: {
  version: string;
  name: string;
  branch: string;
  todos: readonly { at: string; what: string }[];
  gates: { ok: boolean; detail: string };
  pr: boolean;
  /** The fold's ⚠ lines (step `wiki acks`): the pending acks it could not keep, said again when prepare stops. */
  folded?: readonly string[];
  /** The tests that depend on the version (#443, `versionTestsResult`). */
  tests?: { ok: boolean; detail: string };
  /** The mutation exemptions due at the version (#410 PR 4, `dueExemptions`). */
  exemptions?: readonly string[];
}) {
  const testsOk = o.tests?.ok ?? true;
  const due = o.exemptions ?? [];
  if (!o.todos.length && o.gates.ok && testsOk && !due.length) return undefined;
  const why = [
    o.todos.length ? `${o.todos.length} ${TODO} left` : '',
    due.length ? `${due.length} mutation exemption${due.length > 1 ? 's' : ''} due at ${o.version}` : '',
    o.gates.ok ? '' : "the docs' human gates",
    testsOk ? '' : 'the tests that depend on the version',
  ].filter(Boolean);
  const out = [
    `✖  ${why.join(' and ')} would fail the release pull request's CI: nothing is pushed, ${o.branch} is committed here.`,
  ];
  if (o.todos.length)
    out.push(
      '',
      `The prose to write, one ${TODO} each (file:line, then the line, the brief):`,
      ...o.todos.map((t) => `  ${t.at}\n      ${t.what}`),
      'Write it yourself, or ask your AI assistant to write it with these markers as the brief; read the diff.',
      'The upgrade notes (en, fr) are a translation pair: record it as npm run wiki -- check prints.',
    );
  if (due.length)
    out.push(
      '',
      `The mutation exemptions due at ${o.version} (docs/dev/mutants.json; tests/mutants-json.test.ts refuses them):`,
      ...due.slice(0, 10).map((l) => `  ${l}`),
      ...(due.length > 10 ? [`  … and ${due.length - 10} more`] : []),
      'Read each one again against its file: keep it with a later revisit, or remove it if its mutant is gone or killed.',
      'Then npm run test:mutation:core -- --doc (docs/dev/MUTANTS.md) and say the reread there. Moving only the revisits',
      "keeps every mutation set's cache (#410): the candidate reuses what main measured.",
    );
  if (!o.gates.ok)
    out.push(
      '',
      'The reviews to record:',
      o.gates.detail.replace(/^/gm, '  '),
      'A person reads each one and types its command (prepare never records a review).',
    );
  if (!testsOk)
    out.push(
      '',
      'The tests that depend on the version, red now that package.json names it:',
      o.tests!.detail.replace(/^/gm, '  '),
      'Fix what they say on this branch (a mutants.json entry due, a figure the release moved).',
    );
  if (o.folded?.length)
    out.push(
      '',
      'The pending acks the fold could not keep (their text changed since they were read):',
      ...o.folded.map((l) => `  ${l}`),
      "A person's review among them is read again by a person before its command is typed.",
    );
  out.push(
    '',
    `Commit on ${o.branch}, then run the same command:`,
    `  npm run release -- prepare ${o.version} --name="${o.name}"${o.pr ? '' : ' --no-pr'}`,
    `It resumes here, then ${o.pr ? 'pushes and opens the pull request' : 'stops (--no-pr)'}, its CI run once.`,
  );
  return out.join('\n');
}

/**
 * The warm-up of main's mutation cache (4.5.5), by hand only since #410 PR 4: the nightly's mutation jobs (#330,
 * `-f jobs=mutation`) on the organisation's main. It takes about 110 min (20 shards, 8 at a time); the release pull
 * requests of 4.6.0 and 4.7.0 were merged 24 and 52 min after `prepare`, so the candidate measured the long shards
 * beside it. The candidate's cache step restores and saves the same keys: a review expected to last longer than the
 * warm-up is the one case it shortens the candidate.
 */
export const warmupArgs = (repo: string) => [
  'workflow',
  'run',
  'nightly',
  '--repo',
  repo,
  '--ref',
  'main',
  '-f',
  'jobs=mutation',
];
export const warmupCommand = (repo: string) => `gh ${warmupArgs(repo).join(' ')}`;

/** The pull request body's line about the warm-up: none started, and its command for a long review. */
export const warmupBodyLine = (repo: string) =>
  `No warm-up of main's mutation cache was started (#410): the candidate this merge starts restores main's cache and measures only the sets whose inputs moved. A review that will last more than about two hours can give it a head start: \`${warmupCommand(repo)}\`.`;

/** What `--no-pr` says: nothing pushed, and the warm-up's command for a long review once the pull request is open. */
export const noPrNote = (repo: string) =>
  `--no-pr: nothing pushed. Once you open the pull request, if its review will last more than about two hours, warm main's mutation cache for its candidate:\n  ${warmupCommand(repo)}`;

/**
 * The mutation exemptions due at `version` (#410 PR 4): `checkKnown`'s own lines for an entry whose revisit came, the
 * rule tests/mutants-json.test.ts applies, so `prepare` names them before the push. 4.7.0's 135 entries were all due:
 * the stop said only that test's FAIL line, and the reread was made on the pull request after its ci failed.
 */
export const dueExemptions = (known: readonly KnownSurvivor[], version: string) =>
  checkKnown([...known], version).filter((l) => / to be read again at /.test(l));

/**
 * The tests that depend on the version being released (#443): pull requests run them at package.json's version, so a
 * release that moves it can turn them red only on its own pull request (4.7.0: `mutants.json`'s entries due, the first
 * visit typed in a test). `check` runs them, and so does the stop before the push: a few seconds, on this machine.
 */
export const VERSION_TESTS = [
  'tests/mutants-json.test.ts',
  'tests/quality-baseline.test.ts',
  'tests/readme-truth.test.ts',
  'tests/readme-release.test.ts',
] as const;
export const versionTestsArgs = () => ['vitest', 'run', ...VERSION_TESTS];

/** What a run of VERSION_TESTS says: ok, or its FAIL lines and the command to run them again. */
export function versionTestsResult(r: { code: number; out: string }): { ok: boolean; detail: string } {
  if (r.code === 0) return { ok: true, detail: '' };
  const fails = r.out
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('FAIL '));
  return {
    ok: false,
    detail: [
      ...(fails.length ? [...new Set(fails)] : [`vitest exited ${r.code}`]),
      `they fail once package.json names the version; run them: npx ${versionTestsArgs().join(' ')}`,
    ].join('\n'),
  };
}

/**
 * `text` (the CHANGELOG, the LOG) with the mark `next` given `version` from the first line `from` matches to the next
 * release heading of the CHANGELOG (`## x.y.z`), or the end: fragments assembled before the release kept their mark
 * (#443); an older section, which may quote it, is left alone.
 */
export function withVersionInRelease(text: string, from: RegExp, version: string) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => from.test(l));
  if (start < 0) return text;
  let end = lines.findIndex((l, i) => i > start && /^## \d+\.\d+\.\d+/.test(l));
  if (end < 0) end = lines.length;
  return [
    ...lines.slice(0, start),
    ...rewriteMarkdown(lines.slice(start, end).join('\n'), version).split('\n'),
    ...lines.slice(end),
  ].join('\n');
}

/**
 * The `quality baseline` step (4.6.0, #405): the figures only a release writes (the test files and declarations, the
 * first visit in bytes, the READMEs' figures and install line), measured on a fresh build of the default game. A pull
 * request's `npm run quality:baseline` moves the behaviour only, so open pull requests never conflict on these.
 */
export const QUALITY_BASELINE_COMMANDS: [string, string[]][] = [
  ['npx', ['vite', 'build', '--logLevel=warn']],
  ['npm', ['run', '-s', 'quality:baseline', '--', '--release', '--dist']],
];

/**
 * The `quality baseline` step's last move (4.7.3): the measured game's `assetBudgets.initialJsKB` reset to the first
 * visit just measured (tests/quality-baseline.json) plus 2 KB, up or down, so a pull request fails only when it eats
 * that margin. A game that sets no budget is left alone; one whose budget cannot be rewritten in place stops the step.
 * Returns the line `prepare` says, which the release pull request shows.
 */
export function resetFirstVisitBudget(deps: {
  read: (file: string) => string;
  write: (file: string, text: string) => void;
  game: string;
}): string {
  const baseline = JSON.parse(deps.read('tests/quality-baseline.json') || '{}') as {
    bundle?: { initialJsBytes?: number };
  };
  const bytes = baseline.bundle?.initialJsBytes;
  if (typeof bytes !== 'number')
    throw new Error('tests/quality-baseline.json holds no bundle.initialJsBytes to reset initialJsKB from');
  const path = `games/${deps.game}/game.ts`;
  const kb = releaseBudget(bytes);
  let out: ReturnType<typeof withInitialJsBudget>;
  try {
    out = withInitialJsBudget(deps.read(path), kb);
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`);
  }
  if (!out) return `${path} sets no initialJsKB: left alone`;
  if (out.from === kb) return `${path}: initialJsKB ${kb} kept (${bytes} bytes measured + 2 KB)`;
  deps.write(path, out.text);
  return `${path}: initialJsKB ${out.from} → ${kb} (${bytes} bytes measured + 2 KB)`;
}

/** The steps of `prepare`, in 4.5.3's order; before the push, the prose left and the human gates (4.5.5). */
export const PREPARE_STEPS = [
  'branch',
  'version',
  'locks',
  'changelog',
  'wiki acks',
  'next mark',
  'upgrade notes',
  'transition pages',
  'golden save',
  'reference run',
  'passes',
  'readme',
  'quality baseline',
  'commit',
  'before the push',
  'pull request',
] as const;

/** The steps of a run again on a prepared branch. */
export const RESUME_STEPS = [
  'before the push',
  'pull request',
] as const satisfies readonly (typeof PREPARE_STEPS)[number][];

interface CheckDeps {
  read: (file: string) => string;
  /** The files a release writes prose into. */
  todoFiles: () => string[];
  /** Runs a command: its exit code and what it printed. */
  run: Run;
}

/** The reference golden save of `version`: its entry in tests/fixtures/saves/index.json and its file (#348). */
function goldenSave(version: string, read: (file: string) => string) {
  let demo: unknown;
  try {
    demo = (JSON.parse(read('tests/fixtures/saves/index.json') || '{}') as { demo?: unknown }).demo;
  } catch {
    return { ok: false, detail: 'tests/fixtures/saves/index.json is not JSON' };
  }
  if (!Array.isArray(demo) || !demo.includes(version))
    return {
      ok: false,
      detail: `${version} is not in tests/fixtures/saves/index.json: npx tsx tools/golden-save.ts ${version}, then add it to "demo"`,
    };
  if (!read(`tests/fixtures/saves/demo-${version}.json`).trim())
    return {
      ok: false,
      detail: `no tests/fixtures/saves/demo-${version}.json: npx tsx tools/golden-save.ts ${version}`,
    };
  return { ok: true, detail: '' };
}

/** What `check` says of a prepared release, item by item. */
export async function checkRelease(version: string, deps: CheckDeps) {
  const pkg = JSON.parse(deps.read('package.json') || '{}') as { version?: string };
  const todos = todoMarkers(deps.todoFiles().map((path) => ({ path, text: deps.read(path) })));
  const wiki = deps.run('npm', ['run', '-s', 'wiki', '--', 'check']);
  const gates = humanGates(deps.run);
  return [
    { what: `package.json is at ${version}`, ok: pkg.version === version, detail: `it is at ${pkg.version}` },
    {
      what: `CHANGELOG.md has a ${version} section`,
      ok: releaseNotes(deps.read('CHANGELOG.md'), `v${version}`) !== null,
      detail: `no "## ${version}" heading`,
    },
    {
      // #348: prepare writes both; a release branch made or edited by hand could lose them.
      what: `the passes sheet docs/dev/passes/${version}.md`,
      ok: deps.read(`docs/dev/passes/${version}.md`).trim() !== '',
      detail: `no docs/dev/passes/${version}.md: npm run release -- prepare writes it from the previous one`,
    },
    { what: `the golden save of ${version} (tests/fixtures/saves)`, ...goldenSave(version, deps.read) },
    { what: `no ${TODO} left`, ok: todos.length === 0, detail: todos.join(', ') },
    {
      what: 'npm run wiki -- check: no warning',
      ok: wiki.code === 0 && /\b0 warning\(s\)/.test(wiki.out),
      detail: 'see npm run wiki -- check',
    },
    {
      // What docs-publish would refuse but "executed" (the candidate's report checks it): a claim or a pair a person
      // must read fails the release pull request, never the release (4.5.4).
      what: "the docs' human gates (wiki -- check --publish --reviews-only)",
      ...gates,
    },
    {
      what: 'npm run quality:baseline -- --check',
      ok: deps.run('npm', ['run', '-s', 'quality:baseline', '--', '--check']).code === 0,
      detail: 'see npm run quality:baseline -- --check',
    },
    {
      what: `the tests that depend on the version (${VERSION_TESTS.join(', ')})`,
      ...versionTestsResult(deps.run('npx', versionTestsArgs())),
    },
  ];
}

// ——— The command line. Everything below runs in the repository's root, the commands 4.5.3's release ran by hand.

let root: string | undefined;
const ROOT_ = () => (root ??= execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const sh = (cmd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync(cmd, args, {
    cwd: ROOT_(),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
const capture = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { cwd: ROOT_(), encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const file = (f: string) => join(ROOT_(), f);
const read = (f: string) => (existsSync(file(f)) ? readFileSync(file(f), 'utf8') : '');
const say = (s: string) => console.log(`${new Date().toISOString().slice(11, 19)}  ${s}`);
/** Today, the local day (as tools/changes.ts dates the fragments). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function todoFiles(version: string) {
  return [
    'CHANGELOG.md',
    'docs/dev/LOG.md',
    'README.md',
    'README.fr.md',
    `docs/dev/passes/${version}.md`,
    `wiki/en/${upgradeNotesPage(version)}.md`,
    `wiki/fr/${upgradeNotesPage(version)}.md`,
  ];
}

/**
 * The pull requests merged on main since the tag `v<previous>` (#410), oldest first, or undefined when this clone has no
 * such tag (the LOG's "What ships" is then a marker).
 */
function pullsSince(previous: string) {
  const tag = `v${previous}`;
  if (spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { cwd: ROOT_() }).status !== 0)
    return undefined;
  return mergedPulls(sh('git', ['log', '--first-parent', '--format=%s%x1f%b%x1e', `${tag}..HEAD`]));
}

/** The newest passes sheet's version (docs/dev/passes/<x.y.z>.md). */
function newestSheet() {
  return readdirSync(file('docs/dev/passes'))
    .map((f) => /^(\d+\.\d+\.\d+)\.md$/.exec(f)?.[1])
    .filter((v): v is string => !!v)
    .sort((a, b) => {
      const [x, y] = [parts(a), parts(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })
    .at(-1)!;
}

/**
 * The bullets of `version`'s CHANGELOG section, to start the upgrade notes from: each top-level bullet whole, with its
 * continuation lines, a nested list and an indented paragraph as written (#333: 4.5.4's were cut to their first line).
 * The headings, the intro and the blank lines between bullets are left out: the page gets one tight list.
 */
export function changelogBullets(changelog: string, version: string) {
  const notes = releaseNotes(changelog, `v${version}`) ?? '';
  const bullets: string[][] = [];
  let open = false;
  for (const line of notes.split('\n')) {
    if (/^[-*+] /.test(line)) {
      bullets.push([line]);
      open = true;
    } else if (open && (line.trim() === '' || /^\s/.test(line))) bullets.at(-1)!.push(line);
    else open = false;
  }
  return bullets.map((b) => b.join('\n').trimEnd());
}

/**
 * What prepare says last (#410): the release command runs on main, pulled from the organisation's remote after the
 * merge; prepare stays on its branch, where the pull request's review fixes are committed.
 */
export const nextSteps = (version: string, remote: string | undefined) =>
  [
    'Next: merge the pull request, then, on this machine:',
    `  git switch main && git pull --ff-only ${remote ?? "<the organisation's remote>"} main`,
    `  npm run release -- ${version}`,
  ].join('\n');

/** What to do when a step failed: finish by hand after the commit, else undo the branch (nothing was pushed). */
export function wayBack(step: string, version: string, branch: string, target?: { remote: string; head: string }) {
  if (step === 'pull request')
    return [
      'The release commit is made; push it and open the pull request by hand:',
      `  git push -u ${target?.remote ?? '<the fork>'} ${branch}`,
      `  gh pr create --repo ${REPO} --base main --head ${target?.head ?? ''}${branch} --title "${version}: the release"`,
    ].join('\n');
  return [
    'Nothing was pushed. To start again from main:',
    '  git reset --hard && git clean -fd -- changes docs tests wiki',
    `  git switch main && git branch -D ${branch}`,
  ].join('\n');
}

function prepare(version: string, opts: { name: string; date: string; pr: boolean; dryRun: boolean }) {
  const current = JSON.parse(read('package.json')).version as string;
  let remote: string | undefined;
  try {
    remote = releaseRemote();
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
  }
  // Tried again on a passing failure (#410), as the release command's.
  const fetched = remote
    ? (() => {
        try {
          gitRetried(['fetch', '--quiet', remote, 'main'], { cwd: ROOT_() });
          return true;
        } catch {
          return false;
        }
      })()
    : false;
  if (remote && !fetched) console.error(`✖  git fetch ${remote} main failed: main's state there is not known`);
  const head = sh('git', ['rev-parse', 'HEAD']);
  const theirs = remote
    ? spawnSync('git', ['rev-parse', '-q', '--verify', `${remote}/main`], {
        cwd: ROOT_(),
        encoding: 'utf8',
      }).stdout.trim()
    : '';
  const target = pushTarget(sh('git', ['remote', '-v']), REPO);
  let pr: string | undefined;
  if (opts.pr) {
    if ('problem' in target) pr = target.problem;
    else if (spawnSync('gh', ['auth', 'status'], { cwd: ROOT_(), stdio: 'ignore' }).status !== 0)
      pr = 'gh is not signed in (gh auth login), or pass --no-pr and open the pull request by hand';
  }
  const dirty = sh('git', ['status', '--porcelain']) !== '';
  const onBranch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const shallow = sh('git', ['rev-parse', '--is-shallow-repository']) === 'true';
  // Run again on its branch (the stop before the push held it), prepare resumes there: the commits over main say whether
  // it is the branch prepare made.
  const subjects = () => {
    const r = spawnSync('git', ['log', '--format=%s', `${theirs || 'main'}..HEAD`], { cwd: ROOT_(), encoding: 'utf8' });
    return r.status === 0 ? r.stdout : '';
  };
  const resuming = resumeRefusals({
    current,
    version,
    branch: onBranch,
    dirty,
    prepared: onBranch === `release/${version}` && isPrepared(subjects(), version),
    shallow,
    pr,
  });
  const resume = resuming !== undefined;
  const refusals =
    resuming ??
    prepareRefusals({
      current,
      version,
      dirty,
      branch: onBranch,
      shallow,
      upToDate: fetched && head === theirs,
      upgradeNotes: existsSync(file(`wiki/en/${upgradeNotesPage(version)}.md`)),
      fragments: fragmentFiles(readdirSync(file('changes'))).length,
      pr,
      name: opts.name,
      passes: (() => {
        const sheet = newestSheet();
        return sheet
          ? passesSheetProblem(read(`docs/dev/passes/${sheet}.md`), sheet)
          : 'docs/dev/passes holds no sheet';
      })(),
    });
  // A resume says the name again in the command it prints: refused the same (#348).
  const nameProblem = releaseNameProblem(opts.name);
  if (resume && nameProblem) refusals.push(nameProblem);
  if (refusals.length) {
    for (const r of refusals) console.error(`✖  ${r}`);
    if (!opts.dryRun) process.exit(1);
  }
  if (nameProblem) process.exit(1); // said above, even on a dry run
  // On a resume package.json is at the version already; the previous one is only used by the steps it skips.
  const previous = current;
  const branch = `release/${version}`;
  // The fragments' release lines (#410): read before `--assemble` deletes the fragments, written by the readme step.
  let summary: ReturnType<typeof releaseSummary> = { slugs: [], missingFr: [] };
  /** The LOG's release entry, one bullet given the fact a step just made (#410). */
  const logFact = (bullet: LogBullet, text: string) =>
    writeFileSync(file('docs/dev/LOG.md'), withLogFact(read('docs/dev/LOG.md'), version, bullet, text));
  const steps: Record<(typeof PREPARE_STEPS)[number], () => void> = {
    branch: () => sh('git', ['switch', '-c', branch]),
    version: () => sh('npm', ['version', version, '--no-git-tag-version']),
    // The versioned locks' peers follow the version (#410): the Studio Server's engine peer is its line (`4.6.x`), so a
    // new minor moves it; that field only, never a full `npm run locks` (797ba349).
    locks: () => {
      const pkg = JSON.parse(read('package.json'));
      for (const e of LOCKED as { lock: string; manifest: (root: unknown) => unknown }[]) {
        const text = read(e.lock);
        const out = lockWithPeers(text, e.manifest(pkg));
        if (out !== text) {
          writeFileSync(file(e.lock), out);
          say(`${e.lock}: its peers follow ${version}`);
        }
      }
    },
    changelog: () => {
      const first = lastLogNumber(read('docs/dev/LOG.md')) + 1;
      // The fragments in the assembly's order, read before it deletes them: their slugs and their release lines.
      const fragments = readFragments();
      // Their release lines with the version in place of the mark, as --assemble writes the bullets (#443).
      const lines = releaseSummary(fragments);
      summary = {
        ...lines,
        ...(lines.en ? { en: rewriteMarkdown(lines.en, version) } : {}),
        ...(lines.fr ? { fr: rewriteMarkdown(lines.fr, version) } : {}),
      };
      sh('npm', ['run', '-s', 'changes', '--', '--assemble', `--date=${opts.date}`, `--version=${version}`]);
      const last = lastLogNumber(read('docs/dev/LOG.md')) + 1;
      const intro = wrap(
        changelogIntro({
          version,
          name: opts.name,
          previous,
          first,
          last,
          ...(summary.en ? { summary: summary.en } : {}),
        }),
        '',
      );
      const changelog = withReleaseSection(read('CHANGELOG.md'), releaseHeading(version, opts.date), intro);
      // A fragment assembled before the release (on main, without --version) kept its mark: written here (#443).
      const heading = new RegExp(`^${releaseHeading(version, opts.date).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      writeFileSync(file('CHANGELOG.md'), withVersionInRelease(changelog, heading, version));
      const log = withVersionInRelease(read('docs/dev/LOG.md'), new RegExp(`^## #${first} · `), version).replace(
        /\n*$/,
        '\n\n',
      );
      const facts = {
        'What ships': shipsFact(previous, pullsSince(previous)),
        Fragments: fragmentsFact(
          version,
          head,
          fragments.map((f) => f.slug),
          summary.slugs,
        ),
        Fixtures: fixturesFact(version),
        Signature: signatureFact(version),
      };
      writeFileSync(
        file('docs/dev/LOG.md'),
        log + logReleaseEntry({ n: last, date: opts.date, version, name: opts.name, facts }),
      );
    },
    // The branches' pending acks into wiki/translations.json and wiki/reviews.json, as the fragments into the CHANGELOG
    // (#360); what no longer holds its text is printed, and kept for the stop before the push.
    'wiki acks': () => {
      // What the fold takes in, read before it deletes the pending files: the LOG's "Reviews" (#410).
      const pending = readPending(file('wiki')).files;
      const r = capture('npm', ['run', '-s', 'wiki', '--', 'acks', '--fold']);
      if (r.code !== 0) throw new Error(r.out.trim());
      for (const line of r.out.trim().split('\n')) say(line);
      const notKept = r.out.split('\n').filter((l) => l.startsWith('⚠'));
      mkdirSync(file('.cache/release'), { recursive: true });
      writeFileSync(file(foldedFile(version)), notKept.join('\n'));
      logFact('Reviews', reviewsFact(pending, notKept));
    },
    // The mark `next` in the wiki and the code's comments given the version, the records carried over (#443): after the
    // fold, so the two record files hold every ack.
    'next mark': () => say(sh('npx', ['tsx', 'tools/next-mark.ts', '--write', `--version=${version}`])),
    'upgrade notes': () => {
      const bullets = changelogBullets(read('CHANGELOG.md'), version);
      const ahead = read(`wiki/en/${upgradeNotesPage(version)}.md`)
        .split('\n')
        .includes(`<a name="${upgradeNotesAnchor(previous, version)}"></a>`);
      logFact('Upgrade notes', upgradeNotesFact({ previous, version, ahead }));
      for (const lang of ['en', 'fr'] as const) {
        const page = `wiki/${lang}/${upgradeNotesPage(version)}.md`;
        writeFileSync(file(page), withUpgradeNotes(read(page), { previous, version, name: opts.name, lang, bullets }));
      }
    },
    'transition pages': () => sh('npm', ['run', '-s', 'wiki', '--', 'transition']),
    'golden save': () => {
      sh('npx', ['tsx', 'tools/golden-save.ts', version]);
      const index = JSON.parse(read('tests/fixtures/saves/index.json')) as { demo: string[] };
      writeFileSync(
        file('tests/fixtures/saves/index.json'),
        `${JSON.stringify({ demo: [...index.demo, version] }, null, 2)}\n`,
      );
    },
    'reference run': () => sh('npx', ['tsx', 'tools/speedrun/reference-run.ts'], { GAME: 'reference' }),
    passes: () => {
      const sheet = newestSheet();
      const [now, before] = [passesFor(version), passesFor(sheet)];
      writeFileSync(
        file(`docs/dev/passes/${version}.md`),
        passesSheet(read(`docs/dev/passes/${sheet}.md`), sheet, version, passesIntro(version, sheet, now, before)),
      );
      logFact('Passes', passesFact(version, sheet, now, before));
      const contracts = JSON.parse(read('docs/dev/contracts.json'));
      writeFileSync(file('docs/dev/contracts.json'), formatJson(withPassIssues(contracts, sheet, version)));
    },
    readme: () => {
      for (const [lang, f] of [
        ['en', 'README.md'],
        ['fr', 'README.fr.md'],
      ] as const)
        writeFileSync(file(f), withCurrentRelease(read(f), lang, version, opts.name, summary[lang]));
    },
    'quality baseline': () => {
      for (const [cmd, args] of QUALITY_BASELINE_COMMANDS) sh(cmd, args);
      say(resetFirstVisitBudget({ read, write: (f, text) => writeFileSync(file(f), text), game: gameId() }));
    },
    commit: () => {
      sh('git', ['add', '-A']);
      sh('git', ['commit', '-q', '-m', preparedSubject(version)]);
    },
    'before the push': () => {
      // The same markers and gates `check` (the pull request's CI) fails on: what is left, said in one stop.
      const todos = todoBrief(todoFiles(version).map((path) => ({ path, text: read(path) })));
      const folded = read(foldedFile(version)).split('\n').filter(Boolean);
      const stop = beforePushStop({
        version,
        name: opts.name,
        branch,
        todos,
        gates: humanGates(capture),
        pr: opts.pr,
        folded,
        tests: versionTestsResult(capture('npx', versionTestsArgs())),
        exemptions: dueExemptions(JSON.parse(read('docs/dev/mutants.json') || '[]') as KnownSurvivor[], version),
      });
      if (!stop) return;
      console.error(stop);
      process.exit(1);
    },
    'pull request': () => {
      if (!opts.pr) return say(noPrNote(REPO));
      if ('problem' in target) throw new Error(target.problem);
      sh('git', ['push', '-q', '-u', target.remote, branch]);
      const body = [
        `## What changes`,
        '',
        `Release ${version} "${opts.name}", prepared by \`npm run release -- prepare\`: version, CHANGELOG and LOG from the fragments, the pending acks folded, transition pages, golden save, reference run, passes sheet and passIssues, README, quality baseline.`,
        '',
        `Its prose is written and its docs' human gates hold: \`prepare\` pushes only then. \`npm run release -- check ${version}\` is this pull request's CI.`,
        '',
        warmupBodyLine(REPO),
      ].join('\n');
      const head = `${target.head}${branch}`;
      say(
        sh('gh', [
          'pr',
          'create',
          '--repo',
          REPO,
          '--base',
          'main',
          '--head',
          head,
          '--title',
          `${version}: the release`,
          '--body',
          body,
        ]),
      );
    },
  };
  if (resume) say(`${branch} is prepared: resuming before the push (the prose left, the human gates)`);
  for (const name of resume ? RESUME_STEPS : PREPARE_STEPS) {
    if (opts.dryRun) {
      say(`would run: ${name}`);
      continue;
    }
    say(`${name}…`);
    try {
      steps[name]();
    } catch (e) {
      console.error(`✖  ${name}: ${(e as Error).message}`);
      console.error(wayBack(name, version, branch, 'remote' in target ? target : undefined));
      process.exit(1);
    }
  }
  if (opts.dryRun) process.exit(refusals.length ? 1 : 0);
  say(`✔  ${branch} prepared: npm run release -- check ${version} says what is left`);
  if (opts.pr) say(nextSteps(version, remote));
}

async function check(version: string) {
  const items = await checkRelease(version, { read, todoFiles: () => todoFiles(version), run: capture });
  for (const i of items)
    console.log(`${i.ok ? '✔' : '✖'}  ${i.what}${i.ok ? '' : `:\n${i.detail.replace(/^/gm, '     ')}`}`);
  process.exit(items.every((i) => i.ok) ? 0 : 1);
}

if (process.argv[1]?.endsWith('prepare.ts')) {
  const [verb, version, ...rest] = process.argv.slice(2);
  const opt = (k: string) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  if (verb === 'prepare' && version)
    prepare(version, {
      name: opt('name') ?? '',
      date: opt('date') ?? today(),
      pr: !rest.includes('--no-pr'),
      dryRun: rest.includes('--dry-run'),
    });
  else if (verb === 'check' && version) await check(version);
  else if (verb && /^\d+\.\d+\.\d+$/.test(verb)) {
    // The release itself, after the release pull request's merge (4.5.4, part D): tools/release/release-run.ts.
    const { runRelease } = await import('./release-run');
    const all = process.argv.slice(3);
    const key = all.find((a) => a.startsWith('--key='))?.slice(6);
    const commit = all.find((a) => a.startsWith('--commit='))?.slice(9);
    try {
      await runRelease(verb, {
        ...(key ? { key } : {}),
        ...(commit !== undefined ? { commit } : {}),
        startCandidate: all.includes('--start-candidate'),
        docsRevision: all.includes('--docs-revision'),
        dryRun: all.includes('--dry-run'),
      });
    } catch (e) {
      console.error(`✖  ${(e as Error).message}`);
      process.exit(1);
    }
  } else {
    console.error(
      'usage: npm run release -- <x.y.z> [--key=<key.pub>] [--start-candidate] [--docs-revision] [--reverify] [--commit=<sha>] [--dry-run] | prepare <x.y.z> --name="<name>" [--date=YYYY-MM-DD] [--no-pr] [--dry-run] | check <x.y.z>',
    );
    process.exit(2);
  }
}
