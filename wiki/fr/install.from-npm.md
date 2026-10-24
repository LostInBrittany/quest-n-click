# Installer depuis npm, une fois publié

**Le moteur n'est pas publié sur npm.** Ses paquets sont nommés sous l'organisation `quest-n-click` (D53) :
`@quest-n-click/engine`, `@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors` et
`@quest-n-click/studio-server`. Le 24 octobre 2026, chacun ne porte qu'une version de réservation, `0.0.0-bootstrap.0`,
jamais une version du produit. Les noms sans scope de la 4.5.1 et avant (`quest-n-click`, `quest-n-click-bridge`, …)
sont gardés par les mainteneurs comme pointeurs dépréciés vers les noms à scope, sauf `create-quest-n-click`, qui reste
un relais vers `@quest-n-click/create`. Tant que les notes d'une release ne
disent pas le contraire, installez depuis l'archive de la release :
[Installer depuis l'archive de la release](install.from-archive.md). Cette page dit comment savoir quand npm sera
prêt, et quelles commandes serviront alors.

<a name="what-you-get"></a>

## Ce que vous obtenez

Aujourd'hui : un moyen de vérifier, en une commande, si un paquet `@quest-n-click/engine` sur npm est bien celui du
projet. Une fois les paquets publiés : un projet de jeu créé et mis à jour avec les commandes habituelles de npm, sans URL
d'archive.

<a name="context-and-versions"></a>

## Contexte et versions

- Un **projet créé**, sur votre machine.
- Aucune version du produit n'a jamais été publiée sur npm, jusqu'à la 4.5.1 incluse. La 4.2.0 n'est partie que sur
  GitHub Releases (D38) : la publication demande la double authentification d'un mainteneur à chaque étape, et la
  4.2.0 ne l'a pas attendue. L'organisation npm `quest-n-click` (deux propriétaires, donc deux personnes peuvent
  approuver) et les noms à scope arrivent avec la 4.5.2 (D53) ; la publication elle-même suit dans une release
  ultérieure, et aucune version n'est promise.
- D'ici la première publication, les noms sont seulement surveillés : un job du workflow de nuit (`npm-names`, jamais
  bloquant) vérifie que chaque nom à scope, et chaque ancien nom `web-scumm…`, est encore libre ou publié par un
  propriétaire de l'organisation, que chaque nom sans scope est un pointeur déprécié d'un propriétaire
  (`create-quest-n-click` : un relais d'un propriétaire, non déprécié), et prévient sinon.

> [!LIMIT id=npm-not-published]
> Ni `npm install @quest-n-click/engine`, ni `npm init @quest-n-click`, ni `npm install @quest-n-click/engine@<version>`
> n'installe le moteur aujourd'hui : les noms à scope ne portent qu'une version de réservation. Les noms sans scope
> `quest-n-click` sont des pointeurs dépréciés ou, pour `create-quest-n-click`, un relais ; jamais le moteur lui-même.
> Un paquet sous l'un de ces noms publié par un autre que les propriétaires de l'organisation n'est pas celui du
> projet : ne l'installez pas.

<a name="prerequisites"></a>

## Prérequis

- Les [Prérequis](install.requirements.md) de tout projet de jeu : Node.js 22.12 ou plus récent, Python 3 pour les
  images.
- Une release dont les notes annoncent la publication sur npm.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, depuis le dossier qui contiendra le projet ; puis dans le projet créé.

<a name="steps"></a>

## Étapes

<!-- step: check-owner -->
1. Vérifiez que le paquet est publié et qu'il est celui du projet. Ses mainteneurs doivent être des propriétaires de
   l'organisation `quest-n-click` (`lostinbrittany` aujourd'hui), son dépôt `github.com/Quest-n-Click/quest-n-click`, et
   son `latest` une version du produit :

   ```bash
   # n'importe où
   npm view @quest-n-click/engine maintainers repository.url dist-tags
   ```

   Aujourd'hui, `dist-tags` ne nomme aucune version du produit (seulement `bootstrap`, la réservation) : arrêtez-vous
   là et prenez l'[archive de la release](install.from-archive.md).

<!-- step: create-from-npm -->
2. Créez le projet. Les deux commandes font la même chose (`@quest-n-click/create` lance `quest-n-click create` depuis
   le moteur dont il dépend) :

   ```bash
   # dans le dossier qui contiendra le projet
   npm init @quest-n-click my-game "Mon jeu"     # ou : npx quest-n-click create my-game "Mon jeu"
   ```

   `npx create-quest-n-click my-game "Mon jeu"` marche toujours aussi : le `create-quest-n-click` sans scope est un
   relais qui lance `@quest-n-click/create`, la même chose.

   Sans `--engine`, `create` écrit la dépendance `"@quest-n-click/engine": "^<version>"`, que npm résout depuis le
   registre.

