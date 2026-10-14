# Publier une version

Comment une version se fait, pour le mainteneur (4.1.20 « Last Mile » ; plan §11). Les commandes sont
`npm run ship -- …` (tools/release/ship.mjs) ; chacune écrit son PID dans `.cache/pids/`.

## La chaîne

1. **Un candidat sur main.** `gh workflow run candidate --ref main -f sha=<sha complet>` joue toutes les familles
   lourdes sur ce SHA, le profil de qualification complet sur ses propres archives et son image, les trois charges et la
   répétition de signature. Sa gate écrit et atteste `candidate-manifest.json`, avec chaque fichier que la release
   publiera (tools/release/artifacts.mjs). Lire la gate **et** sa conclusion.
2. **Un tag qui le nomme.** `npm run ship -- tag <version> <sha> --candidate=<run> --now`. L'annotation nomme le run.
3. **La release, depuis ce run.** release.yml télécharge les fichiers du run et vérifie chaque SHA-256 contre le
   manifeste. Il crée la release en **brouillon**, téléverse chaque fichier, la publie, puis la relit (`ship verify`).
   Il ne reconstruit rien de ce que le candidat a fait : archives, image, SBOM, le site, les surfaces. Depuis la
   4.1.20, il lui faut aussi la répétition de signature du run : un candidat antérieur à la PR 3b de cette version ne
   peut pas être publié, il faut en lancer un nouveau. Un seul run de release par tag à la fois : le second attend,
   puis trouve la release du premier.
4. **Relecture.** `npm run ship -- verify <version>` télécharge la release, vérifie les sommes, chaque attestation de
   provenance et la liste des fichiers contre le manifeste. Depuis 4.1.20, il lance aussi `gh release verify` et
   `gh release verify-asset` pour chaque fichier.

Une release publiée ne change jamais. Un run sur une release déjà publiée s'arrête avant de rien faire. Une RC ratée ne
se corrige pas : elle devient une `rc.N+1`.

## Ce que le mainteneur active (une fois, après la PR 3b de 4.1.20)

- **Les releases immuables** : Settings → General → Releases. Une release publiée garde alors ses fichiers et son tag.
- **Un ruleset sur les tags de release** : cible `tag`, `refs/tags/v*`, actif. Il réserve la création, refuse la
  suppression et interdit le force-push.
- `npm run ship -- preflight-stable --candidate=<run>` doit alors voir les deux. **Avant le premier tag de 4.1.20** :
  `ship tag` refuse de taguer tant que les releases immuables sont désactivées (le token de release.yml ne peut pas
  lire ce réglage).

## Signer les tags de 4.2

Les tags 4.1.x restent annotés (D30). Ceux de 4.2 sont signés avec la clé SSH du mainteneur :

```sh
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519_sk.pub
npm run ship -- tag 4.2.0-rc.1 <sha> --candidate=<run> --sign --now
```

- La clé doit aussi être enregistrée sur GitHub comme clé de **signature** (Settings → SSH and GPG keys).
- Elle doit figurer dans `.github/allowed_signers`, que le mainteneur ajoute dans un commit signé par cette clé. C'est
  aussi la racine de confiance des passes reportées (ADR 0024).
- Chaque candidat répète ce chemin avec une clé éphémère (`signing-rehearsal`) : il signe un tag du commit, jamais
  poussé, le vérifie avec `git verify-tag`, puis détruit la clé.

## Le préflight de 4.2

`npm run ship -- preflight-stable --candidate=<run> [--version=4.2.0]` ne signe rien, ne publie rien et ne change aucun
réglage. Il dit, vérification par vérification, `ok`, `missing` (une étape encore à faire) ou `blocked` (quelque chose
ne va pas) :

- la clé de signature, locale et enregistrée ;
- `allowed_signers` ;
- l'immuabilité et le ruleset de tags ;
- la provenance du candidat ;
- pour chaque package npm : l'archive (`npm publish --dry-run`), le nom, le bootstrap, le trusted publisher (en
  stage-only), une publication OIDC prouvée, et la version pas encore publiée ;
