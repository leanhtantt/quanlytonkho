// Sentry phải init trước mọi import khác để bắt lỗi sớm nhất
import './lib/sentry';
import * as Sentry from '@sentry/react';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'
import App from './App.jsx'
import { StoreProvider } from './store/StoreContext.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import ErrorFallback from './components/ui/ErrorFallback'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => <ErrorFallback error={error} resetError={resetError} />}>
      <AuthProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </AuthProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
