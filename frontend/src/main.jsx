import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import './index.css'
import './i18n'
import App from './App.jsx'

const gradient = 'linear-gradient(135deg, #4f46e5, #7c3aed)'

const theme = createTheme({
  palette: {
    primary: { main: '#5b4fe6' },
    secondary: { main: '#7c3aed' },
    success: { main: '#00b894' },
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },

        containedPrimary: {
          backgroundImage: gradient,
          boxShadow: '0 6px 16px rgba(79, 70, 229, 0.28)',
          '&:hover': { backgroundImage: gradient, filter: 'brightness(1.07)', boxShadow: '0 8px 22px rgba(79, 70, 229, 0.34)' },
        },
      },
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <App />
        </LocalizationProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