- le Node et le npm exacts de l'étape de publication ;
- le GO / NO-GO face aux rapports des personnes.

Il ne sort en 1 que sur un `blocked`.

## npm (écrit en 4.1.20, joué en 4.2)

Rien n'est publié sur npm en 4.1.x. Les quatre noms (`web-scumm`, `create-web-scumm`, `web-scumm-bridge`,
`web-scumm-connectors`) sont libres. Chaque nuit, un job non bloquant vérifie qu'ils le restent, ou qu'ils sont à nous
(D34 : le squatting est un risque accepté jusqu'à la 4.2).

1. **Versions.** La publication en étapes demande au moins npm 11.15.0 et Node 22.14.0 ([doc npm][staged]).
   release.yml épingle l'étape de publication à des versions **exactes**, `NPM_PUBLISH_NODE: 22.23.3` et
   `NPM_PUBLISH_NPM: 11.21.0`. Un test refuse une plage. Node 22.23.3 livre npm 10.9.9 : l'étape de publication, écrite en 4.2, installera elle-même npm 11.21.0 (`npm install -g npm@11.21.0`) ; en 4.1.20, seuls les épinglages existent, dans l'env de release.yml.
2. **Le compte.** Le compte npm du mainteneur a la 2FA activée.
3. **Bootstrap, une fois par package.** Les packages n'existent pas encore. On met en scène une **version de
   réservation**, jamais une version du produit :

   ```sh
   npm stage publish <archive de 0.0.0-bootstrap.0>
   ```

   - On le lance depuis une session locale du mainteneur, ou avec un token stage-only.
   - Mettre en scène un package qui n'existe pas publie un placeholder `0.0.0-stage` jusqu'à son approbation
     ([doc npm][staged]). Vérifier avec `npm view <nom>` si cela suffit à configurer le package. Sinon, approuver le
     bootstrap (`npm stage approve <id>`, avec la 2FA).
   - Une publication locale ne porte pas de provenance OIDC. C'est pourquoi elle ne porte jamais une version du
     produit.
4. **Trusted publishing, en stage-only.** Sur chaque package, lancer :

   ```sh
   npm trust github <nom> --repo wanoo/web-scumm --file release.yml --allow-stage-publish
   ```

   - La CI peut alors mettre en scène, jamais publier.
   - La configuration doit réussir sa première publication en moins de **deux jours**, sinon elle expire : la
     configurer juste avant le run de release de 4.2.0.
5. **Promotion.** Le run de release met chaque package en scène par OIDC. Le mainteneur promeut chacun avec sa 2FA
   (`npm stage approve <id>`, ou sur npmjs.com). La 4.2.0, publiée depuis le run du candidat de statut, est la première
   version du produit.
6. **Classement dual-use de `web-scumm-connectors`** (décidé en 4.1.20, PR 3b) :
   - la [politique dual-use][dual] de npm vise les « capacités sensibles pour la sécurité, qui peuvent ressembler à un
     logiciel malveillant » : outils de test d'intrusion, utilitaires de recherche en sécurité, obfuscation ;
   - les connecteurs sont des serveurs qu'un jeu fait tourner (une façade SSH et Telnet pour son terminal, un webhook
     et un lecteur IMAP pour l'email, un vérificateur Open Badge). Ils ne scannent rien, n'attaquent rien et ne
     cachent rien. **Ils ne sont pas déclarés dual-use** ;
   - ils passent de toute façon par la publication en étapes et une promotion 2FA, comme les quatre packages. C'est la
     méthode de publication que la politique demande au contenu dual-use ;
   - si l'analyse de npm à la publication retient ou signale le package, on ajoute
     `"contentPolicy": { "class": "dual-use" }` et un fichier `DISCLOSURE`. La déclaration persiste ensuite d'une
     version à l'autre.

[staged]: https://docs.npmjs.com/staged-publishing
[dual]: https://docs.npmjs.com/policies/dual-use/
