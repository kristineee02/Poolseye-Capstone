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
/** Dev/demo registry — mirrors web localStorage key until backend is ready */
export const REGISTRY_KEY = 'poolseye-lifeguard-registry';

export const INITIAL_REGISTRY_SEED = {
  'jonas@poolseye.com': {
    password: 'lifeguard123',
    mustChangePassword: true,
    name: 'Jonas Ramos',
    initials: 'JR',
    role: 'Primary Lifeguard',
    lifeguardId: 'lg-001',
    status: 'active',
  },
};

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  'qwerty123',
  'lifeguard',
  'admin123',
  'poolseye',
]);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

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
    shiftStart: account.shiftStart || null,
    shiftEnd: account.shiftEnd || null,
    photoUri: account.photoUri || null,
    mustChangePassword: Boolean(mustChangePassword),
  };
}

function accountFromRegistry(email, registryEntry) {
  return {
    email,
    name: registryEntry.name,
    initials: registryEntry.initials,
    role: registryEntry.role || 'Lifeguard',
    shiftStart: registryEntry.shiftStart || null,
    shiftEnd: registryEntry.shiftEnd || null,
    status: registryEntry.status || 'active',
    photoUri: registryEntry.photoUri || null,
  };
}

export function getRegistryEntry(email, registry = {}) {
  return registry[normalizeEmail(email)] || null;
}

export function getTempPasswordForEmail(email, registry = {}) {
  const normalized = normalizeEmail(email);
  const entry = registry[normalized];
  if (entry?.password) return entry.password;
  if (normalized === DEMO_LIFEGUARD.email) return DEMO_LIFEGUARD.password;
  return null;
}

export function mergeRegistrySeed(existing = {}) {
  return { ...INITIAL_REGISTRY_SEED, ...existing };
}

/**
 * @param {string} email
 * @param {string} password
 * @param {{ storedCreds?: object|null, registry?: Record<string, object> }} options
 */
export function checkLifeguardLogin(email, password, options = {}) {
  const { storedCreds = null, registry = {} } = options;
  const normalized = normalizeEmail(email);
  if (!normalized || !password) return null;

  const registryEntry = registry[normalized];

  if (registryEntry?.status === 'archived') return null;

  // Updated password saved on this device after first-login change
  if (storedCreds?.email === normalized && storedCreds.password === password) {
    if (registryEntry) {
      return buildUser(accountFromRegistry(normalized, registryEntry), {
        mustChangePassword: storedCreds.mustChangePassword === true,
      });
    }
    if (normalized === DEMO_LIFEGUARD.email) {
      return buildUser(DEMO_LIFEGUARD, {
        mustChangePassword: storedCreds.mustChangePassword === true,
      });
    }
    return null;
  }

  // Built-in demo account
  if (normalized === DEMO_LIFEGUARD.email) {
    const expectedPassword = registryEntry?.password || DEMO_LIFEGUARD.password;
    if (password !== expectedPassword) return null;
    const usingTempPassword = password === DEMO_LIFEGUARD.password;
    const mustChangePassword =
      usingTempPassword ||
      registryEntry?.mustChangePassword === true ||
      storedCreds?.mustChangePassword === true;
    return buildUser(DEMO_LIFEGUARD, { mustChangePassword });
  }

  // Admin-created local registry accounts
  if (!registryEntry) return null;
  if (password !== registryEntry.password) return null;

  const mustChangePassword = registryEntry.mustChangePassword !== false;
  return buildUser(accountFromRegistry(normalized, registryEntry), { mustChangePassword });
}

export function findRegistryEmail(email, registry = {}) {
  const normalized = normalizeEmail(email);
  if (registry[normalized]) return normalized;
  if (normalized === DEMO_LIFEGUARD.email) return normalized;
  return null;
}
