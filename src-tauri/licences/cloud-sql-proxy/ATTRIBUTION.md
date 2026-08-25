# Cloud SQL Auth Proxy

DoraBase embarque le **Cloud SQL Auth Proxy** de Google
(<https://github.com/GoogleCloudPlatform/cloud-sql-proxy>), un exécutable distinct lancé en
sous-processus quand une connexion passe par Cloud SQL. Voir
`AGENTS.md`.

- **Licence** : Apache License 2.0 — texte intégral dans `LICENSE`, à côté de ce fichier.
- **Version embarquée** : dans `VERSION`, écrit à la construction depuis
  `src-tauri/cloud-sql-proxy.lock`. Ce fichier-ci n'en porte pas de copie, pour qu'il n'y
  ait jamais deux versions annoncées dont une fausse.
- **Dépendances du proxy** : ses propres avis de licence sont publiés par Google avec chaque
  version, sous
  `https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v<version>/third_party/licenses.tar.gz`.

Le binaire n'est **pas** modifié : il est téléchargé tel quel depuis le dépôt de
distribution de Google, à empreinte vérifiée, et embarqué sans recompilation.
