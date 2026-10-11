import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { Command, InvalidArgumentError } from 'commander';
import { BackendClient, ApiError } from '../backend/client';
import { commands } from '../core/catalog';
import type { ApiResponse, CommandParams } from '../core/protocol';
import { toWireResponse } from '../core/protocol';
import packageInfo from '../../package.json';
import { activityCaption, activityLabel, isAgentTelemetry } from '../core/agentTranscript';

const program = new Command('mininotion')
  .description('Mini Notion 本地笔记 · 与 macOS 图形端共享全部数据和命令')
  .version(packageInfo.version)
  .option('--workspace <directory>', '把任意工作文件夹作为数据源（文件夹模式）')
  .option('--data-dir <directory>', '选择工作空间数据目录')
  .option('--format <format>', 'json / text / markdown / csv', 'json')
  .option('--json', '输出 JSON（默认）')
  .option('--envelope', '包含请求 ID、修订号和错误的 API 响应')
  .option('--no-start', '本地服务未运行时退出，不自动启动')
  .addHelpText(
    'after',
    '\nJSON 参数支持直接传入、@文件.json 或 -（标准输入）。\n示例：\n  mininotion workspace init --name 我的笔记\n  mininotion page create --title 读书笔记 --color green\n  mininotion database create --title 计划 --color blue --view calendar\n  mininotion schema block.append\n  mininotion api view.update --data @view.json\n  mininotion watch\n',
  );

