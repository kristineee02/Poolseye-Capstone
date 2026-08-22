require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { initDb, get } = require('./db')

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: 'http://localhost:5174', credentials: true }))
app.use(express.json())

let db

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const user = await get(
      db,
      'SELECT id, email, password_hash, name, role FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    )

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        initials: initials(user.name),
        role: user.role,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await get(
      db,
      'SELECT id, email, name, role FROM users WHERE id = ?',
      [payload.id]
    )
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        initials: initials(user.name),
        role: user.role,
      },
    })
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
})

initDb()
  .then((database) => {
    db = database
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to start backend:', err)
    process.exit(1)
  })