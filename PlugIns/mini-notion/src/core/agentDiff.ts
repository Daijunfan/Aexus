import type { AgentMessage } from '../types';

export type AgentFileDiff = {
  id: string;
  path: string;
  at: number;
  turnId?: string;
  kind: 'patch' | 'write' | 'replace' | 'create' | 'delete';
  status: string;
  patch?: string;
  before?: string;
  after?: string;
  output?: string;
  lines?: ReturnType<typeof unifiedLines>;
};

export function unifiedLines(patch: string) {
  let before = 0,
    after = 0,
    inHunk = false;
  return patch.split('\n').map((text) => {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      before = Number(hunk[1]);
      after = Number(hunk[2]);
      inHunk = true;
    } else if (text.startsWith('diff --git ')) inHunk = false;
    if (!hunk && inHunk) {
      if (text.startsWith('+')) return { text, type: 'added', before: null, after: after++ };
      if (text.startsWith('-')) return { text, type: 'removed', before: before++, after: null };
      if (text.startsWith(' ')) return { text, type: 'context', before: before++, after: after++ };
    }
    return { text, type: 'meta', before: null, after: null };
  });
}

/** Git quotes UTF-8 paths with C escapes, including octal bytes for non-ASCII names. */
function gitPath(value: string) {
  if (value.startsWith('"') && value.endsWith('"')) {
    const bytes: number[] = [];
    const escapes: Record<string, string> = {
      n: '\n',
      t: '\t',
      r: '\r',
      b: '\b',
      f: '\f',
      v: '\v',
      a: '\x07',
    };
    for (const token of value.slice(1, -1).match(/\\[0-7]{3}|\\.|./gsu) || [])
      bytes.push(
        ...(/^\\[0-7]{3}$/.test(token)
          ? [parseInt(token.slice(1), 8)]
          : new TextEncoder().encode(token.startsWith('\\') ? escapes[token[1]] || token.slice(1) : token)),
      );
    value = new TextDecoder().decode(new Uint8Array(bytes));
  }
  return value.replace(/^[ab]\//, '');
}

export function projectAgentDiff(messages: AgentMessage[]) {
  const turns = new Map<string, AgentMessage>();
  const operations: AgentFileDiff[] = [];
  for (const message of messages) {
    const data = message.data;
    if (data?.method === 'turn/diff/updated') turns.set(data.params.turnId, message);
    if (data?.type === 'fileChange')
      for (const [index, change] of (data.changes || []).entries())
        operations.push({
          id: `${message.id}:${index}`,
          path: change.path,
          at: message.at,
          turnId: data.turnId,
          kind: change.kind?.type === 'add' ? 'create' : change.kind?.type === 'delete' ? 'delete' : 'patch',
          after: change.kind?.type === 'add' ? change.diff : undefined,
          before: change.kind?.type === 'delete' ? change.diff : undefined,
          patch: change.diff || '',
          lines: change.kind?.type === 'update' ? unifiedLines(change.diff || '') : undefined,
          status: message.activity?.status || 'done',
        });
    if (data?.type === 'tool_use' && ['Write', 'Edit'].includes(data.name)) {
      const input = data.input || {};
      operations.push({
        id: message.id,
        path: input.file_path || '',
        at: message.at,
        kind: data.name === 'Write' ? 'write' : 'replace',
        ...(data.name === 'Write'
          ? { after: input.content }
          : { before: input.old_string, after: input.new_string }),
        status: message.activity?.status || 'running',
        output: message.activity?.output,
      });
    }
  }
  const summaries = [...turns.entries()].map(([turnId, message]) => {
    const patch = String(message.data.params.diff || '');
    const files = patch
      .split(/(?=^diff --git )/m)
      .filter(Boolean)
      .map((patch, index): AgentFileDiff => {
        const added = patch.match(/^\+\+\+ (.+)$/m)?.[1];
        const removed = patch.match(/^--- (.+)$/m)?.[1];
        const path = added && added !== '/dev/null' ? added : removed;
        return {
          id: `${turnId}:${index}`,
          path: path ? gitPath(path) : patch.split('\n')[0],
          at: message.at,
          turnId,
          kind: 'patch',
          patch,
          lines: unifiedLines(patch),
          status: 'done',
        };
      });
    return { turnId, at: message.at, files };
  });
  return { summaries, operations };
}

export function filterAgentDiff(files: AgentFileDiff[], query: string) {
  const term = query.toLocaleLowerCase();
  return files.filter((file) =>
    [file.path, file.patch, file.before, file.after].some((value) =>
      value?.toLocaleLowerCase().includes(term),
    ),
  );
}
