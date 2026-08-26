#!/usr/bin/env bash
#
# La fenêtre d'installation est-elle vraiment dans le `.dmg` construit ?
#
#   ./scripts/verifier-dmg-monte.sh chemin/vers/DoraBase.dmg
#
# La configuration `bundle.macOS.dmg` est déclarative : Tauri la passe à un script shell qui
# la passe à un AppleScript qui parle au Finder. Aucun maillon ne rend d'erreur quand le fond
# n'arrive pas — un chemin faux, une image que le Finder refuse, une étape sautée sur un
# runner sans session graphique donnent tous le même `.dmg` d'apparence normale, avec la vue
# par défaut. Le seul endroit où la question se tranche est le volume monté.
#
# Ce qui est vérifié : le fichier de fond est **dans** le volume, il est **celui du dépôt**
# (au bit près), le `.DS_Store` le **référence**, et l'alias `Applications` est là — sans quoi
# le geste que l'image décrit n'aurait pas de cible.
#
# Ce qui ne l'est pas, et qui reste une observation humaine : que le rendu soit **beau**, et
# net sur un écran Retina comme sur un écran 1×.

set -euo pipefail
cd "$(dirname "$0")/.."

image="${1:-}"
if [[ -z "$image" || ! -f "$image" ]]; then
  echo "usage : $0 <chemin vers un .dmg>" >&2
  exit 2
fi

fond_attendu="src-tauri/dmg/fond-dmg.tiff"
point=$(mktemp -d)
monte=0

demonter() {
  if [[ $monte -eq 1 ]]; then
    hdiutil detach "$point" -quiet || hdiutil detach "$point" -force -quiet || true
  fi
  rmdir "$point" 2>/dev/null || true
}
trap demonter EXIT

# `-nobrowse` : ne pas faire surgir une fenêtre sur la session de qui lance le script.
# `-readonly` : le volume publié l'est aussi ; monter autrement autoriserait une écriture
# accidentelle à masquer une absence.
hdiutil attach "$image" -nobrowse -readonly -mountpoint "$point" >/dev/null
monte=1

echecs=0
rate() {
  printf '\033[31m   %s\033[0m\n' "$1"
  echecs=$((echecs + 1))
}

if [[ -f "$point/.background/fond-dmg.tiff" ]]; then
  attendu=$(shasum -a 256 "$fond_attendu" | cut -d' ' -f1)
  trouve=$(shasum -a 256 "$point/.background/fond-dmg.tiff" | cut -d' ' -f1)
  [[ "$attendu" == "$trouve" ]] ||
    rate "le fond du volume n'est pas celui du dépôt ($trouve ≠ $attendu)."
else
  rate "le volume n'a pas de .background/fond-dmg.tiff — la fenêtre est restée celle du Finder."
fi

# Le `.DS_Store` porte la géométrie, les positions d'icônes et l'alias du fond. Le fichier
# est un format privé ; on n'en lit ici que ce qui s'y trouve en clair — le nom du fond.
# C'est peu, mais c'est exactement la question : le Finder a-t-il **enregistré** le réglage,
# ou seulement copié une image que personne ne regarde ?
if [[ -f "$point/.DS_Store" ]]; then
  strings "$point/.DS_Store" | grep -q 'fond-dmg.tiff' ||
    rate "le .DS_Store ne référence pas fond-dmg.tiff — le fond a été copié, jamais appliqué."
else
  rate "le volume n'a pas de .DS_Store — aucune mise en fenêtre n'a été enregistrée."
fi

[[ -L "$point/Applications" ]] ||
  rate "le volume n'a pas d'alias Applications — la moitié droite de l'image ne mène nulle part."

[[ -d "$point/DoraBase.app" ]] ||
  rate "le volume ne contient pas DoraBase.app."

if [[ $echecs -eq 0 ]]; then
  echo "fenêtre d'installation : fond, réglage enregistré, alias Applications et app présents."
  exit 0
fi
exit 1