function json(value: string) {
  try {
    return JSON.parse(
      value === '-'
        ? fs.readFileSync(0, 'utf8')
        : value.startsWith('@')
          ? fs.readFileSync(path.resolve(value.slice(1)), 'utf8')
          : value,
    );
  } catch (error) {
    throw new InvalidArgumentError(`JSON 无效：${error instanceof Error ? error.message : error}`);
  }
}
const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
let client: BackendClient;
function connection() {
  return (client ||= new BackendClient({
    hostRPC:process.env.AGENTS_COMPANY_PLUGIN_RPC,
    directory: program.opts().dataDir,
    workspace: program.opts().workspace || process.env.MINI_NOTION_WORKSPACE,
    autoStart: program.opts().start,
  }));
}
async function launchGUI(background = false) {
  const backend = connection();
  if(backend.workspaceRoot&&process.env.AGENTS_WORKSPACE)throw new ApiError('HOST_MANAGED_UI','请点击 Agents Company 中对应的 Team 打开工作空间');
  const status = await backend.call('status');
  if (background && status.desktopClients)
    return { opened: true, background: true, alreadyRunning: true, dataDirectory: backend.directory };
  if (status.guiClients) {
    await backend.call('ui.command', { command: 'window-show' });
    return { opened: true, alreadyRunning: true };
  }
  let failure: Error | undefined;
  if (status.desktopClients) await backend.call('ui.command', { command: 'window-show' });
  else {
    const executable = process.versions.electron
      ? process.execPath
      : process.env.MINI_NOTION_EXECUTABLE || require('electron');
    const env: NodeJS.ProcessEnv = { ...process.env, MINI_NOTION_DATA_DIR: backend.directory, ...(backend.workspaceRoot?{MINI_NOTION_WORKSPACE:backend.workspaceRoot}:{}) };
    delete env.ELECTRON_RUN_AS_NODE;
    const args =
      __dirname.includes('app.asar') || process.env.MINI_NOTION_EXECUTABLE
        ? []
        : [path.resolve(__dirname, '..')];
    if (background) args.push('--background');
    const child = spawn(executable, args, { env, detached: true, stdio: 'ignore' });
    child.unref();
    child.on('error', (error) => {
      failure = error;
    });
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    if (failure) throw failure;
    if ((await backend.call('status')).guiClients) return { opened: true, dataDirectory: backend.directory };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new ApiError('GUI_START_FAILED', '图形端未能启动');
}

function textValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map(textValue).join('\n');
  if (value.role && ['text', 'activity'].includes(value.kind)) {
    if (isAgentTelemetry(value.data)) return '';
    if (value.kind === 'activity') {
      const state = value.activity?.status;
      return `${state === 'running' ? '…' : state === 'error' ? '!' : state === 'stopped' ? '■' : '✓'} ${activityLabel(value.activity?.name)}${activityCaption(value) ? ` · ${activityCaption(value)}` : ''}`;
    }
    return `${value.role === 'user' ? '你' : value.role === 'agent' ? 'Agent' : '提示'}：${value.text || ''}`;
  }
  if (value.records && value.view) {
    const names = new Map(value.records.map((record: any) => [record.id, record.title || '无标题']));
    let body = `${value.name} · ${value.view.name} · ${value.count} 条记录`;
    if (value.timeGrid)
      body +=
        ` · ${value.timeGrid.timeZone}\n` +
        value.timeGrid.days
          .map(
            (day: any) =>
              `\n${day.date}${day.minutes !== 1440 ? `（${day.minutes / 60} 小时）` : ''}\n` +
              [
                ...day.allDay.map((id: string) => `  全天  ${names.get(id)}  ${id}`),
                ...day.events.map(
                  (event: any) =>
                    `  ${event.start} → ${event.hasEnd ? event.end : '未设置结束时间'}  ${names.get(event.id)}  ${event.id}${event.columns > 1 ? '（时间重叠）' : ''}`,
                ),
              ].join('\n'),
          )
          .join('\n');
    else if (value.days)
      body +=
        '\n' +
        value.days
          .map(
            (day: any) =>
              `\n${day.date}\n${day.records.map((id: string) => `  ${names.get(id)}  ${id}`).join('\n')}`,
          )
          .join('\n');
    else if (value.schedule)
      body +=
        '\n' +
        value.schedule
          .map(
            (event: any) =>
              `${event.start || '未排期'}${event.end && event.end !== event.start ? ' → ' + event.end : ''}  ${event.title}  ${event.id}`,
          )
          .join('\n');
    else if (value.series)
      body += '\n' + value.series.map((entry: any) => `${entry.name}\t${entry.value}`).join('\n');
    else if (value.groups)
      body +=
        '\n' +
        value.groups
          .map(
            (group: any) =>
              `\n${group.name}\n${group.records.map((id: string) => `  ${names.get(id)}  ${id}`).join('\n')}`,
          )
          .join('\n');
    else if (value.hierarchy)
      body +=
        '\n' +
        value.hierarchy
          .map(
            (row: any) =>
              `${'  '.repeat(row.depth)}${row.childCount ? (row.expanded ? '▾ ' : '▸ ') : ''}${names.get(row.id)}  ${row.id}`,
          )
          .join('\n');
    else body += '\n' + textValue(value.records);
    if (value.unscheduled?.length)
      body += '\n\n未排期\n' + value.unscheduled.map((id: string) => `  ${names.get(id)}  ${id}`).join('\n');
    if (value.overdue?.length)
      body += '\n\n逾期\n' + value.overdue.map((id: string) => `  ${names.get(id)}  ${id}`).join('\n');
    if (value.dependencies?.length)
      body +=
        '\n\n依赖关系\n' +
        value.dependencies.map((edge: any) => `  ${edge.fromTitle} → ${edge.toTitle}`).join('\n');
    if (value.calculations && Object.keys(value.calculations).length)
      body +=
        '\n\n汇总\n' +
        Object.entries(value.calculations)
          .map(
            ([id, entry]: [string, any]) =>
              `  ${value.columns.find((column: any) => column.id === id)?.name || id}: ${entry.value}`,
          )
          .join('\n');
    return body;
  }
  if (value.scheduledFor && value.text !== undefined && value.pageId)
    return `[${value.archivedAt ? '已归档' : value.readAt ? '已读' : '未读'}] ${value.title}\n  ${value.text}\n  到期 ${value.scheduledFor} · ${value.id}`;
  if (value.templateId && value.rule)
    return `${value.title || '无标题模板'} · ${value.rule.enabled ? '已启用' : '已暂停'} · ${value.rule.frequency} / ${value.rule.interval}\n  下次 ${value.nextAt || '无'} · ${value.rule.timeZone} · ${value.templateId}${value.runtime?.error ? '\n  错误：' + value.runtime.error : ''}`;
  if (value.templateId && value.scheduledFor)
    return `${value.scheduledFor} → ${value.title} · ${value.pageId}${value.manual ? '（手动生成）' : ''}`;
  if (value.title !== undefined && value.id)
    return `${value.icon || ''} ${value.title || '无标题'}\t${value.id}${
      value.children
        ? '\n' +
          textValue(value.children)
            .split('\n')
            .map((line) => '  ' + line)
            .join('\n')
        : ''
    }`.trim();
  return JSON.stringify(value, null, 2);
}
function print(result: any, response?: ApiResponse) {
  const options = program.opts();
  const format = options.json ? 'json' : options.format;
  if (options.envelope) {
    process.stdout.write(JSON.stringify(response ? toWireResponse(response) : result) + '\n');
    return;
  }
  if (format === 'json') process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else if (format === 'text' || format === 'markdown') process.stdout.write(textValue(result) + '\n');
  else if (format === 'csv') {
    const rows = Array.isArray(result) ? result : result.records;
    if (!Array.isArray(rows)) throw new ApiError('INVALID_FORMAT', 'CSV 输出需要记录列表');
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const cell = (value: any) =>
      `"${String(typeof value === 'object' && value !== null ? JSON.stringify(value) : (value ?? '')).replaceAll('"', '""')}"`;
    process.stdout.write(
      [
        columns.map(cell).join(','),
        ...rows.map((row) => columns.map((column) => cell(row[column])).join(',')),
      ].join('\r\n') + '\r\n',
    );
  } else throw new ApiError('INVALID_FORMAT', `未知输出格式 ${format}`);
}
async function execute(method: string, params: CommandParams) {
  params = { ...params };
  const backend=connection();
  for (const key of ['path', 'output'])
    if (typeof params[key] === 'string' && !(method === 'file.resolve' && key === 'path'))
      params[key] = path.resolve(backend.workspaceRoot||process.cwd(),params[key]);
  if (Array.isArray(params.files))
    params.files = params.files.map((file: unknown) =>
      typeof file === 'string' ? path.resolve(file) : file,
    );
  const response = await backend.request(method, params, undefined, program.opts().envelope ? 'full' : 'none');
  if (response.error) throw new ApiError(response.error.code, response.error.message, response.error.details);
  print(response.result, response);
}
const groups = new Map<string, Command>();
for (const definition of commands) {
  const pieces = definition.method.split('.');
  let parent = program;
  if (pieces.length === 2) {
    if (!groups.has(pieces[0]))
      groups.set(pieces[0], program.command(pieces[0]).description(`${pieces[0]} 操作`));
    parent = groups.get(pieces[0])!;
  }
  const command = parent.command(pieces.at(-1)!).description(definition.description);
  for (const argument of definition.arguments || [])
    command.argument(
      argument.required === false ? `[${argument.name}]` : `<${argument.name}>`,
      argument.description,
    );
  for (const [key, option] of Object.entries(definition.options || {})) {
    const flag = `--${kebab(key)}`;
    if (option.type === 'boolean') command.option(flag, option.description);
    else
      command.option(
        `${flag} <${option.type}>`,
        option.description,
        option.type === 'list'
          ? (value) =>
              value.startsWith('[') || value.startsWith('@') || value === '-'
                ? json(value)
                : value.split(',').filter(Boolean)
          : option.type === 'number'
            ? (value) => {
                const number = Number(value);
                if (!Number.isFinite(number)) throw new InvalidArgumentError('需要数字');
                return number;
              }
            : (value) => value,
      );
  }
  command.option('--data <json>', '附加完整参数对象，支持 @file 或 -', json);
  command.action(async (...args) => {
    const own = command.opts();
    const params = { ...own.data, ...own };
    delete params.data;
    // Commander coerces a parser's null result to ''; parse JSON after option collection.
    for (const [key, option] of Object.entries(definition.options || {}))
      if (option.type === 'json' && own[key] !== undefined) params[key] = json(own[key]);
    (definition.arguments || []).forEach((argument, index) => {
      if (args[index] !== undefined) params[argument.name] = args[index];
    });
    await execute(definition.method, params);
  });
}
groups
  .get('ui')!
  .command('launch')
  .description('启动或连接此工作空间的 macOS 图形端')
  .option('--background', '在后台启动，不显示或聚焦窗口')
  .action(async (options) => print(await launchGUI(!!options.background)));
