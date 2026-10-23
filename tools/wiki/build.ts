// `npm run wiki -- build --target wiki` (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 "Generated from the manifest",
// §4.5.6 links by output, §4.5.7 read-only wording): the folder a publication pushes to the GitHub wiki. Generated
// whole from `wiki/`, never edited there: `Home.md` (both languages side by side), a sidebar per language grouped by
// domain, a footer that says the page is generated and how to change it, one file per published page under its public
// URL with a header (the twin's URL, type, audience, context, versions), and the four indexes (by task, by symptom,
// by identifier, by vocabulary). Published means `ready`; `--preview` adds the `draft` pages under a banner. A link to
// another page's source becomes its public URL in the same language; a link to a page not published keeps its text
// and says it is coming; a link to a repository file points at `blob/<productCommit>/` so it shows the code of the
// product the page describes, not today's `main`.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type Glossary, readGlossary } from './glossary';
import {
  type Audience,
  type Context,
  DOMAIN_IDS,
  type Domain,
  type Lang,
  LANGS,
  type Manifest,
  type Page,
  type PageType,
  typesOf,
} from './manifest';
import { repoPathOf } from './page';

const REPO_URL = 'https://github.com/wanoo/quest-n-click';
/** The generated index pages: their ids in the manifest; they have no source file and are always built. */
export const GENERATED_INDEXES = ['index.by-task', 'index.by-symptom', 'index.identifiers', 'index.glossary'] as const;

export interface BuildOptions {
  wikiDir: string;
  outDir: string;
  manifest: Manifest;
  /** Include the `draft` pages, each under a banner (a preview artifact, never the public wiki). */
  preview: boolean;
  productVersion: string;
  /** The commit of the `wiki/` sources built. */
  docRevision: string;
  /** The commit of the product the pages describe: links to the code point there. */
  productCommit: string;
}

const L = {
  en: {
    domains: {
      index: 'Index',
      start: 'Start',
      play: 'Play',
      install: 'Install',
      create: 'Create a game',
      engine: 'Engine',
      studio: 'Local Studio',
      team: 'Team Studio',
      clever: 'Clever Cloud',
      bridge: 'Reality Bridge and connectors',
      contribute: 'Contribute',
      reference: 'Reference',
      help: 'Help',
    } satisfies Record<Domain, string>,
    types: {
      tutorial: 'tutorial',
      howto: 'how-to',
      reference: 'reference',
      explanation: 'explanation',
      troubleshooting: 'troubleshooting',
      index: 'index',
    } satisfies Record<PageType, string>,
    audiences: { player: 'player', author: 'author', admin: 'admin', contributor: 'contributor' } satisfies Record<
      Audience,
      string
    >,
    contexts: {
      'engine-repo': 'engine repository',
      'created-project': 'created project',
      'studio-local': 'local Studio',
      'studio-demo': 'demo Studio',
      'studio-hosted': 'hosted Studio',
      bridge: 'Reality Bridge',
      player: "player's browser",
    } satisfies Record<Context, string>,
    colon: ':',
    synonyms: 'also',
    twinLanguage: 'French',
    type: 'Type',
    audience: 'Audience',
    context: 'Context',
    appliesFrom: 'Applies from',
    other: 'Français',
    home: 'Home',
    draft: '**Draft**: this page is not reviewed yet. It is shown in a preview only, never in the published wiki.',
    coming: 'coming',
    edit: 'Edit the source of this page',
    report: 'Report an error',
    noPage: 'No published page yet.',
    byTask: 'I want to…',
    bySymptom: 'I see…',
    otherNames: 'Other names',
  },
  fr: {
    domains: {
      index: 'Index',
      start: 'Démarrer',
      play: 'Jouer',
      install: 'Installer',
      create: 'Créer un jeu',
      engine: 'Moteur',
      studio: 'Studio local',
      team: "Studio d'équipe",
      clever: 'Clever Cloud',
      bridge: 'Reality Bridge et connecteurs',
      contribute: 'Contribuer',
      reference: 'Référence',
      help: 'Aide',
    } satisfies Record<Domain, string>,
    types: {
      tutorial: 'tutoriel',
      howto: 'procédure',
      reference: 'référence',
      explanation: 'explication',
      troubleshooting: 'dépannage',
      index: 'index',
    } satisfies Record<PageType, string>,
    audiences: {
      player: 'joueur',
      author: 'auteur',
      admin: 'administrateur',
      contributor: 'contributeur',
    } satisfies Record<Audience, string>,
    contexts: {
      'engine-repo': 'dépôt du moteur',
      'created-project': 'projet créé',
      'studio-local': 'Studio local',
      'studio-demo': 'Studio de démo',
      'studio-hosted': 'Studio hébergé',
      bridge: 'Reality Bridge',
      player: 'navigateur du joueur',
    } satisfies Record<Context, string>,
    colon: ' :',
    synonyms: 'aussi',
    twinLanguage: 'anglais',
    type: 'Type',
    audience: 'Public',
    context: 'Contexte',
    appliesFrom: "S'applique depuis",
    other: 'English',
    home: 'Accueil',
    draft:
      "**Brouillon** : cette page n'est pas encore relue. Elle n'apparaît que dans un aperçu, jamais dans le wiki publié.",
    coming: 'à venir',
    edit: 'Modifier la source de cette page',
    report: 'Signaler une erreur',
    noPage: "Aucune page publiée pour l'instant.",
    byTask: 'Je veux…',
    bySymptom: 'Je vois…',
    otherNames: 'Autres noms',
  },
} as const;

