# web-scumm 4.1.20 « Last Mile » : plan de release

> **Révision 4 : plan vérifié contre `origin/main` (`aa2462e`) après v4.1.19, puis relu deux fois par le mainteneur
> (12 octobre 2026). Points ajoutés : complétude du backup, modes de restauration toujours explicites, maintenance par
> lease, version pertinente pour les passes, attestations de report séparées des rapports, runbook npm.**  
> **Source normative :** ce fichier, dans Git, depuis la PR de cadrage `docs/4120-plan`. Toute copie hors du dépôt,
> ou tout résumé local, n'en est qu'un reflet.  
> **Base :** `v4.1.19`, commit `15300a34858255215a4a28133c3a9cdde033ad3b`, candidat `38172871690`. `main` ajoute
> #108 et #109 (Dependabot), sans code produit.  
> **Nature :** durcissement du dernier kilomètre. Aucune mécanique, aucune primitive DSL, aucune publication npm.  
> **Campagne terrain :** sur le candidat `4.2.0-rc`, qui suit la 4.1.20 sans changer de code (§12).

## 1. Contexte

La v4.1.19 « Field Closure » est publiée sur le commit
`15300a34858255215a4a28133c3a9cdde033ad3b`, à partir du candidat GitHub Actions `38172871690`.

Elle a fermé l'essentiel de la dette technique relevée après la 4.1.18 :

- backup du Bridge pris dans un snapshot unique ;
- restauration SQL atomique ;
- archives Bridge et connecteurs verrouillées ;
- image Bridge construite une fois et identifiée par ses digests ;
- cinq SBOM CycloneDX ;
- Field Kit autonome et attesté ;
- baseline produite par le candidat exact ;
- connecteurs joués depuis leurs archives ;
- profil de qualification distribué étendu ;
- README recentré sur le jeu, le Studio et les preuves.

L'audit après publication n'a trouvé aucun P0 connu et aucune raison de retirer la release. Il a néanmoins trouvé les
derniers écarts techniques qui empêchent de considérer la préparation de 4.2 comme terminée :

1. `connectors-edge` et `reality-store-postgres` sont mesurés mais non bloquants ;
2. le profil `ops:qualify` complet n'est pas exécuté sur les artefacts du candidat final ;
3. le digest du backup protège le payload, mais pas les métadonnées utilisées pour la compatibilité ;
4. `restore --force` remplace les conflits mais ne dit pas assez clairement qu'il ne rend pas le store identique au
   snapshot ;
5. les mesures de charge sont des échantillons uniques et montrent une tendance Postgres à surveiller ;
6. la preuve humaine est liée à un commit entier, ce qui obligerait à refaire une passe après un changement sans
   rapport avec sa surface ;
7. la signature du tag, l'immuabilité GitHub et la publication npm ne sont encore que des engagements pour 4.2 ;
8. plusieurs scripts de qualification sont devenus des sous-systèmes de plusieurs centaines de lignes.

Au tag 4.1.19, les treize passes humaines sont à `not-run`. C'est une chance : 4.1.20 peut devenir la dernière release
contenant du code avant le candidat 4.2, sans invalider du travail humain déjà réalisé.

### 1.1 Constats vérifiés contre le code (révision 4)

Les affirmations ci-dessus ont été relues contre `origin/main`. Celles qui changent l'exécution :

1. **Digest du backup 3** : `payloadDigest` ne couvre que `payload`. `counts` est recontrôlé contre le payload, mais
   `bridge.version`, `store.kind`, `store.schema`, `startedAt` et `endedAt` ne sont pas protégés. Le point 3 est
   confirmé.
2. **`restore --force`** supprime puis réécrit les tenants du fichier, leurs runs et les clés Daily en conflit, et
   conserve tout le reste. C'est bien une fusion, et le point 4 est confirmé.
3. **Profils de qualification** :
   - le candidat joue `ops:qualify --short` (20 étapes : sans reprise de worker, sans quota, sans store 4.1.17, avec
     200 runs) ;
   - le workflow `qualify` joue le profil complet (23 étapes, environ 4 minutes sur runner), mais il le construit
     depuis les sources et ne tourne que sur filtre de chemins ;
   - la qualification complète citée comme faite « sur le code taggé » porte sur la fusion de la PR 5 de la 4.1.19,
     pas sur le commit du tag.
4. **Le backup n'est pas « tout le store »** :
   - la migration 0004 crée `run_quota`, que le backup ne compte, n'exporte, ne restaure ni ne compare ;
   - `schema_migrations` est une table de contrôle ;
   - `makeBackup` accepte aussi les stores `memory` et `jsonl`, dont le schéma SQL est `null`.
5. **SQLite est multi-processus** : le store l'écrit en tête de fichier, et les tests le jouent avec trois
   processus. Le Bridge n'a aucun mode maintenance.
6. **`reality-store-postgres` ne mute que `store-postgres.ts`**.
   - Les transactions, la tenancy et le fan-out vivent dans `store-sql.ts` et `streams.ts`, mutés par
     `reality-store` sur SQLite.
   - La file et le leaderboard vivent dans `runs-store.ts`, muté par `runs`.
   - **`backup.ts` n'est dans aucun ensemble**, et `docs/dev/mutants.json` n'a aucune entrée pour lui. La PR 1b l'ajoute
     à `reality-store` (§6.0).
   - **La matrice de mutation est écrite à la main dans quatre workflows** : `ci`, `candidate`, `nightly` et `release`.
     Celle de `release.yml` n'a ni service Postgres ni shards, avec un délai de 120 minutes. La PR 2a la génère depuis
     `tools/mutation-sets.ts` (§7.3).
7. **La version du package est une donnée fonctionnelle**. `engineVersion()` entre dans l'IR (`tools/game-ir.ts`),
   les paquets speedrun, `site.json` et le bundle (`__ENGINE_VERSION__`). Elle change donc les artefacts de presque
   toutes les surfaces.
8. **`release.yml` crée la release, puis y téléverse les fichiers**. C'est incompatible avec les releases immuables :
   il faut passer par un brouillon.
9. **Côté GitHub et npm**, au 12 octobre :
   - les releases immuables sont désactivées ;
   - aucun ruleset ne protège les tags ;
   - les quatre noms npm sont libres ;
   - le dépôt déclare `npm@10.9.2`, alors que le trusted publishing exige npm 11.5.1 et Node 22.14.0, et
     `npm stage` npm 11.15.0.
10. **Les mesures des ensembles mesurés** sont au §4.1.
11. **`reality-store-postgres` ne peut pas être mesuré sur `main`** : le nightly du 12 octobre et une relance
    (`mutation`, sur `main`) s'arrêtent avant le premier mutant, car les tests de référence échouent. Reproduit en local
    sur Postgres 15, le défaut a deux causes et révèle deux lacunes, et il ne vient pas du produit :
    - la seconde lecture de la PR 3 de la 4.1.19 a ajouté cinq fichiers à l'ensemble après sa dernière mesure. Dans
      `tests/bridge-leaderboard.test.ts`, chaque `make()` SQLite ouvre un fichier neuf, mais le `make()` Postgres
      rouvre la même base, si bien que les lignes s'accumulent d'un test à l'autre. Avec une base vidée par `make()`,
      les 19 tests passent ;
    - la configuration de mutation lance les fichiers en parallèle contre une seule base.
      `tests/bridge-admission.test.ts` échoue ainsi, mais passe quand les fichiers tournent un à un ;
    - le job `bridge-postgres` de la CI ne joue que cinq des huit fichiers (`--maxWorkers=1`). `bridge-admission`,
      `bridge-hardening` et `bridge-leaderboard` ne passent donc jamais sur Postgres dans la gate ;
    - `tools/mutate.ts` jette la sortie de vitest, et rien ne dit quel test échoue.

    C'est classé comme un défaut de test et d'outillage. Le produit est conforme, puisque les mêmes tests passent dès
    qu'ils sont isolés. Le correctif entre dans la PR 2a (§7.2).

## 2. Verdict et positionnement

4.1.20 est une release de **durcissement du dernier kilomètre**, pas une release de fonctionnalités.

Elle doit :

- fermer les deux dernières zones de mutation non bloquantes ;
- faire porter la qualification complète sur les fichiers exacts qui seront publiés ;
- rendre le contrat de backup plus difficile à mal interpréter ;
- permettre de transporter une passe humaine vers un candidat ultérieur seulement lorsque les artefacts de sa surface
  sont identiques, hors exclusions prouvées (§9) ;
- préparer une campagne terrain sur le candidat `4.2.0-rc`, qui ne change que la version (§12) ;
- répéter à blanc les opérations irréversibles de 4.2 ;
- réduire la dette des fichiers qu'elle touche, sans réécriture générale.

Elle ne doit pas :

