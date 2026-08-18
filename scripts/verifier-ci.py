#!/usr/bin/env python3
"""Que le fichier de CI décrive bien ce qu'on croit qu'il décrit.

# Pourquoi ce garde existe

Une édition automatisée a un jour coupé le fichier aux mauvais indices : le job `engine` s'est
retrouvé **déclaré deux fois**, et le premier avait avalé les étapes du job `build`. Or une clé
dupliquée dans un mappage YAML ne fait pas échouer `yaml.safe_load` — le dernier gagne, en silence.

Conséquence : la construction macOS ne tournait plus en CI, et rien ne le disait. C'est exactement le
genre de panne que ce projet refuse — une vérification qui ne peut pas échouer est un mensonge poli.

Lancé par `scripts/verifier-tout.sh`.
"""

import sys
from pathlib import Path

CI = Path(__file__).resolve().parent.parent / ".github" / "workflows" / "ci.yml"


def noms_de_jobs_dupliques(chemin: Path) -> list[str]:
    """Les noms de jobs déclarés plus d'une fois.

    Écrit à la main plutôt que par un analyseur YAML : c'est précisément parce que l'analyseur
    **accepte** les doublons que ce garde existe — il en garde le dernier, sans rien dire.

    **Seulement les noms de jobs**, et non toutes les clés : `runs-on` et `steps` existent
    légitimement dans chacun. Une première version les comptait globalement et refusait un fichier
    correct — un garde qui crie sur du juste finit par être désactivé.
    """
    vues: dict[str, int] = {}
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        # Un nom de job : deux espaces d'indentation exactement, sous `jobs:`.
        if not ligne.startswith("  ") or ligne.startswith("   "):
            continue
        nu = ligne[2:]
        if not nu or nu.startswith("#") or nu.startswith("-") or not nu.endswith(":"):
            continue
        nom = nu[:-1]
        if " " in nom or '"' in nom:
            continue
        vues[nom] = vues.get(nom, 0) + 1
    return [nom for nom, compte in vues.items() if compte > 1]


def main() -> int:
    import yaml

    doublons = noms_de_jobs_dupliques(CI)
    if doublons:
        print(f"jobs déclarés deux fois dans ci.yml : {', '.join(doublons)}", file=sys.stderr)
        print("un doublon YAML ne fait pas échouer l'analyseur : le dernier gagne, en silence",
              file=sys.stderr)
        return 1

    workflow = yaml.safe_load(CI.read_text(encoding="utf-8"))
    jobs = workflow.get("jobs", {})

    # Les deux jobs attendus, et **le nombre d'étapes de chacun** : c'est ce chiffre qui aurait
    # attrapé la panne, le job `build` étant passé de vingt-et-une étapes à zéro.
    attendus = {"build": 15, "engine": 8}
    for nom, minimum in attendus.items():
        if nom not in jobs:
            print(f"le job « {nom} » a disparu de ci.yml", file=sys.stderr)
            return 1
        etapes = jobs[nom].get("steps") or []
        if len(etapes) < minimum:
            print(
                f"le job « {nom} » n'a que {len(etapes)} étapes, au moins {minimum} attendues",
                file=sys.stderr,
            )
            return 1

    # Le job macOS doit **construire** : c'est la raison de son existence, et c'est ce qui avait
    # disparu.
    commandes = " ".join(str(e.get("run", "")) for e in jobs["build"]["steps"])
    if "tauri build" not in commandes:
        print("le job « build » ne construit plus le .app", file=sys.stderr)
        return 1

    print(f"ci.yml cohérent — {len(jobs)} jobs, aucun doublon")
    return 0


if __name__ == "__main__":
    sys.exit(main())
