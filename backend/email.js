

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

function verificationEmailHtml({ title, intro, code, ignoreLine }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 24px 48px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding-bottom:36px;">
              <span style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:#1E6FFF;">PoolsEye</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:16px;">
              <span style="font-size:22px;line-height:1.3;font-weight:800;color:#111827;">&#128274;&nbsp; ${title}</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;font-size:16px;line-height:1.55;color:#374151;">
              ${intro}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 0 12px;">
              <span style="font-size:40px;line-height:1;font-weight:800;letter-spacing:6px;color:#111827;">${code}</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;font-size:13px;line-height:1.4;color:#9CA3AF;">
              This code expires in 10 minutes
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;font-size:15px;line-height:1.55;color:#374151;">
              ${ignoreLine}
            </td>
          </tr>
          <tr>
            <td align="center" style="font-size:15px;line-height:1.4;color:#111827;">
              The PoolsEye Team
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function sendVerificationCodeEmail(to, code) {
  const subject = 'PoolsEye — verify your email'
  const text = [
    'Verify your email',
    '',
    'You are verifying an email address for a PoolsEye lifeguard account. Enter this code to continue:',
    '',
    code,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this code, you can ignore this email.',
    '',
    'The PoolsEye Team',
  ].join('\n')

  return sendEmail({
    to,
    subject,
    text,
    html: verificationEmailHtml({
      title: 'Verify your email',
      intro: 'You are verifying an email address for a PoolsEye lifeguard account. Enter this code to continue:',
      code,
      ignoreLine: 'If you did not request this code, you can ignore this email.',
    }),
  })
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

async function sendPasswordResetCodeEmail(to, code, { audience = 'lifeguard' } = {}) {
  const who = audience === 'admin' ? 'admin account' : 'lifeguard account'
  const intro = `You are resetting the password for your PoolsEye ${who}. Enter this code to continue:`
  const subject = 'PoolsEye — password reset code'
  const text = [
    'Reset your password',
    '',
    intro,
    '',
    code,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this code, you can ignore this email.',
    '',
    'The PoolsEye Team',
  ].join('\n')

  return sendEmail({
    to,
    subject,
    text,
    html: verificationEmailHtml({
      title: 'Reset your password',
      intro,
      code,
      ignoreLine: 'If you did not request this code, you can ignore this email.',
    }),
  })
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
