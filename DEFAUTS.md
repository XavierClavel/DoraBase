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
