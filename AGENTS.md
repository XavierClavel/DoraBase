# AGENTS.md

Working agreements for AI agents on the DoraBase project.

> **Resuming work on this project? Read [`REPRISE.md`](REPRISE.md) first.** It records
> where the work stands, which decisions were already taken and why, the defects found and
> the verification methods that caught them. The specs say *what* to build; that document
> says *where we are*.

## Session start: ask for the working language

At the beginning of every session, **ask the user which language to communicate in**
before doing anything else. Ask it as the first message of the session, keep it to one
short question, and then stick to the chosen language for the whole session.

- This applies to conversation, explanations, questions, commit messages and specs.
- Code, identifiers, and technical file names stay in English regardless of the answer.
- If the user has already answered earlier in the session, do not ask again.

## Specs: small, readable, minimally scoped

The person commissioning the work needs to keep a solid mental model of the stack.
That only works if every spec can be read end to end in a few minutes.

**Rules:**

1. **One spec = one minimal scope.** A single feature, a single decision, a single
   deliverable. If a spec covers two things that could ship separately, split it.
2. **Keep it short.** Target under ~150 lines. If a spec grows past that, it is a sign
   the scope is too broad — split it, do not compress it.
3. **Never write a 1000-line mega spec.** Several small, linked specs always beat one
   giant document. Cross-reference them instead of inlining everything.
4. **Write for a re-reader.** Someone coming back three months later should understand
   the intent, the scope boundaries, and what was deliberately left out.
5. **State what is out of scope.** An explicit "Not in this spec" section is what keeps
   a spec small and honest.
6. **Split before writing, not after.** When a request is broad, propose the breakdown
   into small specs first and get it confirmed, rather than producing one big document.

**Suggested spec shape:**

```
# <Title>

## Goal
One or two sentences: what problem this solves.

## Scope
What this spec covers — the minimal useful slice.

## Not in this scope
Explicitly excluded, with a pointer to the spec that will handle it (if any).

## Approach
The decisions taken and why. Short.

## Done when
Checkable criteria.
```

Specs live in `specs/`, one file per scope, named `NN-short-slug.md`. Keep an index so
the set of specs stays navigable.

## Décors de test : rien de réel

Les tests, les décors de démo (`?demo`) et la galerie ne doivent **jamais** porter la structure
d'une base réelle du commanditaire — ni noms de tables, ni noms de colonnes, ni noms de bases,
ni identifiants, ni ports.

**Pourquoi :** un dépôt, une capture d'écran, un rapport de test ou un artefact de CI publie ce
qu'il contient. Un décor de test n'a jamais besoin d'être vrai, seulement **cohérent** — et les
propriétés qu'on mesure (une bande d'onglets qui déborde, une colonne trop longue) dépendent des
longueurs et des quantités, pas des noms.

**En pratique :** tous les noms sont **inventés** — projets, bases, tables, colonnes, hôtes. Les
identifiants de connexion sont fictifs, et `localhost:5432`.

Le 19 août 2026, le dépôt a été **relu entièrement** pour retirer le nom du commanditaire et celui de
son projet, présents dans 506 endroits : décors de test, démo, galerie, captures de fidélité,
identifiant de bundle, service du Trousseau, et jusque dans le fichier de handoff. L'historique Git a
été réécrit dans le même mouvement. Un nom réel dans un décor ne se remarque plus une fois écrit :
c'est à l'écriture qu'il faut le refuser.

## Notes

- `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only.
