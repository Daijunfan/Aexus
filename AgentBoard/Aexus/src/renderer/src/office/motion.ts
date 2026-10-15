import {createContext} from 'react'
/** Visual playback only. Engine state, timers and unread receipts never depend on this. */
export const CanvasMotion=createContext(true)
