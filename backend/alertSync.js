const clients = new Set()

function publishAlertChange(reason, eventId = null) {
  const payload = `event: alerts\ndata: ${JSON.stringify({ reason, eventId, at: Date.now() })}\n\n`
  for (const res of clients) {
    try { res.write(payload) } catch { clients.delete(res) }
  }
}

function addAlertClient(res) {
  clients.add(res)
  res.write(`event: ready\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`)
  return () => clients.delete(res)
}

module.exports = { addAlertClient, publishAlertChange }
