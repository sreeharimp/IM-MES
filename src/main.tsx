import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import './index.css'
import App from './App.tsx'
import AppInspection from './AppInspection.tsx'
import theme from './theme'

const isFullMode = 
  import.meta.env.VITE_APP_MODE === 'full' || 
  window.location.search.includes('mode=full') || 
  localStorage.getItem('appMode') === 'full';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {isFullMode ? <App /> : <AppInspection />}
    </ThemeProvider>
  </StrictMode>,
)
