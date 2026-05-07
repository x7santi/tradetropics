export interface PasswordChecks {
  length: boolean   // >= 12 chars
  upper: boolean    // A-Z
  lower: boolean    // a-z
  number: boolean   // 0-9
  special: boolean  // !@#... etc
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4
  checks: PasswordChecks
  label: string
}

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const

export function scorePassword(pw: string): PasswordStrengthResult {
  const checks: PasswordChecks = {
    length:  pw.length >= 12,
    upper:   /[A-Z]/.test(pw),
    lower:   /[a-z]/.test(pw),
    number:  /[0-9]/.test(pw),
    special: /[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?`~]/.test(pw),
  }
  const score = Object.values(checks).filter(Boolean).length as 0 | 1 | 2 | 3 | 4
  return { score, checks, label: LABELS[score] }
}

export function isPasswordStrong(pw: string): boolean {
  const { checks } = scorePassword(pw)
  return Object.values(checks).every(Boolean)
}
