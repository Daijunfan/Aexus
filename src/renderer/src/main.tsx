import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import {api} from './api'
import {WebGate} from './web/Gate'
import './web/web.css'
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
import './styles/team-views.css'
// Lets the CLI inspect what is on screen, so tests can assert rendering.
installUiInspector((a) => (window as any).agents.answerUi(a))

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {api.mode==='web'?<WebGate><App /></WebGate>:<App />}
  </React.StrictMode>
)

import './styles/shared.css'
import './styles/company-views.css'
import './styles/messages.css'

import './styles/group-chat.css'
import './styles/messenger.css'
import './styles/message-surface.css'

import './styles/plan.css'
import './styles/audio-playback.css'
import './styles/voice-recorder.css'
import './styles/emoji-picker.css'

import './styles/channels.css'
