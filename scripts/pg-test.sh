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
VOLUME="${NOM}-certs"

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
  chmod 600 "$CERTS/serveur-cle.pem"
  echo "certificats engendrés dans $CERTS" >&2
}

# Les certificats, recopiés dans un **volume Docker** dont l'uid 999 est propriétaire.
#
# # Pourquoi ne pas simplement monter le répertoire
#
# C'est ce que faisait la première version, et elle marchait en local **par accident**. PostgreSQL
# refuse de démarrer si sa clé privée est lisible par d'autres, donc la clé est en `chmod 600` — mais
# 600 pour *l'utilisateur de l'hôte*, alors que le serveur tourne sous `postgres` (uid 999). Sur macOS,
# le montage de Docker Desktop réécrit la propriété des fichiers et le serveur lisait la clé ; sur
# Linux, la propriété est préservée telle quelle, et `postgres` ne pouvait pas l'ouvrir. Le conteneur
# mourait au démarrage. **Le décor le plus divergent entre les deux systèmes était celui qui avait l'air
# le plus simple.**
#
# La copie se fait par un conteneur `root` — root traverse les droits de l'hôte, donc il lit la clé en
# 600 — vers un volume nommé, où il repose la propriété et les droits **du point de vue du conteneur**.
# Aucun `sudo` sur l'hôte, et le même comportement sur les deux systèmes. L'image est `postgres:17`,
# déjà tirée : inutile d'en tirer une seconde pour un `cp`.
poser_les_certificats() {
  docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
  docker volume create "$VOLUME" >/dev/null
  docker run --rm --user root \
    -v "$CERTS:/source:ro" -v "$VOLUME:/cible" \
    postgres:17 \
    sh -c 'cp /source/serveur.pem /source/serveur-cle.pem /cible/ &&
           chown 999:999 /cible/serveur.pem /cible/serveur-cle.pem &&
           chmod 600 /cible/serveur-cle.pem'
}

demarrer() {
  engendrer_les_certificats

  if [ -n "$(docker ps -q -f "name=^${NOM}$")" ]; then
    echo "déjà démarré" >&2
  else
    docker rm -f "$NOM" >/dev/null 2>&1 || true
    poser_les_certificats
    docker run -d --name "$NOM" -p "${PORT}:5432" \
      -e POSTGRES_USER=dorabase \
      -e POSTGRES_PASSWORD="$MDP" \
      -e POSTGRES_DB=dorabase_test \
      -v "$VOLUME:/certs:ro" \
      postgres:17 \
      -c ssl=on \
      -c ssl_cert_file=/certs/serveur.pem \
      -c ssl_key_file=/certs/serveur-cle.pem >/dev/null
  fi

  # **L'attente distingue « pas encore prêt » de « mort ».** La version d'origine tournait ses soixante
  # tours quoi qu'il arrive, puis lançait `psql` — qui rendait « container is not running ». Un
  # message qui ne dit ni que le serveur a refusé de démarrer, ni pourquoi : c'est ce qui a fait
  # chercher la cause dans la CI plutôt que dans le journal du conteneur, qui la contenait.
  printf 'attente du serveur' >&2
  pret=
  for _ in $(seq 1 60); do
    if docker exec "$NOM" pg_isready -U dorabase -d dorabase_test >/dev/null 2>&1; then
      printf ' prêt\n' >&2
      pret=oui
      break
    fi
    if [ -z "$(docker ps -q -f "name=^${NOM}$")" ]; then
      printf ' mort\n' >&2
      echo "--- journal de $NOM ---" >&2
      docker logs "$NOM" >&2 2>&1 || true
      echo "--- fin du journal ---" >&2
      exit 1
    fi
    printf '.' >&2
    sleep 1
  done

  if [ -z "$pret" ]; then
    printf ' abandon\n' >&2
    echo "le serveur tourne mais ne répond pas après 60 s ; journal :" >&2
    docker logs "$NOM" >&2 2>&1 || true
    exit 1
  fi

  docker exec -i "$NOM" psql -v ON_ERROR_STOP=1 -U dorabase -d dorabase_test -q \
    < scripts/schema-test-pg.sql >&2

  echo "postgres://dorabase:${MDP}@localhost:${PORT}/dorabase_test"
}

arreter() {
  docker rm -f "$NOM" >/dev/null 2>&1 || true
  docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
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