program
  .command('api <method>')
  .description('直接调用本地 API 方法')
  .option('--data <json>', '参数对象 / @file / -', json)
  .action(async (method, options) => execute(method, options.data || {}));
program
  .command('watch')
  .description('持续输出数据和 GUI 事件（JSON Lines）')
  .action(async () => {
    const unsubscribe = await connection().subscribe(
      (event) => process.stdout.write(JSON.stringify(event) + '\n'),
      () => {
        process.stderr.write('本地服务连接已关闭\n');
        process.exitCode = 1;
      },
    );
    process.once('SIGINT', () => {
      unsubscribe();
    });
    process.once('SIGTERM', () => {
      unsubscribe();
    });
  });
groups
  .get('agent')!
  .command('attach <pageId>')
  .description('持续输出此空间的 Agent 事件（JSON Lines）')
  .option('--conversation-id <id>', '仅输出指定会话的事件')
  .action(async (pageId: string, options: { conversationId?: string }) => {
    const backend = connection();
    const unsubscribe = await backend.subscribe(
      (event) => {
        if (
          event.type === 'agent' &&
          event.pageId === pageId &&
          (!options.conversationId || event.conversationId === options.conversationId)
        )
          process.stdout.write(JSON.stringify(event) + '\n');
      },
      () => {
        process.stderr.write('本地服务连接已关闭\n');
        process.exitCode = 1;
      },
    );
    process.once('SIGINT', () => unsubscribe());
    process.once('SIGTERM', () => unsubscribe());
  });
