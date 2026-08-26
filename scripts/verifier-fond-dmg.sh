#!/usr/bin/env bash
#
# Le fond de la fenêtre d'installation du `.dmg` s'accorde-t-il avec ce que la
# configuration de bundle en dit ?
#
# Ce garde-fou existe parce que l'image est un **bitmap committé** : rien, dans une
# compilation, ne la relit ni ne la compare à quoi que ce soit. Une régénération à la
# mauvaise échelle, un `tiffutil` qui n'a fondu qu'une représentation, ou une taille de
# fenêtre modifiée d'un côté seulement passeraient jusqu'au volume publié — c'est-à-dire
# jusqu'à un utilisateur, personne d'autre ne montant le `.dmg`.
#
# Ce qui est vérifié ici est **statique**. Que le Finder applique réellement le fond se
# vérifie sur un volume monté : `scripts/verifier-dmg-monte.sh`.

set -u
cd "$(dirname "$0")/.."

dossier="src-tauri/dmg"
conf="src-tauri/tauri.conf.json"
echecs=0

rate() {
  printf '\033[31m   %s\033[0m\n' "$1"
  echecs=$((echecs + 1))
}

for f in fond-dmg.html fond-dmg.png fond-dmg@2x.png fond-dmg.tiff; do
  [[ -f "$dossier/$f" ]] || rate "$dossier/$f manquant — \`pnpm dmg:fond\` le régénère."
done

if [[ $echecs -eq 0 ]]; then
  # Les deux représentations du TIFF, dans cet ordre : macOS choisit la seconde sur un
  # écran Retina. Une seule représentation donnerait un fond flou (1×) ou deux fois trop
  # grand (2×), et `tiffutil` ne se plaint de rien.
  representations=$(tiffutil -info "$dossier/fond-dmg.tiff" |
    sed -n 's/.*Image Width: \([0-9]*\) Image Length: \([0-9]*\).*/\1x\2/p' | tr '\n' ' ')
  [[ "$representations" == "660x440 1320x880 " ]] ||
    rate "fond-dmg.tiff porte « ${representations}» au lieu de « 660x440 1320x880 »."

  for paire in "fond-dmg.png:660 440" "fond-dmg@2x.png:1320 880"; do
    fichier="${paire%%:*}"
    attendu="${paire#*:}"
    mesure=$(sips -g pixelWidth -g pixelHeight "$dossier/$fichier" |
      awk '/pixel(Width|Height)/ { printf "%s ", $2 }')
    [[ "$mesure" == "$attendu " ]] || rate "$fichier mesure « ${mesure}» au lieu de « $attendu »."
  done
fi

# **Aucun numéro de version dans l'image.** Le volume porte déjà la version dans son nom ;
# la remettre dans un bitmap obligerait à régénérer une image — donc à faire tourner un
# Chromium — à chaque relèvement, et une image oubliée annoncerait la version précédente
# sur toute la durée de vie de la suivante. Même esprit que
# `verifier-aucun-decor-de-version.sh`, à ceci près qu'ici seule la **source** est lisible.
if grep -Eq '[0-9]+\.[0-9]+\.[0-9]+' "$dossier/fond-dmg.html"; then
  rate "fond-dmg.html porte un numéro de version — l'image ne doit pas en contenir."
fi

# La zone de contenu de la fenêtre du volume vaut la hauteur demandée **moins la barre de
# titre**, que le Finder dessine et que personne ne peut retirer : mesurée à 32 pt (macOS 26,
# fenêtre sans barre d'outils ni barre d'état). L'image fait 440 pt de haut, la fenêtre doit
# donc en demander 472. C'est la seule cote du lot qu'une lecture du handoff seul aurait
# faussée : `bounds` d'une fenêtre Finder est la fenêtre entière, pas sa zone de contenu.
attendus=(
  '"background": "dmg/fond-dmg.tiff"'
  '"windowSize": { "width": 660, "height": 472 }'
  '"appPosition": { "x": 168, "y": 233 }'
  '"applicationFolderPosition": { "x": 492, "y": 233 }'
)
for motif in "${attendus[@]}"; do
  grep -Fq "$motif" "$conf" || rate "$conf ne porte pas « $motif »."
done

if [[ $echecs -eq 0 ]]; then
  exit 0
fi
exit 1
