import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DataService } from '../service';
import { agentEnvironment } from './environment';

/** Git validates reverse hunks and runs inside the same Workspace OS boundary as agent tools. */
export async function reversePatch(service: DataService, pageId: string, patch: string, apply: boolean) {
  const operationId = `revert-${randomUUID()}`;
  const environment = await agentEnvironment(
    service,
    pageId,
    randomUUID(),
    operationId,
    apply ? 'agent' : 'plan',
  );
  try {
    return await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = environment.spawn(
        '/usr/bin/git',
        [
          '-c',
          'core.fsmonitor=false',
          '--work-tree',
          environment.cwd,
          'apply',
          '--reverse',
          '--no-index',
          '--no-unsafe-paths',
          ...(!apply ? ['--check'] : []),
        ],
        {
          env: {
            ...environment.env,
            GIT_DIR: undefined,
            GIT_WORK_TREE: undefined,
            GIT_INDEX_FILE: undefined,
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_OPTIONAL_LOCKS: '0',
          },
        },
      );
      let output = '';
      child.stdout!.on('data', (data) => {
        output += data;
      });
      child.stderr!.on('data', (data) => {
        output += data;
      });
      child.stdin!.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EPIPE') reject(error);
      });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output }));
      child.stdin!.end(patch);
    });
  } finally {
    environment.close(true);
    fs.rmSync(path.dirname(environment.launcher), { recursive: true, force: true });
  }
}
