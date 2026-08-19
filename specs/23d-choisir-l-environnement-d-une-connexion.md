# 23d — Choisir l'environnement d'une connexion (`A2`)

## Goal

Le formulaire de nouvelle connexion propose les environnements **du projet choisi**, et non trois
boutons figés.

## Scope

**Le groupe « Variante d'environnement » devient « Environnement »**, et ses entrées viennent du
projet : leurs libellés, leurs couleurs, leur ordre. Le mot « variante » disparaît avec le modèle
qu'il décrivait (`23b`).

**Il suit le projet choisi.** Changer de projet dans le formulaire change la liste des environnements
proposés, et l'environnement retenu redevient le premier du nouveau projet — garder l'ancien
choisirait un environnement que le projet ne déclare pas.

**« + Nouveau projet… » propose le trio par défaut**, puisque le projet n'existe pas encore et
recevra `dev` / `staging` / `prod` à sa création (`23a`). Les trois s'affichent, désactivés
jusqu'à ce que le nom du projet soit saisi — la règle de `09f` : montrer ce qui viendra plutôt que du
vide.

**L'encart de production reste accroché au drapeau**, non au libellé : un environnement nommé
« live » et marqué production déclenche le même avertissement rouge que `prod`. C'est ce qui empêche
la garantie de `11d` de dépendre d'une chaîne de caractères.

## Not in this scope

- **La création d'un environnement depuis ce formulaire.** Elle appartient à l'écran d'édition du
  projet (`23e`) : un formulaire de connexion qui crée aussi des environnements mélange deux gestes,
  et le second est rare.
- **Le choix de l'environnement à l'édition d'une connexion existante** (`08g`) : le déplacer d'un
  environnement à l'autre déplacerait son mot de passe, ce qui est le geste de `23f` et mérite sa
  propre décision. À l'édition, l'environnement s'affiche et ne se change pas.

## Done when

- [ ] Le groupe liste les environnements du projet choisi, avec leurs libellés et couleurs
- [ ] Changer de projet change la liste, et l'environnement retenu redevient le premier
- [ ] Un projet à cinq environnements les montre tous les cinq
- [ ] L'encart de production suit le drapeau, pas le libellé
- [ ] À l'édition d'une connexion, l'environnement est affiché et non modifiable
