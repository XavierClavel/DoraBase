#!/usr/bin/env bash
#
# Fond en universel les binaires **secondaires** de la crate, avant que Tauri ne les copie
# dans le bundle.
#
# # Pourquoi ce script existe
#
# `tauri build --target universal-apple-darwin` compile la crate pour les deux architectures,
# puis fusionne par `lipo` **le seul binaire de l'application**. Or le bundler copie ensuite
# *tous* les binaires de la crate — ici `dorabase` et `export-types` (plan `06a`) — et échoue
# sur le second :
#
#   failed to bundle project: Failed to copy binary from
#   « target/universal-apple-darwin/release/export-types » : does not exist
#
# Constaté le 25 août 2026 en construisant la première version publiable. L'échec arrive **au
# bundling**, donc après la compilation des deux cibles : quatre minutes par tentative.
#
# La fusion des tranches déjà compilées coûte, elle, une seconde. Ce script est branché sur
# `build.beforeBundleCommand` de `tauri.conf.json` — le seul point d'accroche entre la
# compilation et le bundling.
#
# # Pourquoi il ne fait rien la plupart du temps
#
# Une construction ordinaire (`tauri build`, `tauri dev`, `cargo test`) ne passe pas par
# `target/universal-apple-darwin/` : cargo y a déjà mis chaque binaire, et il n'y a rien à
# fondre. Le script sort alors sans bruit — un hook qui échoue hors de son cas serait un hook
# qu'on finit par débrancher.

set -euo pipefail

racine=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
universel=$racine/src-tauri/target/universal-apple-darwin/release
arm=$racine/src-tauri/target/aarch64-apple-darwin/release
intel=$racine/src-tauri/target/x86_64-apple-darwin/release

if [[ ! -d $universel ]]; then
  # Rien à dire : ce n'est pas une construction universelle.
  exit 0
fi

# Les binaires **déclarés par la crate**, et non ce qui traîne dans le répertoire de sortie :
# celui-ci contient aussi le sidecar téléchargé, les scripts de construction et les artefacts
# intermédiaires. `cargo metadata` est la seule source qui distingue les uns des autres — et
# cargo est nécessairement joignable ici, puisque c'est lui qui vient de compiler.
binaires=$(cargo metadata --manifest-path "$racine/src-tauri/Cargo.toml" \
  --format-version 1 --no-deps | python3 -c '
import json, sys
paquet = json.load(sys.stdin)["packages"][0]
for cible in paquet["targets"]:
    if "bin" in cible["kind"]:
        print(cible["name"])
')

empreinte_de() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

for nom in $binaires; do
  cible=$universel/$nom

  # Le binaire de l'application est déjà fondu par Tauri lui-même. On ne le refait pas : sa
  # fusion à lui passe par le même `lipo`, mais c'est Tauri qui en décide le moment.
  if [[ -f $cible ]] && lipo -archs "$cible" 2>/dev/null | grep -q x86_64; then
    continue
  fi

  if [[ ! -f $arm/$nom || ! -f $intel/$nom ]]; then
    echo "erreur : $nom manque pour l'une des deux architectures" >&2
    echo "  arm64  : $arm/$nom" >&2
    echo "  x86_64 : $intel/$nom" >&2
    exit 1
  fi

  lipo -create "$arm/$nom" "$intel/$nom" -output "$cible"
  chmod 755 "$cible"
  # Ce que `lipo` a écrit, et non ce qu'on lui a demandé.
  archs=$(lipo -archs "$cible")
  grep -q arm64 <<<"$archs"
  grep -q x86_64 <<<"$archs"
  echo "$nom fondu en universel — $archs ($(empreinte_de "$cible" | cut -c1-12)…)"
done
