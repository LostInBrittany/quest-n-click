# web-scumm 4.3 « Studio Server » : un jeu commun, édité en direct par plusieurs développeurs

> **Révision 1** : plan vérifié contre `origin/main` (`a0ce19d`, merge de la release 4.2.0) le 17 octobre 2026. Il
> intègre la relecture du mainteneur du même jour : la transaction comme unité de modification, un pan d'écriture
> unique, une garde unifiée, une prévisualisation explicite, des révisions partout, la durabilité dès le socle et un
> découpage en trois étapes.
> **Source normative** : ce fichier, dans Git, depuis la PR de cadrage `docs/43-plan`. Toute copie hors du dépôt
> n'en est qu'un reflet.
> **Base** : `v4.2.0`, commit `a0ce19dc67e1b5844b43bdb5a79edb94ca771354`.
> **Nature** : nouvelle surface produit (un serveur d'édition partagé). Le moteur, le DSL gelé (D28) et le Bridge ne
> changent pas de sens.

## 1. Contexte

Le Studio est aujourd'hui un outil d'auteur **mono-utilisateur**, servi par le serveur de dev Vite. La vérité vit dans
les fichiers `games/<id>/`, versionnés dans Git.

Le mainteneur veut **une plateforme où plusieurs développeurs se connectent au même serveur, en même temps**. Chacun
travaille sur un pan du scénario, et le serveur **assemble et compile** le travail commun.

Sa demande du 17 octobre : « j'aimerais bien une plateforme où plusieurs développeurs peuvent se connecter pour bosser
des pans du scénario […] bosser à plusieurs en même temps sur un même serveur et compiler un travail à plusieurs ».

Il a rejeté une première proposition « git-natif » (un studio local par personne et des PR) : hors sujet. Il a ensuite
choisi **une seule copie du jeu, partagée en direct**, avec des verrous explicites et des builds figés.

**Condition de réussite** : on doit pouvoir affirmer qu'**aucune modification confirmée n'est perdue, et chacun sait
exactement quelle version il regarde.**

### 1.1 Constats vérifiés contre le code (`a0ce19d`)

Les écritures :

- **Une file par processus.** `serial` (`tools/studio/core.ts:176-182`) chaîne des promesses dans un seul processus.
  `tools/studio/assets.ts:297-302` tient **sa propre** file.
- **Le MCP a son propre studio.** `tools/mcp/server.ts:18` (`npm run mcp`) crée un second `createStudio` dans un
  autre processus, avec sa propre file et sa propre pile d'undo. Il en va de même pour `studio-apply`.
- **Des CLI écrivent directement le jeu** avec `writeFileSync` : `tools/ids.ts:85,94,118,120`, `tools/i18n.ts:39,44-45`,
  `tools/voices.ts:83`, `tools/pages/import-layout.ts:142` et `tools/pages/storyboard.ts:356`.
- **Une route contourne le core.** `POST /__layout/<room>` (`tools/vite/plugins.ts:57`) écrit le layout sans file,
  sans validation et sans undo.

La garde de validation :

- **Elle ne couvre que deux écritures.** `guarded` (`core.ts:322-339`) annule en 422 une écriture qui ajoute des
  erreurs, mais seuls `setValue` (`:313`) et `setLayout` (`:408`) l'appellent.
- **Les autres écritures ne sont pas validées.** `setText` vérifie le parse, `setStoryboard` le schéma, `setVoice`
  l'id. Les notes et les assets ne sont pas validés.

Les écritures sur plusieurs fichiers :

- **`addEntity` n'est pas atomique.** Il écrit la salle (`core.ts:463`) puis le layout (`:470`), en deux écritures et
  deux entrées d'undo.
- **`uploadSheet` écrit beaucoup de fichiers** (`assets.ts:527`) : une copie de la planche plus le découpage de N
  cellules.

La durabilité :

- **Aucun fsync dans le Studio.** `writeAtomic` (`core.ts:231-240`) écrit un fichier temporaire puis le renomme, sans
  fsync. Les notes, le storyboard et les assets passent par `writeFileSync`.
- **La pile d'undo est globale.** `core.ts:228-249` la plafonne à 200 entrées et `step` lève un 409 si le fichier a
  changé (`:274`). Les notes et le storyboard n'y entrent pas (`:487`, `:512-539`).

L'identité et la diffusion :

- **Il n'y a pas d'identité.** `tools/studio/security.ts` vérifie l'hôte et l'origine. En LAN, il exige un jeton
  **unique pour tous** (`:68-86`).
- **La diffusion est un flux SSE.** `GET /__studio/api/events` (`plugin.ts:245-258`) émet `{type:'changed', file}`
  depuis un `fs.watch` récursif (`:198-216`). Il ne porte ni auteur, ni révision, ni curseur de reprise.

Le jeu jouable :

- **Le jeu est importé statiquement.** `src/main.ts:4` importe `@game`, que `vite.config.ts:159` résout vers
  `games/<GAME>/index.ts`.
- **Les iframes se rafraîchissent par Vite.** Les iframes Play (`src/studio/play.ts:26`) et Rooms
  (`rooms-bridge.ts:43`) se rechargent par le rechargement complet de Vite. La page Studio refuse ce rechargement
  (`src/studio/main.ts:36-40`) et suit le SSE.
- **Une sauvegarde ne dit pas pour quel contenu elle a été faite.** L'enveloppe V4 (`src/engine/core/save.ts:73-81`)
  porte `gameId`, `gameSaveVersion`, le hash du monde et `variant`. Elle n'a **pas d'empreinte de contenu**.
  `GameFingerprint` existe (`src/engine/core/fingerprint.ts:21-26`) mais n'entre pas dans la sauvegarde. Le chargement
  élague les items, salles et acteurs inconnus au lieu de refuser (`save.ts:209-235`).

Les ids et la provenance :

- **Les répliques n'ont pas toujours d'id stable.** Elles n'en reçoivent qu'avec `ids --lines`
  (`src/engine/core/content-ids.ts:139-143`) et gardent sinon un chemin positionnel.
- **Les clés d'entité ne sont uniques que par salle** (`core.ts:442`).
- **La provenance donne le fichier source.** La provenance IR (`IrSource {file, line}`, `src/engine/core/ir.ts:32-35`,
  `provenanceOf` `:505`) indique le fichier, donc la salle propriétaire.

Les verrous et l'auth du Bridge :

- **Les baux du Bridge n'ont pas de fencing.** Ils (`bridge/src/maintenance.ts`, migration `0005`) prennent l'heure
  de la base et refusent au lieu d'attendre. Il n'y a **aucun jeton de fencing**, et les écritures ordinaires ne
  vérifient pas le bail en SQL.
- **Biscuit est déjà là.** `bridge/src/biscuit.ts` et `bridge/policy/*.datalog`.

Les contraintes de la charte :

- La règle 10 de la charte (`CHARTER.md:40-42`) dit « no realtime scripting ». Elle porte sur le contenu des jeux, pas
  sur l'outil d'édition.
- D17 (`DECISIONS.md:22`) livre le joueur en SSE plus une lecture HTTP par curseur, « no WebSocket ». D23 le
  confirme.

**Conséquence** : le Studio actuel n'a pas un seul point d'entrée des écritures, mais au moins cinq (core, assets, MCP,
CLI, route de layout Vite). La garde ne couvre que deux écritures. Le socle partagé doit d'abord **faire converger
toutes les écritures** vers une seule API transactionnelle. C'est un prérequis, pas un détail.

## 2. Verdict et positionnement

- **Après 4.2.0 stable**, publiée le 16 octobre (D38). Les treize passes humaines de 4.2 restent ouvertes et ne sont
  pas bloquées par ce chantier.
- **Une seule copie, partagée en direct** ; ni espaces personnels ni merge Git comme interface de collaboration. Git
  reste la persistance et l'historique sous le capot.
- **Les CRDT et la co-édition caractère par caractère sont reportés.** Le verrou par pan rend l'édition simultanée sûre
  sans eux.
- **Trois étapes livrables séparément** (§5), chacune utilisable seule.
- **Le Studio local continue d'exister.** `npm run dev` garde son comportement mono-utilisateur, mais passe par le
  même noyau d'opérations dès l'étape 1, donc par les mêmes contrôles.

## 3. Principes structurants

### P1. La transaction est l'unité de modification

Une action d'auteur peut toucher plusieurs fichiers : salle, layout, storyboard, locales. Par exemple, `addEntity`
écrit déjà deux fichiers aujourd'hui.

- **Une file d'opérations par projet**, qui remplace les files `serial` de `core.ts` et `assets.ts`. Un processus
  unique la détient : le serveur. Les autres entrées (MCP, CLI, assistant) lui soumettent leurs opérations au lieu
  d'écrire elles-mêmes (P6).
- **Une opération** porte un identifiant client, l'auteur, la révision de base vue par le client, les verrous
  revendiqués avec leur jeton, et une liste d'effets typés.
- **L'application se fait en six temps :**
  1. **Préparer.** On calcule le nouvel état de chaque fichier touché, en mémoire ou dans un répertoire de
     préparation.
  2. **Valider.** On valide l'état final (P3).
  3. **Journaliser l'intention.** Le journal reçoit l'id d'opération, la révision cible, et pour chaque fichier le
     chemin et les hashes avant et après, plus le contenu après. On fait un fsync.
  4. **Appliquer.** Chaque fichier passe par un temporaire, un fsync, un renommage, puis un fsync du répertoire.
  5. **Confirmer.** On enregistre la révision et le résultat, puis on fait un fsync.
  6. **Diffuser.**
- **Après une interruption**, au démarrage, une intention sans confirmation est rejouée si les hashes « avant »
  correspondent encore. Elle est terminée si les hashes « après » sont déjà en place. Dans tout autre cas, elle est
  annulée vers l'état « avant » et marquée `aborted`. Un écart inexplicable (fichier modifié hors serveur) met le
  projet en **maintenance** et l'annonce, plutôt que de deviner.

### P2. Chaque élément a un seul pan d'écriture

- **Les pans d'écriture.** Le **propriétaire technique** d'un élément est unique :
  - sa salle, pour tout ce qui est déclaré dans `rooms/<id>.ts` et `layout/<id>.json`, d'après la provenance IR ;
  - le pan **global**, pour `game.ts`, `items.ts`, `cast.ts` et `rules.ts` ;
  - le pan **storyboard** ;
  - un pan par langue pour les locales et les voix.

  La liste est fermée et dérivée par un outil testé : chaque fichier de `games/<id>/` appartient à exactement un pan,
  sinon la génération échoue.
- **Les regroupements de la carte** (personnage, énigme, chapitre, à l'étape 3) ne font que **référencer** des
  éléments. Ils ne verrouillent rien.
- **Une opération transverse** revendique **tous** ses pans d'un coup, triés dans un ordre fixe. Si un seul pan est
  tenu par quelqu'un d'autre, c'est un refus immédiat (423), sans attente ni acquisition partielle.
- **Les baux sont gérés avec l'heure de la base** (motif de `bridge/src/maintenance.ts`) et renouvelés tant que la
  session est active.
- **Fencing.** Chaque prise de bail incrémente un **jeton de fencing** monotone par pan. Une opération porte les jetons
  de ses pans, et la file vérifie qu'ils sont toujours les jetons courants **au moment d'appliquer** (étape 3 de P1).
  Après expiration ou reprise, les requêtes de l'ancien détenteur sont refusées (423), même si elles étaient déjà en
  vol. C'est nouveau par rapport au Bridge, qui n'a pas de fencing.
- **La reprise d'un bail** par un `owner` est une opération journalisée, qui nomme l'ancien détenteur.

### P3. Une garde de validation unifiée, sur l'état final

- **Toutes les écritures passent par la même garde** : validate, plus les contrôles propres au type (parse, schéma,
  id). Aujourd'hui, seuls `setValue` et `setLayout` l'utilisent.
- **La garde juge l'état final de la transaction**, pas chaque étape. « Créer l'objet + ajouter sa référence dans une
  autre salle » passe en une transaction, alors que chaque étape isolée échouerait.
- **La règle reste celle de `guarded`** : une transaction qui **ajoute** des erreurs est refusée en 422, avec la liste.
  Une transaction qui laisse des erreurs déjà présentes passe, ce qui permet de réparer progressivement.
- **Le solveur et les playtests ne sont pas dans la garde synchrone** : ils sont trop longs. Ils produisent la santé par
  révision (P5).

### P4. La prévisualisation commune est un chantier explicite

`src/main.ts:4` importe `@game` statiquement. Diffuser des événements ne suffit donc pas à mettre à jour un jeu
jouable.

- **Le serveur produit une prévisualisation par révision** : un build du jeu dans un répertoire isolé, servi sous
  `/preview/<rev>/` et immuable une fois produit. L'implémentation part d'un build incrémental (Vite en mode
  watch/library, ou rolldown direct), à mesurer à l'étape 2. **Seuil d'acceptation : au plus 5 s** entre la
  confirmation d'une opération et la disponibilité de sa prévisualisation, sur le jeu d'exemple.
- **Les prévisualisations se coalescent.** Si plusieurs révisions arrivent pendant un build, seule la dernière est
  construite. Chaque prévisualisation dit sa révision.
- **Une partie ouverte n'est jamais rechargée en silence.** À l'annonce « révision N disponible », le joueur choisit :
  - **Reprendre** : la sauvegarde courante est rechargée dans la nouvelle révision, seulement si elle y est compatible.
  - **Redémarrer.**
  - **Rester** sur sa révision, affichée en clair.
- **La compatibilité exige une empreinte de contenu dans la sauvegarde** (absente aujourd'hui, §1.1). On propose
  d'ajouter `GameFingerprint.logic` à l'enveloppe, dans un **champ optionnel** pour préserver les sauvegardes
  existantes. La reprise est « compatible » si l'empreinte est identique, ou si `parseSave` charge la sauvegarde sans
  rien élaguer. À trancher dans l'ADR 0025, car le format de sauvegarde est une surface stable (D28).

### P5. Tout porte une révision

- **Le compteur de révision** est monotone par projet et incrémenté par chaque opération confirmée. Il est affiché en
  permanence dans le Studio (« révision 412 »).
- **Les diagnostics portent leur révision.** Validate, lint, solve et playtests tournent en tâche de fond. Chaque
  résultat porte **sa révision**, et un résultat plus vieux que la révision courante est affiché *périmé*.
- **Pas de coupable désigné.** On dit « **révision ayant introduit l'échec** », pas « auteur fautif » : une
  incompatibilité peut venir de deux modifications raisonnables prises séparément. La recherche se fait par bissection
  sur les snapshots de révisions, à l'étape 2.
- **Les builds partent d'un snapshot.** Il est pris **à une frontière d'opération**, sous la file, puis copié dans un
  répertoire isolé et compilé là.
- **Le manifeste de build** identifie :
  - la révision ;
  - le hash du contenu de `games/<id>/` (sources et assets, fichier par fichier) ;
  - la version du moteur et le commit du dépôt ;
  - le lockfile ;
  - les résultats des diagnostics sur **ce** snapshot.

### P6. Durabilité et entrée unique dès le socle

- **L'identifiant d'opération** est fourni par le client (UUID). Un retry avec le même id renvoie le résultat déjà
  enregistré, sans seconde application. On garde cette table d'idempotence au moins 24 h.
- **Le serveur ne confirme qu'après fsync** du journal et des fichiers (P1).
- **Reconnexion** : le client envoie la dernière révision vue. Il reçoit la suite des opérations confirmées, ou une
  resynchronisation complète si elle est trop ancienne. On ne passe jamais en silence par-dessus un trou de révisions.
- **Une seule API d'opérations pour toutes les entrées** : Studio, assistant (`apply.ts`), MCP, CLI d'auteur (`ids`,
  `i18n`, `voices`, `import-layout`, `storyboard`) et upload d'assets.
  - En mode serveur, MCP et CLI deviennent des **clients** de l'API, authentifiés par un jeton Biscuit atténué.
  - En mode local, ils prennent le verrou de projet ou passent par le serveur local s'il tourne.
  - La route `POST /__layout/<room>` de `tools/vite/plugins.ts:57` disparaît ou passe par le noyau.
- **L'autosave Git n'est plus la garantie.** Il devient l'historique lisible : un commit par lot de révisions, avec
  `Co-authored-by` pour chaque auteur du lot.

### P7. Transport : SSE et HTTP par curseur, comme D17

On garde pour le Studio le choix fait pour le joueur :

- **Un flux SSE par projet** diffuse les révisions confirmées (id d'opération, révision, auteur, pans et ids touchés),
  les baux, la présence et l'état des diagnostics et des builds.
- **Une lecture HTTP par curseur** (`GET /ops?after=<rev>`) donne les mêmes événements. C'est elle qui sert à la
  resynchronisation (P6).
- **La présence** (qui, quel pan, quel onglet) est publiée par un battement HTTP.

Ce choix réutilise le motif éprouvé du Bridge et ne demande aucune nouvelle dépendance. Il ne remet pas en cause D17.
Un WebSocket ne serait envisagé que sur une mesure qui montre que SSE et HTTP ne tiennent pas.

## 4. Sécurité et identité

- **Les comptes** sont des utilisateurs locaux au serveur (mot de passe argon2id, ou lien d'invitation à usage
  unique). Il n'y a pas de fournisseur externe à l'étape 1.
- **Les sessions** reposent sur un cookie `HttpOnly`, `Secure` et `SameSite=Strict`. On conserve la vérification
  d'origine de `security.ts`.
- **Les rôles** :
  - `owner` : gère les membres, reprend les baux, déclenche les builds publics ;
  - `dev` : écrit sur les pans qu'il tient ;
  - `reviewer` : lit, joue, commente.
- **Les jetons de CLI et de MCP** sont des Biscuit atténués au projet et au rôle, avec une expiration et une
  révocation, sur le modèle de `bridge/src/biscuit.ts`.
- **Le modèle de menaces** `docs/dev/threat-models/studio-server.md` est écrit à l'étape 1, avant l'exposition réseau.
  Il couvre :
  - l'upload d'assets, avec taille, type et décodage dans un processus limité ;
  - le code TypeScript de contenu, exécuté par validate et le build : c'est **du code de confiance**, et un `dev` peut
    exécuter du code sur le serveur. On le dit tel quel : les membres sont de confiance ;
  - le chemin de fichiers (traversal) ;
  - le déni de service par builds ;
  - les secrets.

## 5. Découpage

Chaque étape est publiée seule, avec ses gates automatiques et sa passe humaine (issue `field-pass`, D12).

### Étape 0 : cadrage (cette PR) et maquettes

- Ce plan, l'ADR 0025 et D39 dans `DECISIONS.md`.
- Des **maquettes avec les vrais assets** du jeu d'exemple, validées par le mainteneur **avant tout code** :
  - le bandeau de révision ;
  - la présence ;
  - un pan tenu ou libre, et le refus 423 ;
  - le conflit 409 ;
  - le bandeau de santé avec son état périmé ;
  - l'écran Builds ;
  - l'invite « révision N disponible » dans Play.

### Étape 1 : Socle partagé

Elle livre :
- **L'extraction du noyau.** `tools/studio/core.ts`, `source.ts`, `assets.ts` et `apply.ts` deviennent un noyau
  d'opérations paramétré par projet (`studio-server/src/ops/`), avec des effets typés et la garde unifiée (P1, P3).
  La première PR est un découpage neutre, sans changement de comportement.
- **Le paquet `studio-server/`** : serveur Node, sert le Studio buildé et l'API. `--local` lance tout sur une seule
  machine.
- **Le store de métadonnées** SQLite (local) ou Postgres, avec des migrations, selon le motif de `bridge/` : projets,
  comptes, sessions, baux et jetons de fencing, journal d'opérations, idempotence, révisions.
- **Les verrous** par salle et pour les pans global, storyboard et langue, avec fencing (P2).
- **Le flux SSE et la lecture par curseur** : reconnexion et resynchronisation (P6, P7).
- **La convergence des entrées.** MCP, assistant et CLI d'auteur passent par l'API, et la route `__layout` est retirée
  ou rebranchée.
- **Le client.**
  - `src/studio/api.ts` envoie les ids d'opération et les jetons de bail, gère les 409 et 423 et suit la révision vue.
  - `src/studio/main.ts` passe du flux `changed` par fichier au flux de révisions.
  - Le bandeau « révision N » et la présence sont ajoutés.
- **Le modèle de menaces** et `docs/en|fr` (Studio Server, UPGRADING pour le Studio local).

**Hors étape 1** : la prévisualisation commune (Play continue de jouer l'état local du serveur, comme aujourd'hui),
l'undo personnel (l'undo est désactivé en mode serveur, avec un message clair), les builds et la carte.

**Critères de sortie** :
- toutes les écritures du dépôt passent par le noyau. Un test parcourt `tools/` et `src/studio/` et refuse tout
  `writeFileSync` ou `writeFile` vers `games/` hors du noyau ;
- les tests de concurrence et de pannes du §6 sont verts ;
- la passe humaine est faite à deux ou trois navigateurs, avec une coupure réseau volontaire.

### Étape 2 : Atelier jouable

- **La prévisualisation par révision** et l'invite de partie ouverte (P4), avec l'empreinte de contenu dans la
  sauvegarde (ADR 0025).
- **La santé par révision** : diagnostics en tâche de fond, état périmé, révision ayant introduit l'échec (P5).
- **L'undo personnel** : il émet l'opération inverse de la sienne, refusée en 409 si un autre a touché l'élément depuis
  et en 423 si le pan n'est plus tenu.
- **Les builds immuables** : snapshot, compilation isolée, manifeste, `/play/<n>`. Le **dernier build vert** est
  toujours servi.

**Critères de sortie** :
- le seuil de 5 s de prévisualisation est mesuré ;
- un diagnostic périmé s'affiche bien comme tel ;
- le manifeste correspond octet pour octet au snapshot.

### Étape 3 : Coordination avancée

- **Les pans transverses** (personnage, énigme, chapitre) comme regroupements, et la **carte du scénario**
  (`scenario.map.json` dérivé des ids stables et de la provenance IR).
- **Les commentaires ancrés** sur les ids stables, avec ids de répliques généralisés (`ids --lines`).
- **Le diff sémantique** entre révisions et entre builds, avec les captures.
- **Les intégrations** : push vers GitHub, déploiement de référence sur Clever Cloud (FS bucket et Postgres),
  packaging et signature du serveur dans les artefacts de release.

## 6. Tests

En plus des tests unitaires de chaque module.

**Concurrence**, avec trois clients simulés :
- une transaction multi-fichiers s'applique entière ou pas du tout ;
- un pan tenu par un autre donne 423 ;
- une base périmée donne 409 ;
- une opération transverse obtient tous ses verrous ou aucun ;
- dix clients en rafale ne perdent aucune écriture et les sources restent parsables.

**Pannes**, par injection de fautes à chaque frontière de P1 (après l'intention, entre deux renommages, avant la
confirmation) :
- le redémarrage remet le projet dans un état cohérent et journalisé ;
- une requête rejouée n'est appliquée qu'une fois ;
- un bail expiré ou repris fait refuser en 423 les requêtes en vol de l'ancien détenteur ;
- après une coupure réseau, la reconnexion par curseur se fait sans trou ni doublon ;
- une écriture hors serveur détectée met le projet en maintenance.

**Invariant** (test de propriété) : toute opération confirmée au client se retrouve dans la révision suivante, dans
le journal, et à l'étape 2 dans le prochain build.

**Révisions**, à l'étape 2 :
- un diagnostic lancé avant une modification s'affiche périmé ;
- une partie ouverte voit l'invite et reprend ou redémarre ;
- le manifeste correspond au snapshot.

**Qualité** : un set de mutation `studio-ops` pour le noyau d'opérations et le journal, ainsi que les planchers de
couverture. Le set est mesuré dès l'étape 1 et devient bloquant à la release de l'étape.

## 7. Décisions

### D39 — 4.3 « Studio Server »

Le mainteneur a décidé, le 17 octobre 2026 :
- le Studio devient une **plateforme partagée**, avec une seule copie du jeu éditée en direct ;
- les verrous sont explicites et les builds figés ;
- les CRDT sont reportés ;
- le chantier passe après 4.2.0 stable ;
- la réalisation suit les sept principes de ce plan (§3), en trois étapes (§5).

« go to 4.3 », le 17 octobre.

### Numéros réservés et questions ouvertes

- **ADR 0025** : le Studio Server (transactions, pans, fencing, révisions, transport). ADR 0022 reste réservé au DSL.
- **ADR 0026** : réservé à l'empreinte de contenu dans la sauvegarde (P4). Il n'est écrit qu'à l'étape 2. Un ADR n'est
  jamais vide.
- **À trancher par le mainteneur** :
  1. **Les numéros de version des étapes.** On propose **4.3.0, 4.4.0 et 4.5.0**, puisque chaque étape ajoute une
     surface (SemVer mineur). L'alternative est 4.3.0, 4.3.1 et 4.3.2, à la manière de la ligne 4.1.x.
  2. **Le nom de l'étape 1.** On propose « Shared Floor ».

## 8. Ce que ce plan ne fait pas

- Pas de co-édition caractère par caractère, ni CRDT.
- Pas de nouvelle primitive DSL, et aucun changement du sens du DSL gelé (D28).
- Pas de service hébergé par le projet : le serveur est auto-hébergé par une équipe.
- Pas de fournisseur d'identité externe à l'étape 1.
- Pas de changement du Bridge, en dehors de la réutilisation de ses motifs.
- Pas de publication npm du serveur avant l'étape 3.
