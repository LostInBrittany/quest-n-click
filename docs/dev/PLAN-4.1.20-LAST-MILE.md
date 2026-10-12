# web-scumm 4.1.20 « Last Mile » : plan de release

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
8. plusieurs scripts de qualification sont devenus des sous-systèmes de 500 à 900 lignes.

Au tag 4.1.19, les treize passes humaines sont à `not-run`. C'est une chance : 4.1.20 peut devenir la dernière release
contenant du code avant le candidat 4.2, sans invalider du travail humain déjà réalisé.

## 2. Verdict et positionnement

4.1.20 est une release de **durcissement du dernier kilomètre**, pas une release de fonctionnalités.

Elle doit :

- fermer les deux dernières zones de mutation non bloquantes ;
- faire porter la qualification complète sur les fichiers exacts qui seront publiés ;
- rendre le contrat de backup plus difficile à mal interpréter ;
- permettre de transporter une passe humaine vers un candidat ultérieur seulement lorsque sa surface est
  byte-identique ;
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

## 3. Décisions à enregistrer si le plan est accepté

### D34 — Dernière release de code avant 4.2

4.1.20 est la dernière release 4.1.x planifiée contenant du code. Après son candidat final :

- une correction P0/P1 peut encore produire une 4.1.21 ;
- aucune nouvelle fonctionnalité ne retarde la campagne terrain ;
- les changements ordinaires suivants sont la version, les notes, la signature et la publication de 4.2.

### D35 — Une passe qualifie une surface, pas aveuglément tout un commit

Une passe reste liée au candidat qui l'a produite. Elle peut être reportée sur un candidat ultérieur uniquement si
`field:carry` prouve que son empreinte de surface et tous les artefacts qu'elle utilise sont identiques.

Une différence pertinente refuse automatiquement le report. Une différence non pertinente est listée et doit être
acceptée explicitement par le mainteneur. Il n'existe ni option `--force`, ni joker de chemins.

### D36 — Sémantique explicite de la restauration

Le comportement actuel reçoit le nom `merge` : le backup remplace ses conflits, mais conserve les données étrangères
au fichier. Un mode `replace-store`, destructif et explicitement confirmé, rend la destination identique au snapshot.

Les deux modes restent atomiques. Le mode par défaut est `merge` afin de ne pas changer silencieusement le comportement
de 4.1.19.

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

## 5. Découpage proposé

| PR | Branche | Contenu | Dépend de |
|---:|---|---|---|
| 1 | `fix/4120-backup-contract` | format de backup, modes de restauration, budget mémoire | — |
| 2 | `test/4120-mutation-gates` | `connectors-edge` et `reality-store-postgres` lus et bloquants | — |
| 3 | `ci/4120-exact-qualification` | qualification complète du candidat exact, tendances de performance | 1, 2 |
| 4 | `feature/4120-field-carry` | empreintes par surface et report sûr des passes | — |
| 5 | `refactor/4120-ops-clarity` | découpage comportementalement neutre des fichiers touchés | 1, 3, 4 |
| 6 | `release/4.1.20` | version, docs, baseline, RC, stable | 1 à 5 |
| — | campagne terrain | treize passes sur le candidat final 4.1.20 | 6 |
| — | candidat 4.2 | publication npm/signature répétées puis passes transportées ou refaites | campagne |

Les PR 1, 2 et 4 peuvent être préparées en parallèle. Une seule mutation lourde tourne à la fois sur la machine du
mainteneur. Chaque PR reçoit le label `full-ci` et une seconde lecture automatisée avant fusion.

## 6. PR 1 — Backup vérifiable et restauration sans ambiguïté

### 6.1 Format de backup 4

Le Bridge écrit un nouveau format :

```ts
interface BackupV4 {
  format: 'web-scumm-bridge-backup';
  schema: 4;
  bridge: { version: string };
  store: { kind: 'sqlite' | 'postgres'; schema: number };
  startedAt: string;
  endedAt: string;
  counts: BackupCounts;
  payload: BackupPayload;
  digest: {
    alg: 'sha256';
    scope: 'envelope';
    value: string;
  };
}
```

