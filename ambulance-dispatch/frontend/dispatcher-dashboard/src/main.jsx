import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AppStartup } from './components/SplashScreen.jsx'

const crewApp = /^#\/driver(?:\/|\?|$)/.test(window.location.hash)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppStartup tagline={crewApp ? 'Crew app' : 'Dispatch center'}>
      <App />
    </AppStartup>
  </StrictMode>,
)
