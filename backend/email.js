

const BREVO_API_KEY = process.env.BREVO_API_KEY
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

const brevoConfigured = Boolean(BREVO_API_KEY)

function parseSenderFromEnv() {
  const raw = process.env.BREVO_SENDER || process.env.SMTP_FROM || ''
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/)
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() }
  }
  const email = process.env.BREVO_SENDER_EMAIL || raw || 'noreply@poolseye.com'
  const name = process.env.BREVO_SENDER_NAME || 'PoolsEye'
  return { name, email }
}

async function sendEmail({ to, subject, text, html }) {
  const payload = {
    to,
    subject,
    text,
    html: html || text.replace(/\n/g, '<br>'),
  }

  if (!brevoConfigured) {
    console.info('[PoolsEye email demo]', JSON.stringify(payload, null, 2))
    return { ok: true, demo: true }
  }

  const sender = parseSenderFromEnv()
  const body = {
    sender: { name: sender.name, email: sender.email },
    to: [{ email: payload.to }],
    subject: payload.subject,
    textContent: payload.text,
    htmlContent: payload.html,
  }

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const message =
      errBody.message ||
      errBody.error ||
      (Array.isArray(errBody.code) ? errBody.code.join(', ') : errBody.code) ||
      `Brevo API error (${res.status})`
    throw new Error(message)
  }

  const data = await res.json().catch(() => ({}))
  return { ok: true, demo: false, messageId: data.messageId }
}

async function sendVerificationCodeEmail(to, code) {
  const subject = 'PoolsEye — verify your email'
  const text = [
    'Your PoolsEye verification code is:',
    '',
    code,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this, you can ignore this email.',
  ].join('\n')

  return sendEmail({ to, subject, text })
}

async function sendWelcomeEmail({ to, name, tempPassword }) {
  const subject = 'Welcome to PoolsEye — your lifeguard account'
  const text = [
    `Hi ${name || 'Lifeguard'},`,
    '',
    'Your PoolsEye lifeguard account has been created by an administrator.',
    '',
    `Email: ${to}`,
    `Temporary password: ${tempPassword}`,
    '',
    'Sign in to the PoolsEye mobile app with these credentials.',
    'You will be asked to change your password on first login.',
  ].join('\n')

  return sendEmail({ to, subject, text })
}

async function sendPasswordResetCodeEmail(to, code) {
  const subject = 'PoolsEye — password reset code'
  const text = [
    'Your PoolsEye password reset code is:',
    '',
    code,
    '',
    'This code expires in 10 minutes.',
    'If you did not request a reset, you can ignore this email.',
  ].join('\n')

  return sendEmail({ to, subject, text })
}

function isEmailConfigured() {
  return brevoConfigured
}

module.exports = {
  sendEmail,
  sendVerificationCodeEmail,
  sendWelcomeEmail,
  sendPasswordResetCodeEmail,
  isEmailConfigured,
}