- ajouter une mécanique de jeu ;
- étendre le DSL ou l'IR ;
- changer `rulesVersion` ;
- changer la signification d'une sauvegarde ou d'un `.wsrun` ;
- ajouter un connecteur, un renderer ou un backend ;
- publier les packages npm stables ;
- présenter une surface expérimentale comme stable avant sa passe humaine.

Le nom proposé est **4.1.20 « Last Mile »**.

## 3. Décisions (acceptées par le mainteneur le 12 octobre 2026)

### D34 — Dernière release de code avant 4.2

4.1.20 est la dernière release 4.1.x planifiée qui contient du code. Après son candidat final :

- une correction P0/P1 peut encore produire une 4.1.21 ;
- aucune nouvelle fonctionnalité ne retarde la campagne terrain ;
- les changements ordinaires suivants sont la version, les notes, la signature et la publication de 4.2.

Précisions du 12 octobre :

- la 4.1.20 ne publie rien sur npm ;
- **la campagne terrain a lieu sur le candidat `4.2.0-rc`**, pas sur la 4.1.20. Après le tag 4.1.20, une PR sans code
  monte la version à 4.2.0. Son candidat porte `v4.2.0-rc.1`, signé, et les treize passes. La version étant pertinente
  (D35), c'est le seul moyen de faire qualifier la 4.2 par les passes. Ensuite, une PR ne change que les fichiers de
  statut. Son candidat, le `rc` suivant, reçoit les passes par `field:carry` avec des attestations signées, et
  `v4.2.0` est taguée et publiée depuis ce run (§12) ;
- **le risque qu'un tiers réserve les quatre noms npm avant 4.2 est accepté**. Un job non bloquant du nightly
  (PR 3b) vérifie chaque jour qu'ils restent libres, et `preflight-stable` le vérifie aussi à chaque appel ;
- les releases GitHub immuables et un ruleset de tags `v*` sont activés pendant la 4.1.20, par le mainteneur, après la
  PR qui fait passer `release.yml` en brouillon ;
- le tag 4.1.20 reste non signé (D30), mais le candidat répète la signature SSH de 4.2 avec une clé éphémère.

### D35 — Une passe qualifie une surface, pas aveuglément tout un commit

Une passe reste liée au candidat qui l'a produite. Elle peut être reportée sur un candidat ultérieur uniquement si
`field:carry` prouve que son empreinte de surface et tous les artefacts qu'elle utilise sont identiques.

Une différence pertinente refuse automatiquement le report. Une différence non pertinente est listée et doit être
acceptée explicitement par le mainteneur. Il n'existe ni option `--force`, ni joker de chemins.

Précisions du 12 octobre :

- **la version est pertinente par défaut**, car elle entre dans l'IR, `site.json`, le bundle et les paquets
  speedrun ;
- on compare les artefacts construits et attestés par le candidat, jamais des sources normalisées ;
- une exclusion se déclare par surface, avec sa justification et un test qui prouve que la surface ne lit pas
  l'élément exclu ;
- le rapport humain (`FieldReport`, quatre statuts) n'est jamais réécrit : le report est une `CarryAttestation`
  séparée ;
- l'approbation est un **commit signé par le mainteneur**, avec sa clé matérielle `id_ed25519_sk`, vérifiée contre
  `.github/allowed_signers` tel qu'il était au candidat source. Claude n'en écrit jamais. *(14 octobre, D37 : la
  racine est finalement la clé logicielle `id_ed25519`, sans phrase de passe ; la signature prouve l'usage de la clé,
  pas l'accord personnel du mainteneur, qui est consigné explicitement.)* ;
- il n'y a pas de revue CODEOWNERS obligatoire : le mainteneur est seul collaborateur et ne peut pas approuver ses
  propres PR. CODEOWNERS reste informatif ;
- grâce à la campagne sur le candidat `4.2.0-rc` (D34), `field:carry` ne sert qu'entre deux `rc` de la 4.2 : après un
  correctif P0/P1, et du `rc` des passes vers le `rc` des fichiers de statut.

### D36 — Sémantique explicite de la restauration

Le comportement actuel reçoit le nom `merge` : le backup remplace ses conflits, mais conserve les données étrangères
au fichier. Un mode `replace-store`, destructif et explicitement confirmé, rend la destination identique au snapshot.

Les deux modes restent atomiques.

Précisions du 12 octobre, qui remplacent « le mode par défaut est `merge` » :

- **`--mode` est toujours obligatoire**. Un `restore` sans mode est refusé avec un message qui nomme les deux modes.
  C'est un changement explicite, décrit dans UPGRADING ;
- **les deux modes exigent la maintenance** : aucun écrivain vivant (`serve`, ou toute commande qui ouvre le store en écriture, migrations comprises), prouvé
  par le protocole de lease du §6.4. Le restore refuse au lieu d'attendre la fin d'une lease. Seul le verrou consultatif
  de Postgres est réessayé, et dans un délai borné ;
- `replace-store` n'accepte qu'un backup de schéma 4 complet (§6.1), du même schéma SQL que la destination, et
  écrit d'abord un backup de sécurité vérifié (`--safety-out`) ;
- le digest est un contrôle d'intégrité contre l'altération accidentelle, **pas une signature**.

### Numéros réservés

- ADR 0022 reste vacant : il est réservé à la première extension DSL (D33), hors périmètre.
- **ADR 0023** couvre le backup 4, la complétude, la maintenance et les modes de restauration.
- **ADR 0024** couvre la preuve par surface et les attestations de report.
- On n'écrit jamais d'ADR vide.

## 4. État de référence et mesures à conserver

Le candidat 4.1.19 sert de point de comparaison :

| Mesure | Référence 4.1.19 |
|---|---:|
| Déclarations de tests | 1 872 |
| Preuve de la démo | `solved`, 3 480 états, 0 softlock |
| Preuve du chapitre de référence | `solved`, 288 états, 0 softlock |
| Premier chargement JS | 133 Ko gzip |
| SQLite, propositions | 392/s, p95 387,2 ms, 0 trou |
| Postgres, propositions | 271/s, p95 507,4 ms, 0 trou |
| Leaderboard SQLite, 100 000 runs | p95 464,4 ms, 126 Mo RSS |
| Leaderboard Postgres, 100 000 runs | p95 205,6 ms, 134 Mo RSS |
| Qualification candidate | 20/20 étapes, profil court |
| Mutations bloquantes | 7 ensembles, 0 survivant inexpliqué |
| Passes humaines | 0/13 |

Les seuils de sécurité existants ne sont pas relâchés. Une variation de performance est comparée sur plusieurs
tentatives avant d'être appelée régression.

### 4.1 Ensembles mesurés, premiers scores

Ces scores ont d'abord été mesurés par dispatch, avant la fusion de #106. Le nightly qui suit le tag 4.1.19
(`38239994636`, sur `main`) retrouve pour `connectors-edge` exactement les mêmes chiffres, en 2 h 02. De son côté,
`reality-store-postgres` ne se mesure plus sur `main` tant que la PR 2a n'a pas corrigé ses tests (§1.1, point 11) :
le chiffre ci-dessous reste celui du dispatch.

| Ensemble | Tués / total | Survivants inexpliqués | Durée sur runner |
|---|---:|---:|---|
| `connectors-edge` | 638 / 1 126 | 488 | 2 h 41 puis 2 h 02, non shardé |
| `reality-store-postgres` | 15 / 41 | 26 | 14 min |

Survivants de `connectors-edge` par fichier :

| Fichier | Survivants |
|---|---:|
| `badges/verify` | 168 |
| `email/connector` | 70 |
| `ssh` | 44 |
| `email/imap` | 40 |
| `terminal/shell` | 32 |
| `badges/connector` | 29 |
| `run` | 28 |
| `telnet` | 25 |
| `http` | 18 |
| `registry` | 12 |
| `terminal/guard` | 12 |
| `email/parse` | 6 |
| `config` | 4 |

Côté Postgres, les survivants sont dans `withTx` (retry, advisory lock), la reconnexion de `LISTEN` et `close`.

Sans sharding, le candidat passerait de 79 minutes à plus de trois heures : le §7.3 devient obligatoire.

## 5. Découpage

| Ordre | PR | Branche | Contenu | Dépend de |
|---:|---:|---|---|---|
| 1 | C | `docs/4120-plan` | ce plan, D34–D36, réservations | — |
| 2 | 1a | `refactor/4120-backup-split` | caractérisation et découpage neutre de `backup.ts` | PR C |
| 2 | 2a | `test/4120-mutation-shards` | tests Postgres isolés, sharding, matrice unique, exemptions, `reality-store-postgres` bloquant | PR C |
| 3 | 1b | `fix/4120-backup-contract` | backup 4, complétude, maintenance, modes ; `bridge/src/backup/*` dans `reality-store` | PR 1a, PR 2a |
| 3 | 2b–2d | `test/4120-edge-<famille>` | survivants de `connectors-edge` : badges, email, terminal | PR 2a |
| 4 | 2e | `test/4120-edge-rest` | le reste de `connectors-edge`, puis l'ensemble dans `GATED` | PR 2b–2d |
| 4 | 3 | `ci/4120-exact-qualification` | découpage d'`ops-qualify`, manifeste d'artefacts, qualification exacte, performance | PR 1b |
| 5 | 4 | `feature/4120-field-carry` | surfaces, attestations de report, `allowed_signers` | PR 3 |
| 5 | 3b | `ci/4120-stable-rehearsal` | release en brouillon, signature répétée, `preflight-stable`, veille des noms npm, runbook npm | PR 3 |
| 6 | — | réglage GitHub | le mainteneur active l'immuabilité et le ruleset `v*` | PR 3b |
| 7 | — | candidat technique | obligatoire, sans passe | PR 1a à PR 4, PR 2e, PR 3b |
| 8 | 6 | `release/4.1.20` | version, docs, baseline | ordres 6 et 7 (réglage fait, candidat technique vert) |
| 9 | — | candidat final, RC, stable 4.1.20 | vérification humaine de la RC | PR 6 |
| 10 | 7 | `release/4.2.0-rc` | la version 4.2.0, les notes, sans code | ordre 9 (tag 4.1.20) et nightly suivant classé |
| 11 | — | candidat `4.2.0-rc`, `preflight-stable`, puis `v4.2.0-rc.1` signé | issues commentées, `field:init`, campagne | PR 7 |
| 12 | 8 | `release/4.2.0-status` | les fichiers de statut seuls, d'après les passes | ordre 11 (campagne) |
| 13 | — | candidat de statut (`rc.2` ou suivant), `field:carry`, `v4.2.0` | attestations signées par le mainteneur | PR 8 |

La colonne « Dépend de » nomme des PR (« PR 6 ») ou des ordres (« ordre 7 »).

### 5.1 Ordre restant (15 octobre) — ce tableau remplace l'ordonnancement ci-dessus à partir de l'ordre 6

Les ordres 1 à 5 sont faits : PR C #110, 1a #111, 2a #112, 1b #113, 1c #114 (maintenance, détachée de la 1b),
2b–2e réunies en #118, PR 3 #119, durcissement des connecteurs #120 (hors plan), PR 4 #121, PR 3b #122 (empilée sur la
PR 4, qui crée `surfaces.json`). Le ruleset `v*` (création, suppression, non-fast-forward) est actif depuis le 14
octobre ; l'immuabilité des releases depuis le 15. Les étapes qui suivent n'attendent plus le mainteneur, sauf mention :

