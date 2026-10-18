# Spike 4.2.2 : quelle prévisualisation par révision

> **Date** : 18 octobre 2026.
> **Plan** : `docs/dev/PLAN-4.2.2-ATELIER-JOUABLE.md`, §2.1 (PR 1).
> **Question** : (a) un bundle moteur par version plus un paquet de contenu par révision, ou (b) un build complet par
> révision, coalescé. Chaque ligne ci-dessous est une mesure, ou dit qu'elle n'en est pas une.

## 1. Ce que le contenu d'un jeu contient

La voie (a) suppose qu'une révision du jeu se réduit à des **données** : le moteur, construit une fois par version,
démarre un jeu décrit par un paquet de contenu (`patchGame`, `src/studio/demo-patch.ts`, le fait déjà pour les textes,
placements et storyboard de la démo).

- `games/demo/index.ts` exporte des **commandes personnalisées** (`commands`, `sparkle`) : du code, pas des données.
- Le format du contenu permet des mini-jeux propres au jeu (`minigames`) et des extensions de confiance
  (`trustedExtensions`, ADR 0013), qui sont du code.

**Conséquence** : la voie (a) ne sait pas prévisualiser le jeu d'exemple tel qu'il est. Elle demanderait un format de
contenu sans code, ce qui changerait le format (D40 l'interdit en 4.2.x). **Écartée.**

## 2. La voie (b), mesurée

`vite build` du jeu depuis une copie de son dossier (`GAME_DIR`), avec la base `/preview/<rev>/`, sur la machine du
mainteneur (Apple Silicon, 10 cœurs) :

| Jeu | Premier build | Builds suivants | JavaScript produit | Total servi |
|---|---|---|---|---|
| `games/demo` (avec commandes) | 2,5 s | 1,3 s | 852 Ko | 11 Mo, dont 3,9 Mo d'images et 3,3 Mo de sons |

- Les images et les sons sont les fichiers préparés du jeu, identiques d'une révision à l'autre. Rangés par contenu
  (`sha256/<hex>`, comme les blobs du journal), ils ne sont stockés **qu'une fois** pour toutes les révisions. Ce qui
  est propre à une révision est son JavaScript et sa page : **moins de 1 Mo**.
- `games/reference` ne se construit pas depuis une copie seule (il n'a pas de dossier `art/`) : non mesuré, sans effet
  sur la décision.
- **Non mesuré ici** : le temps sur l'application de traitement Clever (1 vCPU, ≈ 1 Go, spike S §1). On s'attend à un
  facteur de 3 à 6 ; la passe `studio-preview` le mesure.

## 3. Décision et seuil

- **La voie (b)** : un build complet par révision, produit par l'application de traitement depuis le snapshot immuable
  de la révision, **coalescé** (une rafale d'écritures ne construit que la dernière révision), publié par le Studio
  sous des clés qu'il choisit, servi immuable sur `play_url` à `/preview/<rev>/`.
- **Les outils d'édition** (le placement de Rooms) entrent dans ce build avec un drapeau de build propre
  (`VITE_STUDIO_PREVIEW`), sans les correctifs de la démo ni son stockage local.
- **Seuil** : la cible du plan est 5 s de l'écriture à la prévisualisation jouable. Mesuré ici : 1,3 à 2,5 s de build.
  Le seuil publié en 4.2.2 est **p95 ≤ 10 s** sur l'application de traitement, en attendant la mesure de la passe
  `studio-preview` ; pendant un build, la page sert la dernière prévisualisation prête, étiquetée avec sa révision.
