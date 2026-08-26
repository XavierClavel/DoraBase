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

WORKFLOWS = Path(__file__).resolve().parent.parent / ".github" / "workflows"
CI = WORKFLOWS / "ci.yml"
PUBLICATION = WORKFLOWS / "publication.yml"


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


def charger(chemin: Path) -> dict:
    """Le workflow, après avoir refusé les doublons de jobs."""
    import yaml

    doublons = noms_de_jobs_dupliques(chemin)
    if doublons:
        print(f"jobs déclarés deux fois dans {chemin.name} : {', '.join(doublons)}",
              file=sys.stderr)
        print("un doublon YAML ne fait pas échouer l'analyseur : le dernier gagne, en silence",
              file=sys.stderr)
        raise SystemExit(1)
    return yaml.safe_load(chemin.read_text(encoding="utf-8"))


def declencheurs(workflow: dict) -> dict:
    """La section `on:` — sous la clef `True` quand PyYAML a cru lire un booléen.

    YAML 1.1 fait de `on` un synonyme de vrai. `workflow["on"]` rend donc `KeyError` sur un
    fichier parfaitement valide, et un garde écrit sans le savoir passe en croyant vérifier.
    """
    return workflow.get("on") or workflow.get(True) or {}


def etapes_de(jobs: dict, nom: str, minimum: int, fichier: str) -> list:
    """Les étapes d'un job, en refusant qu'il ait disparu ou maigri.

    **Le compte d'étapes est le cœur du garde** : c'est lui qui aurait attrapé la panne du
    19 juillet 2026, le job `build` étant passé de vingt-et-une étapes à zéro sans que rien ne
    le dise. Un minimum, et non une égalité — sinon toute étape ajoutée fait échouer la CI qui
    l'ajoute, et le chiffre finit par être relevé sans être lu. Le relever *en même temps*
    qu'on ajoute une étape reste le geste attendu.
    """
    if nom not in jobs:
        print(f"le job « {nom} » a disparu de {fichier}", file=sys.stderr)
        raise SystemExit(1)
    etapes = jobs[nom].get("steps") or []
    if len(etapes) < minimum:
        print(f"le job « {nom} » de {fichier} n'a que {len(etapes)} étapes, "
              f"au moins {minimum} attendues", file=sys.stderr)
        raise SystemExit(1)
    return etapes


def commandes_de(etapes: list) -> str:
    """Les commandes des étapes, **commentaires retirés**.

    Un `run:` est un script shell, donc il porte des commentaires — et ce dépôt en écrit
    beaucoup. Chercher un fragment dans le texte brut fait donc passer un garde que la phrase
    *expliquant* la commande suffit à satisfaire : le 25 août 2026, remplacer
    `xcrun stapler validate` par un `echo` a laissé le garde vert, parce que le commentaire au-
    dessus nommait `stapler validate`. Vérifié par sabotage, comme il se doit.
    """
    lignes = []
    for etape in etapes:
        for ligne in str(etape.get("run", "")).splitlines():
            if not ligne.lstrip().startswith("#"):
                lignes.append(ligne)
    return " ".join(lignes)


