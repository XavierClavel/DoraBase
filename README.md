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

**macOS 13 Ventura** au minimum. Toutes les versions sont sur la
[page des releases](https://github.com/g3wis/DoraBase/releases).

### Installer

**En une commande, sans aucun avertissement.** La quarantaine n'est pas posée par macOS mais
par le programme qui télécharge — Safari, Chrome, le Finder. `curl` ne la pose pas :

```bash
curl -fL -o /tmp/DoraBase.dmg \
  https://github.com/g3wis/DoraBase/releases/latest/download/DoraBase-0.1.2-universal.dmg
hdiutil attach -quiet /tmp/DoraBase.dmg
cp -R /Volumes/DoraBase/DoraBase.app /Applications/
hdiutil detach -quiet /Volumes/DoraBase && open /Applications/DoraBase.app
```

(Le nom du fichier porte le numéro de version : prenez-le sur la page de la release.)

**Ou par le navigateur** : ouvrir le `.dmg`, glisser **DoraBase** dans **Applications**. macOS
refuse alors l'application au premier lancement — « Apple n'a pas pu confirmer que DoraBase ne
contenait pas de logiciel malveillant » — et une commande lève ce refus définitivement :

```bash
xattr -dr com.apple.quarantine /Applications/DoraBase.app
```

Le vieux réflexe **clic droit ▸ Ouvrir** ne suffit plus depuis macOS 15 : Apple a retiré ce
contournement, ce qui force le détour par *Réglages Système ▸ Confidentialité et sécurité ▸
Ouvrir quand même*.

**Pourquoi ce refus.** L'application est signée en *ad hoc* — assez pour se lancer, pas pour que
macOS sache qui l'a produite. Une signature reconnue demande un **Developer ID** Apple et une
notarisation : un abonnement annuel, pas une ligne de code, et il n'a pas été pris. Le README le
dit plutôt que de laisser croire à une application cassée.

Vérifier l'empreinte avant d'ouvrir, si vous le souhaitez :

```bash
shasum -a 256 /tmp/DoraBase.dmg
curl -fsSL https://github.com/g3wis/DoraBase/releases/latest/download/DoraBase-0.1.2-universal.dmg.sha256
```

### Essayer un commit, sans attendre une version

Chaque commit poussé produit un `.dmg` en artefact de CI, gardé **sept jours** : ouvrir le
[job CI](https://github.com/g3wis/DoraBase/actions/workflows/ci.yml) du commit, section
*Artifacts*, `DoraBase-<sha>-dmg`. Il faut un accès au dépôt, et il n'est
**mono-architecture** — celle du runner GitHub. Pour installer, préférez une version
publiée.

---

## Numéroter et publier

Les versions sont en **`majeur.fonction.correctif`** (SemVer) :

| Cran | Quand | Commande |
| --- | --- | --- |
| **correctif** | une correction, rien de neuf | `./scripts/version.sh correctif` |
| **fonction** | une fonctionnalité, rien de cassé | `./scripts/version.sh fonction` |
| **majeur** | une rupture assumée | `./scripts/version.sh majeur` |

Le flux, du travail à la release :

```
branche de travail  ──PR──▶  main (CI verte)  ──version.sh──▶  tag vX.Y.Z  ──▶  release GitHub
```

1. **Le travail se fait sur une branche**, arrive dans `main` par PR, et `main` reste verte —
   `ci.yml` tourne sur chaque push et chaque PR.
2. **Publier**, depuis `main` à jour et propre :

   ```bash
   git switch main && git pull
   ./scripts/version.sh fonction        # relève les 3 fichiers, committe, pose le tag annoté
   git push origin main --follow-tags   # c'est le tag qui déclenche la publication
   ```

3. **Le tag `vX.Y.Z` déclenche `publication.yml`** : construction du bundle universel,
   signature ad hoc, vérifications, puis release GitHub avec le `.dmg` et ses notes de
   version — celles-ci listent les commits depuis le tag précédent.

Ce que le script refuse, et pourquoi : une branche autre que `main` (le tag désignerait un
état que la CI n'a pas validé), un arbre sale (le commit de relèvement emporterait du
travail en cours), une divergence avec `origin/main`, un numéro qui recule, un tag déjà
publié. Il **ne pousse rien** : la commande est affichée, le geste reste humain.

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
