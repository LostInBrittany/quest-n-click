# Qualification 4.2.3 : le déploiement de référence

> **Statut** : phase A faite (§1 à §3) et exercice de restauration (§4), le 19 octobre 2026. La montée de version (§5)
> attend le main final (phase B). Ce qui dit encore « à mesurer » n'est pas mesuré.
> **Plan** : `docs/dev/PLAN-4.2.3-COORDINATION.md`, H9 et §2.4 (PR 9) ; plan maître
> `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md` §4 (bail de service, redéploiement à chevauchement).
> **Runbook suivi** : `docs/en/STUDIO-SERVER.md`, « Deploying on Clever Cloud », « The OpenID provider », « Running it:
> the reference deployment ».
> **Où** : l'organisation Clever de test du mainteneur (« Erwan Testing »), région `par`, sur les ressources du spike S
> gardées pour cela (D44). **Quand** : 19 octobre 2026, entre 14 h 30 et 17 h 45 UTC.
> **Limite déclarée (H9)** : mesuré sur l'organisation de test, pas sous une charge de production, et les chiffres le
> disent. Chaque chiffre est une mesure, avec sa commande, ou dit qu'il n'en est pas une. Un seul échantillon par
> chiffre, sauf mention.

## 1. Ce qui a été déployé

| Élément | Valeur |
|---|---|
| Version du moteur (commit, tag) | `52e68932` (branche `ops/423-reference`, PR #178), `package.json` 4.2.2 ; pas de tag |
| Application studio (taille, nombre d'instances) | `web-scumm-spike-studio`, Node.js natif, **XS** (1 vCPU, 1 077 Mo), **1 instance** ; Node **v24.21.0** (`node -v` dans `clever ssh`) |
| Application de traitement (taille) | `web-scumm-spike-worker`, Node.js natif, **XS**, 1 instance ; aucun add-on lié |
| Add-on PostgreSQL (plan, version) | `web-scumm-spike-pg`, plan **DEV** (5 connexions), lié au studio seulement ; version 18 (18.6 mesuré au spike, non relu ici) |
| Cellar (bucket) | add-on `web-scumm-spike-cellar`, plan **S**, lié au studio seulement ; bucket **`web-scumm-ref-studio`** créé pour la référence |
| Fournisseur OIDC (Keycloak managé ou autre) | Keycloak managé, plan **BASE**, version **26.7.4** ; realm `web-scumm` créé par l'API d'administration à partir de `ops/studio/keycloak/realm.json` (URL Clever, jetons d'accès de 300 s, client `studio` confidentiel PKCE S256 avec déconnexion back-channel, client public `web-scumm-cli` avec device grant et mapper d'audience `studio-api`, deux utilisateurs de test à e-mail vérifié) |
| Domaines, TLS (`publicUrl`, `playUrl`, `worker.url`) | `https://web-scumm-studio-spike.cleverapps.io`, `https://web-scumm-play-spike.cleverapps.io`, `https://web-scumm-worker-spike.cleverapps.io` ; TLS des domaines `cleverapps.io` (deux sites distincts : voir le spike S §7) |
| `STUDIO_METRICS_TOKEN`, `STUDIO_BACKUP_CRON` posés | **oui**, **oui** (`1`) |

Déploiements (`clever deploy -a <alias> --force` depuis la branche) :

- **Traitement** : « Successfully deployed in 0 minutes and 36 seconds » (≈ 48 s de bout en bout), dont le hook pip :
  NumPy 2.4.6, Pillow 12.3.0, SciPy 1.18.1 installés en ≈ 7 s, hashes vérifiés. `/livez` et `/readyz` à 200.
- **Studio** : « Successfully deployed in 0 minutes and 29 seconds » (≈ 43 s de bout en bout). `/startz` à 200 au
  contrôle de Clever, `/readyz` à 200 (`writes: served`, `rpoMs: 0`).
- **Import** de `games/demo` par `clever ssh` (le shell a bien les variables de l'application : `STUDIO_*`,
  `POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_*`, `INSTANCE_NUMBER`) : révision 1, **242 s** (les blobs envoyés à Cellar).
  Il a fallu `--config <fichier>` (défaut 1 du §7).
- **Invitation** du mainteneur comme `owner` : lien produit, gardé hors du dépôt.

## 2. Métriques et alertes

- Collecteur utilisé pour `/metrics` (Prometheus, autre) et sa fréquence : **aucun en phase A** ; lu à la main avec
  `curl`.
- `/metrics` sans jeton → **401** (`the metrics need their token`), mauvais jeton → **401**, avec le jeton → **200**
  (`text/plain; version=0.0.4`). Sur l'origine du jeu → **401** et non 404 : l'origine du jeu refuse toute requête sans
  session (« open the game from the Studio ») avant de regarder le chemin. Les métriques n'y sont donc jamais servies ;
  le 404 n'est la réponse que sur l'origine du Studio quand le jeton n'est pas configuré.
- Alertes posées, et vers qui (une personne) : `/readyz` non 200, RPO > 60 s, profondeur de file, échecs de jobs,
  sauvegarde manquante ; notifications Clever (`DEPLOYMENT_FAIL`) : **à mesurer** (pas posées en phase A).
- Une alerte déclenchée exprès (laquelle, délai jusqu'à la personne) : **à mesurer**.

| Mesure (sur la durée de la qualification) | Valeur |
|---|---|
| Latence des opérations du journal, p50 / p95 (`studio_journal_operation_seconds`) | à mesurer (aucune écriture par l'API en phase A ; l'import passe par la CLI, hors de l'instance) |
| Profondeur de file maximale observée (`studio_worker_jobs_in_flight`) | 0 aux lectures faites (pas d'échantillonnage continu) |
| Conflits de bail (`studio_lease_conflicts_total`), et pendant quel scénario | 0 |
| Durée des jobs par sorte, p50 / p95 (`studio_worker_job_seconds`) | un échantillon chacun : `validate` 0,86 s, `preview` 2,64 s, `solve` 2,39 s ; tous `ok` |
| Jobs en échec ou hors délai, par sorte | 0 après l'import ; avant l'import, la révision 0 (vide) donnait `health-failed` (« the game does not load »), attendu |

Autres valeurs lues : prévisualisation de la révision 1 en **32,2 s** (`studio_preview_build_seconds`, `built`),
jugement de santé en **1,18 s** (`pass`).

## 3. Sauvegarde planifiée

| Mesure | Valeur |
|---|---|
| La tâche `clevercloud/cron.json` a tourné (date, ligne `"event":"backup"` dans les journaux) | **non encore** (03:17 UTC le lendemain). Les crons sont installés au déploiement (« Importing cronjobs », avec un `pam_unix(crond:account): setuid failed` sans suite visible). **Elle échouerait** en l'état : défaut 1 du §7, reproduit à la main (`backup: a new file is required`) |
| Clé écrite (`backups/<date>-r<rev>.json`), taille | `backups/2026-10-19T17-36-40Z-r1.json`, **170 746 octets** (sauvegarde manuelle, `--config` explicite) |
| Durée de `backup --to-bucket` | **2,49 s** (démarrage de `tsx` compris), révision 1 |
| `--keep` : sauvegardes supprimées au deuxième passage | à mesurer (premier passage : `removed: []`) |
| Une seule sauvegarde par jour (instance 0), ou deux pendant un redéploiement | à mesurer |

Après l'import, le RPO a crû sans fin (190 s au bout de trois minutes) : le journal expédié ne part qu'au démarrage et
après les opérations confirmées par l'instance elle-même. L'opération écrite par la CLI n'est partie qu'au redémarrage
suivant (`clever restart`, 51 s), après quoi `rpoMs` est revenu à 0 et `journal/<epoch>/0/000000000001.json` est
apparu dans le bucket. Défaut 2 du §7.

## 4. Exercice de restauration réel

Sur un add-on PostgreSQL neuf (`web-scumm-ref-pg-drill`, plan DEV), lié à rien, supprimé ensuite ; la production
laissée tranquille. La restauration a tourné depuis la machine du mainteneur, avec la configuration du studio (dossier de
travail local), les identifiants Cellar et l'URI de l'add-on d'exercice seulement : l'URI de production n'a jamais
quitté l'instance.

| Mesure | Valeur |
|---|---|
| Tête de production notée avant (révision), RPO à cet instant | **1**, RPO **0** (`studio_journal_revision`, `studio_journal_rpo_seconds`) |
| Révision de la sauvegarde restaurée | **1** (`backups/2026-10-19T17-36-40Z-r1.json`) |
| **Temps de restauration** (`time … restore <fichier> --replay`, de bout en bout) | **28,7 s** depuis Paris vers la région `par` (démarrage de `tsx` compris) |
| Lignes écrites, `dropped`, `stopped` | **508** lignes, `dropped` **0**, pas de `stopped` |
| Révision atteinte après rejeu ; égale à la tête de production ? | **1**, oui |
| `studio_files` identiques (chemin, blob) sur les deux bases | **499** lignes, empreinte md5 de `path:blob` (ordre `C`) **identique** à celle de la table `studio_files` de la sauvegarde ; la base de production n'a pas été relue (lecture refusée par les permissions de la session) : la comparaison passe par la sauvegarde, prise à la même tête |
| **RPO observé** : opérations confirmées en production et absentes de la restauration | **0** ; mais aucune écriture n'a eu lieu après la sauvegarde : le rejeu n'avait rien à rejouer. L'exercice avec deux écritures après la sauvegarde reste à faire (il demande une session membre) |

## 5. Montée de version (redéploiement à chevauchement)

À mesurer en phase B (redéploiement du main final). Observé en passant au `clever restart` du §3 : la nouvelle
instance écoutait à 17:34:24, l'ancienne est restée `STOPPING` jusque vers 17:36:30, et le bail de service n'a été pris
qu'à **17:37:01** (`lease-taken`), soit ≈ 2 min 37 s sans instance qui serve les écritures. Aucune ligne `stopping` de
l'ancienne. Juste après, vers 17:38–17:39, les trois sondes (`/startz`, `/readyz`, `/livez`) ont rendu la page 503 de
Clever pendant une à deux minutes, revenues à 200 sans intervention ; cause non établie.

| Mesure | Valeur |
|---|---|
| Version de départ → version d'arrivée | à mesurer |
| Chevauchement observé (les deux instances vivantes, combien de temps) | à mesurer |
| Délai de bascule du bail de service (`lease-taken` de la nouvelle instance) | à mesurer |
| Écritures refusées en 503 pendant la bascule, puis rejouées avec le même identifiant | à mesurer |
| Révision inchangée, une écriture après bascule | à mesurer |
| SIGTERM reçu par l'ancienne instance (ligne `stopping`) | à mesurer |

## 6. Prévisualisation et recompilation

| Mesure | Valeur |
|---|---|
| **p95 de la prévisualisation** (`studio_preview_build_seconds`, sur combien de révisions) | à mesurer (une révision : 32,2 s) |
| Seuil de prévisualisation : la cadence de modifications au-delà de laquelle la file s'allonge (méthode, résultat) | à mesurer |
| **Coût d'une recompilation fraîche** (`POST /api/builds/<n>/rebuild` : durée, octets identiques ?) | à mesurer |

## 7. Ce qui n'a pas pu être fait

Défauts trouvés, à corriger avant de clore :

1. **Sans `--config`, le premier argument est perdu** (`studio-server/src/server/main.ts`, `rest.filter((_, i) => i
   !== at && i !== at + 1)` avec `at = -1` retire l'indice 0). Toute commande configurée par `STUDIO_CONFIG_JSON` est
   touchée : `import <dossier>`, `invite --email`, `backup --to-bucket`. C'est exactement l'appel de
   `ops/studio/backup-cron.sh` : **la sauvegarde quotidienne échoue en l'état**. Contourné ici par `--config` sur un
   fichier écrit depuis `STUDIO_CONFIG_JSON`.
2. **Une opération écrite hors de l'instance n'est pas expédiée** : `Shipper.ship()` ne part qu'au démarrage et sur
   l'événement `confirmed` de l'instance. Après `import` (ou toute écriture par la CLI), le RPO croît jusqu'au prochain
   redémarrage ou à la prochaine écriture. Il faut un réessai périodique tant que le RPO n'est pas nul, ou dire dans le
   runbook de redémarrer après l'import.

Écarts du runbook : la création du realm sur le Keycloak managé (`admin-cli` refuse le mot de passe administrateur,
mot de passe par défaut temporaire), les valeurs locales de `realm.json`, `APP_FOLDER` hérité, `clever env set` d'une
clé PEM (`--` nécessaire), `clever deploy` qui demande un alias lié, `clever logs` qui suit sans fin, le 401 de
`/metrics` sur l'origine du jeu.

Non faits en phase A : collecteur et alertes (§2), latence du journal (aucune écriture par l'API), passage du cron
(§3), exercice avec écritures après la sauvegarde (§4), montée de version (§5), seuil et recompilation (§6), option «
traitement sans réseau sortant », OpenTelemetry (hors de 4.2.3).

## 8. Conclusion

À remplir après la phase B. En l'état : le déploiement tient sur deux applications XS, PostgreSQL DEV et un Keycloak
BASE ; une sauvegarde de la révision 1 prend 2,5 s et 171 Ko ; sa restauration sur une base neuve prend 29 s et rend la
même tête. Deux défauts du serveur (§7) empêchent pour l'instant la sauvegarde quotidienne et l'expédition des écritures
faites par la CLI. Limite : organisation de test, un échantillon par chiffre, pas de charge de production.
