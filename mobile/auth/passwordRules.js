const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  'qwerty123',
  'lifeguard',
  'admin123',
  'poolseye',
]);

/**
 * Live checklist — core complexity rules only.
 */
export function getPasswordRuleChecks(password) {
  const value = String(password || '');
  return [
    { id: 'length', label: 'At least 8 characters', met: value.length >= 8 },
    { id: 'upper', label: 'One uppercase letter (A–Z)', met: /[A-Z]/.test(value) },
    { id: 'lower', label: 'One lowercase letter (a–z)', met: /[a-z]/.test(value) },
    { id: 'number', label: 'One number (0–9)', met: /[0-9]/.test(value) },
    {
      id: 'special',
      label: 'One special character (!@#$%…)',
      met: /[^A-Za-z0-9]/.test(value),
    },
  ];
}

/**
 * Password policy for PoolsEye (ISO 27001 access-control aligned):
 * - min 8 characters
 * - upper + lower + number + special character
 * - not temporary password / email / common passwords
 */
export function validateNewPassword(password, { email, tempPassword } = {}) {
  const value = String(password || '');
  if (value.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (!/[A-Z]/.test(value)) {
    return { ok: false, error: 'Include at least one uppercase letter (A–Z).' };
  }
  if (!/[a-z]/.test(value)) {
    return { ok: false, error: 'Include at least one lowercase letter (a–z).' };
  }
  if (!/[0-9]/.test(value)) {
    return { ok: false, error: 'Include at least one number (0–9).' };
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    return { ok: false, error: 'Include at least one special character (!@#$%).' };
  }
  if (tempPassword && value === tempPassword) {
    return { ok: false, error: 'Choose a new password, not the temporary one.' };
  }
  if (email && value.toLowerCase() === String(email).trim().toLowerCase()) {
    return { ok: false, error: 'Password cannot be the same as your email.' };
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return { ok: false, error: 'That password is too common. Pick a stronger one.' };
  }
  return { ok: true };
}
