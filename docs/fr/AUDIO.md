# Audio : musique et bruitages qui sonnent comme un seul jeu

*Version anglaise : [docs/en/AUDIO.md](../en/AUDIO.md).*

Un jeu déclare ses sons par id (`audio.music`, `audio.sfx`, `audio.voices` dans `game.ts`) et les joue avec `music`,
`sfx` et `say … voice`. D'où viennent les fichiers ? `tools/audio` est une chaîne qui transforme un MIDI (ou un fichier
audio) en arrangement **Sega Mega Drive** (FM YM2612 + PSG SN76489 + batterie DAC), et synthétise les bruitages
depuis la même banque de sons : chaque piste et chaque blip d'un jeu partagent une identité sonore, comme
`npm run prompts` donne un style à chaque image. Écrit pour n'importe quel assistant IA ou humain : les décisions sont
un fichier JSON, le reste est du code.

```bash
npm run audio -- setup                                              # une fois par machine : Furnace 0.6.8.3 + une SoundFont GM
npm run audio -- ingest morceau.mid games/<id>/audio/projects/<slug> # MIDI (ou .wav/.mp3 : voir « Sources audio »)
npm run audio -- all games/<id>/audio/projects/<slug>/spec.json     # .fur + .wav + .vgm + .mp3 + rapport QA
npm run audio -- sfx games/<id>/audio/sfx.json                      # les bruitages du jeu → audio/sfx/*.mp3
npm run assets                                                      # publie audio/ dans public/assets
```

Il faut Python 3 avec numpy, `ffmpeg` et `fluidsynth` (`brew install ffmpeg fluid-synth`). Furnace est téléchargé par
`setup` dans `tools/audio/.furnace` (hors dépôt). Les sources audio (non MIDI) demandent un venv Python 3.11 :
`uv venv --python 3.11 tools/audio/.venv && uv pip install --python tools/audio/.venv/bin/python -r tools/audio/requirements-audio.txt`.

## Les règles