| # | Étape | Après |
|---:|---|---|
| a | seuils du candidat technique écrits avant son lancement (`changes/4120-release.log.md`) | #122 |
| b | candidat technique, lancé avec le SHA complet de `main` ; profil `ops:qualify` complet, répétition de signature | a |
| c | `ship preflight-stable` à la main ; manques acceptables : les lignes npm, la clé de signature sur GitHub | b |
| d | PR 6 `release/4.1.20`, liste fermée (§11.3 réduit à ce qui manque), `load.json` selon les seuils de a | b |
| e | candidat final sur le SHA de fusion de la PR 6 ; une relance au plus par job, consignée | d |
| f | `preflight-stable`, puis `v4.1.20-rc.1` ; `ship verify`, `gh release verify`, statut immuable | e |
| g | si les trois contrôles de f passent, `v4.1.20` sur le même SHA et le même run, sans attendre (accord du mainteneur, 15 octobre) ; nightly lancé sur ce SHA | f |
| h | PR 7 `release/4.2.0-rc` : la version et les notes, sans code ; son candidat | g |
| i | nightly classé, `preflight-stable`, `v4.2.0-rc.1` signé avec `id_ed25519` (D37 ; Claude signe, accord du 15 octobre) ; `field:init` sur #75–#87 | h |

Si un contrôle de f échoue, la stable est bloquée et rc.1 reste en place. Un défaut du code ou des artefacts donne un
correctif, un nouveau candidat et `rc.2`. Une publication interrompue : `release.yml` supprime le brouillon restant et
refait la release en entier ; deux échecs donnent `rc.2` sur le même SHA et le même run.

**Pourquoi cet ordre.**
- La PR 1a ne touche aucun ensemble de mutation, et `mutants.json` n'a aucune entrée pour `backup.ts`. Elle avance donc
  en parallèle de la 2a.
- La PR 1b vient après les deux. Elle ajoute `bridge/src/backup/*` à `reality-store` et lit ses survivants avec le
  schéma d'exemption de la 2a.
- 2b–2d avancent côte à côte, et 2e ferme l'ensemble en dernier.
- La PR 3 attend la 1b, parce que la qualification joue les deux modes et la migration 0005.
- Enfin, 4 et 3b.

Une seule suite de tests tourne à la fois sur la machine du mainteneur. Les mutations, Docker et la qualification tournent sur les runners. Chaque PR reçoit le label
`full-ci` et une seconde lecture automatisée avant fusion.

**Il n'y a plus de PR de refactoring en fin de cycle.** Un découpage « neutre » juste avant le candidat produit des
défauts sans le vouloir. `backup.ts` est découpé dans la PR 1a, `ops-qualify.mjs` au début de la PR 3, et le
manifeste d'artefacts entre dans la PR 3. Le reste, dont `connector-archive-e2e.mjs`, attend la fin de la campagne.

## 6. PR 1a et 1b — Backup vérifiable et restauration sans ambiguïté

> **Livré par #111 (1a), #113 (1b) et #114 (1c, maintenance)**, fusionnées sur `main` avant la release.

### 6.0 PR 1a : découpage neutre

1. **Caractérisation d'abord**, sur le code actuel : formats, messages et codes de sortie de `backup` et de
   `restore`, pour les schémas 1 à 3.
2. Découpage en :

   ```text
   bridge/src/backup/schema.ts
   bridge/src/backup/canonical.ts
   bridge/src/backup/files.ts
   bridge/src/backup/snapshot.ts
   bridge/src/backup/restore.ts
   bridge/src/backup/index.ts
   ```

   Les exports publics passent par `index.ts`. L'API publique est inchangée, et la caractérisation reste verte.
3. Aucun ensemble de mutation ne change dans la PR 1a.

**Dans la PR 1b**, `bridge/src/backup/*` et la maintenance entrent dans `reality-store`. Leurs survivants sont lus :
chacun est tué ou exempté (§7.4). Un test garantit que tout fichier de `bridge/src/backup/` appartient à un ensemble
bloquant.

### 6.1 Format de backup 4

```ts
interface BackupV4 {
  format: 'web-scumm-bridge-backup';
  schema: 4;
  bridge: { version: string };
  store: { kind: 'memory' | 'jsonl' | 'sqlite' | 'postgres'; schema: number | null };
  completeness: {
    scope: 'whole-store' | 'tenants-only';
    families: Array<'tenants' | 'runs' | 'daily' | 'run-quotas'>;
    controlFamilies: Array<'schema-migrations' | 'maintenance'>;
  };
  startedAt: string;
  endedAt: string;
  counts: BackupCounts;
  payload: BackupPayload;
  digest: { alg: 'sha256'; scope: 'envelope'; value: string };
}
```

L'empreinte couvre la représentation canonique de `bridge`, `store`, `completeness`, `startedAt`, `endedAt`,
`counts` et `payload`. Seuls `format`, `schema` et `digest` sont hors de leur propre empreinte.

**Complétude.**

- Un store SQL produit `scope: 'whole-store'` avec les quatre familles. Le schéma 4 exporte, compte, restaure et
  compare `run_quota`.
- Un store `memory` ou `jsonl` produit `tenants-only`.
- Les tables de contrôle ne sont jamais restaurées : `schema_migrations` décrit la destination, et `maintenance`
  porte le verrou en cours.
- **Un registre des tables SQL** (`bridge/src/backup/tables.ts`) classe chaque table créée par les migrations, ainsi
  que `schema_migrations`, comme `backed-up` (avec sa famille), `control` ou `explicit-ephemeral`. `replace-store`
  vide les tables `explicit-ephemeral`, et `merge` n'y touche pas. Un test applique toutes les migrations sur SQLite et
  sur Postgres, liste les tables réelles (hors tables internes `sqlite_*`) et échoue si l'une n'est pas classée. Une
  future migration ne peut donc pas rendre `whole-store` faux en silence.

**Ce que le digest garantit.** C'est un contrôle d'intégrité contre l'altération accidentelle ou la troncature, pas
une signature : quiconque peut modifier le fichier peut aussi recalculer le SHA-256. Cela est écrit dans l'ADR 0023,
REALITY-OPS et `bridge restore --help`.

Le lecteur reste compatible avec les schémas 1, 2 et 3, **pour `merge` seulement**. Pour le schéma 3, il dit
explicitement que seul le payload est couvert. Un backup d'un schéma SQL plus récent reste refusé avant la première
écriture.

