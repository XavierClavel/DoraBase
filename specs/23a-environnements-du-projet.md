# 23a — Les environnements appartiennent au projet

## Goal

`Environment` cesse d'être une énumération fermée de trois valeurs. Chaque projet **déclare** ses
environnements : un identifiant stable, un libellé, une couleur, et le drapeau qui dit lequel est une
production.

## Scope

**Le modèle.** Un projet porte `environments: Vec<EnvironmentDeclaration>`, où une déclaration est :

| Champ | Rôle |
| --- | --- |
| `id` | identifiant **stable**, dérivé du libellé à la création, jamais réécrit ensuite |
| `label` | ce qui s'affiche — renommable |
| `color` | `green` \| `amber` \| `red` \| `slate` \| `violet`, la pastille du sélecteur |
| `production` | ce qui déclenche les garde-fous d'écriture (`11d`) et l'encart rouge |

**`id` et `label` sont deux choses**, et c'est la décision centrale de cette spec. La référence d'un
mot de passe dans le trousseau vaut `dorabase/<projet>/<base>/<environnement>` (`08e`) : si
l'identifiant suivait le libellé, renommer « prod » en « production » rendrait introuvables tous les
mots de passe du projet. L'identifiant est donc figé à la création, comme `slug()` l'était pour
l'énumération.

**Un projet neuf reçoit le trio du handoff** — `dev` vert, `staging` ambre, `prod` rouge marqué
production. C'est ce que le mockup montre, et un projet sans aucun environnement n'aurait aucune
connexion possible.

**La migration.** Une configuration écrite avant cette spec porte `activeEnvironment: "dev"` et des
bases à variantes ; ses projets n'ont pas de champ `environments`. La lecture le reconstruit à partir
des variantes réellement présentes, dans l'ordre du trio, et conserve les identifiants `dev`,
`staging`, `prod` — donc les mots de passe restent trouvables.

## Not in this scope

- **Les bases et leurs variantes** : `23b`. Cette spec ne touche qu'aux déclarations du projet.
- **L'écran d'édition** : `23e`. Ici, les environnements ne se modifient que par le disque.
- **La suppression d'un environnement et son avertissement** : `23f`.
- **Les couleurs disponibles** ne sont pas réglables au pixel : cinq jetons existants, pas un
  sélecteur de teinte. Un client de bases n'est pas un éditeur de thème.

## Approach

`Environment` devient `EnvironmentId(String)` — un type nommé et non un `String` nu, pour qu'aucune
signature ne confonde un identifiant d'environnement avec un nom de base.

**Le format de configuration monte de version.** C'est la première fois : les onze specs précédentes
ont utilisé `serde(default)`, justement parce qu'elles n'invalidaient rien. Ici, `activeEnvironment`
change de type (une énumération devient un identifiant libre) et `environments` doit exister. Un
`default` produirait une configuration vide de sens plutôt qu'une erreur, et la migration a besoin de
lire l'ancienne forme pour en déduire la nouvelle.

**La validation reste au modèle.** Deux environnements de même identifiant dans un projet sont un
refus à la construction, comme deux variantes du même environnement l'étaient dans `Database`.

## Done when

- [ ] Un projet porte ses environnements, chacun avec identifiant stable, libellé, couleur et drapeau
      de production
- [ ] Renommer un libellé ne change pas l'identifiant, et un test le prouve sur la référence du
      trousseau
- [ ] Un projet neuf reçoit `dev` / `staging` / `prod`, avec `prod` marqué production
- [ ] Une configuration de l'ancien format se lit, et ses environnements sont déduits des variantes
      présentes
- [ ] Deux environnements de même identifiant sont refusés à la construction
- [ ] `pnpm domain:build` projette le nouveau modèle sans édition manuelle
