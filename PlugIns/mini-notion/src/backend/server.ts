import { ignoredFolderPath } from './folder';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { canonicalDirectory, defaultDataDirectory, socketPath } from './paths';
import { DataService } from './service';
import type { ApiRequest } from '../core/protocol';
import { toWireResponse } from '../core/protocol';
import packageInfo from '../../package.json';

export async function startServer(directory: string, workspaceRoot?: string) {
  directory = canonicalDirectory(directory);
  const socket = socketPath(directory);
  const release = await lockfile.lock(directory, {
    lockfilePath: path.join(directory, '.api.lock'),
    stale: 10000,
    update: 2500,
    retries: 0,
  });
  if (fs.existsSync(socket)) fs.unlinkSync(socket);
  let service: DataService;
  try {
    service = new DataService(directory, workspaceRoot);
  } catch (error) {
    await release();
    throw error;
  }
  const eventClients = new Set<http.ServerResponse>();
  let stopping = false;
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            ok: true,
            pid: process.pid,
            apiVersion: 1,
            version: packageInfo.version,
            workspaceRoot: service.folder?.root,
            guiClients: service.guiClients.size,
            desktopClients: service.desktopClients.size,
          }),
        );
        return;
      }
      if (request.method === 'GET' && request.url?.startsWith('/events')) {
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        response.write(`data: ${JSON.stringify(service.state())}\n\n`);
        const clientId = new URL(request.url!, 'http://local').searchParams.get('client') || '';
        if (clientId.startsWith('gui-')) service.desktopClients.add(clientId);
        eventClients.add(response);
        request.on('close', () => {
          eventClients.delete(response);
          service.guiClients.delete(clientId);
          service.desktopClients.delete(clientId);
        });
        return;
      }
      if (stopping) {
        response.writeHead(503);
        response.end(JSON.stringify({ error: { code: 'SERVICE_STOPPING', message: '服务正在停止' } }));
        return;
      }
      if (request.method === 'PUT' && request.url === '/assets') {
        const name = decodeURIComponent(String(request.headers['x-file-name'] || 'file'));
        const extension = path
          .extname(name)
          .replace(/[^.a-zA-Z0-9]/g, '')
          .slice(0, 16);
        const filename = randomUUID() + extension;
        const temporary = path.join(directory, 'uploads');
        fs.mkdirSync(temporary, { recursive: true, mode: 0o700 });
        const file = path.join(temporary, filename);
        try {
          await pipeline(request, fs.createWriteStream(file, { mode: 0o600 }));
          fs.renameSync(file, path.join(service.storage.assets, filename));
        } catch (error) {
          fs.rmSync(file, { force: true });
          throw error;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ url: `asset://local/${filename}` }));
        return;
      }
      if (request.method === 'PUT' && request.url?.startsWith('/spaces/')) {
        const [, , pageId, rawFolder] = request.url.split('?')[0].split('/');
        const folderId = rawFolder && rawFolder !== 'root' ? decodeURIComponent(rawFolder) : null;
        const name = decodeURIComponent(String(request.headers['x-file-name'] || 'file'));
        fs.mkdirSync(path.join(directory, 'uploads'), { recursive: true, mode: 0o700 });
        const temporary = fs.mkdtempSync(path.join(directory, 'uploads', 'space-'));
        const staging = path.join(temporary, 'upload');
        try {
          await pipeline(request, fs.createWriteStream(staging, { mode: 0o600 }));
          const result = await service.request({
            jsonrpc: '2.0',
            id: randomUUID(),
            method: 'space.upload',
            params: { pageId, folderId, path: staging, name },
          });
          if (result.error) throw new Error(result.error.message);
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify(result.result));
        } catch (error) {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({ error: { code: 'UPLOAD_FAILED', message: (error as Error).message } }),
          );
        } finally {
          fs.rmSync(temporary, { recursive: true, force: true });
        }
        return;
      }
      if (request.method !== 'POST' || request.url !== '/rpc') {
        response.writeHead(404);
        response.end();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 64 * 1024 * 1024)
          throw new Error('JSON 请求超过 64 MB；大文件请使用文件路径导入或附件上传');
        chunks.push(Buffer.from(chunk));
      }
      const message = JSON.parse(Buffer.concat(chunks).toString('utf8')) as ApiRequest;
      if (
        message.jsonrpc !== '2.0' ||
        typeof message.method !== 'string' ||
        (message.id !== undefined && !['string', 'number'].includes(typeof message.id))
      )
        throw new Error('无效的 JSON RPC 请求');
      const result = await service.request(message);
      if (message.id === undefined) {
        response.writeHead(204);
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(toWireResponse(result)));
    } catch (error) {
      if (!response.headersSent) response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          toWireResponse({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: error instanceof SyntaxError ? 'PARSE_ERROR' : 'INVALID_REQUEST',
              message: error instanceof Error ? error.message : String(error),
            },
            revision: service.revision,
          }),
        ),
      );
    }
  });
  let watcher: fs.FSWatcher|undefined;
  let watchTimer: ReturnType<typeof setTimeout>|undefined;
  const close = async () => {
    watcher?.close();clearTimeout(watchTimer);
    if (stopping) return;
    stopping = true;
    service.stopScheduler();
    service.agents.stopAll();
    await service.idle();
    for (const client of eventClients) client.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await release();
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGINT', onSignal);
  };
  service.subscribe((event) => {
    for (const client of eventClients) client.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'shutdown')
      setTimeout(() => {
        void close();
      }, 50);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socket, () => {
        fs.chmodSync(socket, 0o600);
        resolve();
      });
    });
  } catch (error) {
    await release();
    throw error;
  }
  const onSignal = () => {
    void close();
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  if(service.folder) {
    await service.request({jsonrpc:'2.0',id:randomUUID(),method:'fs.sync'});
    watcher=fs.watch(service.folder.root,{recursive:true},(_event,filename)=>{
      if(!filename||ignoredFolderPath(String(filename)))return;
      clearTimeout(watchTimer);watchTimer=setTimeout(()=>void service.request({jsonrpc:'2.0',id:randomUUID(),method:'fs.sync'}),120);
    });
  }
  service.startScheduler();
  return { service, server, close, socket };
}

if (require.main === module) {
  const index = process.argv.indexOf('--data-dir');
  startServer(index >= 0 ? process.argv[index + 1] : defaultDataDirectory(), process.env.MINI_NOTION_WORKSPACE).catch((error) => {
    if (error.code !== 'ELOCKED') console.error(error);
    process.exit(1);
  });
}