1. **Les sources.** La source d'un morceau doit être à toi, dans le domaine public, ou sous une licence qui autorise
   une œuvre dérivée (un MIDI d'une pièce du XIXᵉ siècle, oui ; un thème de film, non). Dis d'où elle vient dans
   `spec.json` (`author`, `comment`), dans un `SOURCE.md` à côté de `source.mid`, et dans `CREDITS.md`. Une
   transcription a sa propre licence, et l'arrangement en hérite. Le thème du jeu d'exemple est le *Lac des cygnes* de
   Tchaïkovski (domaine public), ses notes écrites pour le projet par un script
   (`games/demo/audio/projects/swan-theme/compose.py` écrit `source.mid`) : aucune transcription dont hériter, donc CC
   BY 4.0, et un jeu peut être vendu avec (3.7 ; le thème d'avant venait d'un MIDI en CC BY-NC).
2. **Une seule palette.** `tools/audio/palette.json` contient les patches FM, les enveloppes PSG, le kit de batterie
   DAC et les cibles de mix. Chaque projet et chaque bruitage s'y construisent. Un son manquant est un nouveau patch
   dans la palette (avec un `desc`), jamais un patch ad hoc dans un spec ; un patch dont dépendent des morceaux livrés
   ne se modifie pas (on en ajoute un, ou on incrémente `version`).
3. **Réorchestrer, jamais convertir piste par piste.** Garder la mélodie, l'harmonie qui compte, la structure et le
   tempo ; réduire la polyphonie à dessein (fusionner les doublures, retirer les voix intérieures, transformer les
   accords tenus en arpèges).
4. **Une construction est finie quand le rapport QA dit `ISSUES: none`.** Il mesure les niveaux par rapport aux
   cibles de la palette, la justesse et la saturation. Il n'écoute pas : dis-le, et dis à l'humain quoi vérifier à
   l'oreille.
5. **Les fichiers rendus sont commités** (`audio/music/*.mp3`, `audio/sfx/*.mp3`, le `spec.json` du projet,
   `source.mid`, `analysis.md`, `qa.txt`) ; les intermédiaires lourds non (`out/*.wav`, `reference.wav`).

## Musique : le déroulé

1. **Importer.** `npm run audio -- ingest <source> games/<id>/audio/projects/<slug>` copie le MIDI en `source.mid`,
   écrit `analysis.md` / `analysis.json` (pistes, tessitures, polyphonie, doublures détectées, une carte d'activité
   mesure par mesure qui fait apparaître les sections, changements de tempo et de mesure) et un squelette de
   `spec.json`, et rend `reference.wav` avec une SoundFont GM pour comparer.
2. **Analyser.** Lire `analysis.md` en entier. Décider ce qui est essentiel (mélodie, basse, riffs qui définissent le
   morceau, rythme harmonique) et ce qui peut partir. Les changements de tempo ne sont pas gérés dans une seule
   construction : couper le morceau à un changement (`bars`), ou faire un projet par section.
   `npm run audio -- analyze source.mid --dump N` liste les notes de la piste N mesure par mesure.
3. **Arranger : écrire `spec.json`.** Plan de canaux par défaut, à adapter et justifier :

   | Canal | Rôle (`role` = cible QA) | Contenu typique |
   |---|---|---|
   | FM1 | lead | la mélodie (`lead_brass`, `synth_lead`, `bright_strings`) |
   | FM2 | double, pan L | la mélodie à l'octave sur un patch contrasté, désaccordé (`fx_init: [["E5", "86"]]`) |
   | FM3 | bass | la voix la plus grave (`slap_bass`, `finger_bass`) |
   | FM4 | harmony | cor / contre-chant / voix d'accord ; le patch peut changer par section |
   | FM5 | counter, pan R | une ligne secondaire, une note d'accord |
   | FM6 | drums (DAC) | grosse caisse / caisse claire / toms ; une partie FM s'il n'y a pas de batterie |
   | PSG1 | echo | la mélodie retardée `delay_rows: 4` à vol ~8 |
   | PSG2 | arp | `type: arp` (`00 7C` arpèges de quinte, `00 37` / `00 47` mineur / majeur) |
   | PSG3 | accent | mordant de cuivres +12, une note d'accord |
   | NOISE | noise | charleys, charley ouvert, crash |

   Famille GM → palette : cuivres → `lead_brass` ; cor / trombone / tuba → `horn_section` ; cordes / nappes →
   `bright_strings` ou `soft_pad` ; piano → `e_piano` ; mailloches / cloches → `bell` ; orgue → `organ` ; guitare
   saturée → `power_guitar` (lui donner l'octave basse : elle ajoute l'octave et la quinte) ; guitare claire →
   `muted_pluck` ; basse → `slap_bass` (chargée) ou `finger_bass` (tenue) ; lead synthé → `synth_lead` ; coups
   d'orchestre → `orch_hit`.

   Référence du spec (`games/demo/audio/projects/swan-theme/spec.json` est un exemple complet) :
   - haut niveau : `title`, `author`, `comment`, `slug`, `source`, `bars` (combien de mesures construire),
     `rows_per_beat` (8 = lignes de triple croche), `pattern_rows` (64), `hz` (60), `extra_bars` (résonance),
     `stop_at_end`, `sections` `{ nom: [première, dernière] }`, `bpm` (forçage) ;
   - `channels.<CH>` : `name`, `role`, `pan` (`L` / `R` / `C`, FM seulement), `fx_init` `[["E5", "86"]]`,
     `fx` `[["mesure:temps", "04", "00"]]`, `parts` ;
   - une partie : `track` (index, fragment de nom, ou liste à fusionner), `voice` (`high` / `low` / `latest` /
     `rankN`), `bars` (`[a, b]`, un nom de section, ou une liste des deux) ou `from` / `to` (`"mesure:temps"`),
     `exclude_bars`, `ins` (clé de la palette), `vol` (FM 0–127, PSG 0–15), `weak_vol` (accent hors temps),
     `accent_long`, `transpose`, `delay_rows`, `vibrato` (hex `"34"`, sur les notes ≥ 1,5 temps), `offs` ;
   - une partie arpège : `type: "arp"`, `root_track`, `voice`, `bars`, `every_rows`, `transpose`, `arp` (hex xy),
     `ins`, `vol`, `weak_vol` ;
   - `drums` : `track`, `dac`, `noise`, `accent: "beat"`, `map` (note GM → `kick` / `snare` / `ghost` / `tom:G3` /
     `hat` / `ohat` / `crash` / `noise_snare`), `hat_fill`, `extra_crash`, `noise_vols` ;
   - `extras` : notes isolées pour les fins et les coups `{ ch, at: "mesure:temps", note: "C5", beats, ins, vol }`.
4. **Construire, rendre, contrôler, recommencer.** `npm run audio -- all …/spec.json` écrit `out/<slug>.fur`
   (éditable dans Furnace), `.wav`, `.vgm` (émulateurs, lecteurs sur vraie console), `.mp3` (−14 LUFS),
   `<slug>_patterns.txt` et `qa.txt`. Corriger ce que liste `ISSUES` et reconstruire : un niveau hors cible → le `vol`
   de la partie (FM : 1 pas ≈ 0,75 dB en haut de l'échelle, davantage plus bas ; PSG : 1 pas = 2 dB) ; une justesse
   faible → un `transpose` faux, deux parties qui se chevauchent sur un canal, ou `voice` qui prend la mauvaise ligne ;
   `note collision` → deux notes sur une ligne.
5. **Livrer.** Copier `out/<slug>.mp3` dans `games/<id>/audio/music/<id>.mp3`, le déclarer dans `audio.music`, le
   jouer (`titleScreen.music`, le `music` d'un lieu, une commande `music`), `npm run assets`. Dire à l'humain quel
   canal joue quoi, quelles libertés l'arrangement a prises, et quoi vérifier à l'oreille (équilibre lead / basse,
   niveau de l'écho, répartition stéréo).

### Sources audio
Un `.wav` / `.mp3` / `.flac` est d'abord transcrit en MIDI par basic-pitch (`.venv` requis ; les pistes séparées par
demucs sont optionnelles et lourdes). Le résultat est un brouillon : garder la mélodie, la basse et les fondamentales
des accords, supprimer les notes fantômes, vérifier le tempo (`--bpm`), réécrire la batterie en motif. Préférer un
MIDI quand il existe.

### Matériel et Furnace (géré dans le code)
Furnace joue les canaux tonals du SN76489 deux octaves au-dessus de la note écrite ; le constructeur compense, les specs
utilisent donc les vraies hauteurs (garder les notes PSG ≥ A2). Le DAC n'a pas de volume : les nuances sont des
échantillons séparés (`snare` / `ghost`). Une note par canal, quatre effets par cellule, des lignes de triple croche à
60 Hz avec un groove pour le tempo.

## Des stems pour le directeur musical (3.5)

`npm run audio -- stems <projet>/spec.json` rend l'arrangement canal par canal (la sortie par canal de Furnace) et
additionne les canaux en stems : les `"stems": { "<nom>": ["FM1", "PSG1"], … }` de la spec, ou par rôle de canal s'il
n'y en a pas (melody : lead et echo ; harmony : double, harmony, counter, accent, arp ; bass ; drums : le DAC et le
bruit). Chaque stem vient du même rendu : tous ont la même longueur et le même départ, et leur somme est le mix. Un
seul gain, le même pour chaque stem, amène la somme à −14 LUFS (jamais une normalisation par stem : l'équilibre est
celui de l'arrangement). La commande écrit `games/<id>/audio/music/<slug>-stems/<stem>.mp3` et un `score.json` à
coller sous `audio.scores`, sous l'id du mix unique (le tempo est mesuré sur le rendu : mesures × temps sur sa durée ;
`pcmBytes` est le poids décodé des stems à 48 kHz, sur lequel décide un navigateur qui ne donne pas sa mémoire, 3.5.1).
Des stems faits à la main sont bienvenus, mais `npm run validate -- --release` les mesure avec ffprobe (3.6). Chaque stem
doit avoir la même fréquence, les mêmes canaux et le même nombre d'échantillons, la boucle doit finir dans les fichiers,
et `pcmBytes` doit être leur poids décodé.

Regrouper les canaux selon ce que le jeu allumera ou éteindra : le thème du jeu d'exemple a mélodie, cordes, harpe et
basse, et ne joue que la harpe et la basse quand Biscuit est actif. Un stem presque muet (le seul canal de bruit du
Lac des cygnes, −54 LUFS) est un téléchargement perdu : le fondre dans un autre. Le mix unique reste : c'est lui qui
joue avec Save-Data, sur un appareil modeste, ou sans Web Audio.

## Bruitages

`games/<id>/audio/sfx.json` contient une recette par id de `audio.sfx` ; `npm run audio -- sfx <fichier>` les rend
en `audio/sfx/<id>.mp3` (silence final coupé, crête normalisée, fondu de 10 ms). Une recette, ce sont quelques lignes
d'un ou plusieurs canaux à 60 lignes par seconde, avec les instruments de la palette :

```json
"door_open": { "desc": "a latch, then a wooden creak", "rows": 40, "tracks": [
  { "ch": "NOISE", "ins": "noise_hat", "events": [{ "row": 0, "note": "C6", "vol": 12 }] },
  { "ch": "FM1", "ins": "muted_pluck", "events": [{ "row": 3, "note": "D2", "vol": 118, "fx": [["01", "03"]] }, { "row": 28, "off": true }] }
] }
```

Événements : `note` (nom ou numéro MIDI), `ins` (par piste ou par événement), `vol`, `fx` (paires hex : `01` / `02`
glissando montant / descendant, `00xy` arpège, `04xy` vibrato, `0Axy` glissé de volume), `off`. `gain` fixe la crête
(0,9 par défaut). Le `sfx.json` du jeu d'exemple couvre le vocabulaire habituel d'un jeu d'aventure : clics et
sélections, réussite et erreur, portes et loquets, pièces, tissu, papier, sonnerie, chute, cloches, verre, métal,
frottements, un gong. Copie-le dans un nouveau jeu et garde les ids : les défauts du moteur (`select`, `success`,
`error`…) les attendent.

## Voix
Une réplique qui a un `id` stable (`npm run ids -- --lines`) joue son clip depuis `audio.voices[id]` ; un jeu
traduit joue `audio.voicesByLang[lang]` à la place, sous les mêmes ids. `npm run voices` tient la table
d'enregistrement (statut, comédien, note par clip, `games/<id>/voices.json`) ; `npm run voices -- check` mesure les
fichiers avec ffmpeg.

### Répliques avec des aiguillages de texte (4.3.0)
Une réplique dont les mots suivent un flag (`{form?m=lui|f=elle}`, CONTENT_GUIDE) s'enregistre une fois par valeur :
Grand-mère qui dit « lui » et « elle », ce sont deux clips. Le clip a pour clé l'id de la réplique et les valeurs des flags
que lisent ses aiguillages :

```ts
audio: { voices: {
  grandma_saw: 'grandma_saw.mp3',              // l'id seul : le repli
  'grandma_saw~form=m': 'grandma_saw_m.mp3',   // {form?m=…} quand form vaut "m"
  'grandma_saw~form=f': 'grandma_saw_f.mp3',
  'greet~form=f~mood=calm': 'greet_f_calm.mp3', // deux flags dans une réplique : triés par nom, joints par "~"
} }
```

- **La recherche** : quand la réplique est dite, `<id>~<flag>=<valeur>` pour les flags tels qu'ils sont (valeurs en
  texte : `true`, `2`, `f`), puis l'id seul. C'est le texte tel qu'écrit qui dit quels flags comptent, donc une
  traduction garde les clés (ses aiguillages lisent les mêmes flags : `npm run i18n -- status` le vérifie). Même
  règle dans `voicesByLang`.
- **Un flag pas encore posé** (la réplique est dite avant le choix) : pas de recherche par clé, l'id seul. Le texte
  montre alors l'alternative `*=` (sinon la première) : c'est ce que le clip de l'id seul doit dire.
- **Une valeur qu'aucun aiguillage ne liste** (couverte par `*=`) : le clip de cette valeur s'il existe, sinon l'id
  seul.
- **La table d'enregistrement** (`npm run voices -- export`, l'onglet Voices du Studio) liste une ligne par combinaison
  des valeurs listées par les aiguillages, avec le texte tel qu'il se lit pour ces valeurs, puis l'id seul quand un
  aiguillage a `*=` (ou quand un clip est déjà rangé sous lui). `{hero}` y reste tel qu'écrit.
