# La référence de qualité

`tests/quality-baseline.json` fige ce que fait le moteur : sur un ensemble de jeux, le témoin que trouve le solveur et
l'empreinte de l'état après chaque entrée, le verdict de la preuve et son nombre d'états, chaque sauvegarde de référence
jouée jusqu'au bout, la surface publique, le nombre de tests et le JavaScript de la première visite. Une refonte la
laisse identique ; un changement de comportement la réécrit volontairement et le dit.

<a name="what-you-get"></a>

## Ce que vous obtenez

Soit `✔ same behaviour as tests/quality-baseline.json` pour un changement censé garder le comportement, soit une
référence réécrite dont vous connaissez chaque ligne qui a bougé et que vous assumez dans le fragment du CHANGELOG.

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur. La référence date de la 4.1.0 « Clarity » (figée avant le découpage du moteur en modules) ; le
rapport « ratcheted » de la 4.1.3 ; les chiffres des README de la 4.1.8 ; la section d'installation du README de la
4.1.20 ; `heroes` parmi les jeux mesurés de la 4.4.0 ; les deux écritures (celle d'une pull request, celle de la
release) et la première visite en octets de la 4.6.0 (#405).

Ce qu'elle mesure, en 4.4.0 ([`tools/quality-baseline.ts`](../../tools/quality-baseline.ts)) :

| Partie | Ce qui est figé | Règle |
|---|---|---|
| `games` (16) | `demo`, `reference`, `heroes`, les cinq classiques, trois fixtures d'ordre partiel, et les fixtures `world`, `cast`, `scale`, `picture`, `mini` : le témoin (statut, terminé, nombre d'entrées, une empreinte des empreintes après chaque entrée) et la preuve (statut, états, blocages) | identique |
| `saves` (43 en 4.4.0) | chaque sauvegarde de référence de `tests/fixtures/saves/demo-*.json`, chargée et jouée jusqu'au bout : terminée, entrées, dernière empreinte | identique |
| `surface.api` | une empreinte de `tests/api-surface.json` (l'API publique et les outils MCP) | identique |
| `tests` | fichiers de test et déclarations de test (`it(`, `test(`, `.each`, `.skipIf`, `.runIf`), écrits par la release | moins de déclarations échouent ; plus, c'est un avertissement |
| `bundle` | le JavaScript de la première visite, compressé, d'après `verify:dist` (avec `--dist`) : `initialJsBytes`, et `initialJsKB` arrondi pour les README, écrits par la release | un avertissement, en octets, dans les deux sens : le budget `assetBudgets.initialJsKB` du jeu fait la vérification |

Elle tient aussi à jour deux endroits des README : les chiffres entre les marqueurs `<!-- metric:tests -->`,
`metric:initialJsKB` et `metric:referenceStates` (3257 déclarations, 136 Ko et 288 états en 4.4.0), et l'URL de
l'archive entre `<!-- install:begin -->` et `<!-- install:end -->`.

Depuis la 4.6.0 (#405), une pull request ne réécrit jamais un chiffre que toutes les autres pull requests réécrivent
aussi. `npm run quality:baseline` n'écrit que le comportement : les jeux, les sauvegardes de référence, la surface, et le
seul chiffre des README qui soit du comportement, `referenceStates`. Les nombres de tests, la première visite et les
autres chiffres des README sont écrits par la release, `npm run quality:baseline -- --release --dist` (l'étape
`quality baseline` de `npm run release -- prepare`, après un build). La première visite est tenue par le budget de
chaque jeu, comparé en octets (`initialJsKB` × 1024) : un octet de trop échoue, avec une marge d'environ 2 Ko au-dessus
de la taille mesurée, que chaque release remet à zéro volontairement.

<a name="prerequisites"></a>

## Prérequis

Un dépôt préparé ([Préparer son poste de développement](contribute.setup.md)). Pour `--dist`, un build de production du
jeu d'exemple dans `dist/` (`npm run build:game`).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur votre machine. Le job `check` de la CI lance
`npm run quality:baseline -- --check --dist` à chaque changement.

<a name="steps"></a>

## Étapes

<!-- step: check -->
1. **Comparez.**

   ```sh
   # dans le dépôt du moteur
   npm run quality:baseline -- --check
   npm run build:game && npm run quality:baseline -- --check --dist   # avec la première visite, comme la CI
   ```

   Elle résout et rejoue chaque jeu (`quality baseline: solving and replaying…`), puis affiche `✔ same behaviour…`, ou
   une ligne `✖` par différence, par exemple `demo witness.digests: … → …` (un état après une entrée diffère :
   `npm run replay` sur le témoin nomme l'entrée), `golden save demo-3.4.0.json last: … → …`,
   `tests/api-surface.json: the public API or the MCP tools changed`, ou `README.md: a figure is not the baseline's`.
   Une ligne `⚠` (plus de tests, la première visite depuis la release en octets) n'est pas un échec.

<!-- step: decide -->
2. **Décidez ce qu'est une différence.**
   - Votre changement devait garder le comportement (une refonte, un renommage, une accélération) : une différence est
     une régression. Trouvez-la ; `npm run replay` sur le témoin nomme la première entrée dont l'état diffère.
   - Votre changement modifie le comportement volontairement (une règle, une commande, un changement du solveur) :
     passez à l'étape 3. Un nouveau test ou un bundle qui a bougé ne demande aucune réécriture : la release écrit ces
     chiffres.

<!-- step: rewrite -->
3. **Réécrivez-la :**

   ```sh
   # dans le dépôt du moteur
   npm run quality:baseline
   ```

   Une réécriture dit ce qu'elle déplace, avant d'écrire : `⚠ behaviour moved: …` pour une empreinte, un verdict, une
   sauvegarde ou la surface, et `⚠ kept for the release: …` pour plus de tests ou une première visite qui a bougé. Elle
   écrit le comportement dans `tests/quality-baseline.json` et garde les nombres de tests et la ligne `bundle` tels que
   la release les a écrits ; elle ne touche aux README que si le nombre d'états de la preuve de référence a bougé. La
   release lance à la place `npm run quality:baseline -- --release --dist`, qui écrit tous les chiffres, ceux des README
   et leur URL d'installation (`✔ README.md: the figures written`), et affiche `✔ ratcheted: …` ; sans `--dist`, le
   `bundle` précédent est gardé.

<!-- step: own -->
4. **Assumez-la.** Committez le JSON et les README avec le changement ; dites dans le fragment du CHANGELOG ce qui a
   bougé et pourquoi (« le témoin du chapitre de référence change », « la première visite passe de 125 à 132 Ko »).
   `tests/quality-baseline.json` est un fichier que relit le mainteneur (`CODEOWNERS`).

> [!LIMIT id=what-baseline-covers]
> La référence ne fige que ces jeux, ces sauvegardes et ces chiffres. Un comportement qu'aucun jeu mesuré n'exerce peut
> changer sans la faire bouger ; une nouvelle mécanique va dans une fixture ou un jeu de la liste, ou dans son propre
> test.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`npm run quality:baseline -- --check --dist` se termine par `✔ same behaviour as tests/quality-baseline.json: 16 games,
n golden saves, n test declarations, first visit n KB gzipped (n bytes)` et le code de sortie 0, avec une ligne `⚠`
pour ce qui a bougé depuis la release (plus de tests, la première visite en octets), qui n'est pas un échec.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `README.md: a figure is not the baseline's (npm run quality:baseline -- --release writes it)` | Les chiffres des README et `tests/quality-baseline.json` ne s'accordent pas (l'un modifié sans l'autre) | `git restore README.md README.fr.md` ; sur une branche de release, `npm run quality:baseline -- --release --dist` |
| `⚠ tests: n → m declarations (the release ratchets it)` | Plus de tests : pas un échec (4.5.4 : les README sont vérifiés contre la référence commitée) | Rien dans une pull request ; la release la réécrit |
| `⚠ first visit's JavaScript: +n bytes since the release` | La première visite a bougé depuis le chiffre de la release : un avertissement (4.6.0) | Rien dans une pull request tant que le budget du jeu tient ; la release l'examine |
| `tests: n declarations → m (a test was removed)` | Un test a été supprimé ou fusionné | Remettez-le, ou assumez le retrait dans la pull request et réécrivez |
| `first visit's JavaScript: n KB gzipped (n bytes), n bytes over initialJsKB n` (`verify:dist`, `build:game`) | La première visite a mangé la marge du jeu | Chargez le nouveau code à la demande ([Frontières d'import](contribute.boundaries.md#layers)), ou relevez le budget dans les `assetBudgets` du jeu et assumez la hausse |
| `<jeu>: new game, not in the baseline` | Un jeu a été ajouté à la liste | Réécrivez-la |
| `README.md: the install section names another version` | La version de `package.json` a changé (une release) | Réécrivez-la : c'est la branche de release qui le fait |

<a name="files-changed"></a>

## Fichiers ou données modifiés

`tests/quality-baseline.json` ; `README.md` et `README.fr.md` si la preuve de référence a bougé, ou avec `--release`.
`--check` n'écrit rien.

<a name="recovery"></a>

## Revenir en arrière

`git restore tests/quality-baseline.json README.md README.fr.md` annule une réécriture non voulue.

<a name="references"></a>

## Références

- [`tools/quality-baseline.ts`](../../tools/quality-baseline.ts), [`tests/quality-baseline.json`](../../tests/quality-baseline.json).
- [Avant une pull request](contribute.before-a-pr.md#steps), [La boucle de développement](contribute.dev-loop.md),
  [Mesures de performance](contribute.benchmarks.md).
