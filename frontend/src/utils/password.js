/** Client-side password rules (admin temp passwords + settings). */

export function getPasswordChecks(password) {
  const value = String(password || '')
  const hasLength = value.length >= 8
  const hasLower = /[a-z]/.test(value)
  const hasUpper = /[A-Z]/.test(value)
  const hasNumber = /[0-9]/.test(value)
  const hasSpecial = /[^A-Za-z0-9]/.test(value)

  return [
    { key: 'length', label: 'At least 8 characters', met: hasLength },
    { key: 'case', label: 'Contains uppercase and lowercase letters', met: hasLower && hasUpper },
    { key: 'number', label: 'Contains at least one number', met: hasNumber },
    { key: 'special', label: 'Contains a special character', met: hasSpecial },
  ]
}

export function validatePassword(password) {
  const checks = getPasswordChecks(password)
  if (checks.some((c) => !c.met)) {
    return { ok: false, error: 'Password does not meet the requirements.' }
  }
  return { ok: true }
}

export function getPasswordStrength(password) {
  const value = String(password || '')
  if (!value) return { level: 'empty', label: '', fill: 0 }

  const hasLength = value.length >= 8
  const hasLower = /[a-z]/.test(value)
  const hasUpper = /[A-Z]/.test(value)
  const hasNumber = /[0-9]/.test(value)
  const hasSpecial = /[^A-Za-z0-9]/.test(value)

  if (hasLength && hasLower && hasUpper && hasNumber && hasSpecial) {
    return { level: 'strong', label: 'Strong', fill: 100 }
  }
  if (hasLength && (hasLower || hasUpper) && hasNumber) {
    return { level: 'medium', label: 'Medium', fill: 66 }
  }
  return { level: 'weak', label: 'Weak', fill: 33 }
}
