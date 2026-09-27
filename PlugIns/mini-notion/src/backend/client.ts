import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { canonicalDirectory, defaultDataDirectory, socketPath, folderDataDirectory } from './paths';
import type { ApiResponse, CommandParams, ServiceEvent } from '../core/protocol';
import { fromWireResponse } from '../core/protocol';
import packageInfo from '../../package.json';
import {hostRequest,hostSubscribe} from './host';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}
export type ClientOptions = {
  hostRPC?: string;
  directory?: string;
  workspace?: string;
  executable?: string;
  serverPath?: string;
  clientId?: string;
  autoStart?: boolean;
};

export class BackendClient {
  readonly directory: string;
  readonly workspaceRoot?: string;
  readonly socket: string;
  readonly clientId: string;
  private starting?: Promise<void>;
  private checkedPid?: number;
  constructor(readonly options: ClientOptions = {}) {
    // A host-bound CLI needs no socket or ancestor-directory inspection. In a
    // scoped sandbox those ancestors are deliberately unreadable.
    if(options.workspace&&options.hostRPC&&fs.existsSync(path.join(options.hostRPC,'host.json'))){
      const host=JSON.parse(fs.readFileSync(path.join(options.hostRPC,'host.json'),'utf8'));
      this.workspaceRoot=path.resolve(options.workspace);
      if(host.workspace&&host.workspace!==this.workspaceRoot)throw new ApiError('WORKSPACE_BOUNDARY','CLI 与宿主授权的工作文件夹不一致');
      this.directory=path.join(this.workspaceRoot,'.mininotion');this.socket='';this.clientId=options.clientId||`cli-${randomUUID()}`;return;
    }
    if(options.workspace)this.workspaceRoot=fs.realpathSync(path.resolve(options.workspace));
    this.directory = this.workspaceRoot ? folderDataDirectory(this.workspaceRoot) : process.env.MINI_NOTION_SOCKET
      ? path.resolve(options.directory || defaultDataDirectory())
      : canonicalDirectory(options.directory || defaultDataDirectory());
    this.socket = (!this.workspaceRoot && process.env.MINI_NOTION_SOCKET) || socketPath(this.directory);
    this.clientId = options.clientId || `cli-${randomUUID()}`;
  }
  private send(
    method: string,
    params: CommandParams,
    id: string | number = randomUUID(),
  ): Promise<ApiResponse> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
        client: this.clientId,
        agentToken: this.workspaceRoot ? undefined : process.env.MINI_NOTION_AGENT_TOKEN,
      });
      const request = http.request(
        {
          socketPath: this.socket,
          path: '/rpc',
          method: 'POST',
          agent: false,
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            try {
              resolve(fromWireResponse(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
            } catch {
              reject(new ApiError('INVALID_RESPONSE', 'API 返回了无效数据'));
            }
          });
        },
      );
      request.on('error', reject);
      request.setTimeout(120000, () =>
        request.destroy(new ApiError('TIMEOUT', '操作超时；请查询状态确认是否已完成')),
      );
      request.end(body);
    });
  }
  private async health(): Promise<{
    pid: number;
    workspaceRoot?: string;
    version?: string;
    guiClients?: number;
    desktopClients?: number;
  } | null> {
    return new Promise((resolve) => {
      const req = http.get(
        { socketPath: this.socket, path: '/health', agent: false, timeout: 500 },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              resolve(res.statusCode === 200 ? JSON.parse(data) : null);
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }
  async ping(): Promise<boolean> {
    return !!(await this.health());
  }
  async ensure(): Promise<void> {
    if (!this.starting)
      this.starting = this.connectVersion().finally(() => {
        this.starting = undefined;
      });
    return this.starting;
  }
  private async connectVersion() {
    const health = await this.health();
    if (health) {
      if(health.workspaceRoot!==this.workspaceRoot)throw new ApiError('WORKSPACE_MODE_MISMATCH','此服务的文件夹模式与请求不一致，请使用正确的 --workspace 参数');
      if (this.checkedPid === health.pid) return;
      const status = health.version ? health : (await this.send('status', {})).result;
      if (status.version === packageInfo.version) {
        this.checkedPid = health.pid;
        return;
      }
      if (String(status.version || '0').localeCompare(packageInfo.version, 'en', { numeric: true }) > 0)
        throw new ApiError(
          'CLIENT_TOO_OLD',
          `本地服务为 ${status.version}，请使用该版本或更高版本的应用与 CLI`,
        );
      if (this.options.autoStart === false)
        throw new ApiError(
          'VERSION_MISMATCH',
          `本地服务为 ${status.version}，当前客户端为 ${packageInfo.version}`,
        );
      if (status.guiClients || status.desktopClients)
        throw new ApiError('RESTART_REQUIRED', '旧版图形端仍在运行，请退出旧版后再启动新版应用或 CLI');
      await this.send('service.stop', {});
      for (let attempt = 0; attempt < 50 && (await this.ping()); attempt++)
        await new Promise((resolve) => setTimeout(resolve, 25));
    } else if (this.options.autoStart === false) throw new ApiError('SERVICE_UNAVAILABLE', '本地服务未运行');
    await this.startServer();
    const started = await this.health();
    if (started?.version && started.version !== packageInfo.version)
      throw new ApiError('VERSION_MISMATCH', `连接到不同版本的本地服务 ${started.version}`);
    this.checkedPid = started?.pid;
  }
  private async startServer() {
    const application = this.options.executable || process.env.MINI_NOTION_EXECUTABLE || process.execPath;
    const name = path.basename(application);
    const helper = path.resolve(
      path.dirname(application),
      `../Frameworks/${name} Helper.app/Contents/MacOS/${name} Helper`,
    );
    const executable = application.includes('.app/') && fs.existsSync(helper) ? helper : application;
    const serverPath = this.options.serverPath || path.join(__dirname, 'server.cjs');
    const env: NodeJS.ProcessEnv = { ...process.env, MINI_NOTION_DATA_DIR: this.directory };
    if(this.workspaceRoot){env.MINI_NOTION_WORKSPACE=this.workspaceRoot;delete env.MINI_NOTION_SOCKET;delete env.MINI_NOTION_AGENT_TOKEN}
    else delete env.MINI_NOTION_WORKSPACE;
    if (application.includes('.app/')) env.MINI_NOTION_EXECUTABLE = application;
    if (process.versions.electron || executable.includes('.app/')) env.ELECTRON_RUN_AS_NODE = '1';
    else delete env.ELECTRON_RUN_AS_NODE;
    let failure: Error | undefined;
    let exited = false;
    const launch = () => {
      const log = fs.openSync(path.join(this.directory, 'service.log'), 'a', 0o600);
      const child = spawn(executable, [serverPath, '--data-dir', this.directory], {
        env,
        cwd: this.workspaceRoot || this.directory,
        detached: true,
        stdio: ['ignore', log, log],
      });
      child.unref();
      fs.closeSync(log);
      exited = false;
      child.on('error', (error) => {
        failure = error;
      });
      child.on('exit', () => {
        exited = true;
      });
    };
    launch();
    for (let i = 0; i < 150; i++) {
      if (failure) throw failure;
      if (await this.ping()) return;
      if (exited && i > 0 && i % 15 === 0) launch();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new ApiError(
      'SERVICE_START_FAILED',
      `服务未启动，请查看 ${path.join(this.directory, 'service.log')}`,
    );
  }
  async request(method: string, params: CommandParams = {}, id?: string | number): Promise<ApiResponse> {
    if(this.options.hostRPC&&fs.existsSync(path.join(this.options.hostRPC,'host.json')))return hostRequest(this.options.hostRPC,method,params,id);
    if (method === 'status' && (await this.ping())) return this.send(method, params, id);
    if (method === 'service.stop')
      return (await this.ping())
        ? this.send(method, params, id)
        : {
            jsonrpc: '2.0',
            id: id || randomUUID(),
            result: { stopping: false, alreadyStopped: true },
            revision: 0,
          };
    await this.ensure();
    return this.send(method, params, id);
  }
  async call<T = any>(method: string, params: CommandParams = {}): Promise<T> {
    const response = await this.request(method, params);
    if (response.error)
      throw new ApiError(response.error.code, response.error.message, response.error.details);
    return response.result as T;
  }
  async subscribe(onEvent: (event: ServiceEvent) => void, onDisconnect?: () => void): Promise<() => void> {
    if(this.options.hostRPC&&fs.existsSync(path.join(this.options.hostRPC,'host.json')))return hostSubscribe(this.options.hostRPC,onEvent);
    await this.ensure();
    let closed = false;
    const request = http.get(
      { socketPath: this.socket, path: `/events?client=${encodeURIComponent(this.clientId)}`, agent: false },
      (response) => {
        response.setEncoding('utf8');
        let buffer = '';
        response.on('data', (chunk) => {
          buffer += chunk;
          for (let index = buffer.indexOf('\n\n'); index >= 0; index = buffer.indexOf('\n\n')) {
            const packet = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const data = packet
              .split('\n')
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6))
              .join('\n');
            if (data) {
              let event: ServiceEvent;
              try {
                event = JSON.parse(data);
              } catch {
                continue;
              }
              onEvent(event);
            }
          }
        });
        response.on('end', () => {
          if (!closed) onDisconnect?.();
        });
      },
    );
    request.on('error', () => {
      if (!closed) onDisconnect?.();
    });
    return () => {
      closed = true;
      request.destroy();
    };
  }
  private put(pathname: string, name: string, bytes: Buffer) {
    return new Promise<any>((resolve, reject) => {
      const req = http.request(
        {
          socketPath: this.socket,
          path: pathname,
          method: 'PUT',
          agent: false,
          headers: { 'x-file-name': encodeURIComponent(name), 'content-length': bytes.length },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            try {
              const result = JSON.parse(Buffer.concat(chunks).toString());
              if (result.error) reject(new ApiError(result.error.code, result.error.message));
              else resolve(result);
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on('error', reject);
      req.end(bytes);
    });
  }
  async upload(name: string, bytes: Buffer): Promise<string> {
    await this.ensure();
    return (await this.put('/assets', name, bytes)).url;
  }
  async uploadToSpace(
    pageId: string,
    folderId: string | null,
    name: string,
    bytes: Buffer,
  ): Promise<{ url: string; name: string; folderId: string | null }> {
    await this.ensure();
    const path = `/spaces/${encodeURIComponent(pageId)}/${folderId ? encodeURIComponent(folderId) : 'root'}`;
    return this.put(path, name, bytes);
  }
}

export const connect = (options: ClientOptions = {}) => new BackendClient(options);
