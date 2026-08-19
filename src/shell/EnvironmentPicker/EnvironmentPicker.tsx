import { useId } from 'react'
import type { EnvironmentDeclaration, EnvironmentId } from '../../domain/config'
import { COULEURS_D_ENVIRONNEMENT } from '../../screens/NewConnection/environments'
import { ListeDeroulante } from '../../ui/Select/ListeDeroulante'
import styles from './EnvironmentPicker.module.css'

type EnvironmentPickerProps = {
  /**
   * Les environnements **du projet courant** (`23g`), dans leur ordre déclaré.
   *
   * Ils étaient lus depuis une table en dur de trois valeurs. Les recevoir en propriété est ce qui
   * garantit qu'aucun trio ne survit ailleurs : un projet à cinq environnements en montre cinq, sans
   * qu'une ligne de ce fichier le sache.
   */
  environments: readonly EnvironmentDeclaration[]
  value: EnvironmentId
  onValueChange: (environment: EnvironmentId) => void
}

/**
 * Le commutateur d'environnement de la barre de titre, **dans sa propre boîte**.
 *
 * Le handoff insiste : la pastille projet est une boîte blanche, puis « dans une seconde boîte
 * blanche séparée (margin-left 8 px) » vient ce sélecteur. Les fondre donnerait un bandeau
 * unique, où l'environnement se lirait comme une propriété du fil d'Ariane plutôt que comme un
 * commutateur — et le rendrait atteignable au clavier seulement après l'avoir traversé.
 *
 * **Sur `ListeDeroulante`, le composant maison** — plus de `<select>` natif, dont la liste ouverte
 * rendait le menu du système au milieu de l'interface (décidé le 19 août 2026). Il n'emploie pas
 * `Select` pour autant : la boîte fait 19 px et porte un point de couleur, soit trois écarts sur
 * quatre propriétés, ce qui ferait des surcharges plus longues que la primitive elle-même. Les deux
 * partagent donc la liste, pas l'habillage du champ.
 */
export function EnvironmentPicker({ environments, value, onValueChange }: EnvironmentPickerProps) {
  const id = useId()
  // La couleur de l'environnement actif. `slate` si l'identifiant ne désigne rien — un état que le
  // modèle refuse (`23a`), donc jamais vu, mais un rendu neutre vaut mieux qu'un plantage d'écran.
  const couleurActive =
    environments.find((declaration) => declaration.id === value)?.color ?? 'slate'

  return (
    <div className={styles.root}>
      {/* « ENV » nomme le contrôle, et le nomme par `aria-labelledby` : le champ n'est plus un
          `<select>` natif, donc un `<label for>` ne l'atteindrait pas. */}
      <span className={styles.legend} id={id}>
        env
      </span>
      <span className={styles.field}>
        <ListeDeroulante
          label="Environnement"
          labelledBy={id}
          className={styles.liste}
          options={environments.map((declaration) => ({
            value: declaration.id,
            label: declaration.label,
            // **Le point de couleur suit l'option dans la liste**, pas seulement le champ fermé :
            // c'est la couleur qui distingue `prod` d'un coup d'œil, et une liste sans elle
            // obligerait à lire trois libellés proches.
            ornement: (
              <span
                className={styles.dot}
                style={{ background: COULEURS_D_ENVIRONNEMENT[declaration.color] }}
                aria-hidden="true"
              />
            ),
          }))}
          value={value}
          onValueChange={onValueChange}
          prefixe={
            <span
              className={styles.dot}
              // **La couleur vient de la déclaration**, non d'un attribut lu par le CSS. Une table de
              // teintes par identifiant redeviendrait le trio en dur, sous une autre forme.
              style={{ background: COULEURS_D_ENVIRONNEMENT[couleurActive] }}
              aria-hidden="true"
            />
          }
        />
      </span>
    </div>
  )
}
