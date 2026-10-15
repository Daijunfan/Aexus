// Lets the CLI see the interface, not just the data behind it.
//
// Every check here goes through the real renderer: the request is forwarded to
// the window, the window answers with what is actually on screen, and the
// answer comes back. That is what makes it possible to catch a bug where the
// store is correct but nothing rendered.

import { BrowserWindow, type WebContents } from 'electron'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

let primaryWindow:()=>BrowserWindow|undefined=()=>BrowserWindow.getAllWindows()[0]
export function setPrimaryWindow(get:()=>BrowserWindow|undefined){primaryWindow=get}
const ready = new WeakSet<WebContents>()
export function rendererReady(contents: WebContents) { return ready.has(contents) }
export function setRendererReady(contents: WebContents, value: boolean) { value ? ready.add(contents) : ready.delete(contents) }

const pending = new Map<string, Pending>()
let nextId = 1

/** Called from the renderer with the answer to a UI request. */
export function resolveUiRequest(id: string, data: unknown, error?: string): void {
  const entry = pending.get(id)
  if (!entry) return
  clearTimeout(entry.timer)
  pending.delete(id)
  if (error) entry.reject(new Error(error))
  else entry.resolve(data)
}

/**
 * Ask the renderer to do something and return its answer. Fails clearly when
 * no window is open, since there is nothing to inspect in that case.
 */
export function askRenderer<T = unknown>(
  op: string,
  args: Record<string, unknown> = {},
  timeoutMs = 8000
): Promise<T> {
  const win = primaryWindow()
  if (!win) return Promise.reject(new Error('no window is open'))

  const id = `ui_${nextId++}`
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`the interface did not answer '${op}' within ${timeoutMs}ms`))
    }, timeoutMs)
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
    win.webContents.send('ui:request', { id, op, args })
  })
}
