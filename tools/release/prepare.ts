// npm run release -- prepare <x.y.z> --name="<name>" [--date=YYYY-MM-DD] [--no-pr] [--dry-run]
// npm run release -- check <x.y.z>
// (4.5.4, part B of docs/dev/PLAN-4.5.4-SIMPLE-RELEASE.md.) `prepare` makes the release pull request: the branch
// `release/<x.y.z>`, every file the tools already generate (version, CHANGELOG and LOG from the fragments, transition
// pages, golden save, reference run, quality baseline), the files a release branch used to write by hand (the passes
// sheet, passIssues, the CHANGELOG's heading, the LOG's release entry, the upgrade notes' section, the README's current
// release), and the pull request. It never invents prose: every part that needs a sentence carries `TODO(release)`,
// and `check` fails while one is left. The helpers below are pure and tested against 4.5.3's release commit
// (tests/release-prepare.test.ts); the commands they run are the ones 4.5.3's release ran by hand, in its order.
// @ts-expect-error: a plain .mjs module without declarations
import { REPO } from './lib.mjs';

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

/** The paragraph that opens a release's CHANGELOG section: the LOG range, the name, what it follows; the rest to write. */
export function changelogIntro(o: { version: string; name: string; previous: string; first: number; last: number }) {
  const kind = parts(o.version)[2] > 0 ? 'a patch on' : 'a minor release after';
  return `LOG #${o.first}–#${o.last}: "${o.name}", ${kind} ${o.previous}. ${TODO}: what it changes, for whom, and what a game has to do (Upgrade notes).`;
}

/** The LOG's release entry: its heading and the bullets 4.5.3's had, each to fill. */
export function logReleaseEntry(o: { n: number; date: string; version: string; name: string }) {
  const bullets = [
    'The request',
    'What ships',
    'Fragments',
    'Upgrade notes',
    'Reviews',
    'Fixtures',
    'Passes',
    'Signature',
  ];
  return [
    `## #${o.n} · ${o.date} · Claude · release · ${o.version} "${o.name}": ${TODO}`,
    '',
    ...bullets.map((b) => `- **${b}**: ${TODO}`),
    '',
    `→ next: ${TODO}`,
    '',
  ].join('\n');
}

/** The upgrade-notes page with `version` added to its lead's list of versions (`… 4.5.1 and 4.5.2 changed.`). */
export function upgradeNotesLead(page: string, previous: string, version: string, lang: 'en' | 'fr') {
  const p = previous.replace(/\./g, '\\.');
  if (lang === 'en')
    return page.replace(new RegExp(`\\s+and\\s+${p}\\s+changed\\.`), `, ${previous} and ${version} changed.`);
  return page.replace(
    new RegExp(`\\s+et\\s+la\\s+${p}\\s+ont\\s+changé\\.`),
    `, la ${previous} et la ${version} ont changé.`,
  );
}

/** A release's section of its upgrade notes: anchor, scope, heading, the text to write, the assembled bullets to start from. */
export function upgradeNotesSection(o: {
  previous: string;
  version: string;
  name: string;
  lang: 'en' | 'fr';
  bullets: readonly string[];
}) {
  const anchor = `from-${o.previous.replace(/\./g, '-')}-to-${o.version.replace(/\./g, '-')}`;
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

/** The passes sheet of `version`: the previous one's table and `field:` lines, its heading, the intro to write. */
export function passesSheet(previousSheet: string, previous: string, version: string) {
  const start = previousSheet.indexOf('<!-- field:begin -->');
  const intro = previousSheet.slice(0, start).split('\n').slice(1);
  const field = intro
    .filter((l) => l.startsWith('`npm run field:'))
    .map((l) => l.replaceAll(`--release=${previous}`, `--release=${version}`));
  return [
    `# Passes, ${version}`,
    '',
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

/** The README's current-release line, its summary to write. */
export function currentReleaseLine(lang: 'en' | 'fr', version: string, name: string) {
  const link = `[v${version} (${name})](https://github.com/${REPO}/releases/tag/v${version})`;
  return lang === 'en' ? `${LABEL.en} ${link}: ${TODO}` : `${LABEL.fr} ${link} : ${TODO}`;
}

/** The README with its current-release paragraph replaced by the new line. */
export function withCurrentRelease(readme: string, lang: 'en' | 'fr', version: string, name: string) {
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => l.startsWith(LABEL[lang]));
  if (start < 0) throw new Error(`no "${LABEL[lang]}" line`);
  let end = start + 1;
  while (end < lines.length && lines[end]!.trim() !== '') end++;
  lines.splice(start, end - start, currentReleaseLine(lang, version, name));
  return lines.join('\n');
}

/** Every `TODO(release)` left, as `file:line`. */
export function todoMarkers(files: readonly { path: string; text: string }[]) {
  return files.flatMap(({ path, text }) =>
    text.split('\n').flatMap((l, i) => (l.includes(TODO) ? [`${path}:${i + 1}`] : [])),
  );
}