def verifier_ci() -> None:
    workflow = charger(CI)
    jobs = workflow.get("jobs", {})

    build = etapes_de(jobs, "build", 25, "ci.yml")
    etapes_de(jobs, "engine", 11, "ci.yml")
    e2e = etapes_de(jobs, "e2e", 6, "ci.yml")

    # **Une exécution par commit.** `on: [push, pull_request]` faisait tourner toute la CI deux
    # fois sur chaque branche ayant une PR : deux verdicts identiques, à la seconde près. Le
    # remède est un push restreint à `main`, et il se défait d'une ligne — d'où ce garde. Un
    # `push:` sans filtre de branches, ou filtrant autre chose que `main`, rétablirait le
    # doublon sans que personne ne le voie autrement qu'en comptant les exécutions.
    sur = declencheurs(workflow)
    # `on: [push, pull_request]` — la forme abrégée — rend une **liste**, où rien ne peut être
    # filtré. C'est exactement la forme fautive, et la nommer valait mieux qu'une trace de pile
    # sur `.get` : constaté par sabotage.
    if not isinstance(sur, dict):
        print(f"ci.yml : `on:` est une liste ({sur!r}), donc sans filtre de branches",
              file=sys.stderr)
        print("  le push doit être restreint à `main`, sinon chaque commit à PR passe deux fois",
              file=sys.stderr)
        raise SystemExit(1)
    branches = (sur.get("push") or {}).get("branches")
    if branches != ["main"]:
        print(f"ci.yml : le push est filtré sur {branches!r}, attendu ['main']", file=sys.stderr)
        print("  sans ce filtre, chaque commit d'une branche à PR fait tourner la CI deux fois",
              file=sys.stderr)
        raise SystemExit(1)
    if "pull_request" not in sur:
        print("ci.yml : sans `pull_request`, plus rien ne vérifie une branche de travail",
              file=sys.stderr)
        raise SystemExit(1)

    # **Playwright doit rester découpé, et rester sur macOS.** Les captures de fidélité portent
    # le suffixe de plateforme (`-darwin.png`) : sur un runner Linux, Playwright ne les
    # trouverait pas, les **écrirait**, et rendrait une suite verte qui ne compare rien. Quant au
    # `--shard`, c'est lui qui tient le job sous les deux minutes ; retiré, il ne casse rien et
    # ne se remarque qu'au chronomètre.
    commandes_e2e = commandes_de(e2e)
    if "test:e2e" not in commandes_e2e:
        print("ci.yml : le job « e2e » ne lance plus Playwright", file=sys.stderr)
        raise SystemExit(1)
    if "--shard=" not in commandes_e2e:
        print("ci.yml : le job « e2e » ne découpe plus la suite — six minutes au lieu de deux",
              file=sys.stderr)
        raise SystemExit(1)
    if "macos" not in str(jobs["e2e"].get("runs-on", "")):
        print("ci.yml : le job « e2e » a quitté macOS — les captures `-darwin` seraient "
              "réécrites au lieu d'être comparées", file=sys.stderr)
        raise SystemExit(1)

    # Le job macOS doit **construire** : c'est la raison de son existence, et c'est ce qui avait
    # disparu.
    commandes = commandes_de(build)
    if "tauri build" not in commandes:
        print("le job « build » ne construit plus le .app", file=sys.stderr)
        raise SystemExit(1)

    # Et il doit **rendre** ce qu'il construit. Un bundle jeté à la fin du job ne prouve que sa
    # compilation ; c'est l'artefact qui permet d'essayer un commit sans le recompiler.
    utilise = " ".join(str(e.get("uses", "")) for e in build)
    if "actions/upload-artifact" not in utilise:
        print("le job « build » ne publie plus le .dmg en artefact", file=sys.stderr)
        raise SystemExit(1)

    # **Sans `TAURI_BUNDLER_DMG_IGNORE_CI`, le `.dmg` sort dépouillé.** Le bundler DMG ajoute
    # `--skip-jenkins` dès qu'il voit `CI`, et ce drapeau saute l'AppleScript qui pose le fond,
    # la taille de fenêtre et les deux positions d'icônes — sans erreur et sans trace. La
    # variable ne se lit dans aucun `run:`, elle vit dans un `env:` : d'où cette lecture
    # séparée, qui regarde l'étape et non son texte.
    if not any(
        "TAURI_BUNDLER_DMG_IGNORE_CI" in (etape.get("env") or {})
        for etape in build
        if "tauri build" in str(etape.get("run", ""))
    ):
        print("ci.yml : `tauri build` sans TAURI_BUNDLER_DMG_IGNORE_CI — le .dmg perdrait "
              "son fond, sa taille de fenêtre et ses positions d'icônes, en silence",
              file=sys.stderr)
        raise SystemExit(1)

    print(f"ci.yml cohérent — {len(jobs)} jobs, aucun doublon")


