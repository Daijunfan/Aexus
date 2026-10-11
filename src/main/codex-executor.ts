// Native Codex execution protocol over a private loopback WebSocket and SSH stdio.
// The model sees Codex's normal tools; no routing instructions or MCP namespace.
import { WebSocketServer } from 'ws'
import { createInterface } from 'node:readline'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { IncomingMessage } from 'node:http'
import {APP_HOME} from '../shared/protocol'
import { join } from 'node:path'
import { childEnv } from './exec'
import { python, tunnelDirectory, tunnelConfig } from './tunnel'
import type { RemoteTarget } from '../shared/remote'

/** The controller has a host path; execution environments retain native target paths. */
export function codexControlCwd(cwd:string,target?:RemoteTarget|null){return target?.os==='windows'?APP_HOME:cwd}
export async function openCodexExecutor(target: RemoteTarget) {
  const token = randomUUID(), children = new Set<ChildProcessWithoutNullStreams>()
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0,
    verifyClient: ({ req }: {req:IncomingMessage}) => !req.headers.origin && req.url === '/' + token })
  await once(server, 'listening')
  let lastError = ''
  server.on('connection', socket => {
    const child = spawn(python(), [join(tunnelDirectory(), 'native_executor.py')], { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
    children.add(child)
    child.stdin.write(JSON.stringify(tunnelConfig(target)) + '\n')
    child.stderr.on('data', data => { lastError = (lastError + data).slice(-3000) })
    child.on('error', error => { lastError = error.message; socket.close(1011, 'Working environment unavailable') })
    child.stdin.on('error', () => socket.close(1011, 'Working environment disconnected'))
    socket.on('message', data => child.stdin.write(data.toString() + '\n'))
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => { if (socket.readyState === 1) socket.send(line) })
    socket.on('error', () => socket.close())
    socket.on('close', () => {
      child.stdin.end()
      const timer = setTimeout(() => child.kill('SIGTERM'), 1500)
      timer.unref(); child.once('close', () => clearTimeout(timer))
    })
    child.on('close', () => { children.delete(child); lines.close(); socket.close() })
  })
  const address = server.address() as { port: number }
  return {
    url: `ws://127.0.0.1:${address.port}/${token}`,
    error: () => lastError,
    connected: () => children.size>0&&[...server.clients].some(client=>client.readyState===1),
    async close() {
      const stopping = [...children].map(child => {
        const done = once(child, 'close').catch(() => {})
        child.stdin.end()
        const timer = setTimeout(() => child.kill('SIGTERM'), 1500); timer.unref()
        return done.finally(() => clearTimeout(timer))
      })
      for (const client of server.clients) client.terminate()
      await new Promise<void>(resolve => server.close(() => resolve()))
      await Promise.all(stopping)
    }
  }
}
