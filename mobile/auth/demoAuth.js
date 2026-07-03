// Demo login — replace with real auth later

export const DEMO_LIFEGUARD = {
  email: 'jonas@poolseye.com',
  password: 'lifeguard123',
  name: 'Jonas Ramos',
  initials: 'JR',
  role: 'On-duty lifeguard · primary',
  shiftStart: '06:00 AM',
  shiftEnd: '06:00 PM',
}

export function checkLifeguardLogin(email, password) {
  const normalized = email.trim().toLowerCase()
  if (normalized === DEMO_LIFEGUARD.email && password === DEMO_LIFEGUARD.password) {
    return {
      email: DEMO_LIFEGUARD.email,
      name: DEMO_LIFEGUARD.name,
      initials: DEMO_LIFEGUARD.initials,
      role: DEMO_LIFEGUARD.role,
      shiftStart: DEMO_LIFEGUARD.shiftStart,
      shiftEnd: DEMO_LIFEGUARD.shiftEnd,
    }
  }
  return null
}

export const STORAGE_KEY = 'poolseye-lifeguard-session'