### 6.2 Validation des métadonnées

- dates ISO 8601 strictes ;
- `endedAt >= startedAt` ;
- version Bridge SemVer, ou valeur historique explicitement acceptée ;
- schéma SQL entier, non négatif et compatible, ou `null` pour un store non SQL ;
- backend source reconnu ;
- `completeness` cohérente avec le backend et le payload ;
- compte exact de chaque famille ;
- ordre canonique conservé entre SQLite et Postgres.

### 6.3 Modes de restauration

```text
bridge restore --from=<file> --mode=merge [--force]
bridge restore --from=<file> --mode=replace-store --yes-replace-store --safety-out=<file>
```

**Les deux modes :**

- `--mode` est toujours obligatoire. Un `restore` sans mode est refusé avec un message qui nomme les deux modes ;
- la maintenance est exigée (§6.4) ;
- l'opération est atomique ;
- l'audit complet a lieu avant le commit ;
- la sortie vaut 3 si l'issue du commit est inconnue.

`merge` :

- refuse les conflits sans `--force` ;
- avec `--force`, remplace uniquement les familles que le fichier porte : ses tenants, leurs runs et, pour un schéma 4,
  leurs quotas (un schéma 1 à 3 ne touche pas aux quotas),
  ainsi que les clés Daily qu'il porte. `daily_kv` n'a pas de tenant, donc ce sont les clés qui comptent ;
- conserve les tenants, runs, quotas et clés Daily étrangers au backup ;
- l'ensemble des tenants d'un fichier inclut ceux qui n'ont que des lignes de quota ;
- accepte les schémas 1 à 4.

`replace-store` :

- n'accepte qu'un **schéma 4 dont `completeness.scope` vaut `whole-store`**. Un schéma 3, même authentique, est
  refusé, car rien sous son digest ne dit ce qu'il contient ;
- exige `backup.store.schema === destination.store.schema`. Un snapshot d'un autre schéma SQL est refusé. Il n'y a
  aucune migration de backup en 4.1.20 ;
- exige `--yes-replace-store` ;
- exige `--safety-out=<file>` et, **avant toute suppression** :
  - refuse un chemin qui existe déjà, un lien symbolique ou un fichier non régulier ;
  - écrit le backup 4 de la destination dans un fichier temporaire privé (0600, même dossier), fait un `fsync`, le
    renomme de façon atomique, puis fait un `fsync` du dossier quand la plateforme le permet ;
  - relit ce fichier et vérifie son empreinte ;
  - n'entame rien si l'une de ces étapes échoue, que ce soit par manque d'espace ou par dépassement mémoire ;
- supprime dans la même transaction ce que le snapshot ne contient pas, sauf les tables de contrôle ;
- relit l'intégralité du store avant le commit ;
- garde le verrou exclusif jusqu'à la fin de l'audit ;
- affiche **toujours** le chemin de récupération : en cas de succès, d'échec d'audit ou de commit inconnu.

### 6.4 Maintenance

Le Bridge n'a aujourd'hui aucun mode maintenance, et SQLite est multi-processus. Un fichier PID ne serait pas un
verrou. La maintenance devient donc un protocole transactionnel dans le store, avec **la migration 0005**.

**La table `maintenance`** contient une ligne par lease :

| Colonne | Contenu |
|---|---|
| `instance_id` | clé |
| `kind` | `serving` ou `exclusive` |
| `acquired_at` | début de la lease |
| `expires_at` | expiration |

Une contrainte interdit deux leases `exclusive`. **Toutes les heures viennent de la base**, jamais de l'horloge d'une
instance. Elles sont stockées en millisecondes epoch (`BIGINT`), comme les autres tables, et calculées dans la couche
de dialecte, puisque les migrations sont neutres :

| Base | Expression | Pourquoi |
|---|---|---|
| Postgres | `(extract(epoch FROM clock_timestamp()) * 1000)::bigint` | `now()` reste figé au début de la transaction |
| SQLite | `CAST(unixepoch('subsec') * 1000 AS INTEGER)` | `node:sqlite` embarque SQLite 3.47, et `subsec` existe depuis 3.42 |

**Les écrivains** sont toutes les commandes qui ouvrent le store en écriture, migrations comprises :

- `serve` ;
- `migrate`, dans ses deux formes ;
- `tenant delete` ;
- `restore` ;
- toute commande qui ouvre le store avec `migrate: true`, le défaut de `openStore`, comme `backup` ou `tenant export`.
  Appliquer une migration en attente, c'est écrire.

Chacun prend une lease `serving` pour la durée de son écriture, **sauf `restore` et la descente de `migrate`**, qui
prennent la lease `exclusive` (ci-dessous) : une lease `serving` les ferait se refuser eux-mêmes.

`grant`, `rotate` et `revoke` n'ouvrent pas le store : le premier signe un jeton avec la clé racine, le deuxième
réécrit `config.json`, le troisième appelle un `serve` vivant. `doctor` ouvre le store sans migrer. Sur une base vide,
il crée le fichier (SQLite, en WAL) et `schema_migrations`, puis échoue faute de tables, sans toucher à aucune donnée.

**Amorçage.** La table `maintenance` n'existe qu'après la migration 0005. Les migrations jusqu'à 0005 s'exécutent donc
sous le seul verrou du dialecte : l'advisory lock de migration sur Postgres, `BEGIN IMMEDIATE` sur SQLite. Ensuite,
toute ouverture prend sa lease.

**Descente sous le schéma 5** (`migrate --schema=N`, avec N < 5). `migrate` défait une étape par transaction, en ordre
inverse : la 0005 est donc défaite la première, et la table `maintenance` disparaît avec elle. Le protocole ne protège
plus les étapes suivantes. La descente prend d'abord la lease `exclusive`. UPGRADING impose, comme avant la 4.1.20,
l'arrêt de tous les écrivains pendant l'opération, car un `serve` ou un `backup` ouvert avec `migrate: true`
remonterait le schéma.

**`restore`, dans les deux modes :**

1. Postgres : prendre `pg_try_advisory_lock(K)` en exclusif, en réessayant pendant un délai borné
   (`--lock-timeout`, 30 secondes par défaut), puis refuser. Jamais d'attente indéfinie.
2. Ouvrir une transaction de maintenance (`BEGIN IMMEDIATE` sur SQLite).
3. Supprimer les leases expirées.
4. **Refuser immédiatement** s'il reste une lease `serving` vivante, en citant les instances et leur expiration.
5. Insérer la lease `exclusive`, puis commit.
6. Postgres : renouveler cette lease sur une connexion distincte pendant le backup de sécurité, la restauration et
   l'audit. Si un renouvellement échoue, abandonner avant le commit. SQLite : la restauration et son audit tiennent
   dans une seule transaction `BEGIN IMMEDIATE`, dont le verrou d'écriture exclut tout autre écrivain jusqu'au commit.
   La lease ne peut pas y être renouvelée, puisque les instructions d'un fichier sont sérialisées dans le processus.
   Elle est donc posée avant, avec une durée qui couvre l'opération bornée par `--max-bytes`, et vérifiée vivante au
   début de la transaction.
7. Après l'audit, supprimer la lease. Après un crash, elle expire.

**`serve` :**

1. Postgres : prendre `pg_advisory_lock_shared(K)` sur une **connexion dédiée**.
2. Dans une transaction : supprimer les leases expirées, refuser de démarrer si une `exclusive` vivante existe,
   sinon insérer sa lease `serving`.
3. Renouveler la lease à intervalle fixe. Si le renouvellement échoue ou si la connexion dédiée tombe, l'instance
   devient non prête (`/readyz` répond 503) et refuse les écritures. Elle reprend le verrou, puis la lease, avant de
   servir à nouveau.

**L'ordre d'acquisition est le même partout** : l'advisory lock d'abord, la transaction de lease ensuite. Cela écarte
tout deadlock.

**Le protocole est coopératif** : un Bridge 4.1.19 ne le connaît pas. UPGRADING impose donc l'arrêt de toutes les
anciennes instances avant le premier `restore` en 4.1.20.

La migration 0005 est jouée sur des stores écrits par la 4.1.17 et par la 4.1.19. La maintenance entre dans des
ensembles de mutation bloquants : `reality-store`, et `reality-store-postgres` pour ce qui est propre à Postgres.

### 6.5 Mémoire et grands backups

Mesurer, sur runner :

- des backups de 64, 128 et 256 Mio ;
- le pic RSS à l'export ;
- le pic RSS au parse, à la canonicalisation et à la restauration ;
- la durée sur SQLite et sur Postgres ;
- le comportement à un octet, puis à une ligne au-dessus de la limite.

**Le budget dépend du profil déployé** : limite mémoire du conteneur de qualification, RSS de base du Bridge et marge
de sécurité. Un fichier qui ne tient pas dans cette enveloppe est refusé avant le parse. Le critère
« quatre fois `--max-bytes` » est abandonné : avec 256 Mio, il autorisait environ 1 Gio.

