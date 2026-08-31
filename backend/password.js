/** Password rules for admin temp passwords and lifeguard password changes. */

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  'qwerty123',
  'lifeguard',
  'admin123',
  'poolseye',
])

function getPasswordChecks(password) {
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

function validatePassword(password, { email, tempPassword } = {}) {
  const value = String(password || '')
  const checks = getPasswordChecks(value)
  if (checks.some((c) => !c.met)) {
    return { ok: false, error: 'Password does not meet the requirements.' }
  }
  if (tempPassword && value === tempPassword) {
    return { ok: false, error: 'Choose a new password, not the temporary one.' }
  }
  if (email && value.toLowerCase() === String(email).trim().toLowerCase()) {
    return { ok: false, error: 'Password cannot be the same as your email.' }
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return { ok: false, error: 'That password is too common. Pick a stronger one.' }
  }
  return { ok: true }
}

module.exports = { getPasswordChecks, validatePassword }