L'empreinte couvre la représentation canonique de :

- `bridge` ;
- `store` ;
- `startedAt` et `endedAt` ;
- `counts` ;
- `payload`.

Seuls `format`, `schema` et `digest` sont hors de leur propre empreinte.

Le lecteur conserve la compatibilité avec les schémas 1, 2 et 3. Pour le schéma 3, il dit explicitement que seul le
payload est couvert. Un backup d'un schéma SQL plus récent reste refusé avant la première écriture.

### 6.2 Validation des métadonnées

- dates ISO 8601 strictes ;
- `endedAt >= startedAt` ;
- version Bridge SemVer ou valeur historique explicitement acceptée ;
- schéma SQL entier, non négatif et compatible ;
- backend source reconnu ;
- compte exact de chaque famille ;
- ordre canonique conservé entre SQLite et Postgres.

### 6.3 Modes de restauration

La CLI expose :

```text
bridge restore --from=<file> --mode=merge [--force]
bridge restore --from=<file> --mode=replace-store --yes-replace-store
```

`merge` :

- reste le comportement par défaut ;
- refuse les conflits sans `--force` ;
- remplace uniquement les données dont le fichier parle avec `--force` ;
- conserve les tenants, runs et Daily étrangers au backup.

`replace-store` :

- exige un backup global de schéma 3 ou 4 ;
- exige `--yes-replace-store` ;
- refuse si le Bridge n'est pas déclaré en maintenance ;
- supprime dans la même transaction ce que le snapshot ne contient pas ;
- relit l'intégralité du store avant commit ;
- produit une destination logiquement identique au snapshot.

Un fichier de schéma 1 ou 2 ne peut pas demander `replace-store`, car il ne décrit pas toutes les familles modernes.

### 6.4 Mémoire et grands backups

Avant de réécrire en streaming, mesurer :

- backup de 64, 128 et 256 Mio ;
- pic RSS à l'export ;
- pic RSS au parse, à la canonicalisation et à la restauration ;
- durée SQLite et Postgres ;
- comportement à un octet et une ligne au-dessus de la limite.

Critère provisoire : le pic RSS reste sous quatre fois `--max-bytes`, avec une limite absolue documentée. Si ce
critère échoue, le format 4 passe à un hash incrémental et à une sérialisation canonique en streaming avant fusion.

### 6.5 Tests rouges à écrire en premier

- métadonnée `store.schema` modifiée sans recalcul du digest ;
- date invalide ou inversée ;
- store plus récent avec métadonnée falsifiée ;
- tenant étranger conservé en `merge` ;
- même tenant supprimé en `replace-store` ;
- échec injecté à chaque suppression et insertion de `replace-store` ;
- commit dont la réponse est perdue ;
- comparaison logique complète après commit ;
- backup proche du budget mémoire ;
- lecture des fixtures schémas 1, 2 et 3.

### 6.6 Critères de sortie

- une modification de toute métadonnée sémantique du schéma 4 casse l'empreinte ;
- les quatre schémas restent lisibles ;
- chaque mode est atomique ;
- la CLI ne permet pas de confondre fusion et miroir ;
- le pic mémoire est mesuré et publié ;
- REALITY-OPS et UPGRADING donnent un exemple de chaque mode.

## 7. PR 2 — Fermer les deux dernières zones de mutation

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
- ou nommé comme équivalent avec une entrée précise dans `docs/dev/mutants.json` ;
- jamais accepté parce que le score global paraît suffisant.

Les scénarios réseau difficiles à muter dans le processus utilisent les serveurs locaux du test archive. Les
destinations publiques, changements DNS et fournisseurs réels restent dans la passe #79.

### 7.2 `reality-store-postgres`

La mutation tourne sur un service Postgres isolé et couvre :

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

### 7.3 Sharding

Ces ensembles risquent d'allonger encore un candidat déjà long de 79 minutes. La mutation peut être répartie par
fichier si :

