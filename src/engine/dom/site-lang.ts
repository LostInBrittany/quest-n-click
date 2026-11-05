// The page's title, description and PWA manifest in the language being played (4.7.0): site.json's `i18n` gives them
// per language, the site plugin (tools/vite/plugins.ts) writes them into index.html as `#qnc-site-i18n` and emits one
// `manifest.<lang>.webmanifest` per language; `bootGame` applies the chosen language's here. The language switch in
// Settings reloads the page, so it applies there too. The HTML as served (what a link preview reads) stays in the
// game's own language.

/** site.json's texts in one language. @public */
export interface SiteText {
  title?: string;
  shortName?: string;
  description?: string;
}

/** site.json's `i18n`: its texts in other languages than the game's own. @public */
export type SiteTexts = Record<string, SiteText>;

/** The texts the site plugin wrote into the page (`#qnc-site-i18n`); none when absent or unreadable. */
export function readSiteTexts(doc: Document | undefined = globalThis.document): SiteTexts | undefined {
  const raw = doc?.getElementById('qnc-site-i18n')?.textContent;
  if (!raw) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as SiteTexts) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The page in `lang`: its title, description (and their `og:` copies) and its manifest link (`manifest.<lang>
 * .webmanifest`, which the plugin emits for every language it has texts for). Nothing for a language without texts.
 * @public
 */
export function applySiteLang(doc: Document, site: SiteTexts | undefined, lang: string | undefined): void {
  const t = lang ? site?.[lang] : undefined;
  if (!lang || !t) return;
  const meta = (sel: string, v: string | undefined) => {
    if (v !== undefined) doc.querySelector(sel)?.setAttribute('content', v);
  };
  if (t.title !== undefined) doc.title = t.title;
  meta('meta[property="og:title"]', t.title);
  meta('meta[name="description"]', t.description);
  meta('meta[property="og:description"]', t.description);
  const link = doc.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const href = link?.getAttribute('href');
  if (link && href && /manifest\.webmanifest$/.test(href))
    link.setAttribute('href', href.replace(/manifest\.webmanifest$/, `manifest.${lang}.webmanifest`));
}
