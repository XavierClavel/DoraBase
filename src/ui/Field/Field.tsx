import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cx } from '../cx'
import styles from './Field.module.css'

/**
 * Aucune correction automatique de la saisie.
 *
 * **Ce champ sert à saisir des identifiants techniques** : un nom d'hôte, un nom d'utilisateur,
 * un nom de base. macOS y applique par défaut la capitale initiale et la correction
 * orthographique — `localhost` devenait `Localhost`, et une connexion échouait pour une majuscule
 * que l'utilisateur n'avait pas tapée.
 *
 * Les quatre attributs sont nécessaires : `autoCapitalize` pour la capitale, `autoCorrect` pour la
 * substitution (WebKit), `spellCheck` pour le soulignement rouge, `autoComplete` pour que le
 * navigateur ne propose pas une valeur d'un autre formulaire. Ils sont étalés **avant** `rest` :
 * un appelant qui aurait une raison d'en vouloir un peut le rétablir.
 */
export const SANS_CORRECTION = {
  autoCapitalize: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  autoComplete: 'off',
} as const

type FieldSize = 'sm' | 'md'

type FieldProps = {
  /** Étiquette visible, et nom accessible du champ — obligatoire, jamais décorative. */
  label: string
  size?: FieldSize
  /** Rend la valeur en mono, comme le handoff le fait pour toute valeur technique. */
  mono?: boolean
  /**
   * Contenu placé **dans** la boîte du champ, à droite de la valeur.
   *
   * Deux champs de `A2` en ont besoin : le mot de passe (œil + badge « Trousseau ») et la
   * clé privée du panneau proxy (bouton « Parcourir… »). Les poser à côté du champ plutôt
   * que dedans changerait la largeur de la grille — le mockup les met à l'intérieur, sous
   * la même bordure.
   */
  suffix?: ReactNode
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>

export function Field({
  label,
  size = 'md',
  mono = false,
  suffix,
  className,
  id,
  ...rest
}: FieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={styles.root}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      {suffix ? (
        // Avec un suffixe, la bordure et le fond passent à l'enveloppe : sur l'`<input>`,
        // ils s'arrêteraient avant le suffixe et couperaient la boîte en deux.
        <div className={cx(styles.wrap, styles[size], className)}>
          <input
            id={inputId}
            className={cx(styles.bare, mono && styles.mono)}
            {...SANS_CORRECTION}
            {...rest}
          />
          {suffix}
        </div>
      ) : (
        <input
          id={inputId}
          className={cx(styles.input, styles[size], mono && styles.mono, className)}
          {...SANS_CORRECTION}
          {...rest}
        />
      )}
    </div>
  )
}
