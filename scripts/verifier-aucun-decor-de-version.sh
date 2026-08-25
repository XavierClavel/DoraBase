#!/usr/bin/env bash
#
# Refuse un `dist/` qui porterait la version de décor.
#
# # Pourquoi ce garde existe
#
# La version affichée dans la barre d'état vient du build (`__APP_VERSION__`, posé par
# `vite.config.ts`). Elle est **figée à `9.9.9` sous Playwright**, sans quoi chaque publication
# périmerait toutes les captures de fidélité : la barre d'état est dans chaque capture pleine
# page, et un chiffre qui change en rougit deux — constaté à la 0.1.1.
#
# Le risque symétrique est qu'elle fuie : `DORABASE_VERSION_DECOR` restée exportée dans un
# shell, et l'application livrée annonce « DoraBase 9.9.9 ». Rien ne le dirait — ni
# TypeScript, ni Vitest, ni un test e2e, qui tous s'attendent justement au décor. Seul l'œil
# d'un utilisateur sur la barre d'état, après distribution.
#
# La contrepartie de figer une valeur est donc de vérifier qu'elle ne sort pas du décor. Ce
# garde est appelé après `pnpm build` (donc après `tauri build`, qui l'englobe), en CI comme à
# la publication.

set -euo pipefail

racine=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dist=$racine/dist
decor=9.9.9

# **Un `dist/` absent doit échouer, pas passer.** Un garde qui ne trouve rien à inspecter et
# s'en félicite est exactement le motif que ce dépôt refuse : il serait vert le jour où l'étape
# de construction disparaît.
if [[ ! -d $dist ]]; then
  echo "erreur : $dist n'existe pas — ce garde s'appelle après la construction du front" >&2
  exit 1
fi

# Le libellé tel qu'il est composé au build — « DoraBase 0.1.1 (arm64) » —, et non le
# numéro nu : celui-ci se retrouve par coïncidence dans du code minifié, et un garde qui
# crie sur du juste finit désactivé.
trouves=$(grep -rlF "DoraBase $decor" "$dist" 2>/dev/null || true)
if [[ -n $trouves ]]; then
  echo "erreur : la version de décor « $decor » est dans le build livré :" >&2
  printf '  %s\n' $trouves >&2
  echo "  DORABASE_VERSION_DECOR est probablement exportée dans ce shell : elle n'appartient" >&2
  echo "  qu'à playwright.config.ts. Retirez-la et reconstruisez." >&2
  exit 1
fi

version=$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')
# Et la vraie version doit y être : sans cette moitié, le garde passerait aussi bien sur un
# `dist/` où l'affichage de la version aurait purement disparu.
if ! grep -rqF "DoraBase $version" "$dist" 2>/dev/null; then
  echo "erreur : la version $version n'apparaît nulle part dans $dist" >&2
  echo "  la barre d'état est censée afficher « DoraBase $version » ; si ce libellé a" >&2
  echo "  changé de forme, ce garde doit changer avec lui." >&2
  exit 1
fi

echo "dist/ porte la version $version, et pas le décor $decor"
