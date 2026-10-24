# Paquets npm

Le moteur se livre en cinq paquets npm, empaquetés depuis les fichiers que git suit par
[`scripts/pack.mjs`](../../scripts/pack.mjs) et joints à chaque release GitHub. Cette page dit ce que contient chaque
paquet, comment les paquets sont vérifiés, et où en est leur publication sur le registre npm. Pour les installer en
tant qu'utilisateur : [Référence du paquet](install.package.md).

<a name="packages"></a>

## Les cinq paquets

| Paquet (archive) | Ce qu'il contient | Depuis |
|---|---|---|
| `@quest-n-click/engine` (`quest-n-click-<v>.tgz`) | Le moteur (`src/`), ses pages, ses outils, la commande `quest-n-click`, le modèle de jeu (`games/_template/`), et depuis la 4.5.0 son bundle de documentation `docs-bundle/` ; jamais un jeu de ce dépôt, un test, une page source de la doc ni un build | 3.9 |
| `@quest-n-click/create` (`create-quest-n-click-<v>.tgz`) | `npm init @quest-n-click <dossier>`, qui lance `quest-n-click create` | 3.9 |
| `@quest-n-click/bridge` (`quest-n-click-bridge-<v>.tgz`) | Le Reality Bridge de référence (un module, ses politiques) : un jeu qui n'en fait pas tourner ne l'installe jamais | 4.1.1 |
| `@quest-n-click/connectors` (`quest-n-click-connectors-<v>.tgz`) | Les connecteurs du monde extérieur (un module, son worker MIME) : ceux d'un opérateur, jamais d'un jeu | 4.1.9 |
| `@quest-n-click/studio-server` (`quest-n-click-studio-server-<v>.tgz`) | Le Studio en ligne et son worker (deux commandes, la page du Studio) : celui d'un opérateur, à côté du moteur | 4.2.1 |

Le paquet du moteur ne prend que des chemins suivis sous ses racines (`src/`, `tools/`, `studio-server/`, une partie de
`bridge/src/`, `cli/`, `games/_template/`, les icônes et polices, `index.html`, `studio.html`, `vite.config.ts`,
`tsconfig.json`, `requirements.txt`, `LICENSE`). Un fichier non suivi sous l'une de ces
racines arrête l'empaquetage (« git add or commit them, or add them to .gitignore ») au lieu d'être oublié en silence.
Le Bridge, les connecteurs et le Studio Server portent leur verrou versionné en `npm-shrinkwrap.json` ; un verrou qui ne
correspond plus à son manifeste arrête l'empaquetage : `npm run locks` le refait (relire le diff, le commiter), et
`npm run locks -- --check` dit, sans réseau, si chaque verrou correspond encore.

De la 4.2.5 à la 4.2.x, chaque paquet était aussi empaqueté sous son ancien nom web-scumm, un alias aux mêmes fichiers
et à la même version (D47). La 4.3.0 n'empaquette plus que les nouveaux noms ; `npx quest-n-click migrate` fait quitter
les anciens à un jeu.

À partir de la 4.5.2, les paquets sont nommés sous le scope de l'organisation npm (D53) : une organisation ne possède
que des paquets à scope, donc les cinq noms appartiennent à `quest-n-click`, dont les propriétaires peuvent chacun
approuver une publication. De la 4.2.5 à la 4.5.1, ils s'appelaient `quest-n-click`,
`create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connectors` et `quest-n-click-studio-server` : ces noms
sont gardés comme pointeurs dépréciés vers les noms à scope. Les commandes gardent leur nom (`quest-n-click`,
`create-quest-n-click`, `quest-n-click-bridge`…), et les archives jointes à une release aussi : `scripts/pack.mjs`
renomme le `quest-n-click-engine-<v>.tgz` de npm en `quest-n-click-<v>.tgz`, si bien que les fichiers, les sommes et
les attestations d'une release gardent leur nom. Chaque manifeste porte `publishConfig.access: public`, son
`repository` et ses `engines`.

```sh
# dans le dépôt du moteur
npm run pack                                   # les cinq archives dans .cache/pack
node scripts/pack.mjs --out=.cache/pack --publish-dry-run   # et ce que `npm publish` enverrait pour chacune
```

<a name="how-it-is-checked"></a>

## Comment les paquets sont vérifiés

