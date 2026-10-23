# Notes de mise à jour : 4.5

Ce que la 4.5.0 « Wiki » et la 4.5.1 ont changé. Rien à changer dans un jeu ; la documentation a déménagé.

La mise à jour elle-même est [Mettre à jour](install.upgrade.md).

<a name="from-4-4-0-to-4-5-0"></a>
<!-- applies: 4.5.0.. -->

## De la 4.4.0 à la 4.5.0 « Wiki »

Rien à changer : un jeu se construit, se joue et se sauvegarde comme en 4.4.0 (mêmes empreintes, sauvegardes et runs de
référence). Le moteur s'installe depuis `releases/download/v4.5.0/…`. Ce qui est nouveau :

- **La documentation, c'est le wiki.** Elle vit dans le wiki GitHub, en français et en anglais, et dans la
  documentation de chaque release (`/docs/<version>/` sur le site du projet). Les anciennes pages sous `docs/` sont
  désormais des pages de transition : chaque ancien titre reste et renvoie à sa nouvelle place, si bien qu'un ancien
  lien arrive encore, et le texte complet de la 4.4.0 reste lisible au tag `v4.4.0`.
- **`read_doc {name}` marche toujours** : les huit noms (`CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`,
  `AUDIO`, `UPGRADING`, `CLASSICS`) répondent un seul bloc de texte, avec les arguments de la 4.4.0 ; la page est
  reconstruite à partir des sections du wiki, et une section trop longue pour sa borne est réduite à son titre, son
  premier paragraphe et le `read_doc { id, section }` qui donne la suite.
- **Deux nouveaux outils MCP** : `search_docs` (par mots ou par une question, en français ou en anglais) et
  `list_docs` ; et `read_doc {id, section, lang}` lit une section d'une page par son id. Un agent cherche d'abord, puis
  lit par id.
- **Le package porte sa documentation**, `docs-bundle/` : `npx quest-n-click mcp` dans un projet créé la lit, là où la
  4.4.0 ne trouvait rien à lire.
- **Correctifs** : `npx quest-n-click doctor` fonctionne dans un projet créé (Playwright y est optionnel) ;
  `npm run page:world` et `page:puzzles` écrivent un fichier `.html` par défaut ; un Studio partagé accepte un bail sur
  la portée de la carte du scénario (`groupings`).

<a name="from-4-5-0-to-4-5-1"></a>
<!-- applies: 4.5.1.. -->

## De la 4.5.0 à la 4.5.1

Rien à changer : un jeu se construit, se joue et se sauvegarde comme en 4.5.0 (mêmes empreintes, sauvegardes et runs de
référence). Le moteur s'installe depuis `releases/download/v4.5.1/…`. Ce qu'un jeu peut utiliser, chaque fois en option :

- **`games/<id>/spans.json`** : les pans des fichiers propres au jeu (les modules qu'importe son `index.ts`, ses
  notes, ses scripts), qu'un Studio partagé refusait d'écrire jusqu'ici. Les règles du moteur passent d'abord ; un
  fichier que ni l'un ni l'autre ne nomme reste refusé ([pan](team.concepts.md#span)).
- **`games/<id>/audit-allow.json`** : un mot que l'audit des fuites bloque et qui est aussi, par hasard, un mot du jeu
  (le prénom d'une vraie personne), autorisé par son préfixe SHA-1 et une raison, dans le dossier du jeu et ses assets
  construits seulement ([audit-allow.json](create.build-release.md#audit-allow)).
- **`url` dans `site.json`** : l'adresse publique du jeu. Avec elle, l'`og:image` de la page est absolue et un `og:url`
  s'ajoute, si bien que LinkedIn et Facebook montrent l'image de partage ; sans elle, la page est comme en 4.5.0
  ([site.json](create.project-layout.md#site-json)).
- **La documentation** : les corrections de l'audit du wiki par le mainteneur (liens dont le libellé est du code, le
  premier tutoriel, les sauvegardes, la fenêtre de support, la recherche). Un lien vers une page ou une section de la
  4.5.0 arrive toujours.
