import type { CommandDefinition } from './protocol';

export const assistantCommands: CommandDefinition[] = [
  { method: 'assistant.list', description: '列出宿主中可见的 AI 员工（不启动引擎）' },
  { method: 'assistant.send', description: '通过宿主授权会话发送 MiniNotion 选区消息', mutates: true,
    arguments: [{ name: 'employeeId', description: '用户选择的宿主员工 ID' }],
    options: { text: { type: 'string', description: '完整消息正文', required: true }, clientMessageId: { type: 'string', description: '同一发送的稳定重试 ID', required: true } } },
  { method: 'assistant.read', description: '读取此选区请求的回复与执行状态，不确认用户已读',
    arguments: [{ name: 'employeeId', description: '宿主员工 ID' }, { name: 'messageId', description: 'assistant.send 返回的 messageId' }] },
];
