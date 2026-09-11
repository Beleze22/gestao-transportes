import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErroFatal from './components/ErroFatal.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErroFatal>
      <App />
    </ErroFatal>
  </StrictMode>,
)