program
  .command('serve')
  .description('标准输入/输出 JSON RPC 2.0（每行一个请求）')
  .option('--stdio', '使用标准输入输出')
  .action(async () => {
    const lines = readline.createInterface({ input: process.stdin, terminal: false });
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line);
        if (request.jsonrpc !== '2.0' || typeof request.method !== 'string')
          throw new Error('需要 JSON RPC 2.0 请求');
        const response = await connection().request(request.method, request.params || {}, request.id);
        if (request.id !== undefined) process.stdout.write(JSON.stringify(toWireResponse(response)) + '\n');
      } catch (error) {
        process.stdout.write(
          JSON.stringify(
            toWireResponse({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: error instanceof SyntaxError ? 'PARSE_ERROR' : 'INVALID_REQUEST',
                message: String(error),
              },
              revision: 0,
            }),
          ) + '\n',
        );
      }
    }
  });

// Accept the dotted method names returned by schema as well as grouped CLI commands.
const argv = [...process.argv];
for (let index = 2; index < argv.length; index++) {
  if (['--workspace', '--data-dir', '--format'].includes(argv[index])) {
    index++;
    continue;
  }
  if (argv[index].startsWith('-')) continue;
  const method = commands.find((command) => command.method === argv[index] && command.method.includes('.'));
  if (method) argv.splice(index, 1, ...method.method.split('.'));
  break;
}
program.parseAsync(argv, { from: 'node' }).catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: {
        code: error.code || 'OPERATION_FAILED',
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    }) + '\n',
  );
  process.exitCode = 1;
});
