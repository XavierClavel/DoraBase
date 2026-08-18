#!/usr/bin/env bash
#
# Le décor MongoDB des specs `18a` → `18g`, monté **de la même façon en local et en CI**.
#
# # Pourquoi un script et non un service container
#
# GitHub Actions ne permet de passer à un service container que des options `docker run`, pas des
# arguments de commande : `--replSet rs0` n'est pas exprimable. Or un `mongod` isolé ne sait pas
# ouvrir de transaction, donc `18f` n'y testerait que son refus — la moitié qui écrit ne serait
# jamais exercée.
#
# Un script partagé évite en plus le défaut qui a fait échouer le garde `default-run` : une variante
# CI qu'on ne peut pas essayer localement finit par divergerner de ce qu'on croit qu'elle fait. C'est
# le même arbitrage que `bastion-test.sh`.
#
#   ./scripts/mongo-test.sh demarrer   # démarre, initie le jeu de réplicas, charge le décor
#   ./scripts/mongo-test.sh arreter    # supprime le conteneur
#
# Rend sur sa sortie standard l'URI à mettre dans `DORABASE_TEST_MONGO`.

set -euo pipefail
cd "$(dirname "$0")/.."

NOM=dorabase-test-mongo
PORT="${DORABASE_TEST_MONGO_PORT:-57017}"

demarrer() {
  if [ -n "$(docker ps -q -f "name=^${NOM}$")" ]; then
    echo "déjà démarré" >&2
  else
    docker rm -f "$NOM" >/dev/null 2>&1 || true
    # `--bind_ip_all` : sans lui, `mongod` n'écoute que sur la boucle du conteneur et la
    # redirection de port ne mène à rien.
    docker run -d --name "$NOM" -p "${PORT}:27017" mongo:8 \
      --replSet rs0 --bind_ip_all >/dev/null
  fi

  printf 'attente du serveur' >&2
  for _ in $(seq 1 60); do
    if docker exec "$NOM" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' \
      >/dev/null 2>&1; then
      printf ' prêt\n' >&2
      break
    fi
    printf '.' >&2
    sleep 1
  done

  # Idempotent : `rs.initiate` sur un jeu déjà initié rend une erreur qu'on ignore.
  docker exec "$NOM" mongosh --quiet --eval \
    'try { rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]}) } catch (e) {}' \
    >/dev/null 2>&1 || true

  # **L'élection du primaire prend un instant.** Sans cette attente, le chargement du décor échoue
  # sur « not primary » — panne intermittente, la pire à diagnostiquer en CI.
  printf 'attente du primaire' >&2
  for _ in $(seq 1 60); do
    if docker exec "$NOM" mongosh --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null \
      | grep -q true; then
      printf ' prêt\n' >&2
      break
    fi
    printf '.' >&2
    sleep 1
  done

  docker exec -i "$NOM" mongosh --quiet < scripts/schema-test-mongo.js >&2
  echo "mongodb://localhost:${PORT}"
}

arreter() {
  docker rm -f "$NOM" >/dev/null 2>&1 || true
  echo "mongo arrêté" >&2
}

case "${1:-}" in
  demarrer) demarrer ;;
  arreter) arreter ;;
  *)
    echo "usage: $0 {demarrer|arreter}" >&2
    exit 2
    ;;
esac
