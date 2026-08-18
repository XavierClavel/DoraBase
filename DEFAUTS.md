# Les défauts trouvés, et par quelle méthode

Ce fichier est le journal des défauts rencontrés sur DoraBase, **avec ce qui les a attrapés**.
Il est sorti de [`REPRISE.md`](REPRISE.md) le 8 août 2026 : celui-ci avait atteint 754 lignes,
dont 337 pour cette seule section, et un document de reprise qu'on ne lit pas ne reprend rien.

**Ce n'est pas une liste de corrections.** Chaque entrée dit ce qui était faux, pourquoi c'était
invisible, et par quel moyen c'est apparu. Le moyen est le plus utile : la plupart de ces défauts
avaient une suite de tests verte au moment où ils ont été introduits.

`REPRISE.md` § 5 en tire six règles récurrentes. Le détail est ici.

---

À lire avant d'écrire du code : chacun était **invisible**, aucun trouvé par la CI ni par
des tests verts au moment où il a été introduit.

| Défaut | Trouvé par |
| --- | --- |
| `cssTarget` héritait de `target`, lightningcss réécrivait `oklch()` en `lab()` au build | trois builds comparés |
| Types `vite/client` absents : CSS Modules, woff2, `?raw` échouaient tous au typecheck | sondes de compilation |
| `@types/node` global cassait `useRef<number\|null>` et acceptait `process.env` côté navigateur | sonde `setTimeout` |
| CSP bloquait l'IPC de Tauri, qui retombait sur `postMessage` | instrumentation de la page |
| `Sprite` absent du DOM sous `StrictMode` — cassé en dev, correct en prod | un test que le sous-agent n'avait pas écrit |
| Toutes les primitives bordées 2 px trop courtes | mesure du **mockup lui-même** dans un navigateur |
| `html`/`body` sans hauteur : la fenêtre entière ne faisait que 372 px sur 814 | histogramme de couleurs de la première capture — 57 % de blanc pur, alors qu'aucun token de surface n'est blanc |
| Vitest ramassait `e2e/*.spec.ts` par son glob par défaut, `pnpm test` sortait en 1 **en silence** | lecture attentive du résumé : « Tests 62 passed » ne compte pas une suite qui échoue au chargement |
| `playwright-report/` vide après un échec en CI : le rapporteur `list` seul n'écrit rien sur disque | l'artefact de CI remonté vide aurait fait perdre la capture de référence |
| `localStorage` **undefined** sous Vitest : Node 26 expose un global expérimental, inactif sans `--localstorage-file`, dont l'accesseur masque celui de jsdom | le premier test qui y touche, puis sondes de descripteurs — `sessionStorage` de jsdom marche, `localStorage` non |
| L'écriture dans `localStorage` n'était couverte par aucun test, alors que trois d'entre eux « testaient la persistance » | contrôle négatif : `setItem` supprimé, suite toujours verte |
| La racine de `SplitPane` prenait la hauteur de son contenu — 15 px dans une boîte de 180 — cassant la disposition même de `A4` | mise en scène dans la galerie, puis mesure de la chaîne de parents |
| Onglet actif 5 px trop large, et fond `--paper-bright` au lieu de `--paper` | mesure du mockup **et** de notre rendu, comparés chiffre par chiffre |
| `width: 100%` en `content-box` s'ajoute au padding : les lignes de sidebar sortaient à 234 px dans un corps de 212, leur métadonnée rognée (« int8 » rendu « in ») | mesure de la ligne contre son conteneur |
| Les données de démonstration de la galerie mélangeaient `A4` dans une disposition `A5` | captures du mockup et de notre rendu **côte à côte** |

**Les méthodes qui ont payé**, à réutiliser :

1. **Mesurer le mockup dans un navigateur**, pas lire ses styles. Le mockup est en
   `content-box` : un champ à `height:30px` avec 1 px de bordure y rend **32 px**. Comparer
   notre rendu à une valeur *déclarée* plutôt que *rendue* a produit deux défauts distincts.
2. **Contrôle positif systématique.** « Zéro requête réseau » ne vaut rien sans preuve que la
   page tournait. Toute vérification négative doit être accompagnée d'un cas qui, lui, passe.
3. **Vérifier dans l'application réelle**, pas seulement en test unitaire — les tests ne
   rendent pas `main.tsx`, donc ne voient pas `StrictMode`.
4. **Test négatif sur chaque garde-fou.** Une exclusion Biome, un `tokens:check` : introduire
   délibérément la faute et constater l'échec.
5. **Un test qui documente un défaut le rend permanent.** Un sous-agent avait écrit
   « `Sprite` ne rend qu'une fois même monté deux fois » — ce test protégeait le bug.
