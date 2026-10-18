# Studio Server : un jeu, plusieurs personnes, en ligne

Le Studio Server met le Studio d'un jeu en ligne pour une petite équipe. Chacun se connecte par un fournisseur OpenID
Connect (Keycloak ou un autre), travaille sur le même jeu en même temps, et voit chaque changement dès qu'il arrive.
C'est le chantier de la ligne 4.2.x (plan `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`). Seul sur sa machine,
`npm run studio` reste tel quel : rien de tout ceci n'est nécessaire.

> **État (4.2.1, en cours).** Fait : le journal (aucune modification confirmée n'est perdue), les connexions et les
> rôles, l'application de traitement, les pans et les baux, le flux en direct, l'origine propre du jeu avec son aperçu
> vivant, et la page du Studio. À venir en 4.2.1 : les écrans du Studio pour les membres, les baux et les conflits, et
> le paquet de release. D'ici là, ce guide déploie le serveur depuis le dépôt.

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
| `CC_NODE_DEV_DEPENDENCIES` | `install` (la 4.2.1 tourne depuis le dépôt, avec `tsx`) |
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

- `publicUrl` et `playUrl` sont deux domaines de l'application studio (`clever domain add`). Deux sous-domaines de
  votre propre domaine, c'est le mieux. Deux noms en `*.cleverapps.io` marchent aussi : le cookie de session du jeu est
  partitionné (CHIPS), ce qui lui permet de vivre dans un cadre d'un autre site.
- `trustProxy` : les adresses des proxys de Clever, pour distinguer chaque personne (avec OIDC, le serveur refuse de
  démarrer sans). Les plages privées ci-dessus sont une hypothèse, à réduire aux vrais proxys de Clever par la passe
  `studio-hosted` : sinon, une adresse de ces plages pourrait se prétendre n'importe quel `X-Forwarded-For`.
- Pas de `port` : le serveur écoute sur le `PORT` que Clever lui donne (un `port` dans la configuration l'emporterait).
- `worker.instance` : un nom au choix ; le worker n'exécute les jobs d'aucun autre Studio.
- `publicDir` (facultatif) : les images et les sons préparés du jeu, par défaut `public/` du dépôt déployé
  (`npm run assets` les y écrit et ils sont versionnés). Le Studio les montre aux membres et l'aperçu vivant les joue ;
  ils sont en lecture seule sur un Studio hébergé en 4.2.1.
- `clientDir` (facultatif) : le Studio construit, par défaut `.cache/studio-client` (`npm run studio-client`). Avec
  OIDC, le serveur refuse de démarrer sans lui.

**Les variables de l'application worker :** `CC_NODE_DEV_DEPENDENCIES=install`,
`CC_RUN_COMMAND=npm run studio-worker`, `WORKER_PUBLIC_KEY` (le contenu de `studio-worker.pub`), `WORKER_INSTANCE` (le
même nom que `worker.instance`). Donnez-lui un domaine (`worker.url`).

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

## Travailler à plusieurs

- **Les pans.** Chaque fichier du jeu appartient à un pan : une salle (son code et son layout), une langue, l'histoire,
  les objets, les personnages, les règles, les voix, les assets, les notes, le reste (`meta`). Écrire un fichier prend
  son pan pour 2 min, renouvelées tant que vous êtes actif. Le pan de quelqu'un d'autre refuse votre écriture (423,
  avec son nom) ; votre brouillon reste chez vous.
- **En direct.** Le Studio suit `GET /api/events` : chaque révision, qui tient quoi, qui est là.
- **L'annulation** n'est pas encore disponible sur un Studio partagé (4.2.2).

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

## Limites connues (4.2.1)

- Un jeu par instance, une seule instance (le serveur prend un bail ; une seconde attend).
- Le jeu dans le Studio est un aperçu vivant, pas figé à une révision : les prévisualisations par révision arrivent en
  4.2.2.
- La découpe de planches et `prepare` (Python, ffmpeg) ne sont pas encore disponibles sur un Studio hébergé ; l'upload
  de sons et de décors fonctionne.
- Les captures ne sont pas disponibles sur un Studio hébergé.
- L'onglet Jouer montre le jeu avec son panneau DEV ; l'inspecteur d'état, l'explication des règles et les rejeux à
  côté ont besoin du jeu sur l'origine du Studio, donc du Studio local seulement.
- L'Assistant n'est pas encore sur un Studio hébergé.
- Un jeu qui importe des fichiers hors de son propre dossier ne peut pas tourner sur le worker.