- l'input hash global et l'input hash du shard sont enregistrés ;
- chaque mutant n'appartient qu'à un shard ;
- les rapports sont fusionnés par un outil testé ;
- un shard absent, annulé ou réutilisé depuis de mauvais inputs fait échouer la gate ;
- `--set=<name>` local reste capable de reproduire l'ensemble complet.

### 7.4 Critères de sortie

- `connectors-edge` et `reality-store-postgres` rejoignent `GATED` ;
- `MEASURED` devient vide ;
- aucun survivant inexpliqué ;
- la baseline publie tués, nommés, total, input hash et fichiers pour les neuf ensembles ;
- le candidat reste sous 90 minutes à cache froid, ou documente un budget supérieur décidé avant la mesure.

## 8. PR 3 — Le candidat qualifie exactement ce qu'il publie

### 8.1 Profil complet obligatoire

Le candidat final exécute le profil complet, sans reconstruire ses dépendances :

```text
npm run ops:qualify -- \
  --tarballs=candidate-pack \
  --image-from=candidate-image \
  --out=candidate-qualify
```

Le profil court reste disponible pour les pull requests ordinaires, mais ne satisfait plus `candidate-gate` lors d'un
`workflow_dispatch` destiné à un tag.

Le rapport complet doit inclure :

- les digests des quatre archives ;
- les trois identités de l'image ;
- le SHA et le run candidat ;
- chaque étape, sa durée et son premier défaut ;
- le backup et la restauration selon les deux modes ;
- le store 4.1.17 lu par 4.1.20 ;
- Daily, Mystery, quotas, modération et workers ;
- le kill du worker et la reprise par une autre instance.

### 8.2 Image

Le manifeste de l'image ajoute :

- `os` ;
- `architecture` ;
- version Docker/BuildKit ;
- compression et taille de l'archive.

L'image publiée reste une image de qualification. Une image de déploiement multiarchitecture ou un registre OCI
reste hors de 4.1.20, sauf si la passe #77 démontre qu'elle est indispensable.

### 8.3 Mesures de performance

Pour SQLite et Postgres :

- trois exécutions ;
- médiane, minimum, maximum et dispersion ;
- cache et runner nommés ;
- alerte si le p95 se dégrade de plus de 25 % par rapport à la baseline précédente ;
- échec seulement si le budget absolu est dépassé ou si la dégradation est reproduite.

Le seuil de tendance ne doit jamais être transformé en seuil plus lâche pour faire passer le candidat.

### 8.4 Critères de sortie

- le profil complet est vert sur le SHA exact du candidat ;
- il consomme les archives et l'image exactes du manifeste ;
- la baseline ne renvoie plus vers une qualification d'un commit précédent ;
- les chiffres de charge sont des distributions, pas un échantillon isolé ;
- le workflow de release ne reconstruit aucun artefact candidat.

## 9. PR 4 — Transport sûr des passes humaines

### 9.1 Problème

Le rapport actuel lie une passe à un SHA et un candidat. C'est sûr mais trop grossier : corriger une phrase du README
ou changer la version du package invaliderait une passe Safari, un essai de voix ou un déploiement de 48 heures.

À l'inverse, transporter aveuglément une passe entre versions serait faux. La solution est une empreinte par surface.

### 9.2 Manifeste de qualification par surface

Le candidat produit `qualification-surfaces.json` :

```ts
interface QualificationSurface {
  id: PassId;
  sourceDigest: string;
  artifactDigests: Record<string, string>;
  configDigest: string;
  dependencies: string[];
}
```

Exemples :

- `safari-ios-offline-update` couvre le player, le service worker, le manifeste PWA, les assets de la démo et la
  configuration de build ;
- `connectors-real-security` couvre Bridge, SDK, quatre connecteurs, locks, image et profil de déploiement ;
- `voices-listening` couvre le pipeline voix, le directeur audio et les fichiers effectivement écoutés ;
- `archive-human-install` couvre les quatre archives, le README d'installation et leurs sommes.

La liste est déclarée dans un fichier versionné et vérifiée contre le plan CI. Un fichier public non classé fait
échouer la génération.

### 9.3 `field:carry`

```text
npm run field:carry -- \
  --from=<ancien bundle ou dossier> \
  --candidate=<nouveau run> \
  --out=<nouveau dossier>
```

