#!/usr/bin/env bash
#
# Le décor PostgreSQL, **avec TLS** (specs `06c`, `06d`, `06f`).
#
# # Pourquoi ce script existe maintenant
#
# PostgreSQL était le seul décor démarré à la main en local et par un *service container* en CI —
# les deux seules façons de faire qui divergeaient. `06f` a besoin de TLS activé et d'un certificat
# dont le nom commun **ne correspond pas** à l'hôte joint, ce qui n'est pas exprimable dans les
# options d'un service container. Le script rejoint donc `mongo-test.sh` et `mysql-test.sh`.
#
# # Le certificat, et pourquoi son nom ne correspond pas
#
# `06f` doit prouver quatre comportements sur le **même** serveur :
#
#   - `require`      chiffre sans authentifier          → accepte
#   - `verify-ca`    vérifie la chaîne, pas le nom      → refuse sans l'autorité, accepte avec
#   - `verify-full`  vérifie la chaîne **et** le nom    → refuse même avec l'autorité
#
# Le troisième cas demande un certificat valide dont le nom ne correspond pas à l'hôte joint. Le nom
# commun est donc `pg-interne.exemple.test`, et les tests se connectent par `localhost`.
#
#   ./scripts/pg-test.sh demarrer   # démarre, engendre les certificats, charge le schéma
#   ./scripts/pg-test.sh arreter
#
# Rend sur sa sortie standard l'URL à mettre dans `DORABASE_TEST_PG`.

set -euo pipefail
cd "$(dirname "$0")/.."

NOM=dorabase-test-pg
PORT="${DORABASE_TEST_PG_PORT:-55432}"
MDP=dorabase-test
CERTS="${DORABASE_TEST_PG_CERTS:-/tmp/dorabase-test-pg-certs}"

engendrer_les_certificats() {
  if [ -f "$CERTS/ca.pem" ] && [ -f "$CERTS/serveur.pem" ]; then
    return
  fi
  mkdir -p "$CERTS"
  # Une autorité à nous, puis un certificat serveur qu'elle signe. La chaîne est donc **valide**, et
  # seul le nom ne correspond pas — c'est ce qui distingue `verify-ca` de `verify-full`.
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$CERTS/ca-cle.pem" -out "$CERTS/ca.pem" \
    -subj "/CN=Autorite de test DoraBase" 2>/dev/null
  openssl req -newkey rsa:2048 -nodes \
    -keyout "$CERTS/serveur-cle.pem" -out "$CERTS/serveur.csr" \
    -subj "/CN=pg-interne.exemple.test" 2>/dev/null
  openssl x509 -req -in "$CERTS/serveur.csr" -days 3650 \
    -CA "$CERTS/ca.pem" -CAkey "$CERTS/ca-cle.pem" -CAcreateserial \
    -out "$CERTS/serveur.pem" \
    -extfile <(printf 'subjectAltName=DNS:pg-interne.exemple.test\n') 2>/dev/null
  # PostgreSQL **refuse de démarrer** si la clé serveur est lisible par d'autres, et le conteneur
  # tourne sous l'utilisateur `postgres` (uid 999). Les droits sont donc posés ici.
  chmod 600 "$CERTS/serveur-cle.pem"
  echo "certificats engendrés dans $CERTS" >&2
}

demarrer() {
  engendrer_les_certificats

  if [ -n "$(docker ps -q -f "name=^${NOM}$")" ]; then
    echo "déjà démarré" >&2
  else
    docker rm -f "$NOM" >/dev/null 2>&1 || true
    docker run -d --name "$NOM" -p "${PORT}:5432" \
      -e POSTGRES_USER=dorabase \
      -e POSTGRES_PASSWORD="$MDP" \
      -e POSTGRES_DB=dorabase_test \
      -v "$CERTS:/certs:ro" \
      postgres:17 \
      -c ssl=on \
      -c ssl_cert_file=/certs/serveur.pem \
      -c ssl_key_file=/certs/serveur-cle.pem >/dev/null
  fi

  printf 'attente du serveur' >&2
  for _ in $(seq 1 60); do
    if docker exec "$NOM" pg_isready -U dorabase -d dorabase_test >/dev/null 2>&1; then
      printf ' prêt\n' >&2
      break
    fi
    printf '.' >&2
    sleep 1
  done

  docker exec -i "$NOM" psql -v ON_ERROR_STOP=1 -U dorabase -d dorabase_test -q \
    < scripts/schema-test-pg.sql >&2

  echo "postgres://dorabase:${MDP}@localhost:${PORT}/dorabase_test"
}

arreter() {
  docker rm -f "$NOM" >/dev/null 2>&1 || true
  echo "pg arrêté" >&2
}

case "${1:-}" in
  demarrer) demarrer ;;
  arreter) arreter ;;
  *)
    echo "usage: $0 {demarrer|arreter}" >&2
    exit 2
    ;;
esac