- **`npm run fresh-install`** (job de CI `fresh-install`, quand le plan dit qu'un paquet, le modèle ou un chemin
  d'écriture a changé) : empaquette le moteur, crée un jeu depuis le modèle empaqueté dans un dossier vide hors du
  dépôt, installe l'archive, lance `assets`, `verify` et `build` (chaque fichier de `dist/` justifié), et joue le jeu
  jusqu'à sa fin dans Chromium. Un fichier du nouveau projet qui nomme le dépôt le fait échouer.
- **`npm run external-consumer`** (job de CI `external-consumer`, et dans le candidat sous Ubuntu, macOS et Windows sur
  les archives du candidat lui-même, `--tarballs=`) : les archives utilisées comme un tiers les utilise. Il lit chaque
  archive (nom, version, licence, binaires, exports, aucune dépendance `file:` ni `link:`, aucun chemin du dépôt ; les
  fichiers du bundle de documentation contre leur sha256) ; crée un jeu sur une release plus ancienne (`--from`, 4.1.17
  par défaut), le fait passer au candidat comme son auteur le ferait (désinstaller l'ancien paquet, installer
  `@quest-n-click/engine`, `npx quest-n-click migrate`), joue une ancienne sauvegarde et une nouvelle partie jusqu'à la fin ;
  appelle `read_doc`, `list_docs` et `search_docs` par un vrai client MCP en stdio ; lance `create-quest-n-click` depuis son archive ;
  installe le Bridge (init, doctor, serve sur SQLite, et sur Postgres quand `CONSUMER_PG_URL` est défini) et les
  connecteurs, puis un webhook email signé accepté, le même message vu comme doublon, une mauvaise signature refusée.
- **`--publish-dry-run`** dans `release-check` et dans le job `pack` du candidat : ce que `npm publish` enverrait.
- **SBOM** : le candidat fait un SBOM CycloneDX par archive (`scripts/sbom.mjs`), depuis ce que l'archive contient.

<a name="npm-publishing"></a>

## La publication sur npm : pas encore faite

Chaque release joint les cinq archives ; **aucune n'est publiée sur le registre npm** à la 4.5.1. On installe depuis
l'archive de la release ([Installer depuis l'archive de la release](install.from-archive.md)). Les étapes ci-dessous
ont été écrites en 4.1.20 pour une 4.2.x ; la 4.2.0 n'a été publiée que sur GitHub Releases (D38), parce que chaque
étape demandait la 2FA du mainteneur, et aucune version suivante ne les a encore jouées. La 4.5.2 nomme les paquets
sous l'organisation (D53), dont les deux propriétaires peuvent chacun approuver ; l'étape de publication de
`release.yml` et un canal `next` suivent dans une pull request ultérieure de #283.

> [!LIMIT id=not-on-npm]
> À la 4.5.1, `npm install @quest-n-click/engine` depuis le registre n'installe pas ce projet : les noms à scope ne
> portent qu'une version de réservation (`0.0.0-bootstrap.0`), pas le produit. Utilisez les fichiers `.tgz` de la
> release.

<a name="npm-names"></a>

### Les noms, surveillés chaque nuit

Les cinq noms à scope (`@quest-n-click/engine`, `@quest-n-click/create`, `@quest-n-click/bridge`,
`@quest-n-click/connectors`, `@quest-n-click/studio-server`) et les anciens (`web-scumm`, `create-web-scumm`,
`web-scumm-bridge`, `web-scumm-connectors`, `web-scumm-studio-server`) sont vérifiés chaque nuit par le job
`npm-names` de `.github/workflows/nightly.yml`, qui ne bloque jamais : chacun est « still free » (un 404), « ours »
(publié par exactement un propriétaire de l'organisation), ou un avertissement « taken » dans le résumé du run, pour
que les mainteneurs agissent. Les propriétaires sont une liste, `OWNERS` dans `tools/release/preflight.mjs` et sa
copie dans le job : npm ne montre les membres d'une organisation qu'à ses membres, et la CI n'a pas de jeton.
Aujourd'hui elle contient `lostinbrittany` ; l'utilisateur npm d'Erwan s'y ajoute quand il rejoint l'organisation. Les noms sans scope de la 4.2.5 à la 4.5.1 (`quest-n-click`,
`create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connectors`, `quest-n-click-studio-server`) sont des
pointeurs : le job attend de chacun qu'il soit à un propriétaire et déprécié, prévient quand l'un n'est pas déprécié
ou appartient à un tiers, et note celui qui est encore libre (à réserver). `create-quest-n-click` fait exception, c'est
un **relais** : publié sur le compte d'un propriétaire, sa commande fait
`await import('@quest-n-click/create/index.mjs')`, si bien que `npx create-quest-n-click my-game` marche toujours et
lance la même chose que `npm init @quest-n-click my-game`. Le job attend de lui qu'il soit à un propriétaire et **non**
déprécié. Il faut pour cela que `@quest-n-click/create` garde `index.mjs` à sa racine et aucune carte `exports`
(`tests/pack-manifests.test.ts`).