- **Le validateur** avertit quand une réplique doublée (un clip sous son id ou sous une de ses clés) avec des
  aiguillages n'a pas le clip d'une valeur listée ; l'id seul joue en attendant, donc un jeu peut sortir avant que
  tout soit enregistré.
- **Une réplique sans aiguillage** garde un seul clip. `{hero}` seul n'est pas un aiguillage : une réplique qui dit le
  nom du héros dans un jeu à plusieurs héros a un seul clip ; écris `{form?m=Max|f=Fay}` quand il faut l'enregistrer
  par héros.
- **Un `voice` explicite** sur un `say` nomme un clip exactement, sans clé.
- **Les fichiers** : les clés ne sont que des clés de table. Le fichier que chacune nomme s'écrit à la main
  (`'grandma_saw_f.mp3'`), et `npm run assets` comme le lecteur construisent les chemins depuis le fichier, jamais
  depuis la clé : `~` et `=` n'arrivent jamais dans un nom de fichier ni dans une URL d'asset. Nomme les fichiers
  comme tu veux ; lettres, chiffres, `_` et `-` passent partout.

## Dans le Studio et les outils
L'onglet Assets liste les ids de musique et de son qu'un jeu déclare et si un fichier existe pour chacun ;
`npm run assets` publie ce qui est là et signale ce qui manque. L'outil MCP `read_doc` sert cette page sous le nom
`AUDIO`.
