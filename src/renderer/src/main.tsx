import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installUiInspector } from './uiInspector'
import '@vscode/codicons/dist/codicon.css'
import './styles/base.css'
import './styles/session.css'
import './styles/chat.css'
import "./styles/office.css"
import "./styles/panels.css"
import './styles/canvas.css'
import './styles/pets.css'
import './styles/themes.css'
import './styles/workbench.css'
// Lets the CLI inspect what is on screen, so tests can assert rendering.
installUiInspector((a) => (window as any).agents.answerUi(a))

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
