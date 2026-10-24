# Notes de mise à jour : 4.5

Ce que la 4.5.0 « Wiki », la 4.5.1 et la 4.5.2 ont changé. Rien à changer dans un jeu jusqu'à la 4.5.1 (la
documentation a déménagé) ; à partir de la 4.5.2, `npx quest-n-click migrate` passe ses imports aux noms de paquets à
scope.

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

<a name="from-4-5-1-to-4-5-2"></a>
<!-- applies: 4.5.2.. -->

## De la 4.5.1 à la 4.5.2

Les paquets du moteur sont nommés sous le scope de l'organisation npm (D53) : `quest-n-click` est
`@quest-n-click/engine`, et `create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connectors` et
`quest-n-click-studio-server` sont `@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors` et
`@quest-n-click/studio-server`. Les commandes gardent leur nom (`quest-n-click dev`, `npx quest-n-click migrate`,
`npx quest-n-click-bridge serve`), et les fichiers de la release aussi (`quest-n-click-4.5.2.tgz`, …). Un jeu se
construit, se joue et se sauvegarde comme en 4.5.1. Ce qu'un projet créé change :

1. Installez le nouveau moteur à la place de l'ancien paquet (le paquet de l'archive est maintenant
   `@quest-n-click/engine`) :

   ```bash
   # dans le projet créé
   npm uninstall quest-n-click
   npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.5.2/quest-n-click-4.5.2.tgz
   ```

2. Laissez `migrate` déplacer le reste, puis vérifiez :

   ```bash
   # dans le projet créé
   npx quest-n-click migrate
   npx quest-n-click migrate --check
   npm install
   npm run verify
   ```

   `migrate` renomme les imports `quest-n-click/content`, `/player`, `/minigames`, `/testing`, `/reality` (et
   `quest-n-click-bridge/cli`) en `@quest-n-click/engine/…` (`@quest-n-click/bridge/cli`) dans chaque fichier source ;
   dans `tsconfig.json`, le chemin `quest-n-click/*` et les cibles `node_modules/quest-n-click/…` vers
   `@quest-n-click/engine` ; dans `package.json`, il retire la dépendance à un paquet sans scope une fois son nom à
   scope installé, et dit celles qui restent (`package.json depends on quest-n-click-bridge: npm uninstall
   quest-n-click-bridge && npm install @quest-n-click/bridge`). Il ne renomme aucune commande : les scripts restent
   tels quels.

- **Pas encore migré ?** Pendant toute la 4.5.x, les imports sans scope `quest-n-click/…` se résolvent encore, dans un
  build (Vite) et dans le `tsconfig.json` du moteur lui-même, si bien qu'un jeu qui n'a pas lancé `migrate` se
  construit encore ; son propre `tsconfig.json` pointe encore dans `node_modules/quest-n-click`, que la nouvelle
  installation a retiré, jusqu'à ce que `migrate` le renomme.
- **Un Studio hébergé** renomme lui-même les imports sans scope d'un jeu, à la mise à jour du moteur, comme il l'a
  fait pour les `web-scumm/…` ([Mettre à jour le moteur hébergé](team.upgrade-engine.md)).
- **Le Bridge, les connecteurs et le Studio Server** s'installent depuis leurs archives comme avant ; dans
  `node_modules`, ils sont maintenant sous `@quest-n-click/` (`node_modules/@quest-n-click/bridge`, …).
- **npm** n'a toujours aucune version du produit : les noms à scope portent une réservation, les noms sans scope
  deviennent des pointeurs dépréciés ([Installer depuis npm, une fois publié](install.from-npm.md)).
