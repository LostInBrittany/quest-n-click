### Release

A release's prose is mostly written by `npm run release -- prepare`: the LOG entry's facts, the passes sheet, and the
CHANGELOG's intro and README line from the `### Release` lines a pull request leaves in its fragment, for maintainers.

### Release (fr)

La prose d'une release est en grande partie écrite par `npm run release -- prepare` : les faits de l'entrée du LOG,
la feuille des passes, l'introduction du CHANGELOG et la ligne du README tirées des lignes `### Release` qu'une pull
request laisse dans son fragment, pour les mainteneurs.

### Changes

- **`prepare` writes the release's prose it holds the facts of (next, #410)**: the LOG's release entry gets its
  bullets filled (the pull requests merged since the previous tag, the fragments and main's commit, the upgrade notes'
  section, the acks folded, the fixtures, the passes, the signature) and the passes sheet its intro when no pass
  changed. A fragment may carry `### Release` (and `### Release (fr)`), one or two sentences that `prepare` joins into
  the CHANGELOG's intro and the README's current-release line; `changes -- --check` checks their shape and still
  refuses any other heading. What stays a `TODO(release)`: the LOG entry's title, its request and its next, the
  upgrade notes' opener when `prepare` appends the section, and an intro or README line no fragment gave a line for. On
  the 4.5.3 fixture, 16 markers become 5.
