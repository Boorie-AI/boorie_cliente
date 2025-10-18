import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ClarityProvider } from './components/ClarityProvider'
import './index.css'
import 'mapbox-gl/dist/mapbox-gl.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClarityProvider>
      <App />
    </ClarityProvider>
  </React.StrictMode>,
)