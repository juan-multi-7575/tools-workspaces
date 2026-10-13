/**
 * The announced half of the required-field gate.
 *
 * The message is a live region so a screen reader hears it the moment the field
 * fails, and it is wired to the input with `aria-describedby`, so the field
 * itself names the problem when focus returns to it. Both halves are needed:
 * `role="alert"` alone says something changed without saying *which* control,
 * and `aria-describedby` alone is silent until the user tabs back.
 */
export default function RequiredFieldError({
  id,
  message,
  className = '',
}: {
  id: string
  message: string
  /** The host page's own ink. This notice is mounted on cream boards and on
      dark faceplates alike, so it carries none of its own colour. */
  className?: string
}) {
  return (
    <p id={id} role="alert" className={`text-xs font-semibold leading-snug ${className}`}>
      {message}
    </p>
  )
}
