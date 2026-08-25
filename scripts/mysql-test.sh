#!/usr/bin/env bash
#
# Le décor MySQL des specs `16a` → `16c`, monté **de la même façon en local et en CI**.
#
# Même principe que `mongo-test.sh` : un script partagé plutôt qu'une variante CI qu'on ne peut pas
# essayer localement — le défaut qui a fait échouer le garde `default-run`.
#
# Un service container aurait suffi ici, contrairement à MongoDB : MySQL n'a pas besoin d'arguments
# de commande. Le script existe quand même, pour que les trois décors se montent d'une seule façon.
#
#   ./scripts/mysql-test.sh demarrer   # démarre, attend, charge le décor
#   ./scripts/mysql-test.sh arreter
#
# Rend sur sa sortie standard l'URL à mettre dans `DORABASE_TEST_MYSQL`.

set -euo pipefail
cd "$(dirname "$0")/.."

NOM=dorabase-test-mysql
PORT="${DORABASE_TEST_MYSQL_PORT:-53306}"
MDP=dorabase-test

demarrer() {
  if [ -n "$(docker ps -q -f "name=^${NOM}$")" ]; then
    echo "déjà démarré" >&2
  else
    docker rm -f "$NOM" >/dev/null 2>&1 || true
    docker run -d --name "$NOM" -p "${PORT}:3306" \
      -e MYSQL_ROOT_PASSWORD="$MDP" \
      -e MYSQL_DATABASE=dorabase_test \
      -e MYSQL_USER=dorabase \
      -e MYSQL_PASSWORD="$MDP" \
      mysql:8.4 >/dev/null
  fi

  # **L'attente est longue et il faut la tenir.** MySQL initialise son répertoire de données au
  # premier démarrage : trente secondes ne suffisent pas toujours, et un décor chargé trop tôt
  # échoue sur « server has gone away » — panne intermittente, la pire à diagnostiquer en CI.
  printf 'attente du serveur' >&2
  for _ in $(seq 1 120); do
    if docker exec "$NOM" mysqladmin ping -h 127.0.0.1 -u root -p"$MDP" --silent >/dev/null 2>&1
    then
      printf ' prêt\n' >&2
      break
    fi
    printf '.' >&2
    sleep 1
  done

  # **`--default-character-set=utf8mb4`, et ce n'est pas décoratif.** Sans lui, le client `mysql`
  # emploie le jeu par défaut de son image et interprète les octets UTF-8 du fichier comme du latin1 :
  # « démarrage » entre en base sous la forme « dÃ©marrage ». Un test de lecture échoue alors en
  # accusant l'adaptateur, alors que c'est le décor qui a été abîmé à l'écriture.
  docker exec -i "$NOM" mysql --default-character-set=utf8mb4 -u root -p"$MDP" dorabase_test \
    < scripts/schema-test-mysql.sql 2>&1 | grep -v '^mysql: \[Warning\]' >&2 || true

  # **Le certificat d'autorité auto-généré, sorti du conteneur** (`06f`).
  #
  # MySQL engendre au premier démarrage sa propre autorité et un certificat serveur dont le nom commun
  # est `MySQL_Server_…_Auto_Generated_Server_Certificate` — donc **pas** `localhost`. C'est le décor
  # TLS dont `06f` a besoin, et il est gratuit : autorité inconnue *et* nom d'hôte qui ne correspond
  # pas, sur le même serveur. Générer des certificats à la main donnerait le premier cas seulement.
  local ca="${DORABASE_TEST_MYSQL_CA:-/tmp/dorabase-test-mysql-ca.pem}"
  docker cp "${NOM}:/var/lib/mysql/ca.pem" "$ca" >/dev/null 2>&1 \
    && echo "autorité de test copiée dans $ca" >&2 \
    || echo "attention : ca.pem introuvable, les tests TLS seront sautés" >&2

  echo "mysql://dorabase:${MDP}@localhost:${PORT}/dorabase_test"
}

arreter() {
  docker rm -f "$NOM" >/dev/null 2>&1 || true
  echo "mysql arrêté" >&2
}

case "${1:-}" in
  demarrer) demarrer ;;
  arreter) arreter ;;
  *)
    echo "usage: $0 {demarrer|arreter}" >&2
    exit 2
    ;;
esac