6. **Un histogramme de couleurs vaut un coup d'œil, quand on n'a pas d'écran.** Sans capture
   visuelle possible dans cet environnement, comparer la distribution des couleurs d'un
   rendu à celle attendue (aucune couleur de la palette n'est blanc pur) a suffi à détecter
   un écran qui ne remplissait pas sa fenêtre.
7. **`toHaveTextContent` normalise l'espace insécable du DOM réel, pas la chaîne attendue.**
   Un test conçu pour détecter la perte d'un ` ` doit comparer `.textContent` par
   `.toBe()` — le matcher normalisé masquerait justement la régression qu'il devait révéler.
8quinquies. **Un script de vérification qu'on ne peut pas lancer soi-même n'est pas un
   garde-fou.** Le premier garde-fou de `default-run` était du Python embarqué dans le YAML
   du workflow : son échappement de guillemets produisait un `SyntaxError` impossible à
   reproduire en local, donc la CI a échoué sur le garde-fou lui-même. Sorti dans
   `scripts/verifier-default-run.py`, il se lance à la main — et son contrôle négatif aussi.

8quater. **« Ça compile » et « ça démarre » sont deux choses, et la CI ne couvrait que la
   première.** L'ajout d'un second binaire a rendu `cargo run` ambigu, donc cassé
   `tauri dev` — l'app ne démarrait plus du tout, alors que `cargo build`, `cargo test`,
   `clippy` et `pnpm tauri build` étaient tous verts. `tauri build` ne passe pas par
   `cargo run`. Signalé par l'utilisateur, pas par nous. Depuis, un garde-fou vérifie la
   propriété par `cargo metadata` — pas en lançant `cargo run`, l'app ouvrant une fenêtre
   qui bloquerait le runner.

8bis. **« ÉCHEC à l'étape X » ne dit pas que X a échoué pour la raison qu'on croit.** Le job
   Linux a signalé un échec sur `cargo test --features db-tests` : en réalité la crate ne
   **compilait pas**, `tauri` exigeant la pile GTK/WebKit absente du runner. La commande
   citée était la bonne, la cause était deux étapes en amont *dans* cette commande. Lire
   `gh run view --log-failed`, pas seulement le nom de l'étape.
8ter. **Tout échec de CI n'est pas un défaut du code.** `Set up job` rendant
   « Service Unavailable / Failed to resolve action download info » est une panne de
   GitHub Actions : la réponse est de relancer, pas de corriger. Vérifier *quelle* étape
   échoue avant de chercher un coupable dans le dépôt — la même journée a vu huit échecs
   de sous-agents en erreur 529, tous côté service.

8. **La CI n'a pas fini de mentir tant que le job entier n'est pas vert.** Un `X` sur une
   étape peut avoir sa vraie cause sur une étape *antérieure* dont le résumé masque
   l'échec (voir Vitest/e2e ci-dessus) — toujours vérifier l'étape qui échoue en premier,
   pas la dernière affichée.
9. **jsdom ne calcule aucune mise en page.** Hauteur, largeur, position : `getBoundingClientRect()`
   y renvoie zéro. Ces exigences sont **structurellement hors de portée de Vitest** et ont
   besoin de Playwright — `e2e/layout-primitives.spec.ts` existe pour ça, et chacune de ses
   assertions a été validée par sabotage. Quatre défauts de mise en page sont passés sous
   une suite unitaire verte avant qu'on s'en dote.
10. **Le contrôle négatif se fait par sabotage, pas par relecture.** Trois tests qui
   « testent la persistance » peuvent ne tester que la lecture : c'est en retirant la ligne
   soupçonnée du composant, et en constatant que la suite reste verte, qu'on l'apprend.
   Généralisation de la méthode 4, appliquée systématiquement dans les plans `03` et `04`.
11. **Comparer deux captures côte à côte attrape ce qu'aucune mesure ne cherche.** Couleurs,
   graisses et paliers pouvaient tous être justes tandis que les *données* de démonstration
   venaient du mauvais écran. Une mesure vérifie une hypothèse ; un inventaire visuel en
   révèle l'absence.
12. **`box-sizing: border-box` n'est pas une entorse à la convention `content-box`.** Celle-ci
   vaut pour les **hauteurs** issues d'un token. Un élément dont la **largeur** est à 100 %
   avec du padding a besoin de `border-box`, sinon les deux s'additionnent.
13. **Un test qui vérifie le résultat visible ne prouve pas que le chemin est bon.** En
   `06d`, saboter la pagination — `limit 1000000000` côté SQL, découpe en Rust — laissait
   *vert* le test « la fenêtre rend exactement 500 lignes ». Ramener cent mille lignes puis
   n'en garder que cinq cents satisfait la lettre de l'exigence. Seul le test qui compare le
   **coût** entre une table de mille lignes et une de cent mille a mordu. Quand la contrainte
   porte sur le chemin et non sur la sortie, il faut mesurer le chemin.
14. **Un garde-fou écrit contre une famille de fichiers ne couvre pas celle qu'elle
   engendre.** `verifier-aucun-sabotage.sh`, écrit précisément pour attraper le champ
   `sabotage` committé par accident, exigeait un préfixe Rust (`pub `, `let `…) et a donc
   laissé passer `{ sabotage: boolean, … }` dans `src/domain/engine.ts` — le même champ,
   projeté en TypeScript par `export-types`. C'est `domain:check` qui l'a fini par le voir,
   un cran plus tard. Le motif accepte désormais les deux formes.
15. **Un message d'erreur peut faire passer un test pour la mauvaise raison.** Le test
   « une colonne inconnue est refusée » assertait que le message contient le nom fautif.
   PostgreSQL renvoie `column "colonne_inventee" does not exist` — donc laisser passer le
   nom échappé jusqu'au serveur satisfaisait le test, alors que le but était de refuser
   **avant l'envoi**. Corrigé en assertant aussi `code == None` : une erreur locale n'a pas
   de `SQLSTATE`, un refus serveur porte `42703`. Trouvé par sabotage.
16. **Un enchaînement de vérifications à la main peut mentir.** `set -e` puis
   `cargo clippy … | tail -3` : le statut de sortie d'un pipeline est celui de sa **dernière**
   commande, donc `tail` réussit toujours. « TOUT VERT » s'est affiché avec trois
   vérifications rouges. D'où `scripts/verifier-tout.sh`, qui ne tronque rien, enregistre
   chaque échec et les rappelle à la fin. À utiliser au lieu de rechaîner.
17. **« Ça s'ouvre » ne prouve pas « ça sert ».** Même leçon que le point 13, retrouvée en
   `06e` sur un autre terrain : l'image `linuxserver/openssh-server` livre
   `AllowTcpForwarding no`. La session SSH s'ouvrait, s'authentifiait, annonçait son port
   local — et chaque connexion acheminée était coupée. Le test « un tunnel s'ouvre » était
   vert pendant que la redirection était morte. Ce qui l'a trouvé : un test qui envoie une
   vraie requête SSL PostgreSQL dans le tunnel et attend la réponse du serveur.
18. **`JoinHandle::abort` n'est pas synchrone.** Il *planifie* l'annulation ; au retour, la
   tâche tient encore ses ressources. Un `Drop` qui se contentait d'`abort` laissait donc le
   port local pris, et le test qui le redemandait aussitôt échouait sur « Address already in
   use ». D'où `SshTunnel::fermer`, qui attend le handle après l'avoir abandonné — `Drop`
   n'étant plus qu'un filet, ce que sa documentation dit explicitement.
19. **Un test qui recopie la logique du sujet ne le teste pas.** Écrit puis corrigé dans la
   même heure en `06e` : la lecture d'`etat()` était reconstituée dans une fonction d'appoint
   du module de test, faute de pouvoir construire un `SshTunnel` sans bastion. C'est le même
   défaut que sur l'atomicité de `05b` (point 5). Corrigé en extrayant `Surveillance`, un
   type que le tunnel **et** le test appellent.
55. **`aria-disabled` plutôt que `disabled`, quand un bouton porte une explication.** Un
   `<button disabled>` ne reçoit ni focus ni survol dans la plupart des navigateurs : son
   infobulle serait inatteignable — exactement là où elle est le plus utile. `aria-disabled` le
   garde focalisable et annoncé comme indisponible, et le sabotage qui les échange fait tomber
   deux tests.
56. **Une infobulle *décrit*, elle ne *nomme* pas.** `aria-describedby` et non `aria-label` :
   celui-ci remplacerait le nom du bouton par son explication, et le contrôle s'annoncerait par sa
   limite plutôt que par sa fonction. Le sabotage fait tomber cinq tests, dont trois qui ne
   parlaient pas d'infobulle.
57. **Le `biome-ignore` doit être la *dernière* ligne de commentaire avant le nœud** — deuxième
   occurrence, après le voile de `08a`. Écrire la directive en tête d'un commentaire de trois
   lignes la rend inopérante, et l'avertissement revient sans qu'on comprenne pourquoi.
58. **Lire le DOM dans le même `evaluate` que le `focus()` lit un DOM d'avant le rendu.** React
   ne commet qu'après le gestionnaire : la mesure de l'infobulle rendait `null`. Focus et lecture
   doivent être deux étapes, avec un `waitForSelector` entre les deux.

51. **Le collage des nœuds de texte dans le nom accessible : quatrième occurrence, corrigée dans
   la primitive.** Après `08a` (monogramme), `09a` (compte de segment) et `09c` (état de
   connexion), c'est `TreeRow` : une ligne s'annonçait « orders1.9 M » et « Atelier NordPROD ».
   Les trois premières fois, la correction était chez l'appelant ; la quatrième a montré que la
   place était **dans le composant**. JSX supprime l'espace entre deux éléments, et le calcul du
   nom accessible concatène sans rien ajouter — la règle à retenir : dès qu'un composant place
   deux contenus côte à côte, l'espace doit être explicite.
52. **Un `role` sur une enveloppe met l'élément interactif à l'intérieur du nœud.** `TreeRow`
   rend un `<button>` ; poser `role="treeitem"` sur un `<div>` autour plaçait le bouton *dans* le
   nœud d'arbre, où ni le clic ni le focus ne le désignent — les tests de clic échouaient sans que
   la cause soit évidente. `TreeRow` transmet désormais ses attributs restants à sa racine, ce que
   `04` avait différé « tant qu'aucun écran n'en impose la forme ». `A4` l'impose.
53. **Un motif de nom accessible doit être ancré.** `getByRole('treeitem', { name: /orders/ })`
   comptait aussi `orders_by_day`. Un motif non ancré compte les lignes voisines, et le test
   échoue en annonçant un nombre au lieu de nommer le doublon.
54. **La largeur du mockup n'est pas la largeur rendue.** `width: 252px` avec un `border-right`
   et sans `box-sizing` rend **253**. Attendre 252 était attendre autre chose que le mockup.

47. **`aria-label` sur un élément sans rôle est ignoré — troisième occurrence.** Après le port
   local mappé de `08c`, c'est le point d'état de la pastille projet. Biome le signale à chaque
   fois (`useAriaPropsSupportedByRole`) et a raison à chaque fois. **La règle générale** : quand
   l'élément est une décoration d'un contrôle, l'information n'a pas à porter un `aria-label` —
   elle a sa place dans le **nom du contrôle**, par du texte masqué visuellement
   (`clip-path`, jamais `display: none`, qui le retirerait de l'arbre d'accessibilité).
48. **L'ordre du texte masqué décide de l'ordre de lecture.** Placé en tête, il donnait
   « connectée · PostgreSQL 17.6Atelier Nord » — l'état avant l'identité, et sans espace.
   Placé en dernier avec un espace explicite : « Atelier Nord … connectée ». Troisième
   rencontre du collage des nœuds de texte, après `08a` et `09a`.
49. **`--space-3` vaut 6 px, pas 8.** L'échelle d'espacement va de 3, 5, 6, 7, 9, 11, 14, 16 :
   il n'y a **pas** de 8. Employer le jeton le plus proche « parce que ça se ressemble » a produit
   un écart de 2 px sur la séparation des deux boîtes de la barre de titre, que la mesure a
   attrapé. Un littéral commenté vaut mieux qu'un jeton approximatif — c'est déjà l'arbitrage du
   remplissage de `DataTable`.
50. **Un test de centrage doit nommer *dans quoi* il centre.** Ma première version comparait le
   centre du contenu à la demi-largeur de la barre — une chose que ni le mockup ni notre barre ne
   font, celle-ci réservant 78 px à gauche pour les feux de macOS. Le mockup centre dans
   l'**espace restant**, ce qui est structurel et se vérifie contre la zone elle-même.

45. **Un test qui compte les entrées d'une table ne prouve pas le réemploi.** Le test du
   registre ouvrait deux fois la même base et attendait une seule entrée — mais sans la garde de
   réemploi, la seconde ouverture *remplace* l'entrée et le compte reste 1 de toute façon.
   Retirer la garde laissait le test vert, alors que la première connexion était lâchée sans
   `close` et fuyait son tunnel. La version qui mord emploie une variante **cassée** à la seconde
   ouverture : avec la garde elle rend sans rien tenter, sans elle l'état bascule en `Offline`.
46. **Un test qui devait vérifier l'accord de deux implémentations a montré qu'il fallait n'en
   avoir qu'une.** `connection_states` rendait une table indexée par `projet/base/environnement`,
   ce qui obligeait le front à savoir recomposer cette clé. En écrivant le test qui aurait
   comparé les deux compositions, il est devenu clair que la commande devait rendre des
   **triplets** — la convention n'existe alors plus qu'à un endroit, côté Rust.

42. **La feuille de style du mockup dit ce que sa prose ne dit pas.** Le handoff décrit le
   tableau de `A4` en une phrase ; son `<style>` porte l'essentiel, et trois points s'y jouaient à
   l'inverse de ce que j'avais écrit : les en-têtes **ne sont pas** en capitales (700 11px, casse
   normale), les cellules sont en **mono par défaut** — seule la colonne du nom est en Nunito —
   et il y a des filets **verticaux** entre colonnes. Mon API avait posé `mono?: boolean`, ce qui
   aurait fait de six colonnes sur sept une exception ; c'est devenu `ui?: boolean`. **Lire le
   `<style>` du mockup avant d'écrire du CSS**, pas seulement les blocs `style=` en ligne.
43. **Un `var()` vers un jeton inexistant ne casse rien de visible.** J'avais écrit
   `var(--rowh-base)` ; le générateur aplatit `rowh.base` en `--rowh`. La déclaration devenait
   invalide, l'en-tête retombait en hauteur automatique — 15px au lieu de 26 — et rien ne le
   signalait : ni TypeScript, ni Vitest, ni l'œil. C'est une mesure e2e qui l'a attrapé, et il a
   fallu mesurer la hauteur **calculée** plutôt que le rectangle, lequel incluait le filet et
   masquait l'écart derrière un arrondi.
44. **Un test de mise en page doit nommer ce qu'il mesure.** Le test « les boutons radio font
   30 px » de `08a` balayait tous les `fieldset[class*=root]` de la galerie. `09a` y a ajouté
   `SegmentedControl`, dont les segments font 25 px : le test est tombé pour une raison étrangère
   à son sujet. Resserré sur les groupes qu'il visait réellement, identifiés par une valeur
   d'option connue.

38. **Un `<select>` contrôlé dont la valeur n'est dans aucune option affiche la première, sans
   le dire.** `A2` montrait « Atelier Nord » sélectionné alors que le brouillon portait encore
   la chaîne vide : l'enregistrement visait donc un projet inexistant. **À l'écran, tout allait
   bien** — c'est un test qui vérifiait le `project` de la requête qui l'a trouvé. Corrigé par un
   effet qui aligne le brouillon sur ce que le select affiche, et qui couvre aussi le cas d'une
   sélection devenue invalide.
39. **Le handoff distingue « champ désactivé » et « bouton désactivé ».** `02` avait donné à
   `Button:disabled` le `#F1ECE2` que la table des jetons attribue à un *champ* désactivé. Or la
   prose du handoff nomme séparément l'état désactivé d'un **bouton** : `rgba(35,32,28,.14)` de
   fond, `rgba(35,32,28,.4)` de texte. C'est sensiblement plus sombre — l'un est opaque, l'autre
   est un voile d'encre — et un bouton trop clair a l'air cliquable. Relevé en construisant `08e`,
   seul écran à montrer un bouton désactivé. D'où `--disabled`, qui a la même valeur que
   `--border` et coexiste avec lui délibérément : le handoff les nomme séparément, et rien ne lie
   un fond de bouton à une couleur de bordure.
40. **Huit paramètres positionnels dont quatre chaînes, c'est une invitation à l'erreur.** Clippy
   l'a signalé sur `enregistrer` ; rien n'empêchait d'échanger le nom du projet et celui de la
   base. Regroupés en `NouvelleBase`, dont les champs sont nommés à l'appel.
41. **Une dépendance de `useEffect` recréée à chaque rendu boucle.** Biome signalait `patch`
   manquant dans les dépendances ; l'y déclarer relancerait l'effet indéfiniment. Le poseur d'état
   de React (`setDraft`) est stable — c'est lui qu'il faut employer dans un effet.

34. **Deux règles à une classe se départagent par l'ordre du bundle, et cet ordre bouge.**
   Prévu pour `.envDanger` en `08b`, **constaté** en `08d` pour `.envOption` : `RadioGroup` pose
   `padding: 0 12px` sur `.option`, `NewConnection` pose `0 10px` sur `.envOption`. Éditer
   `NewConnection.module.css` a suffi à inverser le gagnant, et les boutons d'environnement ont
   changé de largeur d'un build à l'autre. Attrapé par une capture de référence, puis nommé par
   un test dédié — pour que la prochaine fois l'échec dise *quoi* est cassé. Le sélecteur doublé
   (`.envOption.envOption`) porte la spécificité à (0,2,0) et tranche définitivement.
35. **Deux modales superposées, deux écouteurs `esc`.** Chaque instance de `Modal` écoute
   `keydown` sur `document` : un `esc` sur `A3` fermait `A2` avec elle. `stopPropagation` n'y
   change rien — les deux écouteurs sont sur la même cible. Corrigé par une pile au niveau du
   module : seule la modale du sommet répond. Les tests unitaires de `08a` ne l'avaient pas vu
   parce qu'ils n'exerçaient **qu'une modale à la fois**.
36. **Un journal ne doit pas pouvoir casser ce qu'il observe.** `testerLaConnexion` faisait
   `await debug(...)` avant l'`invoke`. Or le plugin `log` est derrière une permission
   (`log:allow-log`, qui **manquait**) et n'est enregistré qu'en développement : en release ou
   permission absente, ce `await` rejetait et emportait le test de connexion avec lui. Trouvé en
   **lançant l'app**, pas par un test : sous Vitest comme sous Playwright le plugin n'existe pas
   et l'appel échoue de toute façon, donc aucun test ne distinguait les deux situations.
   Journalisation désormais « lance et oublie ».
37. **Ne pas piloter le bureau de l'utilisateur par frappes synthétiques.** L'observation du pont
   de `08d` a été tentée en automatisant `⌘N` puis des tabulations via `osascript`. La fenêtre de
   l'app ne passait pas au premier plan (`set frontmost` sans effet, Finder restait devant) :
   les frappes pouvaient donc atterrir dans les applications de l'utilisateur. Approche
   abandonnée — l'observation se demande, elle ne se force pas.

31. **Tauri valide ses permissions à la compilation.** Une permission inexistante fait échouer
   le *build script*, donc n'atteint jamais un test qui lirait `capabilities/default.json`. Le
   sabotage utile est donc une permission **valable mais non justifiée** (`dialog:allow-save`),
   pas une inventée. `src-tauri/tests/permissions.rs` garde la liste et refuse tout
   `<plugin>:default` — `dialog:default` accordait `ask`, `confirm`, `message`, `open` et
   `save`, vérifié dans la sortie du build script.
32. **`aria-label` sur un élément sans rôle est ignoré.** Le port local mappé était un
   `<div aria-label="Port local mappé">` : `getByLabelText` le trouvait en test, un lecteur
   d'écran n'aurait rien annoncé. Biome l'a signalé (`useAriaPropsSupportedByRole`) et avait
   raison. L'élément juste est `<output>` — « le résultat d'un calcul de l'application », ce
   qu'est exactement ce port — qui est *labelable*, donc nommé par un vrai `<label for>`, et
   n'est éditable ni focalisable par nature : plus solide qu'un `aria-disabled` qui l'affirme.
33. **Un `<label>` est inline, un `<div>` est bloc.** Remplacer l'un par l'autre pour la même
   classe CSS a décalé de deux pixels tout ce qui suivait, et fait échouer la capture de
   référence. `display: block` posé explicitement sur la classe — après quoi la référence passe
   **sans régénération**, ce qui prouve que le changement de sémantique est pixel-identique.

26. **`content-box` corrige la hauteur et casse la largeur.** `02` avait imposé
   `box-sizing: content-box` sur `Field` pour que `--h-field` signifie la hauteur du contenu,
   comme dans le mockup — raisonnement juste. Mais en `content-box`, `width: 100%` désigne la
   largeur du *contenu* : remplissage et bordure s'ajoutent par-dessus, et le champ déborde de
   sa piste de grille. Mesuré en `A2` : le champ Port rendait **104 px dans une piste de 84**.
   Le mockup n'a pas ce défaut parce que ses champs sont des `<div>` à largeur `auto`, qui se
   rétractent ; un `<input>` ne remplit son conteneur que par `width: 100%`. Corrigé en
   `border-box` avec la hauteur explicitée par un `calc` — l'arithmétique est visible au lieu
   d'être implicite.
27. **Un `<select>` garde sa hauteur intrinsèque dans un conteneur flex.** 16 px mesurés dans
   une boîte de 32 : la boîte avait la bonne taille, l'anneau de focus était au bon endroit,
   et cliquer dans le remplissage du champ n'ouvrait pas la liste. Invisible en test unitaire
   **et à l'œil**. `align-self: stretch` le règle. Trouvé parce qu'un test mesurait le mauvais
   élément et rendait 16.
28. **Une capture d'écran attrape ce qu'aucune mesure ne cherche** — déjà noté au point 11,
   confirmé trois fois en une passe sur `A2` : le badge affichait « lockTrousseau » (`Badge.icon`
   attend un `ReactNode`, pas un nom d'icône), les deux bascules avaient perdu leur libellé
   visible (`Toggle` ne rend que l'interrupteur, le texte est à l'appelant), et l'œil du champ
   mot de passe portait la bordure par défaut du navigateur faute de classe CSS. Les 22 tests
   unitaires de l'écran étaient verts.
29. **Comparer un pixel isolé ne prouve rien : il faut la couleur dominante d'une zone.** Les
   premières mesures contre le mockup tombaient sur du texte ou un bord adouci et donnaient des
   écarts de 42 à 132 sur des couleurs pourtant justes. La dominante d'une boîte est robuste au
   texte et aux bords. Six zones ressortent alors **identiques octet pour octet**.
30. **Un voile ne se compare pas d'une capture à l'autre** : le mockup le pose sur le corps de
   sa fenêtre dessinée, nous sur le vrai canvas. La bonne vérification est le **mélange
   attendu** — le canvas relevé sur la capture de `A1`, composé à alpha .28, comparé à la même
   zone sous le voile. Écart de 1/255, l'arrondi du compositeur. Une première tentative
   échantillonnait le canvas *sous* le voile et raisonnait en rond.

21. **`[href]` dans un sélecteur de focalisables attrape les `<use>` des SVG.** Le sélecteur
   large, qu'on recopie de projet en projet, place alors un élément SVG en tête de liste — et
   `.focus()` sur un `<use>` ne fait rien. Le piège de tabulation de `Modal` était donc muet :
   il appelait bien `focus()`, sur le mauvais élément. Trois tests l'ont attrapé. Il faut
   `a[href]`.
22. **Un `<input type="radio">` natif donne les flèches gratuitement.** La première version de
   `RadioGroup` employait des `<button role="radio">` avec `aria-checked`, `tabIndex` alterné
   et un gestionnaire de flèches maison — une trentaine de lignes. Un groupe de radios natifs
   partageant le même `name` fait tout cela, bouclage compris. Les lignes ont été supprimées
   et **les tests de clavier passent sans elles**, ce qui prouve que le navigateur faisait le
   travail. Biome l'avait signalé (`useSemanticElements`) ; la règle avait raison sur le fond.
23. **Un test peut rester vert sous sabotage sans qu'on le remarque.** « Le focus n'échappe
   pas vers ce qui est derrière » tabulait quatre fois puis vérifiait qu'un bouton extérieur
   n'avait pas le focus. Piège retiré, il restait vert : l'ordre de tabulation de jsdom ne l'y
   amenait pas en quatre coups. Le sabotage a révélé le test, pas le code. Réécrit pour
   vérifier l'invariant après **chaque** tabulation, il mord dès la troisième.
24. **Le nom accessible se concatène sans espace.** Un monogramme `<span>Pg</span>` suivi du
   libellé « PostgreSQL » dans le même `<label>` donne le nom accessible « PgPostgreSQL », que
   le lecteur d'écran annonce tel quel. Le préfixe est décoratif — il abrège un nom déjà
   présent — donc `aria-hidden="true"`.
25. **Les feux tricolores de macOS sont hors d'atteinte du CSS.** Le mockup les grise derrière
   une modale ; `titleBarStyle: "Overlay"` les fait dessiner par le système. Constaté avant
   d'écrire une ligne, en lisant `tauri.conf.json` — les deux specs concernées ont été
   corrigées plutôt que l'implémentation détournée. Détail au § « À trancher » de
   `specs/README.md`.

20. **Un test qui se saute tout seul rend un succès.** Les tests de tunnel s'abstiennent
   quand le décor SSH manque — nécessaire pour le job macOS, mais un bastion qui échoue à
   démarrer les rendrait invisibles sans casser la CI. Une étape dédiée du job Linux relit la
   sortie et refuse la présence de « décor SSH absent ». Le saut est aussi **annoncé** sur
   `stderr` plutôt que muet.

---

## Ce qu'a trouvé le premier usage réel, du 9 au 12 août 2026

Vingt-six défauts, tous sur une suite verte, et **treize signalés par l'utilisateur** — pas par nous. Le
point commun : le décor de test était trop régulier pour les produire, ou l'assertion mesurait
autre chose que ce qu'elle prétendait.

26. **Un décor aux colonnes vides cache les défauts de lecture.** `orders` avait `metadata`,
   `ref`, `paid` et `blob` nuls partout : un type mal lu y était **indiscernable** d'une colonne
   vide. Du 6 au 10 août, `06d` rendait donc `Null` pour tout type non lu nativement —
   horodatage, JSON, UUID, énumération — parce que le repli « lire en texte » supposait un
   transtypage que le `select` ne faisait pas. `A5` aurait affiché `NULL` dans **chaque colonne de
   date de chaque table**. Attrapé non par un test de lecture mais par le test d'`INSERT` de
   `10f`, qui *exécute* son SQL : la base a refusé un `NULL` dans une colonne `not null`.
27. **Le même piège, une seconde fois : `numeric`.** `tokio-postgres` ne le lit ni en `i64` ni en
   `f64`, et la catégorie `Number` n'était pas transtypée — toute colonne de montants ou de taux
   s'affichait vide. Les tables de mesure ne portaient que des entiers et du texte, les deux
   catégories qui se lisent nativement. `Value::Decimal` garde désormais le texte exact : un `f64`
   perdrait de la précision, inacceptable pour de l'argent. Le décor reçoit une table `montants`.
28. **TypeScript ne signale pas un genre oublié quand le retour est `ReactNode`.** En ajoutant
   `Value::Decimal`, le `switch` de rendu tombait dans aucun cas et rendait `undefined` — un
   `ReactNode` valide. La cellule se serait affichée **vide**, sans une erreur. Le `switch` porte
   maintenant un garde typé `never`, qui nomme le genre oublié à la compilation.
29. **« Inconnu » n'est pas « zéro ».** `pg_class.reltuples` vaut `-1` pour une relation jamais
   analysée ; `06c` le traduisait en `0`. Sur une base réelle dont aucune table n'avait été
   analysée, `A4` les affichait **toutes vides**, et l'utilisateur en a conclu que ses tables
   l'étaient. Le test qui aurait dû l'attraper vérifiait `value() >= 0` — ce que zéro satisfait.
   `RowCount::Unknown` porte le cas, `value()` rend `Option`, et l'écran met un tiret cadratin avec
   une infobulle qui parle d'`ANALYZE`.
30. **Les colonnes d'une clé étrangère entrante étaient cherchées dans la mauvaise table.**
   `REQUETE_RELATIONS` joignait `pg_attribute` sur `con.conrelid` dans les deux sens. Quand les
   numéros d'attribut existaient de part et d'autre, elle rendait des noms **faux** — `users.email`
   au lieu de `orders.user_id` — et le test restait vert parce qu'il ne vérifiait que la direction
   et la table cible. Quand ils n'existaient pas, `array_agg` rendait `NULL` et **toute la table
   devenait impossible à ouvrir**. Cas réel : une contrainte pointant la colonne 18 d'une table qui
   en compte 16. `relation_depuis` omet désormais une relation illisible avec un journal — une
   ligne manquante dans « Relations » vaut mieux qu'une table inaccessible.
31. **`data-tauri-drag-region` nu ne rend glissable que l'élément cliqué.** Le script de Tauri
   teste `el === composedPath[0]` ; la barre de titre étant couverte par ses enfants, seule la bande
   de fond autour des feux répondait. La valeur `deep` étend au sous-arbre, et les éléments
   cliquables la bloquent d'eux-mêmes. À savoir aussi : `core:window:default` n'accorde **aucune**
   permission d'écriture, donc `core:window:allow-start-dragging` est nécessaire — le point était
   consigné depuis `01` sans qu'on en tire la conséquence.
32. **macOS corrigeait la saisie des identifiants techniques.** `localhost` devenait `Localhost`,
   et la connexion échouait pour une majuscule que personne n'avait tapée. Quatre attributs
   (`autoCapitalize`, `autoCorrect`, `spellCheck`, `autoComplete`) posés dans `Field`.
33. **Une bande d'onglets qui « ne se réduit jamais » recouvre ce qui la suit.** `flex: none` sur
   `TabStrip`, juste dans le contexte de `03`, faisait déborder la bande **sous** « Données /
   Structure » avec sept onglets. Deux versions du test étaient vertes sans le correctif : mesurer
   le rectangle du `tablist` voit toujours un chevauchement — `getBoundingClientRect` ignore la
   découpe par `overflow` — et celui de l'enveloppe n'en voit jamais. La version qui mord interroge
   `elementFromPoint` au centre du libellé : **ce qui compte est ce qui se trouve sous le pixel**.
34. **Le highlight d'une ligne s'arrêtait au bord de la fenêtre.** Les lignes étaient posées sur
   une toile large comme le *viewport*, pas comme le contenu. En corrigeant, deux défauts voisins
   sont apparus : l'en-tête vivait **hors** de la zone défilante, donc ne suivait pas le défilement
   horizontal — les en-têtes cessaient de désigner les colonnes sous eux ; et une fois déplacé, il
   était rendu dans les **deux** issues du ternaire « vide / rempli », donc React le démontait à
   l'arrivée de la première lecture, emportant une saisie de filtre en cours et un popover ouvert.
   Ce troisième-là a été attrapé par les tests de `10d`, pas par l'œil.

35. **Un `overflow: hidden` posé pour un nom long découpait le menu projet.** La barre de titre le
   portait sur son bloc central pour qu'un nom de projet long rétrécisse au lieu de pousser les
   actions dehors. Le panneau du `Popover` s'ouvrant en absolu *sous* la barre, il était coupé net :
   cliquer la pastille ne faisait rien de visible. **Un test le couvrait déjà et était vert** —
   `toBeVisible()` de Playwright vérifie une boîte non vide et l'absence de `visibility: hidden`,
   et **ignore la découpe par un ancêtre**. Même piège que le n° 33, dans l'autre sens : là c'était
   `getBoundingClientRect`, ici l'assertion de visibilité de l'outil. Le correctif fait porter le
   rétrécissement au **texte qui doit rétrécir**, ce qui est de toute façon plus juste : ce n'est
   pas au conteneur de décider ce qu'on sacrifie.
36. **Un bouton actif et inerte fait croire à un défaut — davantage qu'un bouton désactivé.** `11b`
   avait laissé « Voir le SQL » et « Appliquer » cliquables en écrivant explicitement que les
   désactiver « ferait croire à un défaut ». L'utilisateur a cliqué, rien ne s'est produit, et il
   l'a signalé comme un défaut. `09f` avait déjà tranché l'inverse — action désactivée, raison dans
   l'infobulle — et sa règle valait ici aussi : **un clic sans effet ne s'explique pas, un bouton
   désactivé qui dit pourquoi, si.** Une décision de conception prise contre un précédent du projet
   mérite d'être justifiée par autre chose qu'une intuition.
37. **Le fond et le liseré d'une cellule tenaient la boîte du texte, pas la case.** `.row` centrait
   ses cellules (`align-items: center`) et leur hauteur de ligne était plus courte que la ligne :
   l'encadré ambre d'une cellule modifiée paraissait **collé à ses caractères**. Invisible aux
   tests, qui mesuraient la présence du liseré et la couleur du fond, jamais leur **étendue**. Le
   test qui mord compare la hauteur de la cellule à celle de la ligne *et* le centre du texte à
   celui de la case — car le correctif de hauteur pouvait décaler tous les textes de la grille d'un
   cran, un défaut pire que celui qu'il réparait. Au passage, un `align-items: stretch` ajouté « en
   ceinture » ne changeait rien à la mesure une fois la hauteur de ligne corrigée : il a été retiré
   plutôt que gardé sans rien défendre.

38. **Glisser une poignée de panneau sélectionnait le texte alentour.** `pointerdown` sur la poignée
   n'appelait pas `preventDefault`, et le navigateur démarrait une sélection qui surlignait les
   lignes de la grille sur tout le passage du curseur. Deux correctifs, parce que l'un ne suffit
   pas : `preventDefault` empêche la sélection de *démarrer*, et une classe posée sur `<body>` le
   temps du geste couvre celles que les moteurs relancent au mouvement. Aucun test ne pouvait le
   voir — jsdom n'a pas de sélection — d'où un e2e qui mesure `user-select` sur une cellule pendant
   le glissement. **Sa première version comparait `getSelection()` et restait verte sans le
   correctif** : Chromium ne produit pas de sélection dans ce scénario piloté.
39. **La latence du glissement : deux causes trouvées, aucune mesurée.** L'écriture dans
   `localStorage` avait lieu à *chaque* `pointermove` — synchrone, soixante fois par seconde — et
   chaque mouvement provoquait un rendu React qui faisait retraverser la grille virtualisée entière.
   Les deux sont corrigés et vérifiés par test : une seule écriture au relâchement, zéro rendu
   pendant le geste. **Mais le gain n'est pas mesurable dans Chromium** avec le décor de démo : 8,3
   ms par mouvement avant comme après, chiffre dominé par le protocole Playwright. Le défaut est
   signalé sur une base de 37 colonnes dans WKWebView, que rien ici ne reproduit. Ce qui est prouvé
   est la disparition des deux causes, pas celle du symptôme — et le dire autrement serait
   présenter un raisonnement comme une vérification.

40. **Deux modales oubliaient leur propre remplissage.** Le corps de `Modal` n'en pose aucun — une
   décision assumée d'`08a`, `A2` posant des marges différentes par bloc — donc c'est au contenu de
   le faire. Les modales de renommage (`08i`) et de retrait (`08j`) ne l'avaient pas fait : leurs
   blocs colorés touchaient les deux bords. Signalé à l'écran le 11 août 2026. Aucun test ne
   mesurait le retrait du contenu d'une modale ; deux e2e le font, en le comparant à l'en-tête plutôt
   qu'à une valeur en dur — et **pas au titre**, décalé de 33 px par la pastille d'icône.

41. **Un `SplitPane` sans `width: 100%`, invisible pendant six specs.** Le composant avait un
   `height: 100%` documenté par un défaut de `03` ; la largeur manquait. Personne ne l'a vu parce que
   son contenu était toujours large — une grille dense et un panneau de 296 px réclament de la place.
   La console de `12a`, dont le contenu ne réclame rien, n'a pris que 583 px sur 1183 et laissé un
   vide à droite. **Un composant de disposition dont la taille dépend de son contenu ne se révèle
   qu'avec un contenu qui n'en demande pas.**
42. **Trois éléments de table restaient affichés sous une console.** Le panneau droit proposait de
   « sélectionner une ligne », la barre d'état annonçait « 500 lignes · limit 500 » pour une requête
   qui n'avait pas tourné, et « Données / Structure » proposait deux vues d'une requête. Les trois
   sont apparus **à l'écran**, jamais aux tests : chacun testait son composant isolément, et aucun ne
   regardait l'écran assemblé autour d'un onglet d'une autre nature. C'est le pendant du défaut n° 4,
   où `A4` n'existait que dans la galerie.

43. **Un éditeur contrôlé perd des caractères, et deux gardes n'y changent rien.** `SqlEditor`
   réinjectait le texte reçu par prop dans le document de CodeMirror. L'écran renvoyant la valeur en
   retard d'un rendu, l'éditeur — déjà plus avancé — se voyait réécrire avec un texte plus ancien :
   taper « select 1 » donnait « slc ». Comparer au document, puis à la dernière valeur notifiée, n'a
   rien réglé — la course est structurelle. L'éditeur reçoit maintenant son texte **au montage**, et
   un texte imposé demande un remontage, ce que la `key` par onglet fait déjà. Cette `key`, retirée en
   `12a` faute de garantie mesurable, en a désormais une.
44. **Du CSS pour une classe que rien ne produisait.** `theme.ts` habillait `.cm-activeLine` alors
   qu'aucune extension ne la posait : `highlightActiveLine()` n'était pas chargée. Ni la ligne
   courante ni le CSS n'existaient vraiment, et rien ne le disait. Trouvé par le test qui mesurait le
   fond de cette ligne — un test écrit *après* le style, ce qui est l'ordre inverse de l'habitude et
   ce qui l'a rendu utile.
45. **Neuf exceptions non gérées, tous les tests verts, la suite en échec.** CodeMirror mesure son
   texte via `Range.getClientRects()`, absent de jsdom. Vitest compte ces exceptions et fait échouer
   le run — mode d'échec déroutant, puisque le rapport affiche « 614 passed » juste au-dessus. Le
   setup rend un tableau **vide** plutôt qu'une mesure inventée : dire « aucun rectangle » est la
   vérité sous jsdom, et Playwright vérifie tout ce qui dépend d'une mesure réelle.

46. **Le défaut de `06d` s'est reproduit à l'identique, trois specs plus tard.** `run_sql` lisait les
   valeurs par le protocole étendu, comme le reste du moteur : `jsonb` s'est lu `NULL`. La cause est
   la même — le format binaire — mais le remède de `06d` (transtyper dans le `select`) était
   interdit ici, le SQL étant celui de l'utilisateur. Le protocole simple, qui rend tout en texte, a
   résolu les deux. **Un défaut corrigé par un remède local revient dès que le contexte change.**
47. **Deux gardes ajoutés « par prudence » qui ne gardaient rien.** `setResultat(null)` avant
   d'afficher une erreur, et un `key` par console en `12a` : ni l'un ni l'autre ne changeait une
   mesure. Le premier parce que l'ordre d'affichage portait déjà la garantie ; le second parce que le
   texte venait de l'état — jusqu'à `12b`, où CodeMirror a rendu la `key` nécessaire. Retirer ce qui
   ne défend rien reste juste, **et il faut le remettre quand une dépendance change les règles**.

48. **Un bloc JSX dupliqué, et déjà divergent.** `12a` avait « extrait » le centre de l'écran pour le
   rendre seul en console — en réalité il l'avait **copié** dans les deux branches. Seize lignes plus
   tard, les ajouts de `12c` à `12e` n'étaient allés que dans la première copie, et l'écran de travail
   rendait deux centres différents selon le chemin. Trouvé en comptant les `<ConsoleView>` : il y en
   avait deux. **Un bloc dupliqué se répare une fois sur deux.** L'extraction, elle, a demandé quatre
   tentatives : `{centre}` en position d'expression est un objet vide, non un enfant JSX.

49. **Un DDL rejouable et pourtant faux : l'auto-incrément perdu.** `assembler_ddl` prenait le
   défaut d'une colonne dans `pg_attrdef`. Une colonne `GENERATED … AS IDENTITY` n'y est pas : son
   `default` est `NULL`. Le DDL rendait donc `id bigint NOT NULL`, qui **se rejoue sans erreur** — et
   produit une table dont la clé primaire n'a plus d'auto-incrément. Le test de rejeu, pourtant le
   critère le plus fort de `06c`, ne comparait que position, nom, type et nullité : il validait la
   copie mutilée. Trouvé en branchant `A9` (`14c`), qui met ce DDL sous les yeux. **Un test de rejeu
   ne vaut que ce que sa comparaison regarde** — le défaut, l'identité et la liste des index en font
   maintenant partie, et `schema-test-pg.sql` porte une table aux deux formes d'identité. La même
   inspection a montré que le DDL ne rendait pas non plus les `CREATE INDEX` : une copie qui se lit
   pareil et se requête cent fois plus lentement.
50. **`tsc --noEmit` ne vérifiait rien.** Le projet compile par `tsc -b` (références de projet) ;
   `pnpm tsc --noEmit` sort 0 sans regarder les fichiers de `src`. Un champ ajouté au domaine laissait
   seize littéraux incomplets, et la commande annonçait « aucune erreur ». **Une vérification qui ne
   peut pas échouer est un mensonge poli** — c'est `pnpm typecheck` qui mord, et c'est celle-là qu'il
   faut lancer.

51. **Le décor de démo portait le schéma d'une base réelle du commanditaire.** Quatre noms de
   tables, un nom de base, un nom d'utilisateur et un port venaient de sa base de test — commode
   pour construire un décor crédible, et indiscret : le dépôt, les captures de Playwright et les
   rapports de CI les publiaient. Signalé par l'utilisateur le 12 août 2026. Remplacés par des noms
   inventés **de même longueur**, puisque c'est d'elle que dépendent les propriétés mesurées (une
   bande d'onglets qui déborde). La règle est maintenant dans `AGENTS.md` : **un décor de test n'a
   jamais besoin d'être vrai, seulement cohérent.**

52. **Un `role="tablist"` sans navigation aux flèches.** Un commentaire du code affirmait que « le
   clavier y navigue par les flèches sans code à écrire ». C'est faux : un rôle ARIA **annonce** une
   convention, il n'en fournit aucun comportement. Un lecteur d'écran disait « onglet 1 sur 7 » et
   les flèches ne faisaient rien — le rôle était un mensonge à la voix. Trouvé par le test Playwright
   écrit pour vérifier la promesse du commentaire. Corrigé, avec le bouclage et le `tabIndex` unique
   que la convention demande aussi. Le gestionnaire part de l'onglet **focalisé** et non du
   sélectionné : les deux divergent dès qu'on porte le focus ailleurs.
53. **Une entrée `radio` découpée à un pixel, cliquable en jsdom et pas en Chromium.** L'habillage du
   handoff — carte d'aperçu, pastille de couleur — cachait la radio native par `clip-path`. Vitest
   passait, `check()` de Playwright expirait : un clic au centre d'une boîte d'un pixel atterrit sur
   ce qui la recouvre. La radio couvre maintenant son étiquette, transparente. **jsdom ne calcule
   aucune géométrie, donc il ne peut pas dire qu'un contrôle est atteignable.**
54. **La densité de grille ne pouvait pas venir d'un jeton CSS.** `--rowh` existait depuis `02` et
   `10a` annonçait « `15` la fera varier » — mais la virtualisation calcule quelles lignes monter en
   divisant le défilement par le pas, donc elle a besoin d'un **nombre**. Poser le jeton ne changeait
   rien à la grille. La préférence descend par les props, du seul endroit qui la détient. Trouvé en
   mesurant la hauteur d'une ligne réelle, pas la valeur du jeton — et le premier essai mesurait la
   ligne des filtres, qui a sa propre hauteur.
55. **Un compteur global au serveur ne prouve rien dans une suite parallèle.** Le test « `explain()`
   n'exécute pas » comparait `document.returned` de MongoDB avant et après. Il échouait sur
   « explain a lu 37 documents » — trente-sept que ses vingt-trois voisins avaient lus au même
   instant. La preuve est devenue **structurelle** : MongoDB ne rend `executionStats` que s'il a
   exécuté, donc son absence est le signal, et il est déterministe.
56. **Un facteur calibré au hasard rendait inatteignable une borne du handoff.** Le plancher de
   densité par corps de police valait `1,45 × corps + 2`, ce qui donnait 21 px au corps par défaut —
   et interdisait les 20 px que `--rowh-min` déclare et que le mockup montre atteignables. Le facteur
   est maintenant calibré pour rendre exactement cette borne. **Une constante choisie « à peu près »
   contredit tôt ou tard une valeur que le design a fixée.**

57. **Un test dont le décor lui donnait tort.** Le filtre « contient » de SQLite était vérifié en
   cherchant « gra » dans les noms d'ateliers, en attendant une seule réponse — or « Sérigraphie »
   contient « gra » autant que « Gravure ». Le test échouait en accusant le filtre alors qu'il avait
   raison. **Un décor dont deux valeurs partagent une sous-chaîne est plus honnête qu'un décor où
   chaque mot est unique** : il oblige à écrire l'assertion juste.
58. **« Tel qu'il a été tapé » était faux d'un préfixe.** `17b` affirmait que SQLite garde le DDL
   d'origine — vrai pour le corps, faux pour l'en-tête : `create table` devient `CREATE TABLE`, le
   reste est verbatim. La spec disait « tel qu'il a été tapé » sans réserve, et c'est le genre
   d'écart qu'on remarque en comparant à son fichier de migration, où l'on croit alors le fichier
   modifié. Le mot juste est « presque », et il a fallu un test pour le trouver.

59. **Un décor chargé en latin1, et un test qui accusait l'adaptateur.** `mysql-test.sh` versait le
   fichier SQL dans le client sans `--default-character-set=utf8mb4` : le client interprétait les
   octets UTF-8 comme du latin1, et « démarrage » entrait en base sous la forme « dÃ©marrage ». Le
   test de lecture échouait en désignant le code de lecture, qui était juste. **Un décor abîmé à
   l'écriture fait échouer les tests à la lecture** — et il faut penser à regarder le décor avant le
   code.
60. **Un `DATETIME` du catalogue demandé en `String` fait paniquer le pilote.** `mysql_async` rend
   `information_schema.tables.update_time` en `Value::Date` ; `get::<Option<String>, _>` ne rend pas
   `None`, il **panique** dans la crate. Le test s'est arrêté net à l'intérieur du pilote, sans
   message utile. La conversion passe maintenant par la fonction qui connaît déjà la forme des
   horodatages — une seule façon de les rendre dans tout le moteur.
61. **Deux tests employaient MySQL comme exemple de moteur non implémenté.** Livrer `16` les a fait
   échouer — l'un en réclamant un texte absent, l'autre en trouvant un bouton actif. Ni l'un ni
   l'autre ne mesurait ce qu'il annonçait : ils vérifiaient « un moteur sans adaptateur se dit », et
   MySQL avait cessé d'en être un. **Un test qui nomme un exemple doit être relu quand l'exemple
   change de camp**, et c'est l'implémentation qui le révèle.
62. **Un test d'écriture qui dépendait de la valeur du décor.** Le refus d'écrire sur MyISAM était
   vérifié en relisant `'démarrage'`, la valeur initiale. Un sabotage ayant réussi à écrire une fois,
   la restauration du code ne suffisait plus à faire repasser le test : le décor restait sali. La
   leçon de `11d` — chaque test d'écriture pose sa propre ligne — valait aussi pour un test qui vérifie
   qu'**aucune** écriture n'a lieu.

63. **Un drapeau du pilote MySQL, silencieusement sans effet.**
   `SslOpts::with_danger_skip_domain_validation` existe, se règle sans erreur, et ne fait **rien** avec
   `rustls` 0.23 : le vérificateur du pilote écrit
   `Err(ref e) if e.to_string().contains("NotValidForName")` — il compare l'**affichage** de l'erreur à
   sa forme `Debug`. L'affichage de rustls dit « certificate not valid for name "localhost" » : le mot
   n'y est pas, le bras ne se déclenche jamais. Trouvé parce qu'un test attendait que `verify-ca`
   accepte, et lisait un refus de nom d'hôte. **Filtrer une erreur sur son texte plutôt que sur sa
   variante marche jusqu'à ce que le texte change** — et le vérificateur écrit ici filtre sur la
   variante, ce que le sabotage n° 2 de `06f` a confirmé en reproduisant le défaut.
64. **Un job de CI déclaré deux fois, et la construction macOS qui ne tournait plus.** Une édition
   automatisée a coupé `ci.yml` aux mauvais indices : le job `engine` s'est retrouvé déclaré deux fois,
   et le **premier avait avalé les étapes du job `build`**. Or une clé dupliquée dans un mappage YAML
   ne fait pas échouer `yaml.safe_load` — le dernier gagne, en silence. Le `.app` n'était donc plus
   construit en CI, et rien ne le disait. Trouvé en relisant le fichier pour une autre raison.
   `scripts/verifier-ci.py` refuse maintenant un doublon **et** vérifie que le job `build` construit
   encore.
65. **Un garde qui criait sur du juste.** La première version de `verifier-ci.py` comptait les
   doublons de *toutes* les clés à deux niveaux d'indentation, et refusait donc un fichier correct :
   `runs-on` et `steps` existent légitimement dans chacun des deux jobs. **Un garde qui refuse du juste
   finit par être désactivé**, ce qui est pire que son absence — il ne surveille plus que les noms de
   jobs, qui sont ce qui avait cassé.

66. **Un serveur de développement résiduel, et deux fausses pistes.** `reuseExistingServer` étant
   vrai en local, Playwright réutilise ce qui écoute sur 5173 — et plusieurs barrières lancées en
   arrière-plan y avaient laissé huit processus. Symptôme : **les 175 tests** expirent à 30 s, ou les
   captures de référence diffèrent de 10 % des pixels. Cela ressemble trait pour trait à une
   régression de rendu, et j'ai cherché deux fois dans le code avant de regarder le port. **Une panne
   qui touche tous les tests à la fois n'est presque jamais dans le code** — c'est le décor ou
   l'environnement. Consigné au § 9 de `REPRISE.md`.

67. **Quatre primitives avaient oublié leur `box-sizing`, et l'interface était coupée au bord droit.**
   Le projet n'a **pas** de `box-sizing: border-box` global — c'est une décision documentée dans
   `reset.css`, chaque primitive déclare la sienne. Quatre ne l'avaient pas fait, et l'erreur ne se
   voyait dans aucune vitrine : une variante `.fill` en `width: 100%` ajoutait son filet aux 100 %
   (1 px), un bouton de pied de sidebar dépassait de 6 px, un panneau de détail figé à la mesure du
   mockup (`width: 300px`) vivait dans un panneau redimensionnable de 296. **Chacun poussait le
   suivant**, et le bord droit de la fenêtre était coupé. Le mockup, lui, ne redimensionne rien : une
   mesure prise sur lui est juste et cesse de l'être dès qu'un voisin décide la largeur.
   Correction : le `border-box` là où il manquait, et la mesure de 300 px déplacée dans le conteneur
   de la galerie — c'est la vitrine qui donne la largeur, pas le composant.
68. **La grille de la vue structure écrasait ses colonnes au lieu de défiler.** `DataTable` posait
   `width: 100%` et `table-layout: fixed` sans conteneur défilable : dix-huit colonnes se partageaient
   la largeur disponible, une trentaine de pixels chacune, et la molette n'avait **rien à faire
   défiler** puisque rien ne débordait. Le défaut se lisait comme « le défilement horizontal n'est pas
   supporté », alors qu'il n'y avait pas de débordement à supporter. Une largeur minimale calculée
   depuis les colonnes déclarées, dans une enveloppe en `overflow: auto`, rend le geste natif.
69. **Une barre de défilement là où personne n'en avait demandé — et l'axe le disait.** Une barre
   apparaissait dans la bande d'onglets, à côté de « Données », dans 34 px de haut. Elle était
   **verticale**, ce qui écarte d'emblée le nombre d'onglets. `TabStrip` rend 35 px pour 34 déclarés —
   une fidélité assumée, son filet bas s'ajoutant en `content-box` — et le CSS veut qu'un axe en `auto`
   force l'autre à quitter `visible` : en posant `overflow-x: auto` sur l'enveloppe, on avait rendu son
   axe vertical défilable **sans le demander**. Le pixel de trop suffisait. Retiré à sa source : dans
   cette composition, le conteneur dessine déjà le même filet, les deux se superposaient.
70. **Un commentaire qui affirmait une propriété de l'environnement.** Trois feuilles portaient
   « macOS ne montre la barre de défilement qu'au geste, donc rien ne s'ajoute à la trame ». C'est vrai
   d'*une* configuration de macOS, et faux dès que l'utilisateur règle « Afficher les barres :
   toujours » ou branche une souris. La barre de la sidebar coupait alors les noms de tables.
   **Une hypothèse d'environnement écrite comme une loi** : la règle qui la remplace ne dépend d'aucun
   réglage — barre fine, sans piste, curseur visible au survol.
71. **Le mockup portait le défaut, donc la fidélité ne pouvait pas trancher.** « SELECT dans console »
   demande 118 px de texte dans un bouton qui en offre 104 : il passait à la ligne, et deux lignes à
   l'interligne par défaut débordaient d'un bouton de 28 px. Le handoff a **exactement** les mêmes
   deux colonnes, le même corps et le même libellé — il ne rend simplement jamais ce cas, étant figé.
   Il y a donc des mesures qu'aucune comparaison au mockup ne fera : celles que le mockup n'a pas
   faites.
72. **Un test vert sur un ensemble vide.** L'assertion « aucun bouton ne déborde » filtrait les boutons
   débordants et comparait à `[]`. Elle passait — parce que la navigation ouvrait une table, où les
   actions du panneau de détail **n'existent pas** : elle mesurait zéro bouton. Le sabotage l'a laissée
   verte, ce qui est la seule façon de s'en apercevoir. Depuis, elle compte d'abord le bouton qu'elle
   prétend mesurer. **Toute assertion sur « aucun élément ne fait X » doit d'abord prouver qu'il y a
   des éléments.**
73. **Une mesure de barre de défilement ne prouve rien sous Chromium sans tête.** La première version
   du test de la bande mesurait l'épaisseur de la barre (`getBoundingClientRect().height -
   clientHeight`). Chromium sans tête rend des barres en survol, qui n'occupent aucune place : la
   mesure valait 0 avec **comme sans** la correction. Remplacée par la mesure de la *cause* — le
   débordement d'un pixel — qui, elle, se voit des deux côtés. La discrétion des barres de la sidebar
   (n° 70) reste, elle, **non vérifiable ici** : c'est dit plutôt que faussement testé.
74. **Une correction qui n'en était pas une : du code mort qui se lisait comme un correctif.** Le
   `box-sizing: border-box` ajouté à la variante `.fill` de la sidebar (n° 67) **n'a jamais pris
   effet** : il était déclaré *avant* `.root`, à spécificité égale, et c'est le dernier déclaré qui
   gagne — `.root` remettait `content-box`. Le commentaire affirmait donc le contraire de ce que
   faisait la page, ce qui est pire qu'une absence de correction. Le défaut visible ayant disparu par
   ailleurs, rien ne l'a signalé ; c'est une **mesure** écrite ensuite qui l'a trouvé, pas une
   relecture. Le bloc est maintenant placé après `.root`, et l'ordre est commenté comme étant la règle
   elle-même.
75. **`box-sizing` ne se règle pas par axe.** Le bouton « Nouvelle console » était en `content-box`
   pour une raison juste — la hauteur du handoff désigne le contenu, le filet s'ajoutant par-dessus,
   et `<button>` est en `border-box` par défaut. Mais la même déclaration vaut pour la **largeur**, et
   avec `width: 100%` les deux filets sortaient de la colonne : le bouton dépassait de 2 px. Ce
   débordement-là est **à l'intérieur** d'un panneau, donc l'assertion « rien ne sort de la fenêtre »
   ne le voyait pas. La réponse est de **convertir la valeur** — 28 px en `border-box` rend exactement
   ce que rendait 26 en `content-box` — et non de garder le modèle de boîte qui arrangeait un axe.
   Une mesure ciblée existe désormais : tout élément en `content-box` qui franchit le bord utile de son
   parent.

**Ce que ces défauts disent du décor de test.** Presque aucun n'était un défaut de logique : ils
tenaient à une **régularité du décor** — colonnes exotiques nulles, tables analysées, numéros
d'attribut qui coïncident, grille plus étroite que son cadre, `bigserial` partout. Une suite verte
sur un décor trop propre ne mesure que le décor. Depuis, `scripts/schema-test-pg.sql` porte une
ligne dont aucune colonne exotique n'est nulle, une table `numeric`, une table aux deux formes
d'identité, et la galerie une grille qui déborde.

**Une leçon des quatre moteurs, du n° 62 :** un test qui vérifie qu'**aucune** écriture n'a lieu doit
poser sa propre ligne, comme un test qui écrit. C'est le même raisonnement, et il n'était pas
évident : on croit qu'un test en lecture seule ne salit rien, alors que c'est le *sabotage* qui
salit — et le décor sali survit à la restauration du code.

**Et une leçon d'un autre ordre, du n° 51 :** un décor irrégulier n'a pas à être *réel*. Enrichir
un décor en y copiant une base de production le rend crédible et indiscret à la fois. Les noms
peuvent être inventés ; ce sont les longueurs, les quantités et les types qui font mordre les
tests.

**Une leçon des défauts de la capture du 18 août, des n° 67 à 75 :** ils partagent tous une
forme. Chaque composant était juste **dans sa vitrine**, et faux dès qu'un voisin décidait sa
largeur, qu'un réglage du système changeait le rendu, ou qu'un pixel de fidélité tombait dans un
conteneur qui n'en voulait pas. Une suite de tests organisée par écran ne les voit pas : elle
vérifie qu'un écran ressemble à son mockup, pas ce qui n'appartient à aucun écran.
`e2e/geometrie-reelle.spec.ts` existe pour ça — rien ne sort de la fenêtre, ce qui doit défiler
défile, ce qui a été rendu discret l'est resté.

**Et une leçon sur la vérification elle-même, des n° 74 et 75 :** deux des corrections de cette série
étaient fausses, et **aucune relecture ne les a vues** — l'une était du CSS mort caché par l'ordre des
règles, l'autre déplaçait le débordement à l'intérieur d'un panneau où la mesure existante ne
regardait pas. Ce sont deux mesures écrites *après coup* qui les ont trouvées. Corriger un défaut de
mise en page sans écrire la mesure qui le tient revient à changer du CSS en espérant.
