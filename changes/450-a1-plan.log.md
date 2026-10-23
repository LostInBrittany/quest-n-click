## 4.5.0, A1: the wiki's plan, D50, ADR 0030

- **The ask.** The maintainer enabled the GitHub wiki and asked for an exhaustive plan, in French and in English, for a wiki covering installation, first use, contributing, the Studio, and a team Studio on Clever Cloud.
- **The plan.** Three revisions, each after a review by the maintainer, give `docs/dev/PLAN-4.5-WIKI.md`. It rests on six deliverables before any move:
  - the manifest and its four indexes;
  - the coverage matrix of the old pages;
  - the documentation access contract for MCP and the package;
  - versions and proofs;
  - publication and switch-over;
  - an acceptance test made of real questions, with counter-examples.

  Three end-to-end demonstrators then come before the writing.
- **Recorded.** D50 holds the decisions, the bootstrap exception and the D37 yes for v4.5.0. ADR 0030 records the architecture.
- **Found while planning.** `read_doc` has nothing to read in a created project: the package ships no docs. 4.5.0 fixes it.

→ next: the wiki spike (the maintainer creates the wiki's first page, then the push token, per-folder sidebars, `<a name>` anchors and images are tried), then A2, the manifest.
