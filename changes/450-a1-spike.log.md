## 4.5.0, A1 spike: the wiki takes per-folder sidebars, `<a name>` anchors and a deploy key

- **Setup by the maintainer.**
  - They created the wiki's first page.
  - They added a write deploy key, `wiki publisher (docs-publish)`; their test pushed to `quest-n-click.wiki.git`.
  - They created the `docs-publish` environment: required reviewer `wanoo`, branches `main` and `docs/*`, secret `WIKI_DEPLOY_KEY`.
- **Results.** Test pages pushed to the real wiki, then removed, showed:
  - `en/` and `fr/` sidebars are honoured per folder;
  - `<a name>` anchors keep one id in both languages, and a link scrolls to them (clicked by the maintainer);
  - images resolve from the wiki root;
  - accented names work;
  - the wiki's branch is `master`.
- The plan records these results (§4.5). The fallback to heading slugs is dropped.

→ next: the maintainer's A7 stop (replay the demonstrators, the human reviews), then phase B.
