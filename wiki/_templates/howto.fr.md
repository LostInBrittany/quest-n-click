<!--
Modèle : procédure, docs/dev/PLAN-4.5-WIKI.md annexe B. Copiez-le dans wiki/fr/<id>.md, son jumeau anglais dans
wiki/en/<id>.md, et gardez les dix titres et leurs identifiants de section. L'en-tête (type, public, contexte,
versions, changement de langue) et le pied de page sont générés depuis le manifeste : ne les écrivez pas. Liez une
autre page par sa source, `create.rooms.md#walkable-zones` ; liez le code par son chemin depuis la racine du dépôt,
`src/engine/core/save.ts`. Chaque bloc de commandes dit d'abord le dossier et le contexte où il se lance. Supprimez ces
commentaires.
-->

# Restaurer le Studio sur une installation neuve

<a name="what-you-get"></a>

## Ce que vous obtenez

Une ou deux phrases : l'état dans lequel vous êtes à la fin.

<a name="context-and-versions"></a>

## Contexte et versions

Où cela s'applique (dépôt du moteur, projet créé, Studio local ou hébergé, Bridge) et depuis quelle version : le
`versions.appliesFrom` du manifeste.

<a name="prerequisites"></a>

## Prérequis

- Ce qui doit être installé ou fait avant, chacun avec sa page.

<a name="where-to-run"></a>

## Où lancer les commandes

Le dossier et la machine : « dans le dépôt du moteur, sur votre machine », « dans le projet créé », « sur
l'application Clever Cloud, par `clever ssh` ».

<a name="steps"></a>

## Étapes

<!-- step: first-step -->
1. La première étape essentielle, avec sa commande exacte.

   ```sh
   # dans le projet créé
   npm run validate
   ```

<!-- step: second-step -->
2. La suivante. Chaque étape essentielle garde son identifiant `step`, le même dans les deux langues.

> [!LIMIT id=example-limit]
> Ce que cette procédure ne couvre pas, dit simplement.

> [!GUARANTEE id=example-guarantee]
> Ce que le produit garantit ici, et le test qui le montre (nommé dans le manifeste).

> [!MEASURE id=example-measure]
> Un chiffre, avec sa date, sa version, son volume, ses conditions et sa source à son commit.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Ce que vous voyez quand cela a marché, et la commande ou l'écran qui le montre.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le message exact | Pourquoi | Que faire |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Ce que la procédure écrit, pour savoir quoi sauvegarder ou relire.

<a name="recovery"></a>

## Reprise ou retour arrière

Comment l'annuler, quand c'est possible ; et le dire quand ça ne l'est pas.

<a name="references"></a>

## Références

- Les pages de référence, ADR et fichiers sources sur lesquels cette procédure s'appuie.
