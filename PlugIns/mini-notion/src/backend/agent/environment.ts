import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn, type SpawnOptions } from 'node:child_process';
import type { DataService } from '../service';
import { toWireResponse } from '../../core/protocol';
import packageInfo from '../../../package.json';

/** A process-level boundary, inherited by every tool, hook and subprocess. */
export async function agentEnvironment(
  service: DataService,
  pageId: string,
  token: string,
  conversationId: string,
  mode: 'agent' | 'plan' = 'agent',
) {
  if (process.platform !== 'darwin') throw new Error('Workspace 文件隔离目前需要 macOS sandbox-exec');
  const cwd = service.storage.spaceRoot(pageId);
  const runtime = service.storage.resolveWithinSpace(pageId, path.join(cwd, '.mininotion-runtime'));
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    for (let parent = path.dirname(cwd); parent !== path.dirname(parent); parent = path.dirname(parent)) {
      if (fs.existsSync(path.join(parent, '.git'))) {
        // A Workspace nested in another repository must own its project configuration root.
        execFileSync('git', ['init', '--quiet', cwd], { stdio: 'ignore' });
        break;
      }
    }
  }
  const ignore = path.join(cwd, '.gitignore');
  if (!fs.lstatSync(ignore, { throwIfNoEntry: false })?.isSymbolicLink()) {
    const contents = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
    if (!contents.split(/\r?\n/).includes('/.mininotion-runtime/'))
      fs.appendFileSync(
        ignore,
        `${contents && !contents.endsWith('\n') ? '\n' : ''}/.mininotion-runtime/\n`,
        { mode: 0o600 },
      );
  }
  for (const dir of ['bin', 'tmp', 'codex', 'claude'])
    service.storage.resolveWithinSpace(pageId, path.join(runtime, dir));
  const managedFile = (file: string) => {
    if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error('Agent 运行文件不能重定向到符号链接');
    return file;
  };
  const copy = (source: string, destination: string) => {
    if (fs.existsSync(source) && !fs.existsSync(destination))
      fs.copyFileSync(source, managedFile(destination));
  };
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  for (const name of ['config.toml', 'models_cache.json'])
    copy(path.join(codexHome, name), path.join(runtime, 'codex', name));
  const claudeHome = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  for (const name of ['settings.json']) copy(path.join(claudeHome, name), path.join(runtime, 'claude', name));
  copy(path.join(os.homedir(), '.claude.json'), path.join(runtime, 'claude', '.claude.json'));
  // Logging out must survive reconnects; import global credentials only on first use.
  for (const [source, target, filename] of [
    [codexHome, 'codex', 'auth.json'],
    [claudeHome, 'claude', '.credentials.json'],
  ]) {
    const marker = managedFile(path.join(runtime, target, '.auth-initialized'));
    if (fs.existsSync(marker)) continue;
    copy(path.join(source, filename), path.join(runtime, target, filename));
    fs.writeFileSync(marker, '', { mode: 0o600 });
  }

  // APFS copy-on-write clones let each Workspace customize plugins without changing global installs.
  for (const [source, target] of [
    service.workspace!.spaces![pageId].engine === 'codex' ? [codexHome, 'codex'] : [claudeHome, 'claude'],
  ])
    for (const name of ['skills', 'plugins', 'commands', 'agents', 'rules']) {
      const destination = path.join(runtime, target, name);
      if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink())
        fs.unlinkSync(destination);
      if (fs.existsSync(path.join(source, name)) && !fs.existsSync(destination))
        fs.cpSync(path.join(source, name), destination, {
          recursive: true,
          mode: fs.constants.COPYFILE_FICLONE,
        });
    }
  const bin = service.storage.resolveWithinSpace(pageId, path.join(runtime, 'bin', conversationId));
  const launcher = managedFile(path.join(bin, 'mininotion'));
  const socket = path.join(os.tmpdir(), `mn-agent-${randomUUID().slice(0, 12)}.sock`);
  const gateway = http.createServer(async (request, response) => {
    try {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/health') {
        response.end(JSON.stringify({ pid: process.pid, version: packageInfo.version }));
        return;
      }
      if (request.method !== 'POST' || request.url !== '/rpc') throw new Error('此连接仅提供空间 API');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) throw new Error('请求超过 64 MB');
        chunks.push(Buffer.from(chunk));
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      // Identity belongs to the transport, never to caller-supplied environment or JSON.
      const result = await service.request({ ...input, jsonrpc: '2.0', agentToken: token, client: 'agent' });
      response.end(JSON.stringify(toWireResponse(result)));
    } catch (error) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: { message: String(error) } }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    gateway.once('error', reject);
    gateway.listen(socket, resolve);
  });
  fs.chmodSync(socket, 0o600);
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  fs.writeFileSync(
    launcher,
    `#!/bin/sh\nexec env MINI_NOTION_SOCKET=${quote(socket)} MINI_NOTION_DATA_DIR=${quote(service.storage.directory)} ${process.versions.electron ? 'ELECTRON_RUN_AS_NODE=1 ' : ''}${quote(process.execPath)} ${quote(path.join(__dirname, 'cli.cjs'))} --no-start "$@"\n`,
    { mode: 0o700 },
  );
  const literal = (value: string) => JSON.stringify(fs.realpathSync(value));
  const profile = `(version 1)
(allow default)
(deny appleevent-send)
(deny lsopen)
(deny mach-lookup
  (global-name "com.apple.coreservices.appleevents")
  (global-name "com.apple.CoreServices.coreservicesd")
  (global-name "com.apple.coreservices.quarantine-resolver"))
(deny mach-priv-task-port)
(allow mach-priv-task-port (target same-sandbox))
(deny signal)
(allow signal (target same-sandbox))
(deny file-write*)
(allow file-write* (subpath ${literal(mode === 'plan' ? runtime : cwd)}) (literal "/dev/null") (literal "/dev/tty"))
(deny network-outbound (remote unix-socket))
(allow network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))
(allow network-outbound (remote unix-socket (path-literal ${literal(socket)})))
(deny file-read-data ${['workspace.json', 'changes.json', 'backups', 'history', 'conflicts', 'agents'].map((name) => `(subpath ${JSON.stringify(path.join(service.storage.directory, name))})`).join(' ')})
`;
  const env = {
    ...process.env,
    PATH: `${path.dirname(launcher)}:${process.env.PATH || ''}`,
    MINI_NOTION_SOCKET: socket,
    MINI_NOTION_DATA_DIR: service.storage.directory,
    MINI_NOTION_AGENT_TOKEN: token,
    CODEX_HOME: path.join(runtime, 'codex'),
    CLAUDE_CONFIG_DIR: path.join(runtime, 'claude'),
    TMPDIR: path.join(runtime, 'tmp'),
    TMP: path.join(runtime, 'tmp'),
    TEMP: path.join(runtime, 'tmp'),
    CLAUDE_CODE_TMPDIR: path.join(runtime, 'tmp'),
    GIT_CEILING_DIRECTORIES: path.dirname(cwd),
    ELECTRON_RUN_AS_NODE: undefined,
  };
  const processes = new Set<number>();
  const stopChildren = () => {
    const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number));
    const tree = [...processes];
    for (let index = 0; index < tree.length; index++)
      for (const [pid, parent] of rows) if (parent === tree[index] && !tree.includes(pid)) tree.push(pid);
    // Kill parent shells before their sleeps/commands, so `sleep; write` cannot continue on cancellation.
    for (const pid of tree.filter((pid) => !processes.has(pid))) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already exited */
      }
    }
  };
  return {
    cwd,
    runtime,
    env,
    launcher,
    mode,
    stopChildren,
    spawn(binary: string, args: string[], options: SpawnOptions = {}) {
      const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, binary, ...args], {
        ...options,
        cwd,
        detached: true,
        env: options.env || env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (child.pid) processes.add(child.pid);
      child.once('exit', () => {
        if (child.pid) processes.delete(child.pid);
      });
      const kill = child.kill.bind(child);
      child.kill = (signal = 'SIGTERM') => {
        let sent = false;
        if (child.pid && child.exitCode === null) {
          try {
            process.kill(-child.pid, signal);
            sent = true;
          } catch {
            /* process already exited */
          }
        }
        return kill(signal) || sent;
      };
      return child;
    },
    close(force = false) {
      stopChildren();
      if (force)
        for (const pid of processes) {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch {
            /* already exited */
          }
        }
      gateway.close();
      fs.rmSync(socket, { force: true });
    },
  };
}
export type AgentEnvironment = Awaited<ReturnType<typeof agentEnvironment>>;
