import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'
import App from './App.jsx'
import { StoreProvider } from './store/StoreContext.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AuthProvider>
  </StrictMode>,
)
