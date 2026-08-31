/**
 * Lifeguard accounts — temporary local persistence.
 * TODO: replace localStorage calls with fetch('/api/lifeguards') when backend is ready.
 */

import { lifeguards as seedLifeguards } from '../data/lifeguards'
import { validatePassword } from '../utils/password'

export const GUARDS_STORAGE_KEY = 'poolseye-lifeguards'
export const REGISTRY_STORAGE_KEY = 'poolseye-lifeguard-registry'
export const VERIFICATION_STORAGE_KEY = 'poolseye-email-verification'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_TTL_MS = 10 * 60 * 1000

function toInitials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function readGuards() {
  try {
    const raw = localStorage.getItem(GUARDS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeGuards(guards) {
  localStorage.setItem(GUARDS_STORAGE_KEY, JSON.stringify(guards))
}

function readRegistry() {
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeRegistry(registry) {
  localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(registry))
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function buildRegistryEntry(guard, password) {
  return {
    password,
    mustChangePassword: true,
    name: guard.name,
    initials: guard.initials,
    role: guard.role,
    lifeguardId: guard.id,
    status: guard.status || 'active',
    createdAt: guard.createdAt,
    photoUri: guard.photoUri || null,
  }
}

/** Seed mobile-login registry from demo lifeguards (dev/demo only). */
function ensureDemoRegistry() {
  const registry = readRegistry()
  let changed = false

  if (!registry['jonas@poolseye.com']) {
    registry['jonas@poolseye.com'] = {
      password: 'lifeguard123',
      mustChangePassword: true,
      name: 'Jonas Ramos',
      initials: 'JR',
      role: 'Primary Lifeguard',
      lifeguardId: 'lg-001',
      status: 'active',
    }
    changed = true
  }

  if (changed) writeRegistry(registry)
}

// TODO: replace with fetch('/api/lifeguards')
export function fetchLifeguards() {
  ensureDemoRegistry()
  return readGuards() ?? [...seedLifeguards]
}

function saveGuards(guards) {
  writeGuards(guards)
  return guards
}

function emailTaken(guards, email, excludeId = null) {
  const normalized = normalizeEmail(email)
  return guards.some(
    (g) => normalizeEmail(g.email) === normalized && g.id !== excludeId
  )
}

export function isValidEmail(email) {
  return EMAIL_RE.test(normalizeEmail(email))
}

function readVerifications() {
  try {
    const raw = localStorage.getItem(VERIFICATION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeVerifications(entries) {
  localStorage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(entries))
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function getVerificationEntry(email) {
  const normalized = normalizeEmail(email)
  const entries = readVerifications()
  const entry = entries[normalized]
  if (!entry) return null
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    delete entries[normalized]
    writeVerifications(entries)
    return null
  }
  return entry
}

export function isEmailVerified(email) {
  const entry = getVerificationEntry(email)
  return Boolean(entry?.verified)
}

export function clearEmailVerification(email) {
  const normalized = normalizeEmail(email)
  const entries = readVerifications()
  if (!entries[normalized]) return
  delete entries[normalized]
  writeVerifications(entries)
}

// TODO: replace with fetch('/api/lifeguards/verify-email/send', { method: 'POST', ... })
export function sendVerificationCode(email) {
  const normalized = normalizeEmail(email)
  if (!normalized) {
    return { ok: false, error: 'Email is required.' }
  }
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }

  const guards = fetchLifeguards()
  if (emailTaken(guards, normalized)) {
    return { ok: false, error: 'A lifeguard with this email already exists.' }
  }

  const code = generateVerificationCode()
  const entries = readVerifications()
  entries[normalized] = {
    code,
    verified: false,
    expiresAt: Date.now() + CODE_TTL_MS,
    sentAt: Date.now(),
  }
  writeVerifications(entries)

  console.info('[PoolsEye demo] Verification code for', normalized, ':', code)

  return {
    ok: true,
    demoCode: code,
    message: 'Verification code sent.',
  }
}

// TODO: replace with fetch('/api/lifeguards/verify-email/confirm', { method: 'POST', ... })
export function confirmVerificationCode(email, code) {
  const normalized = normalizeEmail(email)
  const trimmedCode = String(code || '').trim()

  if (!normalized) {
    return { ok: false, error: 'Email is required.' }
  }
  if (!/^\d{6}$/.test(trimmedCode)) {
    return { ok: false, error: 'Enter the 6-digit verification code.' }
  }

  const entry = getVerificationEntry(normalized)
  if (!entry) {
    return { ok: false, error: 'No active verification code. Send a new one.' }
  }
  if (entry.code !== trimmedCode) {
    return { ok: false, error: 'Incorrect verification code.' }
  }

  const entries = readVerifications()
  entries[normalized] = {
    ...entry,
    verified: true,
    verifiedAt: Date.now(),
  }
  writeVerifications(entries)

  return { ok: true, message: 'Email verified.' }
}

// TODO: replace with fetch('/api/lifeguards/welcome-email', { method: 'POST', ... })
export function sendWelcomeEmail({ email, name, tempPassword }) {
  const normalized = normalizeEmail(email)
  const payload = {
    to: normalized,
    subject: 'Welcome to PoolsEye — your lifeguard account',
    body: [
      `Hi ${name || 'Lifeguard'},`,
      '',
      'Your PoolsEye lifeguard account has been created.',
      `Temporary password: ${tempPassword}`,
      '',
      'Sign in to the mobile app with this email and temporary password.',
      'You will be asked to change your password on first login.',
    ].join('\n'),
  }

  console.info('[PoolsEye demo] Welcome email queued:', payload)

  return { ok: true, message: 'Welcome email sent.' }
}

// TODO: replace with fetch('/api/lifeguards', { method: 'POST', ... })
export function createLifeguard({ name, email, phone, role, assignedZones, tempPassword, photoUri = null }) {
  const trimmedName = String(name || '').trim()
  const normalizedEmail = normalizeEmail(email)

  if (!trimmedName) {
    return { ok: false, error: 'Name is required.' }
  }
  if (!normalizedEmail) {
    return { ok: false, error: 'Email is required.' }
  }
  if (!EMAIL_RE.test(normalizedEmail)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }

  const guards = fetchLifeguards()
  if (emailTaken(guards, normalizedEmail)) {
    return { ok: false, error: 'A lifeguard with this email already exists.' }
  }
  if (!isEmailVerified(normalizedEmail)) {
    return { ok: false, error: 'Verify the email address before creating an account.' }
  }

  const passwordCheck = validatePassword(tempPassword)
  if (!passwordCheck.ok) return passwordCheck

  const newGuard = {
    id: `lg-${Date.now()}`,
    initials: toInitials(trimmedName),
    name: trimmedName,
    email: normalizedEmail,
    phone: String(phone || '').trim(),
    role: role || 'Lifeguard',
    assignedZones: assignedZones || [],
    certifications: ['Lifeguard'],
    status: 'active',
    createdAt: new Date().toISOString(),
    mobileAppStatus: 'disconnected',
    channels: [{ label: 'App push', primary: true }],
    acknowledgedAlerts: 0,
    missedAlerts: 0,
    lastAlertAcknowledgedAt: null,
    onDutySince: null,
    mustChangePassword: true,
    photoUri: photoUri || null,
  }

  const nextGuards = [...guards, newGuard]
  saveGuards(nextGuards)

  const registry = readRegistry()
  registry[normalizedEmail] = buildRegistryEntry(newGuard, tempPassword)
  writeRegistry(registry)

  clearEmailVerification(normalizedEmail)

  return { ok: true, guard: newGuard }
}

// TODO: replace with fetch(`/api/lifeguards/${id}`, { method: 'PATCH', ... })
export function updateLifeguard(id, updates) {
  const guards = fetchLifeguards()
  const index = guards.findIndex((g) => g.id === id)
  if (index === -1) {
    return { ok: false, error: 'Lifeguard not found.' }
  }

  const current = guards[index]
  const trimmedName = String(updates.name ?? current.name).trim()
  const normalizedEmail = normalizeEmail(updates.email ?? current.email)

  if (!trimmedName) {
    return { ok: false, error: 'Name is required.' }
  }
  if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }
  if (emailTaken(guards, normalizedEmail, id)) {
    return { ok: false, error: 'A lifeguard with this email already exists.' }
  }

  const updated = {
    ...current,
    ...updates,
    name: trimmedName,
    email: normalizedEmail,
    initials: toInitials(trimmedName),
  }

  const nextGuards = [...guards]
  nextGuards[index] = updated
  saveGuards(nextGuards)

  const registry = readRegistry()
  const oldEmail = normalizeEmail(current.email)
  if (oldEmail !== normalizedEmail && registry[oldEmail]) {
    delete registry[oldEmail]
  }
  if (registry[oldEmail] || registry[normalizedEmail]) {
    const existing = registry[normalizedEmail] || registry[oldEmail]
    registry[normalizedEmail] = {
      ...existing,
      name: updated.name,
      initials: updated.initials,
      role: updated.role,
      lifeguardId: updated.id,
      status: updated.status === 'archived' ? 'archived' : 'active',
      photoUri: updated.photoUri || null,
    }
    writeRegistry(registry)
  }

  return { ok: true, guard: updated }
}

// TODO: replace with fetch(`/api/lifeguards/${id}/archive`, { method: 'POST' })
export function archiveLifeguard(id) {
  const guards = fetchLifeguards()
  const guard = guards.find((g) => g.id === id)
  if (!guard) return { ok: false, error: 'Lifeguard not found.' }

  const nextGuards = guards.map((g) =>
    g.id === id ? { ...g, status: 'archived' } : g
  )
  saveGuards(nextGuards)

  const registry = readRegistry()
  const email = normalizeEmail(guard.email)
  if (registry[email]) {
    registry[email] = { ...registry[email], status: 'archived' }
    writeRegistry(registry)
  }

  return { ok: true, guard: nextGuards.find((g) => g.id === id) }
}

// TODO: replace with fetch(`/api/lifeguards/${id}/restore`, { method: 'POST' })
export function restoreLifeguard(id) {
  const guards = fetchLifeguards()
  const guard = guards.find((g) => g.id === id)
  if (!guard) return { ok: false, error: 'Lifeguard not found.' }

  const nextGuards = guards.map((g) =>
    g.id === id ? { ...g, status: 'active' } : g
  )
  saveGuards(nextGuards)

  const registry = readRegistry()
  const email = normalizeEmail(guard.email)
  if (registry[email]) {
    registry[email] = { ...registry[email], status: 'active' }
    writeRegistry(registry)
  }

  return { ok: true, guard: nextGuards.find((g) => g.id === id) }
}