Si l'enveloppe ne tient pas, le format 4 passe à un hash incrémental et à une sérialisation canonique en streaming
avant la fusion.

### 6.6 Tests rouges à écrire en premier

- chaque métadonnée (`store.*`, `bridge.version`, dates, `counts`, `completeness`) modifiée sans recalcul du digest ;
- une date invalide ou inversée ;
- un store plus récent avec une métadonnée falsifiée ;
- `replace-store` refusé :
  - sur un schéma 3 authentique ;
  - sur un schéma 3 JSONL ré-étiqueté `sqlite` ;
  - sur un schéma 4 `tenants-only` ;
  - sur un schéma SQL différent ;
  - sans `--yes-replace-store` ou sans `--safety-out` ;
- `--safety-out` :
  - un chemin existant, un lien symbolique ou un fichier non régulier : refusé ;
  - un `ENOSPC` injecté ou un dépassement mémoire : aucune suppression ;
  - le chemin est affiché dans les trois issues ;
- complétude :
  - une table ajoutée sans classement fait échouer le registre, sur SQLite et sur Postgres ;
  - `run_quota` fait l'aller-retour ;
  - `schema_migrations` et `maintenance` ne sont ni restaurées ni supprimées ;
- maintenance :
  - `restore` sans `--mode` est refusé ;
  - une lease `serving` vivante provoque un refus immédiat ;
  - une lease expirée est supprimée ;
  - SQLite : deux processus `serve` et un `restore` concurrents ; un `serve` lancé après la pose de l'`exclusive`
    refuse de démarrer ;
  - un renouvellement de l'`exclusive` qui échoue en cours de route provoque un abandon avant commit ;
  - une horloge d'instance décalée ne change rien ;
  - Postgres : la coupure de la connexion dédiée rend l'instance non prête ; le `try lock` échoue au bout du délai ;
    l'ordre des verrous est le même sous charge concurrente ;
- restauration :
  - un tenant étranger est conservé en `merge` et supprimé en `replace-store` ;
  - un échec injecté à chaque suppression et insertion des deux modes laisse le store intact ;
  - un commit dont la réponse est perdue donne le code 3 ;
  - la comparaison logique complète après commit passe ;
- un backup proche de l'enveloppe mémoire ;
- la lecture des fixtures de schémas 1, 2 et 3 en `merge` ;
- la migration 0005 sur des stores 4.1.17 et 4.1.19.

### 6.7 Critères de sortie

- toute métadonnée sémantique du schéma 4 casse l'empreinte si elle change ;
- seul un backup 4 complet, du même schéma SQL, ouvre `replace-store` ;
- toutes les tables SQL sont classées ;
- les quatre schémas restent lisibles, et les schémas 1 à 3 seulement en `merge` ;
- chaque mode est atomique et exige la maintenance ;
- la CLI ne permet pas de confondre fusion et miroir ;
- le backup de sécurité est vérifié avant toute suppression ;
- le pic mémoire est mesuré et publié contre le profil ;
- REALITY-OPS et UPGRADING donnent un exemple de chaque mode, l'arrêt des instances 4.1.19 et le rôle du digest, en
  anglais et en français ;
- ADR 0023.

## 7. PR 2a à 2e — Fermer les deux dernières zones de mutation

> **Livré par #112 (2a) et #118 (2b–2e réunies)**, fusionnées sur `main` avant la release.

### 7.0 Découpage

- **2a** pose le sharding (§7.3) et le schéma d'exemption (§7.4), puis rend `reality-store-postgres` bloquant.
- **2b** : badges (`badges/verify`, `badges/connector`).
- **2c** : email (`email/connector`, `email/imap`, `email/parse`).
- **2d** : terminal (`terminal/guard`, `terminal/shell`, `ssh`, `telnet`).
- **2e** : le reste (`run`, `http`, `registry`, `config`). Elle fait passer `connectors-edge` dans `GATED`.

Les PR 2b à 2e touchent des fichiers disjoints et avancent en parallèle. Chacune lance sa mutation en `--file` sur un
runner.

### 7.1 `connectors-edge`

Lire chaque survivant, fichier par fichier :

- configuration et démarrage ;
- webhook et IMAP ;
- parsing email ;
- vérification et orchestration Open Badge ;
- garde et shell du terminal ;
- SSH ;
- Telnet.

Chaque survivant est :

- tué par un test ciblé ;
- ou exempté avec une entrée structurée dans `docs/dev/mutants.json` (§7.4) ;
- jamais accepté parce que le score global paraît suffisant.

Les scénarios réseau difficiles à muter dans le processus utilisent les serveurs locaux du test archive. Les
destinations publiques, changements DNS et fournisseurs réels restent dans la passe #79.

### 7.2 `reality-store-postgres`

La mutation tourne sur un service Postgres isolé. L'ensemble couvre ce que seul Postgres exécute : `store-postgres.ts`
et la partie Postgres de la maintenance (§6.4).

Les thèmes suivants sont couverts par l'union de `reality-store` (sur SQLite, qui reçoit `bridge/src/backup/*` dans
la PR 1b), de `runs` (`runs-store.ts` : file et leaderboard) et de `reality-store-postgres`, sans dupliquer de
mutant :

- transactions et rollback ;
- isolation du snapshot ;
- advisory locks ;
- retries sur sérialisation, deadlock et unicité ;
- reconnexion de `LISTEN` ;
- backup et restore ;
- fan-out ;
- tenancy ;
- queue et leaderboard.

Les mutants qui ne sont observables qu'en concurrence reçoivent des tests de synchronisation déterministes, pas des
temporisations arbitraires.

**Préalable, dans la PR 2a** (§1.1, point 11). Tests rouges d'abord :

- chaque store Postgres d'un test part d'une base vide, comme un fichier SQLite neuf ;
- l'ensemble joue ses fichiers un à un contre Postgres. Sa référence est verte sur `main` ;
- le job `bridge-postgres` de la CI lit la liste des fichiers depuis `tools/mutation-sets.ts`, sa seule source. Un
  fichier de l'ensemble absent de la CI fait échouer un test ;
- quand la référence échoue avant le premier mutant, `tools/mutate.ts` écrit le nom du test qui a échoué et sa sortie.

### 7.3 Sharding

La mutation est répartie par fichier (`tools/mutate.ts --shard=i/n`) :

- l'input hash global et l'input hash de chaque shard sont enregistrés ;
- chaque mutant n'appartient qu'à un shard, et l'union des shards couvre exactement les fichiers de l'ensemble ;
- les rapports sont fusionnés par un outil testé. La fusion vérifie la version du mutateur, la configuration, les
  opérateurs, le SHA et la liste des fichiers ;
- un shard absent, annulé, en double ou réutilisé depuis de mauvais inputs fait échouer la gate ;
- `--set=<name>` en local reproduit l'ensemble complet ;
- **une seule matrice**, générée depuis `tools/mutation-sets.ts`, pour `ci`, `candidate`, `nightly` et `release`. Un
  test refuse une liste écrite à la main dans un workflow. Chaque job qui mute `reality-store-postgres` a son service
  Postgres. Le délai de chaque shard est mesuré, et `release.yml` rejoue les neuf ensembles comme le candidat.

### 7.4 Exemptions structurées

Une entrée de `mutants.json` n'est pas une décharge. Chacune porte :

- une catégorie : `equivalent`, `unreachable`, `instrumentation` ou `out-of-contract` ;
- une justification précise ;
- le fichier et la mutation ;
- la preuve ou le test associé ;
- un propriétaire ;
- une version de réexamen.

Un test refuse une entrée incomplète ou dont la version de réexamen est dépassée. Les 93 équivalents existants
migrent vers ce format dans la PR 2a.

### 7.5 Critères de sortie

- `connectors-edge` et `reality-store-postgres` rejoignent `GATED`, et `MEASURED` devient vide ;
- aucun survivant n'est inexpliqué ;
- la baseline publie, pour les neuf ensembles : les tués, les exemptés par catégorie, le total, l'input hash et les
  fichiers ;