def verifier_publication() -> None:
    """Le workflow de publication, dont chaque erreur ne se voit qu'une fois le tag poussé.

    C'est ce qui justifie de le vérifier ici plutôt que « à l'usage » : il ne tourne que sur un
    tag, un tag ne se rejoue pas, et une release ratée est publique.
    """
    if not PUBLICATION.exists():
        print("publication.yml a disparu : plus rien ne construit les versions publiées",
              file=sys.stderr)
        raise SystemExit(1)

    workflow = charger(PUBLICATION)
    jobs = workflow.get("jobs", {})
    etapes = etapes_de(jobs, "macos", 29, "publication.yml")

    sur = declencheurs(workflow)
    # **Le déclencheur, et rien d'autre que lui.** `on: push` sans filtre publierait une release
    # à chaque commit ; un motif de tag non ancré (`v*`) accepterait `v1.2` ou `v0.1.0-essai`,
    # dont le nom de bundle n'a été décidé par personne.
    tags = (sur.get("push") or {}).get("tags")
    if tags != ["v[0-9]+.[0-9]+.[0-9]+"]:
        print(f"publication.yml : le motif de tag est {tags!r}", file=sys.stderr)
        print("  attendu : ['v[0-9]+.[0-9]+.[0-9]+'] — ancré sur les trois nombres",
              file=sys.stderr)
        raise SystemExit(1)
    if (sur.get("push") or {}).get("branches") or "pull_request" in sur:
        print("publication.yml : un déclencheur autre qu'un tag publierait sans qu'on le demande",
              file=sys.stderr)
        raise SystemExit(1)

    # Sans `contents: write`, tout le job réussit et **seule la dernière étape** échoue : trente
    # minutes de construction pour découvrir qu'on ne peut pas créer la release.
    if (workflow.get("permissions") or {}).get("contents") != "write":
        print("publication.yml : il manque `permissions: contents: write`", file=sys.stderr)
        raise SystemExit(1)

    commandes = commandes_de(etapes)
    for fragment, raison in (
        ("universal-apple-darwin", "le bundle publié ne serait plus universel"),
        ("verifier-version.py", "rien ne vérifierait que le tag et les fichiers s'accordent"),
        ("codesign --verify", "rien ne vérifierait la signature, dont dépend le lancement"),
        ("notarytool submit", "l'image ne serait plus notariée — Tauri ne notarie que l'app"),
        ("stapler validate", "rien ne vérifierait l'agrafage du ticket de notarisation"),
        ("source=Notarized Developer ID",
         "rien ne vérifierait le verdict que le système rend vraiment au lancement"),
        ("gh release create", "rien ne publierait le résultat"),
        ("verifier-aucun-decor-de-version.sh",
         "la version de décor pourrait partir dans le bundle livré"),
        ("verifier-dmg-monte.sh",
         "rien ne dirait que la fenêtre d'installation a bien été posée sur le volume"),
    ):
        if fragment not in commandes:
            print(f"publication.yml : « {fragment} » a disparu — {raison}", file=sys.stderr)
            raise SystemExit(1)

    # Même variable, même raison — et ici la conséquence est publique.
    if not any(
        "TAURI_BUNDLER_DMG_IGNORE_CI" in (etape.get("env") or {})
        for etape in etapes
        if "tauri build" in str(etape.get("run", ""))
    ):
        print("publication.yml : `tauri build` sans TAURI_BUNDLER_DMG_IGNORE_CI — la version "
              "publiée s'ouvrirait sur la vue Finder par défaut", file=sys.stderr)
        raise SystemExit(1)

    print(f"publication.yml cohérent — {len(jobs)} job, tag ancré, release publiée")


def main() -> int:
    verifier_ci()
    verifier_publication()
    return 0


if __name__ == "__main__":
    sys.exit(main())
