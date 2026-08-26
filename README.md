# DoraBase

Un explorateur de bases de données desktop pour macOS : la densité de l'explorateur
d'IntelliJ, sans l'IDE. Quatre moteurs — **PostgreSQL**, **MySQL / MariaDB**, **SQLite**,
**MongoDB** — derrière un seul arbre, une grille dense, une console SQL et un écran de
structure.

Tauri 2 + React / TypeScript / Vite.

---

## Télécharger

**[Dernière version →](https://github.com/g3wis/DoraBase/releases/latest)**

Chaque version publiée porte un `.dmg` universel — Apple Silicon **et** Intel — et son
empreinte SHA-256 :

| Fichier | Contenu |
| --- | --- |
| `DoraBase-X.Y.Z-universal.dmg` | l'application, à glisser dans *Applications* |
| `DoraBase-X.Y.Z-universal.dmg.sha256` | l'empreinte, à comparer avant d'ouvrir |
| `DoraBase-X.Y.Z-universal.app.tar.gz` | la mise à jour, que l'application va chercher elle-même |
| `latest.json` | ce que l'application lit pour savoir qu'une version existe |

**macOS 13 Ventura** au minimum. Toutes les versions sont sur la
[page des releases](https://github.com/g3wis/DoraBase/releases).

### Installer

Ouvrir le `.dmg`, glisser **DoraBase** dans **Applications**, double-cliquer. C'est tout :
l'application est signée par un Developer ID Apple et **notariée**, donc macOS ne demande rien
et n'avertit de rien.

Vérifier, si le cœur vous en dit — c'est ce que la CI vérifie à chaque publication :

```bash
spctl --assess --type execute --verbose=4 /Applications/DoraBase.app
# /Applications/DoraBase.app: accepted
# source=Notarized Developer ID
```

L'empreinte du `.dmg` est publiée à côté de lui :

```bash
shasum -a 256 ~/Téléchargements/DoraBase-*.dmg
```

### Mettre à jour

Rien à télécharger. Quand une version plus récente existe, DoraBase l'annonce dans sa **barre
d'état**, en bas à droite, à côté du numéro qui tourne : cliquer dessus montre les changements
et le bouton *Installer et redémarrer*. L'application se remplace et se relance seule.

Il n'y a **ni recherche périodique ni installation automatique** : la recherche a lieu une fois
au démarrage, et l'installation attend un clic. Hors ligne, ou derrière un pare-feu qui ferme
`github.com`, rien ne s'affiche et rien ne se plaint.

Ce que l'application accepte d'installer est **signé deux fois** : par Apple, qui décide si
macOS l'ouvre, et par une clé propre au projet, qui décide si l'application accepte de se
remplacer par ce qu'on lui envoie. Une archive dont la seconde signature ne correspond pas est
refusée avant d'être ouverte.

Le remplacement demande de pouvoir écrire dans le bundle. Installée d'un glisser-déposer dans
*Applications*, elle en a le droit ; posée là par un administrateur pour un autre compte, elle
ne l'a pas, et le dit plutôt que d'échouer en silence — dans ce cas, retéléchargez le `.dmg`.

### Essayer un commit, sans attendre une version

Chaque commit poussé produit un `.dmg` en artefact de CI, gardé **sept jours** : ouvrir le
[job CI](https://github.com/g3wis/DoraBase/actions/workflows/ci.yml) du commit, section
*Artifacts*, `DoraBase-<sha>-dmg`. Il faut un accès au dépôt, et il n'est
**mono-architecture** — celle du runner GitHub. Pour installer, préférez une version
publiée.

---

## Numéroter et publier

Les versions sont en **`majeur.fonction.correctif`** (SemVer) :

| Cran | Quand |
| --- | --- |
| **correctif** | une correction, rien de neuf |
| **fonction** | une fonctionnalité, rien de cassé |
| **majeur** | une rupture assumée |

Le travail se fait sur une branche, arrive dans `main` par PR, et `main` reste verte —
`ci.yml` tourne sur chaque push et chaque PR. Publier se fait ensuite d'un clic.

### Publier : le bouton

> **Actions** ▸ [**Publication**](https://github.com/g3wis/DoraBase/actions/workflows/publication.yml)
> ▸ *Run workflow* ▸ branche `main`, cran `fonction` ▸ **Run workflow**

C'est tout. Ni Mac, ni `git`, ni tag à poser. Le run relève les trois fichiers de version,
pose le tag annoté, construit le bundle universel, le signe et le notarie chez Apple, vérifie,
**puis seulement** pousse et crée la release avec le `.dmg`, son empreinte, l'archive de mise à
jour et `latest.json`. Une trentaine de minutes.

L'ordre compte : le commit de relèvement et le tag restent locaux au runner jusqu'à ce que le
bundle soit vérifié. **Si quoi que ce soit échoue, il ne reste rien** — ni commit, ni tag, ni
release à moitié. Il n'y a rien à nettoyer, seulement à recliquer.

Avant de relever quoi que ce soit, le run refuse deux états :

- **une branche autre que `main`** — c'est le seul état que la CI a validé ;
- **une CI qui n'est pas verte sur ce commit exact.** Encore en cours compte comme un refus :
  laissez-la finir, puis recliquez.

Le champ *version* reste vide sauf pour un numéro que les trois crans ne savent pas dire.

### Publier : depuis un poste

La voie d'origine, sans Actions, pour qui l'a sous la main :

```bash
git switch main && git pull
./scripts/version.sh fonction        # relève les 3 fichiers, committe, pose le tag annoté
git push origin main --follow-tags   # c'est le tag qui déclenche la publication
```

`version.sh` **ne pousse rien** : la commande est affichée, le geste reste humain. Ce qu'il
refuse, et pourquoi : une branche autre que `main` (le tag désignerait un état que la CI n'a
pas validé), un arbre sale (le commit de relèvement emporterait du travail en cours), une
divergence avec `origin/main`, un numéro qui recule, un tag déjà publié. Les mêmes refus valent
sur le runner, qui appelle le même script.

Le tag `vX.Y.Z` déclenche alors `publication.yml`, qui fait le reste — mêmes étapes, mêmes
vérifications, mêmes assets. Les notes de version listent les commits depuis le tag précédent.

### Les huit secrets

`publication.yml` les contrôle **avant de compiler** : un secret vide vaut la chaîne vide, et
l'échec tomberait sinon après vingt minutes, sur un message qui ne le nomme pas.

| Secret | Ce que c'est |
| --- | --- |
| `APPLE_SIGNING_IDENTITY` | « Developer ID Application: … » — sa présence décide de tout le bloc |
| `APPLE_CERTIFICATE` | le certificat, en base64 |
| `APPLE_CERTIFICATE_PASSWORD` | son mot de passe |
| `APPLE_API_KEY` | le **Key ID** App Store Connect (dix caractères) |
| `APPLE_API_KEY_P8` | la clé `.p8` elle-même, en base64 — `notarytool` veut un fichier |
| `APPLE_ISSUER_ID` | l'**Issuer ID** du même écran (un UUID) — les échanger est l'erreur naturelle |
| `TAURI_SIGNING_PRIVATE_KEY` | la clé qui signe les mises à jour, en une ligne |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | son mot de passe |

Sans les six premiers, la construction reste possible : signature ad hoc, sans notarisation,
et **sans mise à jour proposée** — une archive qu'Apple n'a pas acceptée s'installerait
proprement puis serait refusée au redémarrage, chez des gens qui n'ont plus de voie de retour.

> **La clé de mise à jour est irremplaçable.** Sa moitié publique est dans le bundle que les
> utilisateurs ont déjà ; la perdre coupe la voie de mise à jour de toutes les installations
> existantes, définitivement — il leur faudra retélécharger un `.dmg` une fois. Elle se génère
> par `pnpm tauri signer generate --write-keys <chemin>`, et se garde ailleurs que dans GitHub.
> Elle n'a rien à voir avec la signature Apple : celle-ci décide si macOS *ouvre*
> l'application, celle-là si une application installée accepte de se *remplacer*.

Un numéro de version vit à **trois** endroits — `package.json` (que `tauri.conf.json` lit,
donc celui qui finit dans l'`Info.plist` et dans le nom du `.dmg`), `src-tauri/Cargo.toml`
et `src-tauri/Cargo.lock`. `version.sh` les écrit ensemble ;
`scripts/verifier-version.py` refuse qu'ils divergent, en local comme en CI, et le
workflow de publication exige en plus qu'ils s'accordent avec le nom du tag.

---

## Développer

```bash
pnpm install
export PATH="$HOME/.cargo/bin:$PATH"   # cargo n'est pas dans le PATH de tous les shells

pnpm dev             # serveur Vite ; ?gallery pour la galerie, ?demo pour le décor de démo
pnpm tauri dev       # l'application, dans sa fenêtre native
./scripts/verifier-tout.sh             # la barrière avant commit : ce que lance la CI
```

Les conventions, les décisions et leurs raisons, les prohibitions de design et les pièges
propres à cette machine sont dans **[AGENTS.md](AGENTS.md)** — le document de référence du
dépôt.
