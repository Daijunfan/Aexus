import type { AgentMessage } from '../types';

/** Transport progress belongs in raw logs, not in the conversation transcript. */
export function isAgentTelemetry(data: any): boolean {
  return data?.type === 'rate_limit_event' ||
    (data?.type === 'system' &&
      ['status', 'thinking_tokens', 'background_tasks_changed', 'turn_duration'].includes(data.subtype));
}

export function activityCaption(message: AgentMessage): string {
  const input = message.data?.input;
  const file = input?.file_path || input?.path;
  if (file) return String(file).split('/').at(-1) || '';
  if (input?.description) return String(input.description).replace(/\s+/g, ' ').slice(0, 120);
  if (message.data?.changes?.length)
    return message.data.changes.map((change: any) => String(change.path).split('/').at(-1)).join(', ');
  const command = message.data?.command || input?.command;
  if (typeof command === 'string' && command.length <= 100 && !command.includes('\n')) return command;
  return '';
}

export function activityLabel(name?: string): string {
  const labels: Record<string, string> = {
    Bash: '运行命令', Write: '写入文件', Edit: '编辑文件', Read: '读取内容',
    Glob: '查找文件', Grep: '搜索内容', shell: '运行命令', edit: '修改文件',
    thinking: '思考', reasoning: '思考', commandExecution: '运行命令', fileChange: '修改文件',
    backgroundTask: '后台任务', mcpToolCall: '调用工具', dynamicToolCall: '调用工具',
    webSearch: '搜索网页', contextCompaction: '压缩上下文',
    'turn/plan/updated': '任务计划', 'turn/diff/updated': '本轮修改', result: '结果', notice: '引擎提示',
  };
  return labels[name || ''] || name || '操作';
}
