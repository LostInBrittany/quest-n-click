# Carte du monde

La carte de voyage : des régions, des lieux qui ouvrent des salles, le trajet entre eux, et le marqueur de nouveauté.
Elle se déclare une fois dans `game.ts` (`map`). Un jeu de deux ou trois salles reliées par des portes n'en a pas
besoin.

<a name="map"></a>

## La carte

```ts
map: {
  start: 'world',
  regions: { world: { name: 'Monde', image: 'decor/map' }, town: { name: 'Ville', image: 'decor/map_town', parent: 'world' } },
  places: {
    market: { name: 'Marché', room: 'market', region: 'town', pos: [61, 41], portrait: 'seller/r1c2', vehicle: 'car', news: '!market_done' },
  },
},
```

| Champ | Contenu |
|---|---|
| `start` | La région montrée à l'ouverture de la carte. |
| `regions.<id>` | `name`, `image` (l'image de la carte), `parent` (la région d'où elle s'ouvre : la France depuis le Monde), `frame: [x, y, w, h]` (sa zone sur l'image du parent, en % : tracée en contour une fois la région ouverte). |
| `places.<id>` | `name`, `room` (la salle qu'il ouvre), `region`, `pos: [x, y]` (en % de l'image de la région), `portrait`, `vehicle`, `news`, `joins`. |
| `music` | La musique de la carte. |
| `vehicles` | `{ car, plane, pin, news, dot }` : des images qui remplacent, sur la carte, les icônes de l'habillage (`dot` : le jeton de `pins: 'dots'`). |
| `pins` | `'faces'` (par défaut), `'hidden'` ou `'dots'` : comment les lieux sont marqués sur la carte ([plus bas](#bare-pins)). |

Le validateur veut que la région de départ, la salle et la région de chaque lieu, et le parent de chaque région
existent.

<a name="unlocking"></a>

## Débloquer et voyager

Un lieu n'apparaît qu'une fois débloqué : `{ unlock: 'market' }` dans une règle, ou `start.unlocked` dans `game.ts`
(un point de reprise a son propre `unlocked`). `{ unlocked: 'market' }` le teste. Le joueur ouvre la carte avec son
bouton (`skin.icons.map`), ou une règle l'ouvre avec `{ map: true }` ; un tap sur une épingle emmène dans la salle de
son lieu (son `onEnter` s'exécute). `vehicle: 'car'` ou `'plane'` dessine le véhicule le long du trajet : une petite
animation et une impression de distance.

`vehicle: 'walk'` fait voyager le héros à pied : le personnage que le joueur joue à ce moment marche le long du trajet,
tel que la salle le dessine (la variante qui s'applique, donc le héros choisi au Nouveau jeu, et sa palette). Ses images
`walk` défilent à son `fps`, retournées quand le chemin va vers la gauche ; sur un tronçon surtout vertical, `walk_back`
en montant et `walk_front` en descendant quand la planche les a. Le marcheur fait 12 % de la hauteur de la carte (à peu
près la taille d'une épingle), sa largeur suit l'image, ses pieds sur le trajet ; le voyage dure 1,6 s, comme en
voiture, et ne fait aucun bruit. Un héros sans images `walk` voyage en voiture. Comme les autres véhicules, ce n'est
que de la présentation : les règles, les sauvegardes et le solveur ne le voient pas.

```ts
lande: { name: 'La lande', room: 'lande', region: 'leon', pos: [40, 62], vehicle: 'walk' },
```

`news: COND` affiche un « ! » sur l'épingle tant que la condition est vraie : là où quelque chose de nouveau attend.
Dans la démo, le jardin a une nouveauté tant que `!tank_drained`, la maison quand on tient la clé et que le
garde-manger est encore fermé.

<a name="pins"></a>
<!-- applies: 4.4.0.. since 4.4.0 -->

## Une épingle pour plusieurs lieux

Le `portrait` d'un lieu peut être une liste : plusieurs visages côte à côte sur son épingle, quand plusieurs
personnages y vivent. Un lieu qui dit `joins: '<lieu>'` se pose sur l'épingle de ce lieu au lieu d'avoir la sienne :
une fois débloqué, son visage s'y ajoute, un tap sur un visage emmène dans le lieu de ce visage, et depuis n'importe
lequel d'entre eux l'épingle est « ici » (seul le visage courant est cerclé). Passer d'un lieu à l'autre d'une même
épingle ne dessine aucun trajet. Sa propre `pos` ne sert pas : écrivez celle de l'épingle.

```ts
places: {
  harbour: { name: 'Port', room: 'quay', region: 'town', pos: [30, 70], portrait: ['captain/r1c2', 'cook/r1c2'] },
  // Une autre salle de la même ville : son visage rejoint l'épingle du port et y mène directement.
  lighthouse: { name: 'Port : le phare', room: 'lighthouse', region: 'town', pos: [30, 70], portrait: 'keeper/r1c2', joins: 'harbour' },
},
```

Le validateur veut que le lieu de l'épingle existe, dans la même région, et qu'il n'en rejoigne pas lui-même un autre
(et refuse un lieu qui se rejoint lui-même). Une épingle qui n'a qu'un lieu s'affiche comme avant.

<a name="regions"></a>
<!-- applies: 4.6.1.. since 4.6.1 -->

## Des régions dans des régions

Une région qui a un `parent` s'ouvre depuis lui : la carte du parent a un bouton de zoom vers elle (`ui.zoomIn`) et,
quand la région a un `frame`, sa zone tracée en contour sur l'image du parent. Les deux n'apparaissent qu'une fois la
région ouverte : un lieu en elle, ou dans une région en dessous, est débloqué. Jusque-là le joueur n'en voit rien : elle
ne gâche rien et ne mène jamais à une carte vide. Une région peut être dans une région elle-même dans une région : celle
du milieu a le chemin vers le bas au-dessus du retour vers le haut (`ui.world`), toujours là.

La région sur laquelle la carte s'ouvre (celle du lieu de la salle courante, sinon `start`) est toujours ouverte : le
joueur peut toujours revenir là où il se trouve. Quand plusieurs régions enfants sont ouvertes, chacune a son cadre et
le bouton mène à la première.

```ts
regions: {
  land: { name: 'Terre', image: 'decor/map' },
  // Cachée de la carte de la terre tant que le port (ou un lieu d'une région dans la côte) n'est pas débloqué.
  coast: { name: 'Côte', image: 'decor/map_coast', parent: 'land', frame: [20, 10, 50, 30] },
},
```

Ne peignez pas de cadre dans l'image du parent : la carte le trace quand la région s'ouvre.

<a name="bare-pins"></a>
<!-- applies: 4.6.1.. since 4.6.1 -->

## Une carte sans épingles, ou avec des jetons

Quand l'image de la carte dessine déjà ses lieux (un village, une chapelle, un phare, chacun là où est le lieu),
`pins: 'hidden'` retire les épingles : ni visage, ni disque, ni aiguille. Chaque lieu reste un bouton, nommé d'après lui
pour les lecteurs d'écran, de la taille d'un visage et centré sur sa `pos`, mais transparent : le joueur touche le
repère lui-même. Son « ! » (`news`) s'affiche toujours là, et le focus clavier l'entoure. Les lieux qui rejoignent une
même épingle ont chacun un tel bouton, côte à côte à cet endroit. La liste « Où aller ? » à côté de la carte est la
même, et le `portrait` n'est pas dessiné (on peut l'omettre). Placez chaque `pos` au milieu de son repère, pas
dessous comme pour une aiguille : le trajet du voyage va d'un repère à l'autre. Par défaut, `pins: 'faces'` dessine
les épingles comme avant.

`pins: 'dots'` est la voie du milieu : les mêmes boutons, chacun avec un petit jeton en son milieu (environ un tiers
d'un visage, un disque couleur de pierre au contour sombre avec une ombre douce, ou l'image `vehicles.dot`, gardée
nette), pour que le joueur voie où toucher sans que le dessin soit caché. Un jeton s'illumine d'une lueur chaude au
survol et au focus clavier (sans grossir avec `prefers-reduced-motion`). La zone de tap garde la taille d'un visage.
Sur le lieu actuel, à la place de son jeton, le héros que le joueur joue à ce moment se tient immobile : sa première
image `idle`, telle que la salle le dessine (la variante et la palette qui s'appliquent), 12 % de la hauteur de la
carte comme le marcheur de `vehicle: 'walk'`, les pieds sur le repère, avec une petite ombre ; le « ! » de ce lieu
passe à côté de sa tête. Quand le joueur voyage, le héros quitte le repère (le marcheur, ou le véhicule, prend le
relais) et se tient sur le nouveau lieu à l'arrivée, tourné du côté d'où il vient. Un héros sans image `idle` laisse au
lieu son jeton. Le héros debout n'est dessiné qu'avec `dots` : avec `faces`, le lieu actuel est le visage cerclé, et
`hidden` ne dessine rien, par choix.

```ts
map: { start: 'leon', pins: 'dots', regions: { leon: { name: 'Le Léon', image: 'decor/map_leon' } }, places: { … } },
```

Le validateur refuse toute autre valeur que `faces`, `hidden` et `dots`.

<a name="design"></a>

## Concevoir la carte

- **Une carte à partir de trois lieux.** À deux, une porte suffit ([sorties](create.exits.md)).
- **Les véhicules** donnent à chaque trajet une petite animation et une impression de distance.
- **Le marqueur de nouveauté** montre où quelque chose de nouveau attend.
- **Aucun lieu verrouillé visible.** Un lieu apparaît quand une règle le débloque, avec un `toast` (« Nouveau sur la
  carte : le jardin »). Le joueur ne devrait jamais voir une épingle qu'il ne peut pas utiliser.

Comment la carte sert l'histoire : [concevoir les énigmes](create.puzzle-design.md#map).

<a name="related"></a>

## Identifiants liés

- `MapDef`, `MapRegion`, `PlaceDef` dans [`src/engine/core/types/game.ts`](../../src/engine/core/types/game.ts) ; les
  règles du validateur dans [`src/engine/tools/validate/map.ts`](../../src/engine/tools/validate/map.ts).
- `unlock`, `map` ([commandes](create.commands.md#world)), `{ unlocked }` ([conditions](create.conditions.md)), les
  textes de la carte `ui.mapTitle`, `ui.mapBack`, `ui.world`, `ui.zoomIn`, `ui.arrival`. La vue carte du Studio :
  [carte du Studio](studio.map.md).
