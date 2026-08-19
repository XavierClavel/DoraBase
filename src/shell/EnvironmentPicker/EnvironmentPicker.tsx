import { useId } from 'react'
import type { Environment } from '../../domain/config'
import { ENVIRONMENT_ORDER, ENVIRONMENTS } from '../../screens/NewConnection/environments'
import { ListeDeroulante } from '../../ui/Select/ListeDeroulante'
import styles from './EnvironmentPicker.module.css'

type EnvironmentPickerProps = {
  value: Environment
  onValueChange: (environment: Environment) => void
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
export function EnvironmentPicker({ value, onValueChange }: EnvironmentPickerProps) {
  const id = useId()

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
          options={ENVIRONMENT_ORDER.map((environnement) => ({
            value: environnement,
            label: ENVIRONMENTS[environnement].label,
            // **Le point de couleur suit l'option dans la liste**, pas seulement le champ fermé :
            // c'est la couleur qui distingue `prod` d'un coup d'œil, et une liste sans elle
            // obligerait à lire trois libellés proches.
            ornement: (
              <span className={styles.dot} data-environment={environnement} aria-hidden="true" />
            ),
          }))}
          value={value}
          onValueChange={onValueChange}
          prefixe={<span className={styles.dot} data-environment={value} aria-hidden="true" />}
        />
      </span>
    </div>
  )
}
