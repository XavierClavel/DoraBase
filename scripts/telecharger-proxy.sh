#!/usr/bin/env bash
#
# Télécharge le binaire `cloud-sql-proxy` que le bundle embarque, à la version épinglée dans
# `src-tauri/cloud-sql-proxy.lock`, et vérifie son empreinte. Voir `specs/06h-binaire-embarque.md`.
#
# Pourquoi un script et non un binaire commis : 40 Mo par architecture, une fois par
# relèvement de version, alourdiraient le dépôt de façon permanente pour un fichier
# reproductible depuis une URL et une empreinte.
#
# Usage :
#   scripts/telecharger-proxy.sh           l'architecture de cette machine
#   scripts/telecharger-proxy.sh --tous    les deux architectures macOS, pour un bundle
#                                          universel ou une construction croisée
#
# Idempotent : un fichier déjà présent et de bonne empreinte n'est pas retéléchargé, ce qui
# permet de l'appeler avant chaque `tauri dev` sans coût.

set -euo pipefail

racine=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
verrou=$racine/src-tauri/cloud-sql-proxy.lock
destination=$racine/src-tauri/binaries
base=https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy

# Lecture du verrou. Format volontairement pauvre — `clef = valeur` — pour être lu ici en
# trois lignes et en Rust sans dépendance.
lire() {
  local clef=$1
  local valeur
  valeur=$(sed -n "s/^${clef} *= *//p" "$verrou" | head -1)
  if [[ -z $valeur ]]; then
    echo "erreur : la clef « $clef » manque dans $verrou" >&2
    exit 1
  fi
  printf '%s' "$valeur"
}

version=$(lire version)

# Le nom du fichier chez Google, par triplet Rust. Deux vocabulaires différents pour la même
# chose ; la table est le seul endroit qui les relie.
suffixe_de() {
  case $1 in
    aarch64-apple-darwin) printf 'darwin.arm64' ;;
    x86_64-apple-darwin) printf 'darwin.amd64' ;;
    *)
      echo "erreur : triplet non pris en charge par ce scope : $1" >&2
      echo "  (macOS seulement — voir « Hors périmètre » de specs/06h)" >&2
      exit 1
      ;;
  esac
}

empreinte_de() {
  shasum -a 256 "$1" | cut -d' ' -f1
}

# Le temporaire en cours, effacé quoi qu'il arrive — échec d'empreinte, `curl` interrompu,
# Ctrl-C. Un piège `RETURN` sur la fonction ne suffirait pas : un `exit` depuis la fonction
# ne le déclenche pas, et c'est précisément le chemin de l'empreinte fausse.
temporaire=
trap 'rm -f "${temporaire:-}"' EXIT

recuperer() {
  local triplet=$1
  local attendue
  attendue=$(lire "sha256-$triplet")
  local cible=$destination/cloud-sql-proxy-$triplet

  if [[ -f $cible ]] && [[ $(empreinte_de "$cible") == "$attendue" ]]; then
    echo "cloud-sql-proxy $version ($triplet) : déjà présent et vérifié"
    return
  fi

  mkdir -p "$destination"
  # Un temporaire puis un `mv` : un demi-binaire portant le bon nom serait pire que pas de
  # binaire du tout, puisque Tauri l'embarquerait et le signerait sans rien remarquer.
  temporaire=$(mktemp "$destination/.cloud-sql-proxy-$triplet.XXXXXX")

  echo "cloud-sql-proxy $version ($triplet) : téléchargement…"
  curl --fail --location --silent --show-error \
    --output "$temporaire" \
    "$base/v$version/cloud-sql-proxy.$(suffixe_de "$triplet")"

  local obtenue
  obtenue=$(empreinte_de "$temporaire")
  if [[ $obtenue != "$attendue" ]]; then
    echo "erreur : empreinte inattendue pour $triplet" >&2
    echo "  attendue : $attendue" >&2
    echo "  obtenue  : $obtenue" >&2
    echo "  rien n'a été installé. Si la version du verrou vient d'être relevée, relevez" >&2
    echo "  aussi son empreinte — sinon, ne faites pas confiance à ce fichier." >&2
    exit 1
  fi

  chmod 755 "$temporaire"
  mv "$temporaire" "$cible"
  temporaire=
  echo "cloud-sql-proxy $version ($triplet) : installé et vérifié"
}

# La version, écrite là où le bundle la copiera. Une seule source — le verrou — pour
# l'attribution comme pour le code : deux versions annoncées dont une fausse serait pire
# qu'aucune. Voir `src-tauri/licences/cloud-sql-proxy/ATTRIBUTION.md`.
inscrire_la_version() {
  local fichier=$racine/src-tauri/licences/cloud-sql-proxy/VERSION
  printf 'cloud-sql-proxy %s\n' "$version" > "$fichier"
}

if [[ ${1:-} == --tous ]]; then
  triplets=(aarch64-apple-darwin x86_64-apple-darwin)
else
  # Le triplet de cette machine, tel que `rustc` le nomme — la même source que celle dont
  # Tauri se sert pour choisir le fichier à embarquer.
  triplets=("$(rustc -vV | sed -n 's/^host: //p')")
fi

for triplet in "${triplets[@]}"; do
  recuperer "$triplet"
done

inscrire_la_version