- le candidat technique reste sous 90 minutes à cache froid. *(Précisé le 15 octobre, avant son lancement : le budget
  porte sur le chemin critique à travers `needs` (`duration.criticalPath.seconds`) ; la durée murale a un seuil
  d'alerte de 150 minutes, qui ne bloque rien ; `changes/4120-release.log.md`.)* Sinon, un budget supérieur est décidé avant la mesure
  suivante et écrit dans le LOG ;
- l'alias `connectors` reste jusqu'à la 4.2.

## 8. PR 3 — Le candidat qualifie exactement ce qu'il publie

> **Livré par #119**, fusionnée sur `main` avant la release.

### 8.0 Découpage neutre d'abord

`scripts/ops-qualify.mjs` passe dans :

```text
scripts/ops-qualify/steps.mjs
scripts/ops-qualify/topology.mjs
scripts/ops-qualify/runs.mjs
scripts/ops-qualify/backup.mjs
scripts/ops-qualify/report.mjs
```

Chaque étape garde son identifiant stable, son budget, sa commande de reproduction, sa durée et son premier défaut.
Une caractérisation prouve que le rapport JSON est identique avant et après, hors durées. Ce commit précède tout
changement de comportement. Le filtre de chemins de `.github/workflows/qualify.yml` suit le nouveau dossier.

### 8.1 Profil complet obligatoire

Le candidat exécute le profil complet, sans reconstruire ses dépendances :

```text
npm run ops:qualify -- \
  --tarballs=candidate-pack \
  --image-from=candidate-image \
  --out=candidate-qualify
```

Le profil court reste disponible pour les pull requests ordinaires. Il ne satisfait plus `candidate-gate` lors d'un
`workflow_dispatch` destiné à un tag.

Le rapport complet doit inclure :

- les digests des quatre archives ;
- les trois identités de l'image ;
- le SHA et le run candidat ;
- chaque étape, sa durée et son premier défaut ;
- le backup et la restauration selon les deux modes, maintenance comprise ;
- le store 4.1.17 lu par 4.1.20, migration 0005 comprise ;
- Daily, Mystery, quotas, modération et workers ;
- le kill du worker et la reprise par une autre instance.

### 8.2 Image

Le manifeste de l'image ajoute :

- `os` ;
- `architecture` ;
- la version Docker/BuildKit ;
- la compression et la taille de l'archive.

L'image publiée reste une image de qualification. Une image de déploiement multiarchitecture ou un registre OCI
restent hors de 4.1.20, sauf si la passe #77 démontre qu'ils sont indispensables.

### 8.3 Mesures de performance

Pour SQLite et Postgres :

- trois charges, chacune mesurant son p95 sur ses nombreuses requêtes ;
- la **médiane des trois p95**, avec minimum et maximum, le cache et le runner nommés ;
- une comparaison avec une baseline prise sur le même runner et le même protocole ;
- une alerte si cette médiane se dégrade de plus de 25 % ;
- un échec seulement si le budget absolu est dépassé ou si la dégradation est reproduite.

Trois échantillons donnent une médiane de contrôle, pas une distribution entre runs. Le seuil de tendance ne doit
jamais être transformé en seuil plus lâche pour faire passer le candidat.

### 8.4 Manifeste unique d'artefacts

Un manifeste décrit :

- les artefacts candidats ;
- les artefacts de release ;
- leurs noms publiés ;
- leur SBOM ;
- leur attestation ;
- leur job producteur.

Les workflows et `ship verify` le lisent. Une archive oubliée ou produite deux fois devient une erreur de test, pas
une divergence YAML. La PR 4 lit ce manifeste pour construire les surfaces.

### 8.5 Critères de sortie

- le profil complet est vert sur le SHA exact du candidat ;
- il consomme les archives et l'image exactes du manifeste ;
- la baseline ne renvoie plus vers une qualification d'un commit précédent ;
- les chiffres de charge sont des médianes de p95, comparées sur le même runner et le même protocole ;
- le workflow de release ne reconstruit aucun artefact candidat ;
- le README reçoit les seules corrections du §10.2.

## 9. PR 4 — Transport sûr des passes humaines

> **Livré par #121**, fusionnée sur `main` avant la release.

### 9.1 Problème

Le rapport actuel lie une passe à un SHA et à un candidat. C'est sûr, mais trop grossier : corriger une phrase du
README invaliderait une passe Safari, un essai de voix ou un déploiement de 48 heures.

À l'inverse, transporter aveuglément une passe serait faux. **La version du package n'est pas neutre** : elle entre
dans l'IR, `site.json`, le bundle et les paquets speedrun. La solution est une empreinte par surface, calculée sur
les artefacts réellement servis.

### 9.2 Manifeste de qualification par surface

Le candidat produit et atteste `qualification-surfaces.json` :

```ts
interface QualificationSurface {
  id: PassId;
  artifactDigests: Record<string, string>; // fichiers servis, archives, bundle : SHA-256 attestés par le candidat
  configDigest: string;
  exclusions: Array<{ path: string; reason: string; test: string }>;
  dependencies: string[];
}
```

Exemples :

- `safari-ios-offline-update` couvre le player, le service worker, le manifeste PWA, les assets de la démo et
  `site.json`. La version y est donc pertinente ;
- `connectors-real-security` couvre Bridge, SDK, quatre connecteurs, locks, image et profil de déploiement ;
- `voices-listening` couvre le pipeline voix, le directeur audio et les fichiers effectivement écoutés ;
- `archive-human-install` couvre les quatre archives au bit près, les README que `scripts/pack.mjs` écrit dans
  chacune, leurs sommes, et **la section d'installation du README du dépôt**, délimitée par des marqueurs générés ;
- le reste du README du dépôt (tableau de maturité, statuts) est dans la classe `status`, hors de toute surface. Un
  test refuse une PR de statut qui touche la section d'installation. Si l'installation de la 4.2 change (par npm),
  elle change dans la PR 7, avant les passes ;
- ces marqueurs n'existent pas encore : la section `## Start` du README écrit `v4.1.19` en dur. **La PR 4** ajoute
  les marqueurs autour de la section d'installation, en anglais et en français, avec leur générateur et leur contrôle
  (`tests/readme-truth.test.ts`). Les PR 6 et 7 ne font qu'en rafraîchir le contenu, par exemple la version.

La liste est déclarée dans `docs/dev/surfaces.json` et vérifiée contre le manifeste d'artefacts du §8.4. Un fichier
public non classé fait échouer la génération.

Une exclusion n'est admise que si elle est justifiée et accompagnée d'un test qui prouve que la surface ne lit pas
l'élément exclu.

### 9.3 Rapport et attestation de report

Le `FieldReport` reste **intact**, avec ses quatre statuts : `not-run`, `blocked`, `failed`, `passed`. Le report est
un objet séparé :

```ts
interface CarryAttestation {
  sourceReportDigest: string;
  sourceSurfaceDigest: string;
  targetSurfaceDigest: string;
  changedFilesDigest: string;
  decision: 'pending' | 'approved' | 'refused';
  approvedBy?: string;
}
```

L'attestation est committée dans `docs/dev/passes/carry/`, dans un commit signé SSH.

**Racine de confiance :**

- `allowed_signers` est lu depuis le commit du **candidat source**, déjà attesté, jamais depuis le commit qui apporte
  l'attestation. Une PR ne peut donc pas ajouter une clé et signer avec elle ;
- une rotation de clé est une procédure distincte : une PR qui ne touche que `allowed_signers`, revue par le
  mainteneur, puis un candidat qui l'atteste. Elle ne vaut qu'à partir de ce candidat ;
- une PR qui modifie à la fois `allowed_signers` et `passes/carry/` est refusée ;
- la racine est la clé matérielle du mainteneur (`id_ed25519_sk`). Le premier `.github/allowed_signers` est ajouté
  dans la PR 4, dans un commit signé par cette clé, et il entre dans le candidat final de la 4.1.20. *(D37 : c'est
  `id_ed25519`, commit 8cebea2 de #121.)* ;
- il n'y a pas de revue CODEOWNERS obligatoire, puisque le mainteneur est seul collaborateur. La garantie vient de la
  signature, que Claude ne peut pas produire ;
- `approvedBy` doit être le principal que `allowed_signers` associe à la clé signataire. Ce n'est pas un texte libre ;
- la signature vérifiée est celle du commit qui a réellement introduit ou modifié l'attestation, y compris à travers
  des merges non squashés. Un merge signé ne couvre pas un commit non signé ;
- les PR qui portent `allowed_signers` ou une attestation sont fusionnées **par commit de merge** (`ship merge`, qui
  utilise déjà `--merge`, comme le ruleset de `main`). Un squash ou un rebase recrée les commits sous la clé de GitHub,
  que `allowed_signers` refuse.

Claude n'écrit jamais d'attestation `approved`.

### 9.4 `field:carry`

```text
npm run field:carry -- \
  --from=<ancien bundle ou dossier> \
  --candidate=<nouveau run> \
  --out=<nouveau dossier>
```

La commande :

1. vérifie l'ancienne preuve et le nouveau candidat ;
2. compare les empreintes d'artefacts de la surface ;
3. refuse toute différence pertinente, version comprise ;
4. écrit une `CarryAttestation` `pending` qui référence le rapport original sans le réécrire ;
5. produit la liste exacte des changements non pertinents et son digest ;
6. attend l'attestation `approved` signée du mainteneur ;
7. conserve les deux attestations de candidat et les deux candidats dans le bundle.

L'agrégateur compte la passe comme `passed` pour le nouveau candidat uniquement lorsque :

- le rapport d'origine était `passed` ;
- les empreintes d'artefacts sont identiques, hors exclusions prouvées ;
- l'attestation est `approved` et sa signature passe la racine de confiance ;
- aucune surface dépendante n'a changé.

Entre une RC et une stable de même SHA et de même run, il n'y a rien à reporter : `field:check` accepte déjà un
rapport `x.y.z-rc.N` contre les archives `x.y.z` de ce run. Il n'existe
pas de `--force`.

### 9.5 Critères de sortie

- une modification du README seul peut transporter une passe PWA, puisque le README n'est pas un artefact de sa
  surface ;
- une modification du service worker refuse la passe Safari ;
- une modification de `store-postgres.ts` refuse la passe Bridge ;
- une modification du mixage refuse la passe voix ;
- **la version seule refuse les passes PWA, Mystery, reprise de run, speedrun et archive**, sauf exclusion prouvée ;
- RC → stable sur le même run n'a pas besoin de report ;
- un candidat qui ne change que des fichiers de statut (§12) se transporte pour les treize passes, avec des attestations
  signées ;
- une attestation non signée, signée par une clé ajoutée dans la même PR ou dont `approvedBy` ne correspond pas est
  refusée ;
- le schéma `FieldReport` refuse tout statut nouveau ;
- un bundle transporté reste vérifiable hors ligne ;
- ADR 0024.

## 10. Maintenabilité et README

### 10.1 Pas de PR de refactoring en fin de cycle

Les découpages se font avant les changements qu'ils préparent : `backup.ts` dans la PR 1a (§6.0), `ops-qualify.mjs`
au début de la PR 3 (§8.0). Le manifeste unique d'artefacts entre dans la PR 3 (§8.4).

`scripts/connector-archive-e2e.mjs` attend la fin de la campagne terrain. Aucun refactoring ne passe entre le
candidat technique et le candidat final.

### 10.2 README

Pas de nouvelle refonte. Corriger seulement :

- « les quatre archives de packages » au lieu du mot ambigu « archives » ;
- la différence entre fichiers produits par le candidat et fichiers produits par la release ;
- le statut exact de Postgres, Canvas et des connecteurs ;
- la version et les métriques entre marqueurs générés.

Les captures supplémentaires sont conservées conformément à la politique des assets. Elles peuvent servir dans une
page de galerie ou être renommées `_v1`, jamais supprimées.

## 11. PR 3b et PR 6 — Répétition de 4.2 et release 4.1.20

### 11.1 PR 3b : release immuable, signature, préflight

**Release en brouillon.** `release.yml` crée la release en brouillon, y téléverse tous les fichiers, la publie, puis
la relit. Un rerun sur une release déjà publiée s'arrête sans rien modifier. Une RC ratée ne se corrige pas : elle
donne une `rc.N+1`.

Le mainteneur active ensuite les releases immuables et un ruleset `v*` (création réservée, ni suppression ni
force-push).

**`ship verify`** appelle aussi `gh release verify <tag>` et `gh release verify-asset <tag> <fichier>` pour chaque
asset. Il exige leur succès en plus de ses propres contrôles : sommes, attestations, manifeste.

**Répétition de la signature.** La 4.2 signera en local, avec la clé SSH du mainteneur (`ship tag`, `git tag -s`,
`gpg.format=ssh`). Le candidat répète ce chemin sans aucun secret :

1. une clé SSH éphémère générée dans le job ;
2. un tag signé local, jamais poussé ;
3. `git verify-tag` contre un `allowed_signers` temporaire ;
4. la destruction de la clé ;
5. un rapport dans le manifeste du candidat.

La PR 3b ajoute à `ship tag` une option de signature, testée, qui reste inactive pour le tag 4.1.20 (D30). Aujourd'hui,
`ship tag` crée un tag annoté (`git tag -a`).

**Préflight 4.2**

```text
npm run ship -- preflight-stable --candidate=<run>
```

Il ne signe, ne publie et ne change aucun réglage. Il dit séparément :

- si la clé de signature locale est disponible et enregistrée sur GitHub comme clé de signature ;
- si le ruleset `v*` et l'immuabilité des releases sont actifs ;
- si `.github/allowed_signers` existe et contient la clé de signature du mainteneur ;
- si la provenance et les attestations du candidat sont valides ;
- pour chaque package npm :
  - si l'archive est publiable (`npm publish --dry-run` sur l'archive exacte du candidat) ;
  - si le nom est disponible, ou déjà pris par un tiers ;
  - si un bootstrap est requis, parce que le package n'existe pas ;
  - si le trusted publisher est configuré, et s'il est en mode stage-only ;
  - si une vraie publication OIDC n'est pas encore prouvée ;
  - si une version est déjà publiée ;
- si les versions de Node et de npm de l'étape de publication sont suffisantes et épinglées exactement ;
- si le GO / NO-GO est cohérent avec les rapports terrain et les attestations de report.

### 11.2 Runbook npm (écrit dans la PR 3b, joué en 4.2)

- L'étape de publication de `release.yml` épingle des **versions exactes** de Node et de npm, choisies et validées
  dans la PR 3b. Il faut au moins Node 22.14.0, npm 11.5.1 pour le trusted publishing et **npm 11.15.0 pour
  `npm stage`**. Aucune plage : un test refuse `>=`.
- Les quatre noms n'existent pas encore. Le bootstrap de chaque package se fait par `npm stage publish` d'une
  **version de réservation** (`0.0.0-bootstrap.0`, jamais `4.2.0`), depuis une session locale 2FA du mainteneur ou
  avec un token stage-only. Une publication locale ne porte pas de provenance OIDC, c'est pourquoi elle ne porte jamais
  une version du produit. Le runbook vérifie dans la documentation npm si une version mise en scène, sans promotion,
  suffit à créer le package, et ne promeut le bootstrap que si c'est nécessaire. On configure ensuite le trusted
  publisher OIDC sur chaque package. La 4.2.0, publiée depuis le run du candidat de statut, est la première version du produit.
- Une configuration de trusted publisher doit réussir sa première publication en moins de deux jours, faute de quoi
  elle expire.
- Par défaut, la configuration est **stage-only** : la CI met en scène, le mainteneur promeut avec sa 2FA.
- `web-scumm-connectors` (SSH, Telnet) est classé contre la politique dual-use de npm, et la décision est écrite. Si
  elle s'applique, on ajoute `contentPolicy` et `DISCLOSURE`. Dans tous les cas, les quatre packages passent par le
  staged publishing et une promotion 2FA.
- Le squatting des noms est un risque accepté jusqu'à la 4.2 (D34).

### 11.3 Documentation (PR 6)

- `CHANGELOG.md`, daté de la **date de gel du candidat** et libellé comme tel ; la date de publication réelle vient
  du timestamp du tag, dans les notes générées par `release.yml` ;
- `docs/en|fr/UPGRADING.md` : backup 4, `--mode` obligatoire, arrêt des instances 4.1.19, migration 0005 ;
- `docs/en|fr/REALITY-OPS.md` : les deux modes, la maintenance, le digest, le runbook npm ;
- `docs/en|fr/FIELD.md` pour `field:carry` et les attestations ;
- `docs/en|fr/SUPPORT.md` ;
- `docs/dev/GO-NO-GO-4.2.md` ;
- `docs/dev/passes/4.1.20.md` ;
- `docs/dev/baselines/4.1.20.md`, avec seuils et protocoles mais sans numéro de run ;
- ADR 0023 et 0024 ;
- `docs/dev/LOG.md` et fragments `changes/`.

### 11.4 Compatibilité

- nouvelles fixtures : backup 4 et store migré en 0005 ;
- backups 1, 2 et 3 relus en `merge` ;
- golden save `demo-4.1.20.json` ;
- `.wsrun` schémas 1 et 2 inchangés ;
- `schemaVersion: 3` inchangé ;
- `rulesVersion: 1` inchangé ;
- API publique qui ne fait que grandir ;
- l'alias de mutation `connectors` peut être retiré seulement en 4.2, pas ici.

### 11.5 Candidats et tags

1. **Candidat technique, obligatoire**, sur `main` avant la PR 6. Il vérifie :
   - la gate complète ;
   - neuf ensembles bloquants ;
   - la qualification complète ;
   - les médianes de p95 ;
   - `qualification-surfaces.json` ;
   - la répétition de signature ;
   - le préflight.

   Il ne lance aucune passe et ne produit aucun rapport Field. Son temps à cache froid juge le budget de 90 minutes.
2. Candidat final sur le SHA exact de la fusion de la PR 6. Lire la gate **et** la conclusion, puis le manifeste.
3. `ship preflight-stable` : l'immuabilité et le ruleset sont vus. Les manques npm sont listés.
4. `v4.1.20-rc.1` sur ce SHA et ce candidat, puis `ship verify`. Il faut environ une heure : `ci` puis
   `release.yml`, et c'est la première exécution réelle du brouillon immuable et de `checkout` v7.
5. **Vérification humaine de la RC** par le mainteneur : la page de release, les assets, le statut immuable et
   `ship verify`. Son accord ouvre la stable.
6. Stable `v4.1.20` sur le même SHA et le même candidat, puis `ship verify` et le Quick Start publié.
7. Nightly suivant classé.
8. La PR 7 (`release/4.2.0-rc`) monte la version à 4.2.0, sans code, puis le candidat 4.2.0-rc est construit. Les
   passes démarrent sur ce candidat (§12).
9. Un P0/P1 avant la stable donne un correctif, un nouveau candidat et une `rc.N+1`.

## 12. Campagne terrain après la 4.1.20

Les passes commencent sur le **candidat `4.2.0-rc`** (D34), ni sur la 4.1.20, ni sur une branche intermédiaire :

1. La PR 7 ne change que la version et les notes. Son candidat passe `preflight-stable`.
2. `v4.2.0-rc.1` est tagué sur ce candidat, signé avec la clé du mainteneur. Cette RC répète la signature de la 4.2,
   et D30 ne s'applique plus.
3. Chaque issue #75–#87 reçoit un commentaire avec le run, les SHA-256 et la commande. C'est une étape manuelle, comme
   en 4.1.19. Chaque passe s'ouvre par `field:init --release=4.2.0-rc.1 --candidate=<run>`.
4. Après la campagne, la PR 8 (`release/4.2.0-status`) écrit **seulement les fichiers de statut** d'après les
   rapports : les sections de statut du README (jamais sa section d'installation), SUPPORT, GO / NO-GO, la fiche des
   passes et les rapports eux-mêmes. Ces fichiers n'entrent ni
   dans les archives (`scripts/pack.mjs` n'emporte ni `README.md` ni `docs/`), ni dans le site. Les artefacts des
   surfaces restent donc identiques. Un test le prouve en déclarant ces fichiers comme classe `status` dans
   `surfaces.json`.
5. Le candidat suivant (`rc.2`, ou `rc.N+1` après un correctif) est construit. `field:carry` prouve, pour les treize passes, que seule la classe `status` a
   changé. Le mainteneur signe les attestations.
6. La stable `v4.2.0` est taguée sur ce candidat de statut, signée, et publiée sur npm depuis ce même run.

Ordre recommandé :

### Vague A — Distribution et infrastructure

1. `archive-human-install` (#75) ;
2. `bridge-postgres-https` (#77), pendant 24 à 48 heures ;
3. `connectors-real-security` (#79).

### Vague B — Appareils et accessibilité

4. `phone-both-renderers` (#83) ;
5. `safari-ios-offline-update` (#86) ;
6. `firefox-real-offline` (#80) ;
7. `code-wheel-human` (#78), dont l'alternative lecteur d'écran.

### Vague C — Jeu, audio et compétition

8. `blind-playtesters` (#76) ;
9. `voices-listening` (#87) ;
10. `runs-real-players` (#85) ;
11. `run-resume-power-cycle` (#84) ;
12. `mystery-deployed` (#82) ;
13. `livesplit-obs` (#81).

Un défaut P0 ou P1 :

1. retire immédiatement la promotion de la surface ;
2. produit une reproduction et un test rouge ;
3. donne un correctif minimal sur `main`, puis un nouveau candidat et `v4.2.0-rc.N+1` ;
4. invalide seulement les passes dont l'empreinte de surface change. Les autres sont transportées par `field:carry`,
   avec une attestation signée ;
5. ne ferme jamais automatiquement l'issue terrain.

## 13. Gates par pull request

Chaque PR exécute au minimum :

```text
npm run quality
npm run docs:truth
npm run test:node
npm run quality:baseline -- --check
```

Selon la surface :

```text
npm run test:mutation:core -- --set=<set>
npm run connector-archive-e2e
npm run ops:qualify
npm run field:verify-bundle -- <fixture>
npm run external-consumer
```

Discipline :

- test rouge avant le correctif ;
- mutation du fichier touché ;
- seconde lecture automatisée avant fusion ;
- rapport avec SHA, commande et artefact ;
- aucune hausse de timeout sans reproduction et mesure ;
- aucun seuil abaissé dans la même PR que le code qu'il juge ;
- une seule source de vérité pour les listes d'artefacts et de surfaces.

## 14. Critères de sortie de 4.1.20

La release ne doit pas être taguée tant que :

- `connectors-edge` ou `reality-store-postgres` possède un survivant inexpliqué ;
- l'un des neuf ensembles de mutation n'est pas bloquant ;
- la qualification complète ne porte pas sur le SHA, les archives et l'image exacts du candidat ;
- une métadonnée sémantique d'un backup 4 peut changer sans casser son empreinte ;
- `merge` et `replace-store` peuvent être confondus ;
- un restore échoué peut modifier le store ;
- le budget mémoire du backup n'est pas mesuré ;
- une passe peut être transportée malgré un changement pertinent ;
- un fichier public peut échapper à la classification des surfaces ;
- la baseline utilise une mesure de performance d'un autre SHA ;
- le préflight 4.2 ne sait pas dire précisément ce qui manque à la signature, à l'immuabilité ou à npm ;
- README, SUPPORT et GO / NO-GO donnent des statuts différents ;
- un backup 4 se dit `whole-store` alors qu'une table SQL n'est pas classée ;
- `replace-store` accepte un backup de schéma 3, `tenants-only` ou d'un autre schéma SQL ;
- un restore peut s'exécuter pendant qu'une instance `serve` vit ;
- `replace-store` peut supprimer avant d'avoir vérifié son backup de sécurité ;
- une passe peut être transportée malgré un changement de version qui touche sa surface ;
- une attestation de report peut être approuvée par une clé introduite dans la même PR ;
- une exemption de mutation est incomplète ;
- la release GitHub n'est pas immuable, ou `ship verify` ne passe pas `gh release verify` ;
- une version de Node ou de npm de l'étape de publication n'est pas épinglée exactement ;
- une matrice de mutation est écrite à la main dans un workflow ;
- `.github/allowed_signers` n'existe pas dans le candidat final, signé par la clé du mainteneur.

Les treize passes peuvent rester `not-run` au tag 4.1.20 conformément à D12. Elles bloquent ensuite la promotion en
4.2 de chaque surface qui les exige.

## 15. Critères d'entrée en 4.2

Après la campagne terrain sur le candidat `4.2.0-rc` :

- chaque surface annoncée stable a sa preuve machine et sa passe humaine ;
- chaque passe vient d'un candidat `4.2.0-rc`, et elle est transportée vers le candidat de la stable (le `rc` de statut, fichiers
  de statut seuls) par une empreinte identique et une attestation signée ;
- aucun P0/P1 terrain n'est ouvert ;
- les surfaces sans passe restent limitées, expérimentales ou hors périmètre ;
- le candidat de la stable ne change aucun fichier qualifié après les passes, seulement la classe `status` ;
- le tag est signé ;
- la release GitHub est immuable ;
- les packages exacts du candidat sont publiés sur npm avec provenance ;
- `ship verify` relit npm, GitHub, attestations, sommes et signature ;
- la baseline 4.2 porte sur le même SHA que le tag ;
- chaque package a fait son bootstrap (`npm stage publish`) et sa promotion 2FA, avec le trusted publisher
  configuré en stage-only.

## 16. Hors périmètre

- nouvelle primitive DSL ;
- nouvelle mécanique de gameplay ;
- quatrième ou cinquième connecteur ;
- nouveau renderer ;
- changement du solveur ;
- nouvelle physique ou nouveau système d'occlusion ;
- registre public d'image de production, sauf si la passe #77 le rend indispensable (§8.2), sur décision du
  mainteneur ;
- multi-tenancy supplémentaire ;
- cloud saves, stores mobiles ou achievements ;
- refonte générale du Bridge, du Studio ou du player ;
- garantie WCAG avant le passage humain correspondant ;
- publication npm, même en stage, avant la 4.2 ;
- migration SQL autre que la 0005 (maintenance) ;
- migration d'un backup d'un schéma SQL à un autre.

## 17. Résultat attendu

À la sortie de 4.1.20 :

- il ne reste plus de zone critique seulement « mesurée » ;
- la qualification complète juge exactement ce qui est publié ;
- un backup protège aussi son contrat, pas seulement ses lignes ;
- un opérateur sait s'il fusionne ou remplace un store ;
- une passe humaine survit à un changement sans rapport, jamais à un changement pertinent ;
- les opérations de signature, d'immuabilité et de publication npm ont été répétées sans publier ;
- le projet peut consacrer son énergie aux treize essais humains sur le candidat `4.2.0-rc`, sans rouvrir un chantier
  de fonctionnalités.

La définition du succès n'est pas « davantage de code ». C'est : **plus aucune ambiguïté entre ce qui a été testé,
ce qui a été publié et ce que web-scumm promet.**