La commande :

1. vérifie l'ancienne preuve et le nouveau candidat ;
2. compare l'empreinte de la surface ;
3. refuse toute différence pertinente ;
4. écrit un rapport `carried` qui référence le rapport original sans le réécrire ;
5. produit la liste exacte des changements non pertinents ;
6. demande la validation explicite du mainteneur ;
7. conserve les deux attestations et les deux candidats dans le bundle.

`carried` compte comme `passed` uniquement lorsque :

- le rapport d'origine était `passed` ;
- les empreintes sont identiques ;
- les artefacts utilisés sont identiques ;
- l'approbation du mainteneur est enregistrée ;
- aucune surface dépendante n'a changé.

Il n'existe pas de `--force`.

### 9.4 Critères de sortie

- une modification du README seule peut transporter une passe PWA si le README n'était pas dans son protocole ;
- une modification du service worker refuse la passe Safari ;
- une modification de `store-postgres.ts` refuse la passe Bridge ;
- une modification du mixage refuse la passe voix ;
- la version seule ne force pas treize nouvelles passes ;
- un bundle transporté reste vérifiable hors ligne.

## 10. PR 5 — Maintenabilité des outils de qualification

Le refactor reste strictement limité aux fichiers modifiés par les PR précédentes.

### 10.1 Backup

Découper `bridge/src/backup.ts` en responsabilités :

```text
bridge/src/backup/schema.ts
bridge/src/backup/canonical.ts
bridge/src/backup/files.ts
bridge/src/backup/snapshot.ts
bridge/src/backup/restore.ts
bridge/src/backup/index.ts
```

Les exports publics passent par `index.ts`. Un test de caractérisation compare les formats et messages avant/après.

### 10.2 Qualification

Découper `scripts/ops-qualify.mjs` en :

```text
scripts/ops-qualify/steps.mjs
scripts/ops-qualify/topology.mjs
scripts/ops-qualify/runs.mjs
scripts/ops-qualify/backup.mjs
scripts/ops-qualify/report.mjs
```

Chaque étape conserve :

- son identifiant stable ;
- son budget ;
- sa commande de reproduction ;
- sa durée ;
- son premier défaut.

Le rapport JSON avant et après refactor doit être identique hors durées.

### 10.3 Workflows

Un manifeste unique décrit :

- les artefacts candidats ;
- les artefacts de release ;
- leurs noms publiés ;
- leur SBOM ;
- leur attestation ;
- leur job producteur.

Les workflows et `ship verify` le lisent. Une archive oubliée ou produite deux fois devient une erreur de test, pas une
divergence YAML.

### 10.4 README

Pas de nouvelle refonte. Corriger seulement :

- « les quatre archives de packages » au lieu du mot ambigu « archives » ;
- la différence entre fichiers produits par le candidat et fichiers produits par la release ;
- le statut exact de Postgres, Canvas et des connecteurs ;
- la version et les métriques entre marqueurs générés.

Les captures supplémentaires sont conservées conformément à la politique des assets ; elles peuvent servir dans une
page de galerie ou être renommées `_v1`, jamais supprimées.

## 11. PR 6 — Release 4.1.20

### 11.1 Documentation

- `CHANGELOG.md` ;
- `docs/en|fr/UPGRADING.md` pour le backup 4 et les modes de restauration ;
- `docs/en|fr/REALITY-OPS.md` ;
- `docs/en|fr/FIELD.md` pour `field:carry` ;
- `docs/en|fr/SUPPORT.md` ;
- `docs/dev/GO-NO-GO-4.2.md` ;
- `docs/dev/passes/4.1.20.md` ;
- `docs/dev/baselines/4.1.20.md` ;
- ADR backup 4, restauration et preuve par surface ;
- décisions D34 à D36 si elles sont acceptées ;
- `docs/dev/LOG.md` et fragments `changes/`.

### 11.2 Compatibilité