const BLOCK_NAMES = {
  en: { LIMIT: 'Limit', GUARANTEE: 'Guarantee', MEASURE: 'Measure' },
  fr: { LIMIT: 'Limite', GUARANTEE: 'Garantie', MEASURE: 'Mesure' },
} as const;

/** The footer, with its two fields filled at build time. */
export const FOOTER_TEMPLATE = `Generated publication · publication générée — quest'n'click {{productVersion}}, documentation revision · révision de la documentation \`{{docRevision}}\`.
An edit made in this wiki is overwritten at the next publication · une modification faite dans ce wiki est écrasée à la publication suivante.
[Edit the source · Modifier la source](${REPO_URL}/tree/main/wiki) · [Report an error · Signaler une erreur](${REPO_URL}/issues/new?title=${encodeURIComponent('[bug] docs: ')})
`;

const fill = (template: string, fields: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => fields[k] ?? m);

/** The pages this build publishes: `ready`, and `draft` too in a preview. */
const publishedPages = (manifest: Manifest, preview: boolean): Page[] =>
  manifest.pages.filter((p) => p.state === 'ready' || (preview && p.state === 'draft'));

/** The page's body for one language, its links rewritten for the wiki (§4.5.6) and its blocks named. */
function rewritePage(markdown: string, lang: Lang, urls: ReadonlyMap<string, string>, productCommit: string): string {
  let fence: string | undefined;
  return markdown
    .split('\n')
    .map((line) => {
      const mark = /^\s*(```|~~~)/.exec(line)?.[1];
      if (mark) {
        fence = fence ? (fence === mark ? undefined : fence) : mark;
        return line;
      }
      if (fence) return line;
      const block = /^>\s*\[!(LIMIT|GUARANTEE|MEASURE)\s+id=([a-z0-9-]+)\]\s*$/.exec(line.trim());
      if (block) return `> **${BLOCK_NAMES[lang][block[1] as 'LIMIT']}** · \`${block[2]}\``;
      // Inline code is shown as written: only the text between backtick spans is rewritten.
      return line
        .split(/(`[^`]*`)/)
        .map((part) => (part.startsWith('`') ? part : rewriteLinks(part, lang, urls, productCommit)))
        .join('');
    })
    .join('\n');
}

function rewriteLinks(text: string, lang: Lang, urls: ReadonlyMap<string, string>, productCommit: string): string {
  return text.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, label: string, target: string) => {
    if (/^(https?:|mailto:|#)/.test(target)) return whole;
    const toPage = /^([a-z]+\.[a-z0-9-]+)\.md(#[A-Za-z0-9_-]+)?$/.exec(target);
    if (toPage) {
      const url = urls.get(toPage[1]!);
      return url ? `[${label}](${url}${toPage[2] ?? ''})` : `${label} (${L[lang].coming})`;
    }
    const [path = '', anchor] = target.split('#');
    const repoPath = repoPathOf(path);
    return repoPath ? `[${label}](${REPO_URL}/blob/${productCommit}/${repoPath}${anchor ? `#${anchor}` : ''})` : whole;
  });
}

function header(p: Page, lang: Lang): string {
  const t = L[lang];
  const twin = lang === 'en' ? 'fr' : 'en';
  const parts = [
    `[${t.other}](${p.url[twin]})`,
    `${t.type}: ${typesOf(p)
      .map((x) => t.types[x])
      .join(' + ')}`,
    `${t.audience}: ${p.audience.map((a) => t.audiences[a]).join(', ')}`,
    `${t.context}: ${p.context.map((c) => t.contexts[c]).join(', ')}`,
  ];
  if (p.versions?.appliesFrom) parts.push(`${t.appliesFrom}: ${p.versions.appliesFrom}`);
  // The labels hold no colon of their own: French puts a space before each one.
  return `> ${parts.join(' · ').replace(/: /g, `${t.colon} `)}`;
}

const pageFooter = (p: Page, lang: Lang, productVersion: string) =>
  `[${L[lang].edit}](${REPO_URL}/blob/main/wiki/${lang}/${p.id}.md) · [${L[lang].report}](${REPO_URL}/issues/new?title=${encodeURIComponent(`[bug] docs: ${p.id} (${lang}, ${productVersion})`)})`;

const link = (p: Page, lang: Lang) => `[${p.title[lang]}](${p.url[lang]})`;
const byText = (lang: Lang) => (a: { text: string }, b: { text: string }) => a.text.localeCompare(b.text, lang);

/** The four generated indexes of one language (§4.1), over the published pages only. */
function indexPages(
  manifest: Manifest,
  published: readonly Page[],
  glossary: Glossary,
  lang: Lang,
): { id: string; body: string }[] {
  const t = L[lang];
  const urls = new Set(published.map((p) => p.id));
  const list = (rows: { text: string; to: Page }[]) =>
    rows.length ? rows.sort(byText(lang)).map((r) => `- ${r.text} → ${link(r.to, lang)}`) : [t.noPage];
  const of = (types: PageType[], withTitle: boolean) =>
    published
      .filter((p) => typesOf(p).some((x) => types.includes(x)))
      .flatMap((p) => [
        ...(withTitle ? [{ text: p.title[lang], to: p }] : []),
        ...p.questions[lang].map((q) => ({ text: q, to: p })),
      ]);
  const identifiers = published.flatMap((p) => p.identifiers.map((i) => ({ text: `\`${i}\``, to: p })));
  const vocabulary: string[] = glossary.terms
    .map((term) => ({ term, text: term[lang].term }))
    .sort(byText(lang))
    .map(({ term }) => {
      const side = term[lang];
      const pages = term.pages
        .filter((id) => urls.has(id))
        .map((id) => link(manifest.pages.find((p) => p.id === id)!, lang));
      const other = term[lang === 'en' ? 'fr' : 'en'].term;
      const names = [
        ...(side.synonyms.length ? [`${t.synonyms}${t.colon} ${side.synonyms.join(', ')}`] : []),
        `${t.twinLanguage}${t.colon} ${other}`,
      ];
      return `- **${side.term}** (${names.join(lang === 'fr' ? ' ; ' : '; ')}). ${side.definition}${pages.length ? ` → ${pages.join(', ')}` : ''}`;
    });
  const aliases = published.flatMap((p) => p.aliases[lang].map((a) => ({ text: a, to: p })));
  const bodies: Record<(typeof GENERATED_INDEXES)[number], string[]> = {
    'index.by-task': [`## ${t.byTask}`, '', ...list(of(['tutorial', 'howto'], true))],
    'index.by-symptom': [`## ${t.bySymptom}`, '', ...list(of(['troubleshooting'], false))],
    'index.identifiers': list(identifiers),
    'index.glossary': [
      ...(vocabulary.length ? vocabulary : [t.noPage]),
      ...(aliases.length ? ['', `## ${t.otherNames}`, '', ...list(aliases)] : []),
    ],
  };
  return GENERATED_INDEXES.flatMap((id) => {
    const page = manifest.pages.find((p) => p.id === id);
    if (!page) return [];
    return [{ id, body: `# ${page.title[lang]}\n\n${header(page, lang)}\n\n${bodies[id].join('\n')}\n` }];
  });
}

/** The pages a sidebar or Home lists: the published ones and the generated indexes. */
const listed = (manifest: Manifest, published: readonly Page[]) => {
  const ids = new Set([...published.map((p) => p.id), ...GENERATED_INDEXES]);
  return manifest.pages.filter((p) => ids.has(p.id));
};

function sidebar(manifest: Manifest, published: readonly Page[], lang: Lang): string {
  const pages = listed(manifest, published);
  const out = [`**[${L[lang].home}](Home)**`, ''];
  for (const d of DOMAIN_IDS) {
    const inDomain = pages.filter((p) => p.domain === d);
    if (!inDomain.length) continue;
    out.push(`**${L[lang].domains[d]}**`, '', ...inDomain.map((p) => `- ${link(p, lang)}`), '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

function home(manifest: Manifest, published: readonly Page[]): string {
  const pages = listed(manifest, published);
  const column = (lang: Lang) => {
    const out: string[] = [];
    for (const d of DOMAIN_IDS) {
      const inDomain = pages.filter((p) => p.domain === d);
      if (!inDomain.length) continue;
      // The entry points first: a tutorial, then a how-to, then the rest, four at most (the four indexes fit).
      const order: PageType[] = ['tutorial', 'howto', 'troubleshooting', 'explanation', 'reference', 'index'];
      const first = [...inDomain].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).slice(0, 4);
      out.push(`**${L[lang].domains[d]}**${L[lang].colon} ${first.map((p) => link(p, lang)).join(' · ')}`);
    }
    return out.length ? out : [L[lang].noPage];
  };
  return `# quest'n'click

| Français | English |
|---|---|
| La documentation de quest'n'click, en français. | The quest'n'click documentation, in English. |
| ${column('fr').join('<br>')} | ${column('en').join('<br>')} |

## Chercher · Search

La recherche du wiki (en haut à droite) lit le texte de chaque page. Quelques exemples ·
The wiki's search (top right) reads the text of every page. A few examples:

- \`423\` : un enregistrement refusé dans le Studio d'équipe · a save refused in the team Studio
- \`STUDIO_SESSION_KEY\` : une variable d'environnement · an environment variable
- \`verrou\` ou \`lease\` : un mot du glossaire, dans l'une ou l'autre langue · a glossary word, in either language
- \`FR-Creer\` ou \`EN-Create\` : toutes les pages d'un domaine · every page of a domain

Les pages françaises commencent par \`FR-\`, les anglaises par \`EN-\` · French pages start with \`FR-\`, English ones with \`EN-\`.
`;
}

/**
 * Empties the output folder before a build, so a page withdrawn from the manifest leaves no file behind. A folder
 * that holds something other than a previous build (no `Home.md`) is refused rather than emptied; a `.git` folder (a
 * clone of the wiki's repository) is kept.
 */
function clearOutput(outDir: string): void {
  if (!existsSync(outDir)) return;
  const entries = readdirSync(outDir);
  if (entries.length && !entries.includes('Home.md'))
    throw new Error(`${outDir} is not empty and holds no previous build (no Home.md): choose an empty folder`);
  for (const name of entries) if (name !== '.git') rmSync(resolve(outDir, name), { recursive: true, force: true });
}

/** Writes the wiki folder; returns the files written, relative to `outDir`, sorted. */
export function buildWiki(o: BuildOptions): string[] {
  const published = publishedPages(o.manifest, o.preview);
  const { glossary } = readGlossary(o.wikiDir);
  const files = new Map<string, string>();
  for (const lang of LANGS) {
    const urls = new Map(published.map((p) => [p.id, p.url[lang]]));
    for (const id of GENERATED_INDEXES) {
      const p = o.manifest.pages.find((x) => x.id === id);
      if (p) urls.set(id, p.url[lang]);
    }
    for (const p of published) {
      const source = readFileSync(resolve(o.wikiDir, lang, `${p.id}.md`), 'utf8');
      const body = rewritePage(source, lang, urls, o.productCommit).trim();
      // The header goes under the page's title when it opens with one, the draft banner above the header.
      const top = `${p.state === 'draft' ? `> ${L[lang].draft}\n\n` : ''}${header(p, lang)}`;
      const [first = '', ...rest] = body.split('\n');
      const page = first.startsWith('# ') ? `${first}\n\n${top}\n${rest.join('\n')}` : `${top}\n\n${body}`;
      files.set(`${lang}/${p.url[lang]}.md`, `${page}\n\n---\n\n${pageFooter(p, lang, o.productVersion)}\n`);
    }
    for (const index of indexPages(o.manifest, published, glossary, lang)) {
      const p = o.manifest.pages.find((x) => x.id === index.id)!;
      files.set(`${lang}/${p.url[lang]}.md`, index.body);
    }
    files.set(`${lang}/_Sidebar.md`, sidebar(o.manifest, published, lang));
  }
  files.set('Home.md', home(o.manifest, published));
  files.set('_Footer.md', fill(FOOTER_TEMPLATE, { productVersion: o.productVersion, docRevision: o.docRevision }));
  clearOutput(o.outDir);
  for (const [rel, content] of files) {
    const file = resolve(o.outDir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return [...files.keys()].sort();
}
