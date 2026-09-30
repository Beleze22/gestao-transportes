import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PortaoSessao from './components/PortaoSessao.jsx'
import ErroFatal from './components/ErroFatal.jsx'

// O App não é montado direto: quem decide entre a tela de login e o app é o PortaoSessao,
// e ele precisa estar acima do App para que nenhuma consulta ao banco aconteça sem sessão.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErroFatal>
      <PortaoSessao />
    </ErroFatal>
  </StrictMode>,
)
