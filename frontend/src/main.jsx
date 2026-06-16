import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import './index.css'
import App from './App.jsx'

// Brand theme so MUI components (Tabs, DatePicker, color="primary" buttons, etc.)
// match the indigo-violet palette used across the app.
const theme = createTheme({
  palette: {
    primary: { main: '#5b4fe6' },
    secondary: { main: '#7c3aed' },
    success: { main: '#00b894' },
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        {/* Provides the date adapter context required by every MUI X DatePicker
            (without it they throw MUI X error #149). */}
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <App />
        </LocalizationProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