<a name="publishing-steps"></a>

### Les étapes de publication (écrites en 4.1.20, pour une 4.2.x ultérieure)

1. **Versions.** La publication en étapes demande au moins npm 11.15.0 et Node 22.14.0 ([doc npm][staged]). release.yml
   épingle l'étape de publication à des versions **exactes** dans son env, `NPM_PUBLISH_NODE: 22.23.3` et
   `NPM_PUBLISH_NPM: 11.21.0` ; `tests/release-stable.test.ts` et `ship preflight-stable` refusent une plage. Node
   22.23.3 livre npm 10.9.9 : l'étape de publication, quand elle sera écrite, installera elle-même npm 11.21.0
   (`npm install -g npm@11.21.0`). Seuls les épinglages existent aujourd'hui.
2. **Les comptes.** L'organisation `quest-n-click` exige la 2FA de ses membres ; le compte de chaque propriétaire l'a
   activée.
3. **Bootstrap, une fois par paquet** (fait le 24 octobre 2026 pour les cinq noms à scope, tag `bootstrap`). Un paquet
   qui n'existe pas reçoit une **version de réservation**, jamais une version du produit :

   ```sh
   # dans le dossier de l'archive, depuis la session du mainteneur (ou avec un jeton stage-only)
   npm stage publish <archive of 0.0.0-bootstrap.0>
   ```

   - Mettre en scène un paquet qui n'existe pas publie un placeholder `0.0.0-stage` jusqu'à son approbation
     ([doc npm][staged]). Vérifier avec `npm view <nom>` si cela suffit à configurer le paquet. Sinon, approuver le
     bootstrap (`npm stage approve <id>`, avec la 2FA).
   - Une publication locale ne porte pas de provenance OIDC. C'est pourquoi elle ne porte jamais une version du
     produit.
4. **Trusted publishing, en stage-only.** Sur chaque paquet :

   ```sh
   # n'importe où, connecté à npm en tant que propriétaire de l'organisation
   npm trust github @quest-n-click/<name> --repo Quest-n-Click/quest-n-click --file release.yml --allow-stage-publish
   ```

   - La CI peut alors mettre en scène, jamais publier.
   - La configuration doit réussir sa première publication en moins de **deux jours**, sinon elle expire : la
     configurer juste avant le run de release qui s'en servira.
5. **Promotion.** Le run de release met chaque paquet en scène par OIDC. Un propriétaire de l'organisation promeut
   chacun avec sa 2FA (`npm stage approve <id>`, ou sur npmjs.com).
6. **Classement dual-use de `@quest-n-click/connectors`** (décidé en 4.1.20, PR 3b) :
   - la [politique dual-use][dual] de npm vise les « capacités sensibles pour la sécurité, qui peuvent ressembler à un
     logiciel malveillant » : outils de test d'intrusion, utilitaires de recherche en sécurité, obfuscation ;
   - les connecteurs sont des serveurs qu'un jeu fait tourner (une façade SSH et Telnet pour son terminal, un webhook
     et un lecteur IMAP pour l'email, un vérificateur Open Badge). Ils ne scannent rien, n'attaquent rien et ne cachent
     rien. **Ils ne sont pas déclarés dual-use** ;
   - ils passent de toute façon par la publication en étapes et une promotion 2FA, comme chaque paquet. C'est la
     méthode de publication que la politique demande au contenu dual-use ;
   - si l'analyse de npm à la publication retient ou signale le paquet, on ajoute
     `"contentPolicy": { "class": "dual-use" }` et un fichier `DISCLOSURE`. La déclaration persiste ensuite d'une
     version à l'autre.

`npm run ship -- preflight-stable --candidate=<run>` vérifie, pour chaque paquet, l'archive, le nom (à nous quand un
propriétaire de l'organisation le publie), le bootstrap, le trusted publisher, une publication OIDC prouvée, la version
pas encore publiée, et à partir de la 4.5.2 son pointeur sans scope (à un propriétaire, déprécié)
([Publier une release](contribute.releasing.md#preflight)).

[staged]: https://docs.npmjs.com/staged-publishing
[dual]: https://docs.npmjs.com/policies/dual-use/

<a name="related"></a>

## Voir aussi

- `npm run pack`, `npm run fresh-install`, `npm run external-consumer`, `npm run locks`, `npm run ship`.
- [Publier une release](contribute.releasing.md), [Référence du paquet](install.package.md),
  [Installer depuis npm](install.from-npm.md).
