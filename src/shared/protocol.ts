// The wire contract between the app and the `agents` CLI. Both sides import
// this so a change to the command surface breaks compilation, not runtime.

import { homedir } from 'node:os'
import { join } from 'node:path'

export const APP_HOME = process.env.AGENTS_COMPANY_HOME || join(homedir(), 'AgentsCompany')
export const SOCKET_PATH = join(APP_HOME, 'agents.sock')

export type Request = { cmd: string; args?: Record<string, unknown> }

export type Response<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/** Events pushed to a client that asked to follow a session. */
export type FollowEvent =
  | { type: 'event'; channel: string; payload: unknown }
  | { type: 'done' }

/** Every command the CLI can send. Kept as data so `agents help` can list it. */
export const COMMANDS: {
  name: string
  args: string
  summary: string
  gui: string
}[] = [
  { name: 'shared.info',args:'',summary:'Locate the checkout Shared directory',gui:'共享中转站物理目录'},
  { name: 'view.shared',args:'on|off',summary:'Show or hide the shared transfer drawer without closing the conversation',gui:'共享中转站侧栏'},
  { name: 'transfer.start',args:'--from JSON|@file --to JSON|@file',summary:'Copy a file or directory between local, shared and Team/employee workspaces',gui:'跨工作区拖放复制'},
  { name: 'transfer.list',args:'',summary:'List transfer progress and results for this service run',gui:'传输列表'},
  { name: 'transfer.get',args:'ID',summary:'Read a transfer result and byte progress',gui:'传输进度'},
  { name: 'transfer.cancel',args:'ID',summary:'Cancel a queued or running copy; preserve source files',gui:'取消传输'},
  { name: 'schedule.schema', args: '', summary: 'Describe the host scheduling contract', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.status', args: '', summary: 'Read scheduler health and active runs', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.list', args: '[--employee ID --source PLUGIN]', summary: 'List persistent schedules', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.get', args: 'ID', summary: 'Read a schedule', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.create', args: '--spec @file.json | --name NAME --employee ID --prompt TEXT --at ISO', summary: 'Create an employee task schedule', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.update', args: 'ID --patch @file.json', summary: 'Update a schedule while idle', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.pause', args: 'ID', summary: 'Pause future occurrences', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.resume', args: 'ID', summary: 'Resume from the next future occurrence', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.delete', args: 'ID', summary: 'Cancel active runs and delete the schedule, keeping audit history', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.preview', args: '[ID | --spec @file.json] [--after ISO --count N]', summary: 'Preview future occurrences without executing', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.run', args: 'ID', summary: 'Run once now without consuming the next scheduled occurrence', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.history', args: '[ID] [--employee ID --limit N]', summary: 'Read durable run status and conversation IDs', gui: 'CLI 调度基础，供插件复用' },
  { name: 'schedule.cancel', args: 'RUN_ID', summary: 'Cancel an active scheduled turn', gui: 'CLI 调度基础，供插件复用' },
  { name: 'settings.get', args: '', summary: 'Read theme and pointer sensitivity', gui: '应用设置' },
  { name: 'settings.set', args: '[--theme white|light|space|black|midnight|sage] [--explorer-width N] [--terminal-height N] [--page-zoom N] [--zoom-sensitivity N] [--pan-sensitivity N] [--sidebar-width N] [--snap-employees on|off]', summary: 'Persist appearance and canvas controls', gui: '背景和灵敏度' },
  { name: 'view.get', args: '', summary: 'Read service-owned navigation, including without a window', gui: '当前面板' },
  { name: 'view.open', args: 'home|team|employee|workspace|conversation|plugin|settings [--name NAME] [--employee ID] [--plugin ID]', summary: 'Open a form, workspace or employee conversation', gui: '打开资料或会话' },
  { name: 'view.close', args: '', summary: 'Close the current panel after saving workspace edits; keep engines running', gui: '× / Escape / 收起面板' },
  { name: 'view.details', args: 'on|off', summary: 'Show or hide employee details inside a conversation', gui: '员工资料 / 返回会话' },
  { name: 'status', args: '', summary: 'Is the app running, and how many sessions are live', gui: 'The app window being open' },
  { name: 'session.list', args: '--live', summary: 'List stored cards (or live sessions with --live)', gui: 'The company floor' },
  { name: 'session.new', args: '[--engine claude|codex] [--group NAME] [--model M]', summary: 'Create a session', gui: '“+ Hire employee”' },
  { name: 'session.rename', args: '<card-or-session-id> <title>', summary: 'Compatibility endpoint; employee names are immutable', gui: '会话名称 / 员工名牌' },
  { name: 'session.open', args: '<cardId>', summary: 'Open a stored card (resumes its engine context)', gui: 'Clicking a card' },
  { name: 'session.send', args: '<id> <text>', summary: 'Send a message to a Worker session', gui: '对话输入框' },
  { name: 'host.fingerprints', args: '<id>', summary: 'Read SSH host key fingerprints without trusting them', gui: '查看主机指纹' },
  { name: 'host.trust', args: '<id> --fingerprint SHA256:...', summary: 'Trust an explicitly confirmed and matching SSH host fingerprint', gui: '确认信任主机' },
  { name: 'host.exec', args: '<id> --command COMMAND|--command-file FILE [--directory PATH --timeout SECONDS]', summary: 'Execute a management command exclusively on the registered remote host', gui: '远端管理命令' },
  { name: 'host.list', args: '', summary: 'List registered cloud hosts without passwords', gui: 'Cloud Hosts 插件' },
  { name: 'host.get', args: '<id>', summary: 'Read a cloud host record without its password', gui: 'Cloud Hosts 插件' },
  { name: 'host.create', args: '--data @host.json', summary: 'Create a cloud host in the shared registry', gui: 'Cloud Hosts 插件' },
  { name: 'host.update', args: '<id> --data @patch.json', summary: 'Edit host connection and credentials', gui: 'Cloud Hosts 插件' },
  { name: 'host.remove', args: '<id>', summary: 'Remove an unbound cloud host', gui: 'Cloud Hosts 插件' },
  { name: 'host.check', args: '<id>', summary: 'Check SSH connectivity without requiring a Team working directory', gui: 'Cloud Hosts 插件与 Team 连接灯' },
  { name: 'host.directories', args: '<id> [--path PATH]', summary: 'Browse existing directories on a registered cloud host', gui: 'Cloud Hosts 插件' },
  { name: 'host.credentials', args: '<id>', summary: 'Explicitly reveal the saved host password', gui: 'Cloud Hosts 插件' },
  { name: 'engine.remote-check', args: '--team NAME --engine codex|claude [--directory PATH]', summary: 'Check a Cloud Team native CLI, protocol, authentication and workspace before hiring', gui: 'Cloud Native Worker 创建前检查' },
  { name: 'engine.remote-sessions', args: '--team NAME --engine codex|claude', summary: 'List native sessions on the selected Cloud Team host', gui: '绑定已有云端会话' },
  { name: 'card.native-bind', args: '<employee-id> <native-session-id>', summary: 'Bind an existing remote native session without taking deletion ownership', gui: '绑定远端原生会话' },
  { name: 'session.follow', args: '<id> [--raw]', summary: 'Stream a session’s events until its turn ends', gui: 'Watching the transcript' },
  { name: 'session.transcript', args: '<id> [--thinking]', summary: 'Print a session’s conversation as text', gui: 'The transcript pane' },
  { name: 'session.interrupt', args: '<id>', summary: 'Stop the current turn', gui: 'The “■ Stop” button' },
  { name: 'session.close', args: '<id>', summary: 'Close a live session', gui: 'Leaving the session view' },
  { name: 'session.info', args: '<id>', summary: 'Show a live session’s engines, models, commands', gui: 'The toolbar dropdowns' },
  { name: 'session.activity', args: '<id>', summary: 'Current speech, published thinking or tool preview; null when idle', gui: '员工活动气泡' },
  { name: 'session.snapshot', args: '<id>', summary: 'Full frontend state', gui: 'The conversation and toolbar' },
  { name: 'session.search', args: '<query>', summary: 'Search employees and workspaces', gui: 'Office search' },
  { name: 'approval.list', args: '<id>', summary: 'Pending tool permissions', gui: 'Permission requests' },
  { name: 'approval.respond', args: '<id> <requestId> allow|deny [--answers JSON] [--form JSON]', summary: 'Answer a tool permission', gui: 'Allow / Decline' },
  { name: 'config.engine', args: '<card-or-live-id> codex|claude', summary: 'Switch employee engine while preserving conversation history', gui: '引擎选择' },
  { name: 'config.model', args: '<id> <model>', summary: 'Change model', gui: 'Model dropdown' },
  { name: 'config.remote-admin', args: '<id> on|off', summary: 'Explicitly authorize SSH-user administration on a cloud Codex worker; never local execution', gui: '远端主机管理权限' },
  { name: 'config.permission', args: '<id> <mode>', summary: 'Change permission mode', gui: '🔒 dropdown' },
  { name: 'config.thinking', args: '<id> on|off', summary: 'Toggle thinking', gui: '🧠 toggle' },
  { name: 'config.effort', args: '<id> <level|default>', summary: 'Change effort level', gui: '⚡ dropdown' },
  { name: 'config.plan', args: '<id> on|off', summary: 'Switch the official planning mode', gui: '计划模式' },
  { name: 'external.open', args: '<https-url>', summary: 'Validate an external URL and open it when a desktop is attached', gui: '原生授权链接' },
  { name: 'engine.inspect', args: '<id> [capabilities|skills|mcp|account|usage|config]', summary: 'Inspect native engine capabilities and configuration', gui: '引擎工具面板' },
  { name: 'engine.skill', args: '<id> <name> [prompt]', summary: 'Invoke a discovered engine skill', gui: '使用技能' },
  { name: 'session.steer', args: '<id> <text>', summary: 'Append instructions to the active native turn', gui: '运行中追加' },
  { name: 'session.background', args: '<id>', summary: 'List agent-owned background terminals', gui: '后台进程' },
  { name: 'session.background-stop', args: '<id> [--process ID]', summary: 'Stop one or all agent-owned background terminals', gui: '停止后台进程' },
  { name: 'session.review', args: '<id> [--base BRANCH|--commit SHA|--instructions TEXT]', summary: 'Run native Codex review for a chosen target', gui: '/review' },
  { name: 'session.enqueue', args: '<id> <text>', summary: 'Queue a message after the active turn', gui: '排队发送' },
  { name: 'session.queue', args: '<id>', summary: 'List queued messages', gui: '待发送消息' },
  { name: 'session.dequeue', args: '<id> <messageId>', summary: 'Remove a queued message', gui: '取消排队' },
  { name: 'session.export', args: '<id> [--format markdown|json] [--path RELATIVE]', summary: 'Export conversation into the employee workspace', gui: '导出会话' },
  { name: 'view.tools', args: '<skills|mcp|account|usage|config|export|off>', summary: 'Open or close the engine tools panel', gui: '引擎工具面板' },
  { name: 'config.fast', args:'<id> on|off',summary:'Set the official Fast service tier',gui:'Fast 速度开关' },
  { name: 'commands.run', args:'<id> /command [args]',summary:'Execute a discovered slash command through shared Core',gui:'斜杠命令' },
  { name: 'commands.list', args: '<id> [--filter X] [--all]', summary: 'Slash commands available to a session', gui: 'The “/” menu' },
  { name: 'commands.complete', args: '<id> <name>', summary: 'What Tab would insert', gui: 'Tab/⏎ in the “/” menu' },
  { name: 'group.list', args: '', summary: 'List departments', gui: 'Department headings' },
  { name: 'team-view.list', args: '', summary: 'List All Team and saved Team views with the active selection', gui: '顶部视图标签' },
  { name: 'team-view.create', args: '--name NAME [--teams @teams.json]', summary: 'Create and select a named view of existing Teams', gui: '＋ 添加视图' },
  { name: 'team-view.update', args: 'ID --patch @patch.json', summary: 'Rename a view or change its Team membership', gui: '编辑视图' },
  { name: 'team-view.remove', args: 'ID', summary: 'Delete a custom view without deleting Teams', gui: '删除视图' },
  { name: 'team-view.select', args: 'all|ID', summary: 'Select a saved Team view and its canvas viewport', gui: '切换视图' },
  { name: 'group.add', args: '<name> [--mode work|build|cloud] [--plugin ID] [--host-id ID --remote-dir PATH]', summary: 'Create a Team; Work uses the fixed plugin workspace, Build may bind a folder', gui: '“+ Department”' },
  { name: 'group.configure', args: '<name> --mode work|build|cloud [--plugin ID] [--host-id ID --remote-dir PATH]', summary: 'Bind a Team to a plugin or registered cloud host and directory', gui: 'Team 工作方式与连接' },
  { name: 'group.remove', args: '<name>', summary: 'Delete a department', gui: '× beside a department' },
  { name: 'room.place', args: '<name> --col N --row N [--w N --h N]', summary: 'Position a department’s room on the floor', gui: 'Dragging a room by its sign' },
  { name: 'card.rename', args: '<cardId> <title>', summary: 'Compatibility endpoint; employee names are immutable', gui: '✎ on a card' },
  { name: 'card.move', args: '<cardId> <group> [--before id] [--cwd existing-path]', summary: 'Move an employee between Teams; --cwd binds an existing folder', gui: 'Dragging a card' },
  { name: 'card.remove', args: '<cardId>', summary: 'Remove an employee and all associated host/native conversations, keeping work files', gui: '移除员工及全部会话' },
  { name: 'card.clone', args: '<id> --title NAME [--directory-mode default|bind] [--cwd PATH]', summary: 'Clone an employee with an independent native conversation', gui: '克隆员工' },
  { name: 'card.create', args: '--title NAME [--kind worker|cloud-native-worker] [--engine E] [--avatar cat]', summary: 'Hire a Local or Cloud Native Worker', gui: '添加员工' },
  { name: 'card.update', args: '<cardId> [--avatar fox] [--role ROLE] [--color HEX]', summary: 'Edit an employee and its avatar', gui: '员工资料' },
  { name: 'group.rename', args: '<name> <newName>', summary: 'Rename a Team without renaming or moving its workspace folder', gui: 'Team 名称' },
  { name: 'room.design', args: '<name> [--theme sage] [--wall windows] [--desk oak]', summary: 'Replace room surfaces and furnishings', gui: '空间设计' },
  { name: 'group.migrate', args: '<name>', summary: 'Move a legacy Team into its managed directory, preserving files', gui: '修复旧工作目录' },
  { name: 'group.root', args: '<name> <absolute-folder>', summary: 'Bind an external Team root', gui: 'Team 外部文件夹' },
  { name: 'room.bounds', args: '<name> --x N --y N --width N --height N [--shape S] [--arrangement A]', summary: 'Move and resize a canvas room', gui: '拖动、缩放 Team' },
  { name: 'room.layout', args: '<name>', summary: 'Computed bounds and full-size employee positions', gui: 'Team 画布布局' },
  { name: 'card.place', args: '<id> --x N --y N [--snap on|off] [--zoom N]', summary: 'Place an employee freely or snap to nearby seats', gui: '拖动员工' },
  { name: 'canvas.view', args: '', summary: 'Read viewport position and zoom', gui: '画布视野' },
  { name: 'canvas.set', args: '--x N --y N --zoom N', summary: 'Pan and zoom the canvas', gui: '平移、缩放画布' },
  { name: 'plugin.list', args: '', summary: 'List installed software plugins', gui: 'Team 工作空间插件' },
  { name: 'plugin.describe', args: '<id>', summary: 'Read a plugin manifest, API schema and Markdown guide', gui: '插件信息' },
  { name: 'plugin.install', args: '<directory>', summary: 'Install a compatible local plugin package', gui: 'CLI 安装插件' },
  { name: 'plugin.call', args: '<id> <method> --team NAME [--params JSON]', summary: 'Invoke a plugin API inside a Team workspace', gui: '插件中的操作' },
  { name: 'plugin.open', args: '<id> [--team NAME|--employee ID]', summary: 'Open or focus an independent plugin window', gui: '独立插件窗口' },
  { name: 'plugin.windows', args: '', summary: 'List plugin window state, also in headless mode', gui: '独立插件窗口' },
  { name: 'plugin.place', args: '<windowId> --x N --y N --width N --height N', summary: 'Move and resize a plugin window', gui: '独立插件窗口' },
  { name: 'plugin.mode', args: '<windowId> normal|minimized|maximized|fullscreen', summary: 'Change native plugin window state', gui: '插件窗口最小化、还原与全屏' },
  { name: 'plugin.dismiss', args: '<windowId>', summary: 'Save and close an independent plugin window', gui: '独立插件窗口' },
  { name: 'plugin.view', args: '<id> [--team NAME|--employee ID]', summary: 'Open a plugin view in its managed root or selected scope', gui: 'Team 工作空间' },
  { name: 'plugin.close', args: '<viewId>', summary: 'Close an embedded plugin view', gui: '关闭工作空间' },
  { name: 'workspace.docs', args: '--team NAME', summary: 'Refresh standardized CLI documentation in the workspace', gui: '自动准备 Agent 文档' },
  { name: 'workspace.suggest', args: '--team NAME', summary: 'Suggest an external workspace directory without changing files', gui: '默认工作目录' },
  { name: 'workspace.choose', args: '[--path PATH]', summary: 'Choose a folder in the desktop directory picker', gui: '选择文件夹' },
  { name: 'remote.check', args: '--team NAME | --employee ID | --remote-host HOST --remote-dir PATH', summary: 'Check SSH and the target working directory; return remote OS details', gui: '云端工作目录诊断'},
  { name: 'terminal.open', args: '--employee ID [--cols N --rows N]', summary: 'Open a PTY in the employee working directory', gui: '新建终端'},
  { name: 'terminal.list', args: '[--employee ID]', summary: 'List employee terminals', gui: '终端标签'},
  { name: 'terminal.read', args: 'ID [--cursor N]', summary: 'Read terminal output since an offset', gui: '终端输出'},
  { name: 'terminal.input', args: 'ID --data TEXT [--enter]', summary: 'Send terminal input, including control keys', gui: '终端输入'},
  { name: 'terminal.resize', args: 'ID --cols N --rows N', summary: 'Resize the PTY', gui: '终端尺寸'},
  { name: 'terminal.close', args: 'ID', summary: 'Close a terminal and its shell', gui: '关闭终端'},
  { name: 'workspace.list', args: '[path] [--shared|--team NAME|--employee ID]', summary: 'List real workspace files', gui: '文件目录' },
  { name: 'workspace.image', args: '<path> [--shared|--team NAME|--employee ID]', summary: 'Read a scoped image for preview or model input', gui: '图片预览和附件' },
  { name: 'workspace.read', args: '<path> [--shared|--team NAME|--employee ID]', summary: 'Read a workspace file', gui: '文件预览' },
  { name: 'workspace.write', args: '<path> [--shared|--team NAME|--employee ID] --content TEXT [--hash HASH]', summary: 'Save a workspace file', gui: '保存文件' },
  { name: 'workspace.mkdir', args: '<path> [--shared|--team NAME|--employee ID]', summary: 'Create a folder', gui: '新建文件夹' },
  { name: 'workspace.move', args: '<path> --to PATH [--shared|--team NAME|--employee ID]', summary: 'Rename or move a file', gui: '重命名文件' },
  { name: 'workspace.trash', args: '<path> [--shared|--team NAME|--employee ID]', summary: 'Move a file to recoverable workspace trash', gui: '移到回收站' },
  { name: 'workspace.restore', args: '--id ID [--shared|--team NAME|--employee ID]', summary: 'Restore a trashed file', gui: '撤销删除' },

  // UI inspection. These read what is actually on screen, so a test can assert
  // the interface rendered rather than only that the store changed.
  { name: 'ui.view', args: '', summary: 'Which view is showing (home or a session)', gui: 'The screen itself' },
  { name: 'ui.dom', args: '[--sel CSS]', summary: 'Query the live interface', gui: 'The screen itself' },
  { name: 'ui.text', args: '', summary: 'All visible text, as rendered', gui: 'The screen itself' },
  { name: 'ui.click', args: '<selector>', summary: 'Click an element in the interface', gui: 'That click' },
  { name: 'ui.type', args: '<selector> <text>', summary: 'Type into an input', gui: 'That typing' },
  { name: 'ui.wait', args: '<selector> [--timeout ms]', summary: 'Wait for an element to appear', gui: 'Waiting for the UI to catch up' },
  { name: 'ui.style', args: '<selector>', summary: 'Computed styles of an element', gui: 'How it actually looks' },
  { name: 'ui.screenshot', args: '<path>', summary: 'Save a screenshot', gui: 'Rendered interface' },
  { name: 'ui.drag', args: '<selector> --dx N --dy N', summary: 'Drag a rendered component', gui: '拖动控件' },
  { name: 'ui.wheel', args: '<selector> --dx N --dy N [--zoom]', summary: 'Pan or zoom with the mouse wheel', gui: '画布滚轮' }
]

/** The shape a UI query returns. */
export type UiElement = {
  tag: string
  cls: string
  text: string
  visible: boolean
}

export type UiSnapshot = {
  view: 'home' | 'session'
  departments: string[]
  cards: { title: string; engine: string; group: string }[]
  /** Present only in the session view. */
  session?: {
    title: string
    engine: string
    model: string
    permission: string
    thinking: string
    thinkingEnabled: boolean
    busy: boolean
    turns: number
    hasBackButton: boolean
  }
  counts: Record<string, number>
}
