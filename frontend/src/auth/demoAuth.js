// Demo login — replace with real auth later

export const DEMO_ADMIN = {
  email: 'admin@poolseye.com',
  password: 'admin123',
  name: 'Pia B.',
  initials: 'PB',
  role: 'Site admin',
}

export function checkAdminLogin(email, password) {
  const normalized = email.trim().toLowerCase()
  if (normalized === DEMO_ADMIN.email && password === DEMO_ADMIN.password) {
    return {
      email: DEMO_ADMIN.email,
      name: DEMO_ADMIN.name,
      initials: DEMO_ADMIN.initials,
      role: DEMO_ADMIN.role,
    }
  }
  return null
}

export const STORAGE_KEY = 'poolseye-admin-session'
