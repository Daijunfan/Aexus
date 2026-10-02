import type { SpaceEngine } from '../../types';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export type AgentEvent =
  | { type: 'session'; id: string }
  | { type: 'text'; text: string }
  | {
      type: 'activity';
      id?: string;
      name: string;
      status: 'running' | 'done' | 'error';
      summary?: string;
      output?: string;
    }
  | { type: 'usage'; input?: number; output?: number; costUsd?: number; turns?: number }
  | { type: 'error'; message: string }
  | { type: 'result'; isError?: boolean };

export type EngineInput = {
  prompt: string;
  sessionId?: string;
  systemPrompt: string;
  spaceDir: string;
  cwd: string;
  images?: string[];
};

export type AgentEngine = {
  id: SpaceEngine;
  command(override?: string): { binary: string; prefix: string[] };
  args(input: EngineInput): string[];
  parse(line: string): AgentEvent[];
};

/** Env overrides may carry arguments, e.g. "node /path/stub.mjs", for tests and wrappers. */
function resolve(binary: string, override?: string): { binary: string; prefix: string[] } {
  if (!override) {
    const found = (process.env.PATH || '')
      .split(path.delimiter)
      .map((directory) => path.join(directory, binary))
      .find((file) => {
        try {
          fs.accessSync(file, fs.constants.X_OK);
          return true;
        } catch {
          return false;
        }
      });
    if (found) return { binary: found, prefix: [] };
    // Finder-launched applications do not inherit the user's terminal PATH.
    try {
      const quoted = "'" + binary.replaceAll("'", "'\\''") + "'";
      const resolved = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', `command -v ${quoted}`], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .split('\n')
        .at(-1)!;
      if (path.isAbsolute(resolved) && fs.existsSync(resolved)) return { binary: resolved, prefix: [] };
    } catch {
      /* The process spawn reports an actionable missing-engine error. */
    }
    return { binary, prefix: [] };
  }
  const parts = override.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [override];
  const cleaned = parts.map((part) => part.replace(/^["']|["']$/g, ''));
  return { binary: resolve(cleaned[0]).binary, prefix: cleaned.slice(1) };
}

const truncate = (value: string, length = 400) =>
  value.length > length ? `${value.slice(0, length)}…` : value;

function claudeParse(line: string): AgentEvent[] {
  const data = JSON.parse(line);
  if (data.type === 'system' && data.subtype === 'init' && data.session_id)
    return [{ type: 'session', id: data.session_id }];
  if (data.type === 'assistant' && data.message?.content) {
    const events: AgentEvent[] = [];
    for (const block of data.message.content) {
      if (block.type === 'text' && block.text) events.push({ type: 'text', text: block.text });
      else if (block.type === 'tool_use')
        events.push({
          type: 'activity',
          id: block.id,
          name: block.name || 'tool',
          status: 'running',
          summary: JSON.stringify(block.input ?? {}),
        });
    }
    return events;
  }
  if (data.type === 'user' && Array.isArray(data.message?.content)) {
    const events: AgentEvent[] = [];
    for (const block of data.message.content)
      if (block.type === 'tool_result') {
        const content = Array.isArray(block.content)
          ? block.content.map((part: any) => part.text || '').join(' ')
          : typeof block.content === 'string'
            ? block.content
            : '';
        events.push({
          type: 'activity',
          id: block.tool_use_id,
          name: 'result',
          status: block.is_error ? 'error' : 'done',
          output: content,
        });
      }
    return events;
  }
  if (data.type === 'result') {
    const events: AgentEvent[] = [
      { type: 'result', isError: !!data.is_error },
      {
        type: 'usage',
        input: data.usage?.input_tokens,
        output: data.usage?.output_tokens,
        costUsd: data.total_cost_usd,
        turns: data.num_turns,
      },
    ];
    if (data.session_id) events.unshift({ type: 'session', id: data.session_id });
    if (data.is_error)
      events.unshift({
        type: 'error',
        message: String(data.result || data.errors?.join('\n') || data.subtype || 'Agent 运行失败'),
      });
    return events;
  }
  return [];
}

function codexParse(line: string): AgentEvent[] {
  const data = JSON.parse(line);
  if (data.type === 'thread.started' && data.thread_id) return [{ type: 'session', id: data.thread_id }];
  if (data.type === 'turn.completed')
    return [
      { type: 'usage', input: data.usage?.input_tokens, output: data.usage?.output_tokens },
      { type: 'result', isError: !!data.error },
    ];
  if (data.type === 'error' || data.type === 'turn.failed')
    return [
      {
        type: 'error',
        message: String(data.message || data.error?.message || data.error || 'Agent 运行失败'),
      },
    ];
  if ((data.type === 'item.started' || data.type === 'item.completed') && data.item) {
    const item = data.item;
    const done = data.type === 'item.completed';
    if (item.type === 'agent_message' && item.text) return done ? [{ type: 'text', text: item.text }] : [];
    if (item.type === 'reasoning' && item.text && done)
      return [{ type: 'activity', name: 'thinking', status: 'done', summary: truncate(item.text) }];
    if (item.type === 'command_execution')
      return [
        {
          type: 'activity',
          id: item.id,
          name: 'shell',
          status:
            item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)
              ? 'error'
              : done
                ? 'done'
                : 'running',
          summary: item.command || '',
          ...(done ? { output: item.aggregated_output || '' } : {}),
        },
      ];
    if (item.type === 'file_change' || item.type === 'patch_application')
      return [
        {
          type: 'activity',
          id: item.id,
          name: 'edit',
          status: done ? 'done' : 'running',
          summary: truncate(item.path || item.summary || ''),
        },
      ];
    if (item.type === 'error')
      return [
        {
          type: 'activity',
          id: item.id,
          name: 'notice',
          status: 'done',
          summary: String(item.message || '引擎提示'),
        },
      ];
  }
  return [];
}

const guard = (parse: (line: string) => AgentEvent[]) => (line: string) => {
  try {
    return parse(line);
  } catch {
    return [];
  }
};

export const engines: Record<SpaceEngine, AgentEngine> = {
  claude: {
    id: 'claude',
    command: (override) => resolve('claude', override || process.env.MINI_NOTION_AGENT_CLAUDE),
    args: ({ prompt, sessionId, systemPrompt, spaceDir }) => [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--append-system-prompt',
      systemPrompt,
      '--permission-mode',
      'acceptEdits',
      '--tools',
      'Bash,Read,Glob,Grep',
      '--allowed-tools',
      'Bash,Read,Glob,Grep',
      '--add-dir',
      spaceDir,
      ...(sessionId ? ['--resume', sessionId] : []),
    ],
    parse: guard(claudeParse),
  },
  codex: {
    id: 'codex',
    command: (override) => resolve('codex', override || process.env.MINI_NOTION_AGENT_CODEX),
    args: ({ prompt, sessionId, spaceDir, systemPrompt, images = [] }) => [
      'exec',
      '-c',
      'allow_login_shell=false',
      '-c',
      'agents.enabled=false',
      '-c',
      'sandbox_workspace_write.network_access=true',
      '--json',
      '--skip-git-repo-check',
      '-C',
      spaceDir,
      '-s',
      'workspace-write',
      ...(sessionId ? ['resume', sessionId] : []),
      ...images.flatMap((file) => ['--image', file]),
      `${systemPrompt}\n\nUser message:\n${prompt}`,
    ],
    parse: guard(codexParse),
  },
};

export function engineOf(id: SpaceEngine): AgentEngine {
  if (!engines[id]) throw new Error(`未知 Agent 引擎：${id}`);
  return engines[id];
}
