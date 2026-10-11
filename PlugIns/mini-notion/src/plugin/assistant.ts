export type RequestHost = (request: { cmd: string; args?: Record<string, unknown> }) => Promise<any>;

export async function requestAssistant(host: RequestHost | undefined, method: string, params: Record<string, any>) {
  if (!host) throw new Error('选区 AI 需要在 Agents Company 中使用已有员工');
  if (method === 'assistant.list') {
    const [employees, store] = await Promise.all([host({ cmd: 'session.status' }), host({ cmd: 'session.list' })]);
    return employees.filter((e: any) => e.kind !== 'chatter' && !e.deleting).map((e: any) => ({
      id: e.id, title: e.title, engine: e.engine, cwd: store.sessions.find((card: any) => card.id === e.id)?.cwd, busy: e.busy,
      ready: !e.initialization || e.initialization.status === 'ready',
    }));
  }
  if (typeof params.employeeId !== 'string' || !params.employeeId) throw new Error('请选择 AI 员工');
  if (method === 'assistant.send') {
    if (typeof params.text !== 'string' || !params.text.trim()) throw new Error('消息不能为空');
    if (typeof params.clientMessageId !== 'string' || !params.clientMessageId) throw new Error('发送需要 clientMessageId');
    return host({ cmd: 'session.send', args: { employee: params.employeeId, text: params.text, clientMessageId: params.clientMessageId } });
  }
  if (typeof params.messageId !== 'string' || !params.messageId) throw new Error('读取需要 messageId');
  const transcript = await host({ cmd: 'session.transcript', args: { employee: params.employeeId } });
  const info = await host({ cmd: 'session.info', args: { employee: params.employeeId } });
  const start = transcript.shown.findIndex((item: any) => item.role === 'user' && item.outbound?.taskId === params.messageId);
  if (start < 0) throw new Error('此请求已不在员工的当前会话中');
  const rest = transcript.shown.slice(start + 1), next = rest.findIndex((item: any) => item.role === 'user');
  const items = next < 0 ? rest : rest.slice(0, next);
  return {
    text: items.filter((item: any) => item.role === 'assistant').flatMap((item: any) => item.blocks.filter((b: any) => b.kind === 'text').map((b: any) => b.text)).join('\n\n'),
    error: items.find((item: any) => item.role === 'notice' && item.tone === 'error')?.text,
    done: next >= 0 || info.currentTask?.messageId !== params.messageId || !info.busy,
    waitingApproval: info.waitingApproval || info.approvals?.length > 0,
  };
}
