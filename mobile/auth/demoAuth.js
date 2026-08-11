// Demo auth — admin-issued temp password + local password change
// Replace with real backend auth later

export const DEMO_LIFEGUARD = {
  email: 'jonas@poolseye.com',
  /** Admin-issued temporary password (first login) */
  password: 'lifeguard123',
  name: 'Jonas Ramos',
  initials: 'JR',
  role: 'On-duty lifeguard · primary',
  shiftStart: '06:00 AM',
  shiftEnd: '06:00 PM',
};

export const STORAGE_KEY = 'poolseye-lifeguard-session';
export const CREDS_KEY = 'poolseye-lifeguard-creds';

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
 * Live strength while typing: Weak | Good | Strong
 * progress = 0–1 for a single straight meter line
 */
export function getPasswordStrength(password, { email, tempPassword } = {}) {
  const value = String(password || '');
  if (!value) {
    return {
      level: 'empty',
      label: '',
      progress: 0,
      color: '#8FA3B8',
    };
  }

  let score = 0;
  const maxScore = 7;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[a-z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (
    !(tempPassword && value === tempPassword) &&
    !(email && value.toLowerCase() === String(email).trim().toLowerCase()) &&
    !COMMON_PASSWORDS.has(value.toLowerCase())
  ) {
    score += 1;
  }

  const blocked =
    (tempPassword && value === tempPassword) ||
    (email && value.toLowerCase() === String(email).trim().toLowerCase()) ||
    COMMON_PASSWORDS.has(value.toLowerCase());

  if (blocked) {
    return {
      level: 'weak',
      label: 'Weak',
      progress: 0.22,
      color: '#D6364A',
    };
  }

  const progress = Math.min(1, score / maxScore);

  if (score <= 3) {
    return { level: 'weak', label: 'Weak', progress: Math.max(progress, 0.28), color: '#D6364A' };
  }
  if (score <= 5) {
    return { level: 'good', label: 'Good', progress: Math.max(progress, 0.55), color: '#E6B800' };
  }
  return { level: 'strong', label: 'Strong', progress: Math.max(progress, 0.85), color: '#1B9C6E' };
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

export function buildUser(account, { mustChangePassword = false } = {}) {
  return {
    email: account.email,
    name: account.name,
    initials: account.initials,
    role: account.role,
    shiftStart: account.shiftStart,
    shiftEnd: account.shiftEnd,
    mustChangePassword: Boolean(mustChangePassword),
  };
}

export function checkLifeguardLogin(email, password, storedCreds = null) {
  const normalized = email.trim().toLowerCase();
  if (normalized !== DEMO_LIFEGUARD.email) return null;

  const expectedPassword = storedCreds?.password || DEMO_LIFEGUARD.password;
  if (password !== expectedPassword) return null;

  const usingTempPassword = password === DEMO_LIFEGUARD.password;
  const mustChangePassword =
    usingTempPassword || storedCreds?.mustChangePassword === true;

  return buildUser(DEMO_LIFEGUARD, { mustChangePassword });
}
