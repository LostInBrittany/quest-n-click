# web-scumm 4.2.3 : la coordination (plan détaillé, brouillon)

> **Statut : brouillon, à relire par le mainteneur.** Aucune ligne de code de 4.2.3 avant la fusion de ce plan par le
> mainteneur (méthode du plan maître, §13). Le nom de la release reste à choisir (D40). Signer `v4.2.3` demande son
> propre oui (D37) : ni « you have my all go » ni le oui de `v4.2.2` ne le couvrent.
>
> **Source normative en amont :** `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`, §9. Ce document détaille cette
> section et y ajoute ce que 4.2.2 a laissé ouvert (LOG #217) ; en cas d'écart, le plan maître l'emporte jusqu'à ce
> qu'un amendement soit fusionné.
>
> **Prérequis :** 4.2.2 « Playable Workshop » publiée. Rien ici ne suppose autre chose que ce que 4.2.2 a livré.

## 0. Ce que 4.2.3 doit rendre vrai

**Résultat visible** (plan maître §9) : l'équipe s'organise dans le Studio (carte du scénario, commentaires ancrés,
diff lisible) ; des agents IA travaillent à distance par MCP sur le Studio hébergé ; le jeu part sur GitHub ; le
déploiement Clever Cloud de référence est exécuté et documenté. C'est la dernière étape de la ligne 4.2.x du Studio
Server (D40).

**Ce que 4.2.2 laisse ouvert, et que 4.2.3 ferme** (LOG #217, SUPPORT « 4.2.2 ») :
- **Un worker installé depuis les archives ne peut pas lancer `prepare`** : le verrou
  `ops/studio/worker-requirements.lock` n'est pas dans l'archive, et `PYTHONPATH` suit le dossier du moteur.
- **La découpe de planches et les uploads restent locaux** (D43) ; `prepare` ne montre pas de progression et ne
  s'annule pas.
- **L'exercice de restauration** n'a tourné qu'en CI (Postgres et un S3), pas sur une instance Clever qualifiée.
- **Le seuil de la prévisualisation** (D42) n'est mesuré qu'en local ; le coût de la recompilation fraîche n'est pas
  mesuré.
- **Le set de mutation `studio-workshop`** est mesuré, pas bloquant : ses survivants ne sont pas lus.
- **La santé** juge le validateur et le solveur, pas lint ni les playtests.
- Des limites de 4.2.1 tiennent encore : l'Assistant n'est pas sur un Studio hébergé ; une écriture refusée garde son
  brouillon sans diff à fusionner ; les éditeurs n'envoient pas la révision qu'ils ont lue (la base de P5).

## 1. Garanties, chacune avec sa limite et son test

Format de la maison (`verifiable-guarantees`) : un comportement précis, sa limite déclarée, le test qui le prouve.

| # | Garantie | Limite déclarée | Preuve |
|---|---|---|---|
| H1 | Un regroupement (personnage, énigme, chapitre) ne fait que **référencer** des ids stables ; il n'écrit jamais l'élément qu'il nomme, et la carte du scénario se dérive des ids et de la provenance IR, sans état propre | La carte décrit ce que le contenu déclare ; un lien implicite (une condition calculée) peut manquer, et la carte le dit « non déclaré » | Test : supprimer un regroupement ne change aucun fichier de contenu ; la carte régénérée est identique à la carte dérivée |
| H2 | Un commentaire est ancré sur un id stable et sa révision ; un reviewer peut commenter sans pouvoir écrire le jeu | Un commentaire dont l'id a disparu reste lisible, marqué « orphelin » ; il n'est jamais rattaché ailleurs | Tests : reviewer qui commente (201) puis écrit (403) ; id supprimé → orphelin |
| H3 | Le diff entre deux révisions (ou deux builds) est **sémantique** : il nomme les ids ajoutés, retirés, changés, avec les champs | Les captures avant/après n'existent que si Chromium tourne sur le worker qualifié ; sinon elles sont dites indisponibles en hébergé | Test : une suite d'opérations connue → le diff attendu, champ par champ |
| H4 | Le MCP distant applique **les mêmes contrôles que l'API** (politique B : jeton OIDC, audience, membre au moment de la requête, révocation R) ; il s'annonce comme ressource protégée (RFC 9728) | Le client MCP doit savoir suivre la découverte d'autorisation ; un client qui ne le sait pas reste sur le MCP local en stdio | Tests : jeton d'une autre audience → 401 ; membre retiré → 401 à la requête suivante ; un outil MCP qui écrit passe par le garde et les pans |
| H5 | Un push Git est un **lot de révisions** confirmées, avec `Co-authored-by` de chaque auteur, depuis un secret en fichier | Le push ne réécrit jamais l'historique distant ; un dépôt qui a divergé est refusé, jamais forcé | Test : un dépôt nu local, deux lots, puis une divergence refusée |
| H6 | La montée de version du moteur pour le jeu hébergé est une **opération exclusive**, vérifiée par validate et solve, annulable par restauration | Une migration qui casse un jeu est refusée avant d'être confirmée ; ce qu'un auteur aurait fait pendant le bail exclusif attend | Test : un jeu qui ne migre pas → refus, tête intacte ; un jeu qui migre → une révision, santé verte |
| H7 | Un worker installé **depuis les archives** prépare les assets : le verrou est dans l'archive, `PYTHONPATH` suit le dossier de l'application | Les paquets Python restent installés par le hook de build (jamais à l'exécution) | Test d'installation depuis l'archive : le verrou présent, son empreinte égale à celle du dépôt ; un `prepare` réel en CI |
| H8 | La découpe de planches et les uploads tournent en hébergé, comme `prepare` : sur le worker, sous le bail exclusif, sortie bornée, **progression en SSE et annulation** | Un upload est borné en taille et en type ; une découpe annulée ne laisse aucune opération | Tests : annulation en cours de job → aucune révision ; upload hors bornes → 413/415 |
| H9 | Le déploiement de référence est **exécuté** sur Clever Cloud : runbook, supervision, alertes, sauvegardes planifiées, **exercice de restauration réel** | Mesuré sur l'organisation de test, pas sur une charge de production ; les chiffres le disent | Rapport de qualification avec l'exercice (temps de restauration, RPO observé) ; passes `studio-hosted` |

## 2. Les PR, dans l'ordre

| PR | Branche | Contenu | Dépend de |
|---|---|---|---|
| A | `docs/423-plan` | Ce document, réservations (ADR 0029 : MCP distant ; D44 : choix de 4.2.3) | 4.2.2 |
| 0 | `fix/423-archive-prepare` | H7 : le verrou dans l'archive du serveur, `PYTHONPATH` depuis le dossier de l'application, test d'installation | A |
| 1 | `feature/423-map` | H1 : regroupements et carte du scénario (`scenario.map.json`) | A |
| 2 | `feature/423-comments` | H2 : commentaires ancrés, fils, résolu ; `ids --lines` en opération exclusive ; les notes migrent | A |
| 3 | `feature/423-diff` | H3 : diff sémantique entre révisions et builds ; captures si Chromium qualifié sur le worker | A |
| 4 | `feature/423-mcp-remote` | H4 : MCP distant Streamable HTTP, Protected Resource Metadata, ADR 0029 | A |
| 5 | `feature/423-git` | H5 : export et push Git par lots, import depuis Git | A |
| 6 | `feature/423-engine-upgrade` | H6 : `migrate` en mode exclusif, vérifié, retour arrière | A |
| 7 | `feature/423-assets-hosted` | H8 : découpe et uploads sur le worker, progression SSE et annulation (aussi pour `prepare`) | 0 |
| 8 | `ops/423-reference` | H9 : déploiement de référence exécuté, runbook, supervision, alertes, sauvegardes planifiées, exercice de restauration ; seuil de prévisualisation et coût de la recompilation mesurés sur Clever | 0 |
| 9 | `test/423-workshop-mutants` | Survivants de `studio-workshop` lus (tués ou nommés), set passé en `GATED` | A |
| 10 | `ci/423-gates` | Jobs et passes `studio-mcp-remote`, `studio-oidc-generic` (un second fournisseur OIDC, vérifié par une personne) | 1 à 9 |
| R | `release/4.2.3` | Comme 4.2.2 ; le oui de signature de `v4.2.3` consigné | 10, passes ouvertes |

1 à 6 et 9 sont indépendantes ; 0 passe en premier parce qu'elle débloque la passe `studio-assets-hosted` de 4.2.2.

## 3. Critères de sortie

Ceux du plan maître (§9), plus : H1 à H9 prouvées par leurs tests ; le rapport de qualification du déploiement de
référence fusionné, avec l'exercice de restauration réel ; `studio-workshop` gated ; les passes `studio-mcp-remote` et
`studio-oidc-generic` ouvertes et signalées ; SUPPORT dit, surface par surface, ce qui reste expérimental à la fin de
la ligne 4.2.x.

## 4. Décisions demandées au mainteneur

1. **Le nom** de 4.2.3.
2. **Le second fournisseur OIDC** de la passe `studio-oidc-generic` (GitLab, Authentik, ou un autre).
3. **Le push Git** : clé de déploiement (un dépôt) ou GitHub App (plusieurs dépôts, plus de configuration).
4. **Les captures du diff en hébergé** : qualifier Chromium sur le worker (présent sur le runtime, spike S) ou les
   garder locales.
5. **Le oui pour signer `v4.2.3`** (D37), donné quand la release existe.
6. **Les ressources Clever du spike** : gardées pour le déploiement de référence (PR 8), puis supprimées après la
   release, ou gardées.

## 5. Risques

- **Le périmètre** : neuf garanties pour une release. Si la ligne doit rester courte, la carte et les commentaires
  (1, 2) ou le push Git (5) peuvent passer après 4.2.3 ; le plan le dira par amendement, jamais en silence.
- **Le MCP distant** dépend de clients qui suivent la spécification d'autorisation : sans eux, H4 est prouvée par
  tests mais peu utilisée.
- **Chromium sur le worker** : taille, mémoire, sandbox ; sans qualification, les captures restent locales.
- **Le déploiement de référence** coûte de l'argent réel (environ 37 € par mois pour Keycloak seul, spike S) et
  demande des actions humaines (domaine, TLS, alertes vers une personne).
