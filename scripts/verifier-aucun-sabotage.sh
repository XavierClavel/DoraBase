#!/usr/bin/env bash
# Refuse tout marqueur de sabotage laissé dans les sources.
#
# Pourquoi ce garde-fou existe : un champ `pub sabotage: bool`, ajouté pour un contrôle
# négatif, a été **committé et poussé** le 7 août 2026. Il a survécu à neuf vérifications et
# deux CI vertes — parce qu'un champ en trop sur une structure ne casse rien : ça compile, les
# tests passent, la projection TypeScript se régénère avec.
#
# Le mécanisme : `git checkout -- fichier` restaure depuis l'**index**, pas depuis `HEAD`. Un
# `git add -A` passé pendant que le sabotage était en place le fait donc réinstaller par la
# « restauration » censée l'enlever.
#
# La leçon : un contrôle négatif par sabotage a besoin d'un filet qui détecte ses restes,
# parce que le sabotage est conçu pour être inoffensif à la compilation.
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$racine"

# Le mot apparaît légitimement dans des commentaires qui *racontent* un contrôle négatif
# passé. Ne sont donc traqués que les marqueurs actifs : identifiants et commentaires de
# sabotage en cours.
#
# La deuxième alternative a été ajoutée après un échec de ce garde lui-même : la version
# d'origine n'acceptait qu'un préfixe Rust (`pub `, `let `, …), et a donc laissé passer
# `export type SortKey = { sabotage: boolean, … }` dans `src/domain/engine.ts` — le champ
# saboté **projeté en TypeScript** par `export-types` puis committé. Un garde écrit contre
# une famille de fichiers ne couvre pas les fichiers qu'elle engendre.
#
# Le type après les deux-points est exigé pour ne pas confondre avec la prose française, où
# « sabotage : » est une ponctuation normale. Un type y commence par `bool`, `boolean` ou
# une majuscule ; une phrase, non.
motif='(pub |let |fn |mut )sabotage|\bsabotage\??\s*:\s*(bool|boolean|string|number|Option|Vec|[A-Z])|/\* SABOTAGE|// SABOTAGE|SABOTAGE \*/'

if trouves=$(grep -rnE "$motif" src-tauri/src src 2>/dev/null); then
  echo "Marqueur de sabotage laissé dans les sources :" >&2
  echo "$trouves" >&2
  echo >&2
  echo "Un contrôle négatif doit être défait. Attention : \`git checkout -- fichier\`" >&2
  echo "restaure depuis l'index, donc réinstalle un sabotage qui y aurait été ajouté." >&2
  exit 1
fi

echo "aucun marqueur de sabotage"
