#!/usr/bin/env python3
"""Que les trois endroits qui portent le numéro de version disent la même chose.

# Pourquoi ce garde existe

Le numéro de version vit à trois endroits qui ne se parlent pas :

  - `package.json` — c'est **lui** que `tauri.conf.json` lit (`"version": "../package.json"`),
    donc lui qui finit dans `Info.plist` et dans le nom du `.dmg` ;
  - `src-tauri/Cargo.toml` — la version de la crate, celle que `cargo` affiche ;
  - `src-tauri/Cargo.lock` — recopiée par cargo, et **jamais** régénérée par la CI (qui
    compile avec `--frozen-lockfile` côté pnpm et un lock committé côté cargo).

Rien dans l'outillage ne les relie. Un relèvement fait à la main dans deux fichiers sur trois
laisse une CI verte et publie un `.dmg` dont le nom, l'`Info.plist` et la crate annoncent des
numéros différents — c'est-à-dire une version dont on ne peut plus dire ce qu'elle contient.

Ce garde refuse cet état. Il est appelé par `scripts/verifier-tout.sh`, par la CI, et par
`scripts/version.sh` juste après avoir écrit les trois fichiers — un producteur qui vérifie sa
propre sortie plutôt que d'être cru sur parole.

Le format est **fermé** : `majeur.fonction.correctif`, trois entiers, rien d'autre. Pas de
suffixe de pré-version : un `-rc.1` traverserait `Info.plist`, le nom du bundle et le nom du
tag sans que personne n'ait décidé ce qu'il y devient.
"""

import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FORME = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def version_package_json() -> str:
    return json.loads((RACINE / "package.json").read_text(encoding="utf-8"))["version"]


def version_cargo_toml() -> str:
    texte = (RACINE / "src-tauri" / "Cargo.toml").read_text(encoding="utf-8")
    trouve = re.search(r'^version = "([^"]+)"', texte, re.MULTILINE)
    if not trouve:
        raise SystemExit("src-tauri/Cargo.toml : aucune ligne `version = \"…\"` en tête")
    return trouve.group(1)


def version_cargo_lock() -> str:
    """La version de la crate `dorabase` dans le verrou, et non la première rencontrée.

    Le verrou contient plus de six cents paquets ; chercher `version =` sans ancrer sur le nom
    donnerait celle d'une dépendance, et le garde comparerait deux inconnues.
    """
    texte = (RACINE / "src-tauri" / "Cargo.lock").read_text(encoding="utf-8")
    trouve = re.search(r'^name = "dorabase"\nversion = "([^"]+)"', texte, re.MULTILINE)
    if not trouve:
        raise SystemExit("src-tauri/Cargo.lock : le paquet `dorabase` est introuvable")
    return trouve.group(1)


def main() -> int:
    lues = {
        "package.json": version_package_json(),
        "src-tauri/Cargo.toml": version_cargo_toml(),
        "src-tauri/Cargo.lock": version_cargo_lock(),
    }

    distinctes = set(lues.values())
    if len(distinctes) != 1:
        print("les versions divergent :", file=sys.stderr)
        for fichier, version in lues.items():
            print(f"  {version:<12} {fichier}", file=sys.stderr)
        print("  relevez-les d'un seul geste : ./scripts/version.sh <majeur.fonction.correctif>",
              file=sys.stderr)
        return 1

    version = distinctes.pop()
    if not FORME.match(version):
        print(f"version « {version} » : la forme attendue est majeur.fonction.correctif",
              file=sys.stderr)
        print("  trois entiers sans zéro en tête, sans suffixe de pré-version", file=sys.stderr)
        return 1

    # Une version demandée en argument doit être celle des fichiers. C'est ce que la CI de
    # publication vérifie contre le nom du tag : un tag `v0.3.0` posé sur un arbre resté en
    # `0.2.0` publierait un `.dmg` dont le nom contredit le tag qui l'a produit.
    if len(sys.argv) > 1:
        attendue = sys.argv[1].removeprefix("v")
        if attendue != version:
            print(f"version attendue {attendue}, mais les fichiers portent {version}",
                  file=sys.stderr)
            return 1
        print(f"version {version} — cohérente dans les trois fichiers, et conforme au tag")
        return 0

    print(f"version {version} — cohérente dans les trois fichiers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
