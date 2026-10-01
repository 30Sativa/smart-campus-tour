import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { QueryProvider } from './app/providers/query-provider'
import { router } from './app/router'
import './index.css'

import { ThemeProvider } from './app/providers/theme-provider'
import { AuthBootstrap } from './auth/AuthBootstrap'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <ThemeProvider>
        <AuthBootstrap>
          <RouterProvider router={router} />
        </AuthBootstrap>
      </ThemeProvider>
    </QueryProvider>
  </StrictMode>,
)
