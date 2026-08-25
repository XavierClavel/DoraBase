## Installation

> Cette version n'est **pas notariée** : elle a été construite sans les
> secrets de signature. macOS la refusera au premier lancement.

Téléchargez le `.dmg`, glissez **DoraBase** dans **Applications**, puis :

```bash
xattr -dr com.apple.quarantine /Applications/DoraBase.app
```

macOS 13 Ventura ou plus récent. Bundle universel : Apple Silicon et Intel.

## Changements

- chore(version): 0.1.5
- fix(publication): notarier l'image, et pas seulement l'application
- chore(version): 0.1.4
- fix(publication): un secret vide ne doit pas coûter vingt minutes
- chore(version): 0.1.3
- feat(publication): signer avec le Developer ID et notarier chez Apple

[Comparer v0.1.2…v0.1.5](https://github.com/g3wis/DoraBase/compare/v0.1.2...v0.1.5)