- nouvelle fixture de backup 4 ;
- backups 1, 2 et 3 relus ;
- golden save `demo-4.1.20.json` ;
- `.wsrun` schémas 1 et 2 inchangés ;
- `schemaVersion: 3` inchangé ;
- `rulesVersion: 1` inchangé ;
- API publique inchangée ;
- l'alias de mutation `connectors` peut être retiré seulement en 4.2, pas ici.

### 11.3 Candidat et tags

1. candidat final sur le SHA exact ;
2. gate complète, dont neuf ensembles de mutation et qualification complète ;
3. `v4.1.20-rc.1` sur ce SHA et ce candidat ;
4. `ship verify` ;
5. stable `v4.1.20` sur le même SHA et le même candidat ;
6. `ship verify` et Quick Start publié ;
7. nightly suivant classifié avant toute campagne terrain.

Le tag 4.1.20 peut rester non signé conformément à D30, mais le candidat exécute une répétition de la signature 4.2
avec une clé ou une identité de test. Aucun secret de signature n'entre dans une pull request.

### 11.4 Préflight 4.2

Ajouter une commande sans mutation externe :

```text
npm run ship -- preflight-stable --candidate=<run>
```

Elle vérifie :

- identité de signature disponible ;
- règles de protection du tag ;
- immuabilité des releases GitHub activée ;
- provenance et attestations ;
- noms npm libres et accès en écriture ;
- `npm publish --dry-run` des packages exacts ;
- 2FA/provenance npm selon la politique choisie ;
- aucune version déjà publiée ;
- GO / NO-GO cohérent avec les rapports terrain.

Elle ne signe, ne publie et ne change aucun réglage.

## 12. Campagne terrain après la 4.1.20

Les passes commencent sur le candidat final 4.1.20, pas sur une branche intermédiaire.

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
3. ouvre une 4.1.21 si une correction de code est indispensable ;
4. invalide seulement les passes dont l'empreinte de surface change ;
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
- README, SUPPORT et GO / NO-GO donnent des statuts différents.

Les treize passes peuvent rester `not-run` au tag 4.1.20 conformément à D12. Elles bloquent ensuite la promotion en
4.2 de chaque surface qui les exige.

## 15. Critères d'entrée en 4.2

Après la campagne 4.1.20 :

- chaque surface annoncée stable a sa preuve machine et sa passe humaine ;
- chaque passe vient du candidat 4.2 ou a été transportée par une empreinte identique ;
- aucun P0/P1 terrain n'est ouvert ;
- les surfaces sans passe restent limitées, expérimentales ou hors périmètre ;
- le candidat 4.2 ne change aucun fichier qualifié après les passes ;
- le tag est signé ;
- la release GitHub est immuable ;
- les packages exacts du candidat sont publiés sur npm avec provenance ;
- `ship verify` relit npm, GitHub, attestations, sommes et signature ;
- la baseline 4.2 porte sur le même SHA que le tag.

## 16. Hors périmètre

- nouvelle primitive DSL ;
- nouvelle mécanique de gameplay ;
- quatrième ou cinquième connecteur ;
- nouveau renderer ;
- changement du solveur ;
- nouvelle physique ou nouveau système d'occlusion ;
- registre public d'image de production ;
- multi-tenancy supplémentaire ;
- cloud saves, stores mobiles ou achievements ;
- refonte générale du Bridge, du Studio ou du player ;
- garantie WCAG avant le passage humain correspondant.

## 17. Résultat attendu

À la sortie de 4.1.20 :

- il ne reste plus de zone critique seulement « mesurée » ;
- la qualification complète juge exactement ce qui est publié ;
- un backup protège aussi son contrat, pas seulement ses lignes ;
- un opérateur sait s'il fusionne ou remplace un store ;
- une passe humaine survit à un changement sans rapport, jamais à un changement pertinent ;
- les opérations de signature, d'immuabilité et de publication npm ont été répétées sans publier ;
- le projet peut consacrer son énergie aux treize essais humains puis à 4.2, sans rouvrir un chantier de fonctionnalités.

La définition du succès n'est pas « davantage de code ». C'est : **plus aucune ambiguïté entre ce qui a été testé,
ce qui a été publié et ce que web-scumm promet.**
