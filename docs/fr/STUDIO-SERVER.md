# Studio Server : un jeu, plusieurs personnes, en ligne

Le Studio Server met le Studio d'un jeu en ligne pour une petite équipe. Chacun se connecte par un fournisseur OpenID
Connect (Keycloak ou un autre), travaille sur le même jeu en même temps, et voit chaque changement dès qu'il arrive.
C'est le chantier de la ligne 4.2.x (plan `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`). Seul sur sa machine,
`npm run studio` reste tel quel : rien de tout ceci n'est nécessaire.

> **État (4.2.2, expérimental).** Le journal (aucune modification confirmée n'est perdue), les connexions et les rôles,
> l'application de traitement, les pans et les baux, le flux en direct, l'origine propre du jeu avec ses
> prévisualisations (un build par révision), la santé par révision, l'annulation personnelle, les builds publiés, les
> assets préparés sur l'application de traitement, la sauvegarde et la restauration, et les écrans du Studio pour tout
> cela ; depuis 4.2.3, les uploads et la découpe de planches de l'onglet Assets, Prepare et les découpes en jobs qui
> se suivent et s'annulent. Il reste expérimental jusqu'à ce que ses passes humaines (`studio-hosted`, `studio-collab`, `studio-preview`,
> `studio-assets-hosted`) soient faites. Ce guide déploie depuis le dépôt
> ; l'archive `web-scumm-studio-server` est le même serveur (ci-dessous).

## Ce qui tourne où

```text
navigateurs ─HTTPS─▶ studio (app Node, une instance) ──jobs signés──▶ studio-worker (app Node, sans secrets)
CLI, MCP ─Bearer──┘   │  public_url : le Studio et /api          ▲ snapshot et résultat présignés
                      │  play_url :   le jeu (une autre origine)  │
                      ├──▶ PostgreSQL : journal, membres, sessions, baux
                      ├──▶ Cellar (S3) : le contenu des fichiers, les snapshots du worker ─┘
                      └──▶ fournisseur OpenID : qui sont les gens (jamais ce qu'ils peuvent faire)
```

- **Les fichiers du jeu** vivent dans Postgres (quelle version de chaque fichier) et dans Cellar (leur contenu). Le
  disque de l'application n'est qu'un cache : celui de Clever Cloud ne survit pas à un redémarrage, et rien ne se
  perd quand il disparaît.
- **Le code du jeu ne s'exécute jamais dans le Studio** : sa validation et sa lecture passent par `studio-worker`, une
  seconde application qui ne détient ni mot de passe, ni clé, ni accès à la base (ADR 0028).
- **Le jeu se joue sur une autre origine** (`playUrl`) : son code ne peut pas agir avec la session Studio d'un membre.

## Déployer sur Clever Cloud

Il faut : deux applications Node.js, un add-on PostgreSQL, un add-on Cellar avec un bucket, et un fournisseur OpenID
(un add-on Keycloak managé convient). Avec `clever-tools` :

```sh
clever create --type node my-game-studio
clever create --type node my-game-worker
clever addon create postgresql-addon my-game-pg --plan dev      # 5 connexions : juste (le serveur en garde 4) ; plus pour une équipe
clever addon create cellar-addon my-game-cellar
clever service link-addon my-game-pg --app my-game-studio
clever service link-addon my-game-cellar --app my-game-studio
clever scale --min-instances 1 --max-instances 1 --app my-game-studio
```

Créez le bucket dans Cellar (sa console, ou n'importe quel outil S3). Seule l'application studio est liée aux add-ons :
**ne les liez jamais au worker.**

**Les clés des jobs.** Sur votre machine, dans un dossier vide tenu hors de Git :

```sh
mkdir -p ~/secrets/my-game && npm run studio-server -- worker-keys --out ~/secrets/my-game
```

`studio-worker.key` (0600) est celle du Studio ; `studio-worker.pub` celle du worker.

**Les variables de l'application studio :**

| Variable | Valeur |
|---|---|
| `CC_NODE_DEV_DEPENDENCIES` | `install` (le serveur tourne depuis le dépôt, avec `tsx`) |
| `CC_POST_BUILD_HOOK` | `npm run studio-client` (construit la page du Studio que le serveur sert) |
| `CC_RUN_COMMAND` | `npm run studio-server -- serve` |
| `CC_HEALTH_CHECK_PATH` | `/startz` |
| `STUDIO_CONFIG_JSON` | la configuration ci-dessous, sur une ligne |
| `STUDIO_OIDC_CLIENT_SECRET` | le secret du client `studio` chez le fournisseur |
| `STUDIO_SESSION_KEY` | 32 caractères aléatoires ou plus (`openssl rand -base64 48`) ; plusieurs, séparées par des virgules, pour la rotation |
| `STUDIO_WORKER_KEY` | le contenu de `studio-worker.key` (les retours à la ligne peuvent s'écrire `\n`) |

Les identifiants de la base et de Cellar viennent des add-ons (`POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_KEY_ID`,
`CELLAR_ADDON_KEY_SECRET`). Au démarrage, le serveur lit chaque secret puis le retire de son environnement. Hors de
Clever, chacun peut être un fichier : `STUDIO_SESSION_KEY_FILE`, etc. (mode 0600).

**La configuration** (`ops/studio/studio.config.example.json`) :

```json
{
  "publicUrl": "https://studio.example.fr",
  "playUrl": "https://play.example.fr",
  "game": "my-game",
  "workDir": "/home/bas/work",
  "host": "0.0.0.0",
  "trustProxy": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
  "store": { "kind": "postgres" },
  "blobs": { "kind": "s3", "host": "cellar-c2.services.clever-cloud.com", "bucket": "my-game-studio" },
  "oidc": { "issuer": "https://keycloak.example.fr/realms/web-scumm", "clientId": "studio", "audience": "studio-api", "cliClientId": "web-scumm-cli" },
  "worker": { "url": "https://worker.example.fr", "instance": "my-game-studio" }
}
```

- `publicUrl` et `playUrl` sont deux domaines de l'application studio (`clever domain add`). **Prenez deux
  sous-domaines de votre propre domaine** (`studio.exemple.fr`, `play.exemple.fr`) : un seul site, et le cadre du jeu
  garde son cookie de session dans tous les navigateurs. Deux noms en `*.cleverapps.io` sont deux sites : le cookie du
  jeu ne vit alors dans un cadre d'un autre site que parce qu'il est partitionné (CHIPS). Chromium, Firefox et WebKit
  sous macOS le gardent (l'e2e hébergé). WebKit sous Linux (GNOME Web) n'enregistre aucun cookie posé par un cadre d'un
  autre hôte, même sur un seul site : les cadres du jeu y restent vides. Un vrai Safari, sous macOS et iOS, est la passe
  `studio-hosted`.
- `trustProxy` : les adresses des proxys de Clever, pour distinguer chaque personne (avec OIDC, le serveur refuse de
  démarrer sans). Les plages privées ci-dessus sont une hypothèse, à réduire aux vrais proxys de Clever par la passe
  `studio-hosted` : sinon, une adresse de ces plages pourrait se prétendre n'importe quel `X-Forwarded-For`.
- Pas de `port` : le serveur écoute sur le `PORT` que Clever lui donne (un `port` dans la configuration l'emporterait).
- `worker.instance` : un nom au choix ; le worker n'exécute les jobs d'aucun autre Studio.
- `publicDir` (facultatif) : les images et les sons préparés du jeu, par défaut `public/` du dépôt déployé
  (`npm run assets` les y écrit et ils sont versionnés). Le Studio les montre aux membres et chaque prévisualisation
  les joue ; ils sont en lecture seule sur un Studio hébergé.
- `publicBuilds` (facultatif, `false` par défaut) : les builds publiés (`/play/` sur l'origine du jeu) sont ouverts à
  tous, sans session (D42 : le choix de l'owner, par instance), avec les icônes que leur page nomme. Tout le reste de
  cette origine reste derrière la session.
- `clientDir` (facultatif) : le Studio construit, par défaut `.cache/studio-client` (`npm run studio-client`). Avec
  OIDC, le serveur refuse de démarrer sans lui.

**Les variables de l'application worker :** `CC_NODE_DEV_DEPENDENCIES=install`,
`CC_RUN_COMMAND=npm run studio-worker`, `CC_POST_BUILD_HOOK=python3 -m pip install --target .python --require-hashes
--only-binary=:all: -r ops/studio/worker-requirements.lock` (les paquets Python des outils d'assets, chaque hash
vérifié ; mesuré dans `docs/dev/QUALIF-4.2.2-ASSETS.md`), `WORKER_PUBLIC_KEY` (le contenu de `studio-worker.pub`),
`WORKER_INSTANCE` (le même nom que `worker.instance`). Donnez-lui un domaine (`worker.url`).

**Déployez** les deux (`clever deploy`), puis importez le jeu une fois, et invitez le premier owner :

```sh
clever ssh --app my-game-studio
npm run studio-server -- import games/my-game
npm run studio-server -- invite --email vous@example.fr --role owner
```

Que le shell de `clever ssh` ait les variables de l'application (ici `STUDIO_CONFIG_JSON`) est vérifié par la passe
`studio-hosted` ; sinon, lancez les deux commandes une fois depuis une machine qui a les mêmes variables. L'invitation
affiche un lien : ouvrez-le et connectez-vous avec cet email vérifié. `/readyz` répond 200 dès que
l'instance sert les écritures.

## Depuis les archives de la release

À partir de 4.2.1, une release porte `web-scumm-studio-server-<version>.tgz` : les deux commandes
`web-scumm-studio-server` et `web-scumm-studio-worker`, la page du Studio déjà construite, et ses propres dépendances
(OpenID Connect, JWT, Postgres). Leurs versions sont verrouillées dans son `npm-shrinkwrap.json` et son SBOM ; npm lit ce
verrou quand il installe depuis le registre, pas depuis un fichier d'archive, où `pg` prend le dernier 8.x que permet sa
plage (`web-scumm-studio-server deps` dit lequel). Il fait tourner le serveur du moteur installé à côté, qui doit être
de la même version :

```sh
npm install web-scumm-<version>.tgz web-scumm-studio-server-<version>.tgz
npx web-scumm-studio-server import ./mon-jeu --config studio.config.json
npx web-scumm-studio-server serve --config studio.config.json
npx web-scumm-studio-worker          # sur la machine du worker, avec WORKER_PUBLIC_KEY et WORKER_INSTANCE
```

Un worker installé depuis les archives prépare aussi les assets (depuis la 4.2.3) : son hook de build installe le
verrou que porte le paquet du moteur, depuis le dossier du worker, où le worker cherche les paquets
(`WORKER_PYTHON_PATH` pour les mettre ailleurs) : `CC_POST_BUILD_HOOK=python3 -m pip install --target .python
--require-hashes --only-binary=:all: -r node_modules/web-scumm/ops/studio/worker-requirements.lock`. Le verrou vaut pour
CPython 3.13 sous Linux x86_64, glibc 2.28 ou plus récente (le runtime natif de Clever Cloud) ; une autre plateforme le refait (son en-tête dit
comment). En 4.2.2, il fallait un worker déployé depuis le dépôt.

L'archive du moteur apporte Vite et tsx, dont l'application de traitement a besoin pour exécuter le code du jeu et
construire ses prévisualisations (le Studio lui-même ne fait plus tourner Vite, depuis 4.2.2). Mettez dans `publicDir` les
assets préparés de votre jeu (`public/` de son dépôt) : celui du moteur ne contient que ses icônes et sa police. Le
candidat de chaque release installe ces deux archives dans un dossier vide et y sert un jeu, ses dépendances trouvées
que npm les remonte ou les imbrique (`scripts/studio-install-smoke.mjs`).

## Le fournisseur OpenID

Le realm de test `ops/studio/keycloak/realm.json` montre chaque réglage. Chez n'importe quel fournisseur :

- **Le client `studio`** : confidentiel, Authorization Code avec PKCE S256, redirect URI `<publicUrl>/auth/callback`,
  redirection après déconnexion `<publicUrl>`, back-channel logout vers `<publicUrl>/auth/backchannel` avec
  l'identifiant de session.
- **Le client `web-scumm-cli`** : public, avec le device authorization grant.
- **Un mapper d'audience** qui ajoute `studio-api` (l'`audience` ci-dessus) aux jetons d'accès de `web-scumm-cli`. Elle
  doit différer de l'identifiant du client `studio` : un id_token n'est jamais accepté comme jeton d'accès.
- **Des jetons d'accès de 5 min.** Jusqu'à 15 si la configuration le dit (`oidc.maxTokenSeconds`, 900 au plus) : un
  jeton plus long est refusé.

Le fournisseur dit qui est quelqu'un. Ce qu'il peut faire se décide dans le Studio.

## Personnes et rôles

| Rôle | Peut |
|---|---|
| `owner` | tout ce que peut un dev ; les membres, les rôles, les invitations, les sessions, l'audit ; reprendre un pan ; le bail exclusif |
| `dev` | écrire le jeu, pan par pan |
| `reviewer` | lire et jouer |

Personne n'est membre par défaut : une invitation (7 jours, à usage unique, pour un email vérifié) en fait un. Le
dernier owner ne peut être ni retiré ni rétrogradé. Retirer quelqu'un coupe son accès à sa requête suivante ; ses flux
en direct se ferment en 5 s. Quand le fournisseur désactive un compte, ses sessions se terminent en 15 min au plus.

## Publier des builds

Le bouton **Publish this revision** de l'onglet Jouer fait construire par l'application de traitement le jeu du
joueur à partir de la tête (sans les outils d'édition), numéroté : le build `#n` est servi à `/play/<n>/` sur
l'origine du jeu et ne change jamais. `/play/` est toujours le dernier build vert, le plus récent dont la révision a
été jugée valide par la santé (une révision publiée est jugée à la publication). Le manifeste de chaque build
(l'époque et la révision, le hash du snapshot, le moteur, le commit et le lockfile de l'application de traitement, la
version des assets, le verdict de la révision, le hash de chaque fichier) est signé avec la clé de jobs du Studio :
`GET /api/builds/<n>` donne le manifeste, les octets exacts signés (`signed`) et la signature, faite sur
`web-scumm build manifest v1\n` suivi de ces octets, que `studio-worker.pub` vérifie. **Rebuild fresh** (un owner)
reconstruit le même snapshot, avec la même version des assets, et dit si les fichiers sont les mêmes, octet pour
octet : une vérification que le build est reproductible sur l'application de traitement telle qu'elle est, pas que
son contenu est sans danger. Le code d'un build ne change jamais ; ses images et ses sons sont les assets préparés de
l'instance, servis à côté tels qu'ils sont. Un build publié n'a pas de service worker (il ne s'installe pas pour jouer
hors ligne) et ses sauvegardes ne sont pas encore distinguées par build.

## Sauvegarde et restauration

- **Le journal expédié** : chaque opération confirmée est copiée dans le bucket, dans l'ordre, en segment immuable
  (`journal/<époque>/<ligne>/<rev>.json` ; les contenus sont déjà des blobs ; un échec est retenté sous 30 s).
  `/readyz` donne `rpoMs`, l'âge de la plus ancienne opération pas encore expédiée (0 quand tout l'est) : la cible est
  1 min (D42), mesurée, jamais affirmée. La ligne vaut `0`, puis une nouvelle après chaque restauration : les
  révisions qu'une instance restaurée réécrit n'écrasent jamais les segments de la chronologie qu'elle a quittée.
- **Une sauvegarde** : `npm run studio-server -- backup <fichier> --config <fichier>` écrit les tables du projet en un
  instantané (les membres, le journal, la tête, les prévisualisations, les builds et les ensembles préparés ; ni les
  sessions ni les baux : une restauration déconnecte tout le monde ; seulement les opérations confirmées), avec les
  blobs qu'elles nomment et un condensé. Quotidienne (D42), gardée hors de l'instance. Une sauvegarde est une entrée
  de confiance, comme les identifiants de la base : elle peut ajouter des propriétaires. Son condensé dit qu'elle est
  entière, pas qui l'a faite ; gardez-la là où seuls les opérateurs écrivent.
- **Une restauration** : une instance hébergée seulement, dans une base vide (un nouvel add-on Postgres, le même
  bucket) : `npm run studio-server -- restore <fichier> --replay --config <fichier>` vérifie le condensé, les tables et
  les colonnes, et que chaque blob de la tête et du journal est dans le bucket (une prévisualisation, un build ou un
  ensemble préparé dont les blobs ont été ramassés depuis est laissé de côté, et compté dans `dropped`), écrit les
  lignes, puis rejoue le journal expédié depuis la sauvegarde. Chaque opération rejouée doit continuer la tête (sa
  révision, le contenu précédent de chaque fichier, ses blobs) ; le rejeu s'arrête à la première qui ne le fait pas
  (`stopped` : `gap`, `not-the-head`, `blob-missing`…). S'il échoue en cours de route, le serveur refuse de démarrer
  jusqu'à ce que `npm run studio-server -- replay --config <fichier>` le reprenne. Démarrez le serveur : le dossier est
  refait depuis la tête. Les opérations rejouées ne gardent pas leur réponse : un client qui en retente une reçoit
  `null`. Faites une nouvelle sauvegarde après une restauration : les suivantes rejouent sur la nouvelle ligne.
- **L'exercice** : sur une instance de test, sauvegardez, écrivez deux modifications, attendez `rpoMs` à 0, supprimez
  la base, restaurez avec `--replay`, démarrez, et vérifiez que la tête est la dernière modification.
- **Le ramassage** : `npm run studio-server -- gc --config <fichier>` liste les blobs qu'aucune ligne ne nomme (plus
  vieux d'un jour) et le staging de l'application de traitement de plus d'une heure ; `--delete` les supprime. Un blob
  stocké à nouveau reçoit une nouvelle date : une écriture qui nomme un vieux blob est couverte par le jour de grâce.
  Les blobs de la tête et du journal ne sont jamais ramassés (le journal garde chaque opération) ; une sauvegarde plus
  ancienne restaurée après un ramassage ne perd que les prévisualisations, builds et ensembles préparés ramassés.

## Travailler à plusieurs

- **Les pans.** Chaque fichier du jeu appartient à un pan : une salle (son code et son layout), une langue, l'histoire,
  les objets, les personnages, les règles, les voix, les assets, les notes, le reste (`meta`). Écrire un fichier prend
  son pan pour 2 min, renouvelées tant que vous êtes actif. Le pan de quelqu'un d'autre refuse votre écriture (423,
  avec son nom) ; votre brouillon reste chez vous.
- **En direct.** Le Studio suit `GET /api/events` : chaque révision, qui tient quoi, qui est là.
- **Ce que vous avez lu** (4.2.3). Une écriture porte la révision que son éditeur a lue (`x-studio-base` ; la réponse
  à une lecture dit sa révision dans `x-studio-revision`). Si quelqu'un d'autre a écrit l'un de ses fichiers depuis,
  l'écriture est refusée (409) avec ce fichier tel que vous l'avez lu et tel qu'il est (les écritures depuis du même onglet, de
  la même session CLI ou MCP ne le refusent jamais ; celles de votre autre onglet, ou d'un agent à vous, si). Le Studio montre ce qui a changé et garde votre brouillon. Pour une modification que le serveur
  fait sur le fichier (un texte, une valeur, une note, une voix), il propose de l'appliquer sur la dernière version ;
  pour un document entier (le layout d'une salle, le storyboard), il propose de remplacer le leur par le vôtre, et le
  dit. Rien n'est renvoyé sans que vous le demandiez. Limites : la vérification se fait par fichier (deux notes
  modifiées en même temps sont un seul fichier) ; le placement de la vue de salle est vérifié par rapport à ce que
  l'onglet Rooms a lu, alors que la vue peut encore montrer une prévisualisation plus ancienne un instant ; un script qui
  n'envoie pas `x-studio-base` n'est pas vérifié ainsi.
- **L'annulation est la vôtre** (4.2.2) : Undo et Redo (et Ctrl/Cmd+Z, Maj pour rétablir) annulent votre propre
  dernière opération, quoi que les autres aient écrit entre-temps, par une nouvelle révision (l'historique n'est
  jamais réécrit). Refusée quand quelqu'un d'autre a écrit l'un de ses fichiers depuis (409), ou tient son pan (423,
  avec son nom). Une nouvelle modification de votre part efface ce que vous pouviez rétablir. Votre pile est gardée
  par le serveur : un autre onglet, un redémarrage, une autre instance voient la même.

## La ligne de commande

```sh
npm run studio-server -- login --server https://studio.example.fr   # device flow : ouvrez le lien, tapez le code
npm run studio-server -- token --server https://studio.example.fr   # un jeton d'accès pour les scripts et le MCP
```

Les jetons sont gardés dans `~/.config/web-scumm/studio-tokens.json` (0600), et envoyés en https seulement.

## Essayer en local

`ops/studio/compose.yml` démarre Postgres, MinIO et Keycloak avec le realm de test et un utilisateur de test
(`lea@example.org`, mot de passe `lea-local-only`, email vérifié). C'est un point de départ, pas une installation clé en
main : avec OIDC, il faut encore une configuration avec `oidc.allowInsecure: true` (un fournisseur en http), un bucket
MinIO, un worker (`npm run studio-worker`) et `trustProxy`. Docker n'est jamais requis. Le serveur tourne aussi sans
OIDC, avec SQLite et un dossier pour les contenus, sur le loopback seulement.

## Limites connues

- Un jeu par instance, une seule instance (le serveur prend un bail ; une seconde attend).
- Le jeu dans le Studio est la prévisualisation d'une révision (4.2.2) : après chaque modification, l'application de
  traitement construit la tête (une rafale de modifications ne construit que sa dernière révision), et la vue de la
  salle la charge une fois prête, sauf si un placement n'est pas enregistré. En attendant, les cadres montrent la
  dernière prévisualisation prête, et l'étiquette sous la vue dit de quelle révision il s'agit, celle en construction,
  et une révision qui ne se construit pas, avec sa raison. Une sauvegarde faite dans un autre contenu demande avant
  d'être reprise : la reprendre ici, recommencer, ou rester dans sa propre révision (ADR 0026). L'onglet Jouer garde la
  prévisualisation qu'il a chargée jusqu'à « Load the latest preview ».
- Une prévisualisation se construit à partir des seuls fichiers texte du jeu (sources, données) : un jeu dont le code
  importe une feuille de style ou une image ne peut pas être prévisualisé.
- Les diagnostics qui exécutent le code du jeu (lint, solveur, playtests) tournent sur l'application de traitement,
  avec les commandes propres du jeu (4.2.2) ; le solveur s'y arrête après 45 s et dit qu'il a été interrompu. Chaque
  lecture dit la révision à laquelle elle a été faite : l'onglet Check l'affiche, et marque ses résultats comme
  périmés dès que la tête a avancé.
- La révision d'une lecture est la tête du journal : une instance qui ne tient pas encore le bail (un déploiement)
  peut répondre depuis un dossier en retard, et une nouvelle histoire (un import, une restauration) n'est pas
  distinguée d'une révision plus ancienne.
- L'en-tête dit la santé du jeu à une révision (4.2.2) : le validateur, puis le solveur depuis une nouvelle partie
  (45 s au plus), sur l'application de traitement, après chaque rafale de modifications. Quand une révision échoue là
  où la dernière jugée passait, une bissection sur les révisions entre les deux nomme la première qui échoue, avec ce
  que son opération a fait et ses fichiers (jamais qui l'a faite), en ⌈log₂ n⌉ jugements au plus ; un dev peut en
  demander une entre deux révisions jusqu'à la tête (`POST /api/health/bisect {good, bad}`). Un solveur interrompu dit
  « inconnu », jamais « valide », et arrête une bissection ; une révision qui n'a pas pu être jugée cinq fois dit « ne
  peut être jugée », avec sa raison. Un verdict plus ancien est affiché en gris, jamais en vert. Une passe de l'onglet Check retient les lectures de l'instance pendant que l'application de traitement
  exécute ses diagnostics : une écriture l'attend.
- L'application de traitement exécute un job à la fois, et chaque révision lui en demande désormais trois : la
  construction d'une prévisualisation, le validateur et une passe du solveur (jusqu'à 45 s) : la validation de la
  modification suivante peut les attendre (pas encore mesuré sur une application Clever, la passe `studio-preview` le
  fait). Une bissection demande jusqu'à deux jobs par révision qu'elle juge.
- La prévisualisation de chaque révision est gardée (environ 1 Mo pour le jeu d'exemple : la base `/preview/<rev>/`
  est écrite dans la page et son code, si bien que peu de fichiers sont partagés d'une révision à l'autre) jusqu'au
  ramassage d'une PR ultérieure de 4.2.2.
- L'onglet Assets est sur un Studio hébergé depuis 4.2.3 : un reviewer lit sa liste, ses prompts et ses fichiers ; un
  dev téléverse et découpe. Un upload (un son, un décor) fait 10 Mio au plus une fois décodé (413 au-delà) et son type
  se lit dans ses octets : une image PNG, JPEG ou WebP (un décor : PNG ou JPEG), un son Ogg, MP3 ou WAV dont
  l'extension dit la même chose (415 sinon ; un Studio local prend aussi M4A, FLAC, AAC, Opus et WebM) ; il est écrit
  en une opération, jamais exécuté. La découpe d'une planche et le détourage d'une cellule tournent sur l'application
  de traitement (jobs `cut`, Python avec les paquets du hook, aucun code du jeu), sous le bail exclusif du projet :
  elle reçoit l'image, les cellules de cette planche et `site.json`, ne rend que des cellules de cette planche, et les
  cellules avec les sauvegardes de celles redécoupées sont écrites en une opération. Un Studio hébergé ne garde pas la
  planche téléversée elle-même (un Studio local la garde sous `private/sheets/`, qu'aucun pan ne nomme).
- Le bouton **Prepare assets** de l'onglet Jouer (et de l'onglet Assets ; un dev, 4.2.2) lance `prepare` sur
  l'application de traitement à partir de l'art et des sons de la tête, sous le bail exclusif du projet (personne
  n'écrit entre-temps ; le pan d'un autre le refuse, avec son nom) : l'ensemble préparé est gardé par le Studio et
  servi avant `publicDir`, et le `assets.gen.json` du jeu est écrit en une opération. Chaque passe prépare tout à
  nouveau, en 2 minutes au plus. Elle est refusée, et le jeu se prépare sur un Studio local, quand : son art et ses
  sons dépassent environ 31 Mio (en base64) ou les fichiers préparés environ 22 Mio ; il nomme ses sources dans
  `sources.json` (elles vivent hors de l'art et des sons que garde un Studio hébergé) ; le nouveau manifeste perdrait
  une image ou un son que le jeu avait. Les builds publiés servent l'ensemble préparé tel qu'il est, pas celui contre
  lequel ils ont été construits. Le code du jeu tourne sur l'application de traitement sous l'utilisateur des outils
  d'assets (ADR 0028 : une machine, un utilisateur).
- Prepare et les découpes sont des **jobs** (4.2.3) : la requête répond 202 avec le job tout de suite ; ses états vont
  au flux en direct (événements `job`, dans l'ordre : `queued`, `running` avec ses étapes `packing`, `on the worker`,
  `writing`, puis `done`, `failed` ou `cancelled`) et `GET /api/jobs/<id>` le relit. Un seul tourne à la fois, quatre
  autres peuvent attendre (429 au-delà). `POST /api/jobs/<id>/cancel` (qui l'a lancé, ou un owner) l'annule : un job
  en attente ne tourne jamais ; un job en cours voit sa requête à l'application de traitement fermée, et celle-ci tue
  son processus enfant avec son groupe ; rien n'est écrit (aucune opération, aucun ensemble préparé gardé) et le bail
  exclusif est rendu. Un job qui écrit ne s'annule plus (409). Un job vit dans la mémoire de l'instance : après un
  redémarrage son état est perdu (son écriture, si elle a eu lieu, est dans le journal).
- Un cadre de jeu resté inactif au-delà de sa session de 15 min ne montre plus rien de neuf : « Reload view » (ou
  l'onglet Jouer) le rouvre.
- Les captures ne sont pas disponibles sur un Studio hébergé.
- L'onglet Jouer montre le jeu avec son panneau DEV ; l'inspecteur d'état, l'explication des règles et les rejeux à
  côté ont besoin du jeu sur l'origine du Studio, donc du Studio local seulement.
- L'Assistant n'est pas encore sur un Studio hébergé.
- Les éditeurs du Studio n'envoient pas encore la révision de ce qu'ils ont lu (le journal la vérifie quand elle est
  envoyée) : dans un pan que vous tenez, votre enregistrement remplace le fichier. Les éditeurs rechargent ce que les
  autres confirment ; cela ne compte que pour une modification commencée juste avant qu'un pan change de main.
- Le bouton Save de l'éditeur de salle ne fait rien sur un Studio hébergé : « Save layout » dans le Studio enregistre
  (la page de l'éditeur est celle du jeu, et seul le membre lance une écriture).
- Un jeu qui importe des fichiers hors de son propre dossier ne peut pas tourner sur le worker.
