const { run } = require('./db')

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/

function isExpoPushToken(token) {
  return typeof token === 'string' && EXPO_TOKEN_RE.test(token)
}

/**
 * Send one notification to many Expo push tokens. Tokens Expo reports as
 * DeviceNotRegistered (app uninstalled / signed out elsewhere) are cleared.
 * Returns how many devices Expo accepted.
 */
async function sendPush(db, tokens, { title, body, data = {}, urgent = false }) {
  const valid = [...new Set(tokens.filter(isExpoPushToken))]
  let accepted = 0
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100)
    const messages = chunk.map((to) => ({
      to,
      title,
      body,
      data,
      sound: 'default',
      priority: urgent ? 'high' : 'default',
      channelId: urgent ? 'alerts' : 'default',
    }))
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      })
      const json = await res.json().catch(() => ({}))
      const tickets = Array.isArray(json.data) ? json.data : []
      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j]
        if (ticket.status === 'ok') {
          accepted++
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          await run(db, 'UPDATE users SET push_token = NULL WHERE push_token = ?', [chunk[j]])
        }
      }
    } catch (err) {
      console.error('Expo push failed:', err.message)
    }
  }
  return accepted
}

module.exports = { sendPush, isExpoPushToken }
