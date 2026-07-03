import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'

import './styles/tokens.css'
import './styles/global.css'
import './components/layout/Topbar.css'
import './components/layout/NavRail.css'
import './components/layout/RightRail.css'
import './components/ui/primitives.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