<!-- step: install-and-play -->
3. Installez, préparez les images et jouez, comme depuis l'archive :

   ```bash
   # depuis le dossier qui contient le projet, puis dedans
   cd my-game
   npm install
   python3 -m pip install --require-hashes -r node_modules/@quest-n-click/engine/requirements.txt
   npm run assets && npm run dev
   ```

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Une fois la publication faite, l'étape 1 affiche le mainteneur et le dépôt ; l'étape 2 se termine par
`my-game: "Mon jeu" created (@quest-n-click/engine ^<version>).` Un projet fait depuis une archive passe au registre avec
`npm install @quest-n-click/engine@<version>`, qui remplace l'URL de l'archive dans son `package.json` par une plage de
versions.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| `npm view @quest-n-click/engine dist-tags` ne nomme que `bootstrap` (et la version d’attente `0.0.0-stage` de npm) | Pas encore publié | [Installer depuis l'archive de la release](install.from-archive.md) |
| `npm view` montre un mainteneur qui n'est pas propriétaire de l'organisation | Un nom pris par un tiers | Ne l'installez pas ; signalez-le dans les issues du projet |
| `npm warn deprecated quest-n-click@0.0.1: …` | Un nom sans scope de la 4.5.1 et avant, désormais un pointeur | Installez `@quest-n-click/engine` à la place |

<a name="files-changed"></a>

## Fichiers ou données modifiés

L'étape 1 ne change rien. Les étapes 2 et 3 écrivent le même projet que [depuis l'archive](install.from-archive.md#files-changed) ;
seule la dépendance dans `package.json` diffère (une plage au lieu d'une URL).

<a name="recovery"></a>

## Reprise ou retour arrière

Un projet créé depuis npm revient à une archive avec `npm install <URL de l'archive>`, comme le décrit
[Mettre à jour](install.upgrade.md).

<a name="how-it-will-be-published"></a>

## Comment la publication se prépare

La procédure a été écrite en 4.1.20 et sera jouée par le mainteneur dans une release ultérieure ; le détail est dans
[Paquets npm](contribute.npm-packages.md). Ce sur quoi un utilisateur peut compter :

- **Une publication en étapes, approuvée par une personne.** Le run de release met chaque paquet en scène via l'OIDC
  de GitHub (trusted publishing, configuré en stage-only : la CI peut mettre en scène, jamais publier), et le
  mainteneur promeut chacun avec sa double authentification (`npm stage approve <id>`, ou sur npmjs.com) ; l'un ou
  l'autre propriétaire de l'organisation peut approuver. Une version
  du produit ne vient jamais d'une publication locale, qui ne porterait pas de provenance OIDC ; seule une version de
  réservation `0.0.0-bootstrap.0` le peut, une fois par paquet, pour le créer.
- **Des outils exacts.** La publication en étapes demande au moins npm 11.15.0 et Node 22.14.0. `release.yml` épingle
  les versions de l'étape de publication à l'identique, `NPM_PUBLISH_NODE: 22.23.3` et `NPM_PUBLISH_NPM: 11.21.0`, et un
  test refuse une plage. Node 22.23.3 livre npm 10.9.9 : l'étape installera donc elle-même npm 11.21.0. En 4.4.0,
  seuls les épinglages existent : l'étape de publication elle-même n'est pas encore écrite.
- **Les connecteurs ne sont pas déclarés dual-use.** La politique dual-use de npm vise les outils qui peuvent
  ressembler à un logiciel malveillant (test d'intrusion, recherche en sécurité, obfuscation) ; les connecteurs sont
  des serveurs qu'un jeu fait tourner (une façade SSH et Telnet, un webhook et un lecteur IMAP pour l'email, un
  vérificateur Open Badge), qui ne scannent, n'attaquent et ne cachent rien. Ils passent par la même publication en
  étapes et la même promotion à double authentification que les autres paquets. Si l'analyse de npm retient ou
  signale le paquet, il reçoit `"contentPolicy": { "class": "dual-use" }` et un fichier `DISCLOSURE`.

<a name="references"></a>

## Références

- [Installer depuis l'archive de la release](install.from-archive.md), [Référence du paquet](install.package.md)
- [Paquets npm](contribute.npm-packages.md) (la procédure du mainteneur), [Publier une release](contribute.releasing.md)
- La documentation de npm : [staged publishing](https://docs.npmjs.com/staged-publishing),
  [politique dual-use](https://docs.npmjs.com/policies/dual-use/)
- [`.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml) (le job `npm-names`),
  [`.github/workflows/release.yml`](../../.github/workflows/release.yml) (les épinglages)
