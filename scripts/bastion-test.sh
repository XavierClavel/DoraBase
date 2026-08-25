#!/usr/bin/env bash
#
# Monte un bastion SSH de test devant le PostgreSQL de test, pour les tests de `06e`.
#
# Pourquoi un conteneur plutôt que le `sshd` de la machine : activer « Connexion à distance »
# sur le poste d'un développeur pour faire tourner des tests est une intrusion, et les tests
# dépendraient alors de la configuration de sa machine — ses `authorized_keys`, sa politique
# d'authentification. Un conteneur jetable rend le décor identique en local et en CI.
#
# Ce que le script écrit dans le répertoire de sortie :
#   cle            la clé privée du client (sans phrase de passe)
#   cle.pub        sa clé publique, installée dans le authorized_keys du bastion
#   known_hosts    la clé d'hôte réelle du bastion, relevée après démarrage
#   bastion.env    les variables à exporter pour les tests
#
# Usage :
#   ./scripts/bastion-test.sh demarrer [repertoire]
#   ./scripts/bastion-test.sh arreter

set -euo pipefail

NOM=dorabase-test-ssh
RESEAU=dorabase-test
PORT_SSH=${PORT_SSH:-52222}

# Le conteneur PostgreSQL à placer derrière le bastion.
#
# En local il s'appelle `dorabase-test-pg`. En CI c'est le *service container* de GitHub
# Actions, dont le nom est engendré — on le retrouve par son image. Chercher plutôt que coder
# en dur permet au **même script** de monter le décor dans les deux environnements, ce qui
# supprime une classe de divergence local/CI qui a déjà coûté deux corrections sur ce projet.
trouver_pg() {
  if docker inspect dorabase-test-pg >/dev/null 2>&1; then
    echo dorabase-test-pg
    return
  fi

  local trouves
  trouves=$(docker ps --filter ancestor=postgres:17 --format '{{.Names}}')
  local nombre
  nombre=$(echo "$trouves" | grep -c . || true)

  if [[ "$nombre" != "1" ]]; then
    echo "attendu un conteneur postgres:17, trouvé $nombre :" >&2
    echo "$trouves" >&2
    exit 1
  fi
  echo "$trouves"
}

arreter() {
  docker rm -f "$NOM" >/dev/null 2>&1 || true
  # Le réseau et le conteneur PostgreSQL survivent : ils servent aussi aux tests de `06c`
  # et `06d`, et les détruire ici forcerait à recharger le schéma à chaque fois.
  echo "bastion arrêté"
}

demarrer() {
  local sortie="${1:-}"
  if [[ -z "$sortie" ]]; then
    echo "usage : $0 demarrer <repertoire-de-sortie>" >&2
    exit 2
  fi
  mkdir -p "$sortie"

  arreter

  local pg
  pg=$(trouver_pg)
  echo "PostgreSQL derrière le bastion : $pg"

  # Réseau dédié : le bastion doit joindre PostgreSQL **par son nom**, ce que le réseau
  # `bridge` par défaut de Docker ne permet pas (pas de résolution DNS entre conteneurs).
  #
  # C'est aussi ce qui rend le test honnête : la cible n'est joignable **que** par le bastion.
  # Si elle l'était en direct, le test passerait sans rien prouver du tunnel — le contrôle
  # positif dans `postgres/mod.rs` refuse justement de tourner dans ce cas.
  docker network create "$RESEAU" >/dev/null 2>&1 || true
  docker network connect "$RESEAU" "$pg" >/dev/null 2>&1 || true

  rm -f "$sortie/cle" "$sortie/cle.pub"
  ssh-keygen -t ed25519 -N "" -C "dorabase-test-06e" -f "$sortie/cle" -q

  # `linuxserver/openssh-server` accepte une clé publique par variable d'environnement et
  # refuse le mot de passe par défaut — ce qui correspond au seul moyen que `A2` maquette.
  docker run -d --name "$NOM" --network "$RESEAU" \
    -e PUBLIC_KEY="$(cat "$sortie/cle.pub")" \
    -e USER_NAME=bastion \
    -e PASSWORD_ACCESS=false \
    -p "$PORT_SSH":2222 \
    linuxserver/openssh-server:latest >/dev/null

  echo -n "attente du bastion"
  for _ in $(seq 1 60); do
    if ssh-keyscan -p "$PORT_SSH" -t ed25519 127.0.0.1 2>/dev/null | grep -q ssh-ed25519; then
      echo " prêt"
      break
    fi
    echo -n "."
    sleep 1
  done

  # **`AllowTcpForwarding no` est le défaut de cette image**, et c'est exactement ce dont un
  # tunnel a besoin. Sans ce correctif, la session SSH s'ouvre, s'authentifie, annonce son
  # port local — et chaque connexion acheminée est coupée par le bastion. Le test « un tunnel
  # s'ouvre » passait donc pendant que la redirection était morte : même leçon qu'en `06d`,
  # ouvrir n'est pas acheminer.
  docker exec "$NOM" sh -c \
    "sed -i 's/^AllowTcpForwarding no/AllowTcpForwarding yes/' /etc/ssh/sshd_config /config/sshd/sshd_config"
  docker restart "$NOM" >/dev/null

  echo -n "redémarrage après activation de la redirection"
  for _ in $(seq 1 60); do
    if ssh-keyscan -p "$PORT_SSH" -t ed25519 127.0.0.1 2>/dev/null | grep -q ssh-ed25519; then
      echo " prêt"
      break
    fi
    echo -n "."
    sleep 1
  done

  if docker exec "$NOM" grep -q "^AllowTcpForwarding yes" /etc/ssh/sshd_config; then
    echo "redirection TCP activée"
  else
    echo "la redirection TCP n'a pas pu être activée sur le bastion" >&2
    exit 1
  fi

  # La **vraie** clé d'hôte du conteneur, relevée après démarrage. L'inventer ou la coder en
  # dur ferait que le test vérifierait sa propre invention : c'est tout l'inverse de ce que
  # `hostkey` doit prouver.
  ssh-keyscan -p "$PORT_SSH" -t ed25519 127.0.0.1 2>/dev/null > "$sortie/known_hosts"
  if ! grep -q ssh-ed25519 "$sortie/known_hosts"; then
    echo "le bastion n'a pas présenté de clé d'hôte" >&2
    docker logs "$NOM" 2>&1 | tail -20 >&2
    exit 1
  fi

  cat > "$sortie/bastion.env" <<ENV
export DORABASE_TEST_SSH_HOST=127.0.0.1
export DORABASE_TEST_SSH_PORT=$PORT_SSH
export DORABASE_TEST_SSH_USER=bastion
export DORABASE_TEST_SSH_KEY=$sortie/cle
export DORABASE_TEST_SSH_KNOWN_HOSTS=$sortie/known_hosts
# La cible du tunnel, vue **depuis le bastion** : le nom du conteneur PostgreSQL sur le
# réseau partagé, et son port interne — pas le port publié sur l'hôte.
export DORABASE_TEST_SSH_TARGET_HOST=$pg
export DORABASE_TEST_SSH_TARGET_PORT=5432
ENV

  echo "bastion prêt sur 127.0.0.1:$PORT_SSH — source $sortie/bastion.env"
}

case "${1:-}" in
  demarrer) shift; demarrer "$@" ;;
  arreter) arreter ;;
  *) echo "usage : $0 {demarrer <repertoire>|arreter}" >&2; exit 2 ;;
esac
