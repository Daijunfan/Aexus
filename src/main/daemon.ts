import { startRuntime } from './runtime'
import { SOCKET_PATH } from '../shared/protocol'

const stop = startRuntime()
console.log(`Agents Company CLI service: ${SOCKET_PATH}`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void stop().finally(()=>process.exit(0)) })
}
