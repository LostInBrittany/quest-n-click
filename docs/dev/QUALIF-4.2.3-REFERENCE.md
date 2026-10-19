# Qualification 4.2.3 : le déploiement de référence

> **Statut** : modèle, **à remplir pendant l'exécution**. Aucun chiffre ci-dessous n'est mesuré tant qu'il dit « à
> mesurer ».
> **Plan** : `docs/dev/PLAN-4.2.3-COORDINATION.md`, H9 et §2.4 (PR 9) ; plan maître
> `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md` §4 (bail de service, redéploiement à chevauchement).
> **Runbook suivi** : `docs/fr/STUDIO-SERVER.md`, « Le faire tourner : le déploiement de référence ».
> **Où** : l'organisation Clever de test (à préciser : nom, région). **Quand** : à préciser.
> **Limite déclarée (H9)** : mesuré sur l'organisation de test, pas sous une charge de production, et les chiffres le
> disent. Chaque chiffre est une mesure, avec sa commande, ou dit qu'il n'en est pas une.

## 1. Ce qui a été déployé

| Élément | Valeur |
|---|---|
| Version du moteur (commit, tag) | à mesurer |
| Application studio (taille, nombre d'instances) | à mesurer |
| Application de traitement (taille) | à mesurer |
| Add-on PostgreSQL (plan, version) | à mesurer |
| Cellar (bucket) | à mesurer |
| Fournisseur OIDC (Keycloak managé ou autre) | à mesurer |
| Domaines, TLS (`publicUrl`, `playUrl`, `worker.url`) | à mesurer |
| `STUDIO_METRICS_TOKEN`, `STUDIO_BACKUP_CRON` posés | à mesurer (oui / non ; jamais la valeur) |

## 2. Métriques et alertes

- Collecteur utilisé pour `/metrics` (Prometheus, autre) et sa fréquence : à mesurer.
- `/metrics` sans jeton → 401 ; avec le jeton → 200 ; sur l'origine du jeu → 404 : à mesurer.
- Alertes posées, et vers qui (une personne) : `/readyz` non 200, RPO > 60 s, profondeur de file, échecs de jobs,
  sauvegarde manquante ; notifications Clever (`DEPLOYMENT_FAIL`) : à mesurer.
- Une alerte déclenchée exprès (laquelle, délai jusqu'à la personne) : à mesurer.

| Mesure (sur la durée de la qualification) | Valeur |
|---|---|
| Latence des opérations du journal, p50 / p95 (`studio_journal_operation_seconds`) | à mesurer |
| Profondeur de file maximale observée (`studio_worker_jobs_in_flight`) | à mesurer |
| Conflits de bail (`studio_lease_conflicts_total`), et pendant quel scénario | à mesurer |
| Durée des jobs par sorte, p50 / p95 (`studio_worker_job_seconds`) | à mesurer |
| Jobs en échec ou hors délai, par sorte | à mesurer |

## 3. Sauvegarde planifiée

| Mesure | Valeur |
|---|---|
| La tâche `clevercloud/cron.json` a tourné (date, ligne `"event":"backup"` dans les journaux) | à mesurer |
| Clé écrite (`backups/<date>-r<rev>.json`), taille | à mesurer |
| Durée de `backup --to-bucket` | à mesurer |
| `--keep` : sauvegardes supprimées au deuxième passage | à mesurer |
| Une seule sauvegarde par jour (instance 0), ou deux pendant un redéploiement | à mesurer |

## 4. Exercice de restauration réel

Sur un add-on PostgreSQL neuf, lié à rien ; la production laissée tranquille.

| Mesure | Valeur |
|---|---|
| Tête de production notée avant (révision), RPO à cet instant | à mesurer |
| Révision de la sauvegarde restaurée | à mesurer |
| **Temps de restauration** (`time … restore <fichier> --replay`, de bout en bout) | à mesurer |
| Lignes écrites, `dropped`, `stopped` | à mesurer |
| Révision atteinte après rejeu ; égale à la tête de production ? | à mesurer |
| `studio_files` identiques (chemin, blob) sur les deux bases | à mesurer |
| **RPO observé** : opérations confirmées en production et absentes de la restauration | à mesurer |

## 5. Montée de version (redéploiement à chevauchement)

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
| **p95 de la prévisualisation** (`studio_preview_build_seconds`, sur combien de révisions) | à mesurer |
| Seuil de prévisualisation : la cadence de modifications au-delà de laquelle la file s'allonge (méthode, résultat) | à mesurer |
| **Coût d'une recompilation fraîche** (`POST /api/builds/<n>/rebuild` : durée, octets identiques ?) | à mesurer |

## 7. Ce qui n'a pas pu être fait

À remplir : chaque point du §2.4 du plan qui n'a pas été exécuté, et pourquoi (dont l'option « traitement sans réseau
sortant » si le runtime ne la permet pas, et OpenTelemetry, hors de 4.2.3).

## 8. Conclusion

À remplir : ce que les chiffres permettent de dire, et leur limite (organisation de test, pas de charge de production).
