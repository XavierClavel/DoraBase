#!/usr/bin/env python3
"""Vérifie que `cargo run` sans `--bin` reste non ambigu.

C'est ce que `tauri dev` appelle. L'ajout du binaire `export-types` (plan 06a) l'a rendu
ambigu, donc cassé le démarrage de l'app — sans que rien ne le voie : `cargo build`,
`cargo test`, `clippy` et `pnpm tauri build` étaient tous verts, `tauri build` ne passant
pas par `cargo run`.

La propriété est vérifiée par `cargo metadata` plutôt qu'en lançant `cargo run` : l'app ne
traite aucun argument, donc elle ouvrirait une fenêtre et bloquerait le runner de CI.

Ce script vit dans un **fichier** et non dans le YAML du workflow : la première version y
était embarquée, et son échappement de guillemets produisait un `SyntaxError` que je ne
pouvais pas reproduire en local. Un script de vérification qu'on ne peut pas lancer soi-même
n'est pas un garde-fou.

Usage : cargo metadata --format-version 1 --no-deps | python3 scripts/verifier-default-run.py
"""

import json
import sys

PAQUET = "dorabase"


def main() -> int:
    metadonnees = json.load(sys.stdin)
    paquets = [p for p in metadonnees["packages"] if p["name"] == PAQUET]
    if not paquets:
        print(f"paquet {PAQUET} introuvable dans les métadonnées", file=sys.stderr)
        return 1

    paquet = paquets[0]
    binaires = sorted(t["name"] for t in paquet["targets"] if "bin" in t["kind"])
    defaut = paquet.get("default_run")

    if len(binaires) > 1 and not defaut:
        print(
            f"cargo run serait ambigu entre {binaires} : ajouter `default-run` à [package]",
            file=sys.stderr,
        )
        return 1

    print(f"non ambigu — {len(binaires)} binaire(s) {binaires}, default-run={defaut!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
