import type { KeyboardEvent } from 'react'

/** Block Space from being typed (use with onKeyDown on email / username / password fields). */
export function blockSpaceKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.key === ' ') e.preventDefault()
}

/** Remove all whitespace — covers paste and IME edge cases. */
export function stripWhitespace(value: string): string {
  return value.replace(/\s/g, '')
}
