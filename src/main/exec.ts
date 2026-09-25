import { existsSync, openSync, readSync, closeSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { homedir } from 'node:os'

// An app launched from Finder does not inherit the user's shell PATH, and on
// this machine the PATH entries for both CLIs are forwarding shims that need a
// full shell environment. Resolve the real executables instead of trusting
// `which`, and hand child processes a PATH that can actually run them.

const EXTRA_DIRS = [
  join(homedir(), '.npm-global', 'bin'),
  join(homedir(), '.local', 'bin'),
  join(homedir(), '.bun', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin'
]

const NODE_DIRS = [
  join(homedir(), '.local', 'node-current', 'bin'),
  join(homedir(), '.nvm', 'current', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin'
]

/** True for wrappers that delegate to another CLI rather than being the CLI. */
function isShim(path: string): boolean {
  let fd: number | undefined
  try {
    fd = openSync(path, 'r')
    const bytes = Buffer.alloc(400)
    const count = readSync(fd, bytes, 0, bytes.length, 0)
    const head = bytes.toString('utf8', 0, count)
    return /tunnel\.py|\/Tunnel\/bin/.test(head)
  } catch {
    return false
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * Resolve a CLI to a real executable. `override` wins when set (the escape
 * hatch for unusual installs); otherwise PATH is searched before the common
 * install locations, skipping shims.
 */
export function resolveBinary(name: string, override?: string): string {
  if (override && existsSync(override)) return override

  const dirs = [...(process.env.PATH ?? '').split(':'), ...EXTRA_DIRS].filter(Boolean)
  for (const dir of dirs) {
    const candidate = join(dir, name)
    if (existsSync(candidate) && !isShim(candidate)) return candidate
  }
  return name
}

/** A local Manager employee can reach the host CLI from any nested workspace. */
export function managerCliRoot(cwd?:string,workRoot?:string):string|undefined {
  if(cwd&&!workRoot)for(let folder=resolve(cwd);;folder=dirname(folder)){
    if(basename(folder)==='Agents-Managers'&&existsSync(join(folder,'.agents-company-manager')))return folder
    if(dirname(folder)===folder)break
  }
  return undefined
}

/** Environment for a spawned CLI, with node made available when we can find it. */
export function childEnv(cwd?: string,workRoot?:string): NodeJS.ProcessEnv {
  const path = process.env.PATH ?? ''
  const parts = path.split(':').filter(Boolean)
  const missing = NODE_DIRS.filter((d) => existsSync(join(d, 'node')) && !parts.includes(d))
  const manager=managerCliRoot(cwd,workRoot)&&cwd&&existsSync(join(cwd,'.agents-company','bin','agents'))?join(cwd,'.agents-company','bin'):undefined
  const env={...process.env}
  for(const key of ['AGENTS_WORKSPACE','AGENTS_TEAM_ROOT','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'])delete env[key]
  return { ...env, ...(workRoot&&cwd?{AGENTS_WORKSPACE:cwd,AGENTS_TEAM_ROOT:workRoot}:{}), PATH: [...(workRoot&&cwd?[join(cwd,'.agents-company','bin')]:[]),...(manager?[manager]:[]),...missing, ...parts].join(':') }
}
