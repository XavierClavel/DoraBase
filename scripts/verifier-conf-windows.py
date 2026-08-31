#!/usr/bin/env python3
"""Que `tauri.windows.conf.json` ne perde rien de la fenêtre déclarée par `tauri.conf.json`.

# Le défaut que ce script empêche

Tauri fusionne `tauri.<plateforme>.conf.json` dans `tauri.conf.json` par **RFC 7386**
(`json_patch::merge`), où un **tableau est remplacé en entier**, jamais fusionné élément par
élément. Or la fenêtre est déclarée dans `app.windows`, qui est un tableau.

Mesuré le 31 août 2026 contre `json-patch` 3.0.1, la version du verrou : un recouvrement
réduit à `{"app":{"windows":[{"decorations":false}]}}` rend exactement

    {"app": {"windows": [{"decorations": false}]}}

— `title`, `width`, `height`, `minWidth`, `minHeight`, `resizable` : tous disparus. Le build
Windows aurait alors pris les défauts de Tauri (800 × 600, sans titre), **sans que rien
échoue** : la construction réussit, le bundle se fabrique, et l'écart ne se voit qu'en lançant
l'application. C'est le mode de défaillance de `TAURI_BUNDLER_DMG_IGNORE_CI`, sur un autre
réglage.

Le recouvrement doit donc **répéter toute la fenêtre**, et ce script est ce qui garde la
répétition honnête : sans lui, relever `width` dans `tauri.conf.json` laisserait Windows à
l'ancienne valeur, en silence et pour toujours.

# Ce qui est *censé* différer

`titleBarStyle` et `hiddenTitle` sont des clefs **macOS seulement** : elles n'ont pas de sens
sous Windows, où c'est `decorations: false` qui retire le cadre du système pour laisser
`TitleBar` dessiner ses trois boutons. Elles sont donc attendues absentes du recouvrement, et
leur présence est signalée — une clef macOS dans un fichier Windows est soit une confusion,
soit une attente qui ne sera pas honorée.
"""

import json
import pathlib
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
BASE = RACINE / "src-tauri" / "tauri.conf.json"
WINDOWS = RACINE / "src-tauri" / "tauri.windows.conf.json"

# Les clefs qui appartiennent à macOS et n'ont rien à faire dans le recouvrement.
MACOS_SEULEMENT = {"titleBarStyle", "hiddenTitle"}

# Ce que le recouvrement doit ajouter de son propre chef.
EXIGE_PAR_WINDOWS = {"decorations": False}


def fenetre(chemin: pathlib.Path) -> dict:
    conf = json.loads(chemin.read_text())
    fenetres = conf.get("app", {}).get("windows", [])
    if len(fenetres) != 1:
        print(
            f"ÉCHEC : {chemin.name} déclare {len(fenetres)} fenêtre(s), une seule est attendue.\n"
            "  Ce script compare la fenêtre unique du produit ; à plusieurs, il faudrait dire\n"
            "  laquelle correspond à laquelle.",
            file=sys.stderr,
        )
        sys.exit(1)
    return fenetres[0]


def main() -> int:
    if not WINDOWS.exists():
        print(f"ÉCHEC : {WINDOWS} manque — le build Windows perdrait toute la fenêtre.", file=sys.stderr)
        return 1

    base = fenetre(BASE)
    windows = fenetre(WINDOWS)
    problemes: list[str] = []

    # 1. Tout ce que macOS déclare et qui n'est pas macOS-seulement doit être repris à l'identique.
    for clef, valeur in base.items():
        if clef in MACOS_SEULEMENT:
            continue
        if clef not in windows:
            problemes.append(
                f"« {clef} » ({valeur!r}) manque dans tauri.windows.conf.json.\n"
                f"    RFC 7386 remplace le tableau `app.windows` en entier : une clef absente\n"
                f"    n'est pas héritée, elle retombe sur le défaut de Tauri."
            )
        elif windows[clef] != valeur:
            problemes.append(
                f"« {clef} » diverge : {valeur!r} sur macOS, {windows[clef]!r} sous Windows.\n"
                f"    Si c'est voulu, ajoutez la clef à une liste d'écarts assumés de ce script,\n"
                f"    avec sa raison. Sinon, les deux fichiers ont dérivé."
            )

    # 2. Les clefs macOS n'ont rien à faire là.
    for clef in sorted(MACOS_SEULEMENT & windows.keys()):
        problemes.append(
            f"« {clef} » est une clef macOS et n'a pas d'effet sous Windows ; retirez-la du recouvrement."
        )

    # 3. Ce que le recouvrement doit apporter.
    for clef, attendu in EXIGE_PAR_WINDOWS.items():
        if windows.get(clef) != attendu:
            problemes.append(
                f"« {clef} » doit valoir {attendu!r} sous Windows (actuellement {windows.get(clef)!r}).\n"
                f"    Sans lui, Windows dessine sa propre barre de titre **au-dessus** de la nôtre :\n"
                f"    deux barres, 72 px de chrome pour 40 px d'information."
            )

    # 4. Le bundle Windows ne peut pas viser `dmg`.
    cibles = json.loads(WINDOWS.read_text()).get("bundle", {}).get("targets", [])
    if "dmg" in cibles or "app" in cibles:
        problemes.append(
            f"bundle.targets vaut {cibles!r} : « app » et « dmg » sont des cibles macOS."
        )

    if problemes:
        print("ÉCHEC : tauri.conf.json et tauri.windows.conf.json ont dérivé.\n", file=sys.stderr)
        for probleme in problemes:
            print(f"  - {probleme}", file=sys.stderr)
        return 1

    reprises = len([c for c in base if c not in MACOS_SEULEMENT])
    print(
        f"conf Windows cohérente : {reprises} clef(s) de fenêtre reprises, "
        f"{len(MACOS_SEULEMENT)} clef(s) macOS écartées, cibles {cibles}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
