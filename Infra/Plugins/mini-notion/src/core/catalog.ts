import { assistantCommands } from './assistantCommands';
import { folderCommands } from './folderCatalog.ts';
import { commandExamples } from './commandExamples.ts';
import type { CommandDefinition } from './protocol.ts';

const arg = (name: string, description: string, required = true) => ({ name, description, required });
const string = (description: string) => ({ type: 'string' as const, description });
const json = (description: string) => ({ type: 'json' as const, description });
const flag = (description: string) => ({ type: 'boolean' as const, description });
const list = (description: string) => ({ type: 'list' as const, description });
export const commands: CommandDefinition[] = [
  ...assistantCommands,
  ...folderCommands,
  { method: 'guide', description: 'Agent 实操手册：从原生页面、Markdown、数据库视图到宿主子任务与验收', arguments: [arg('topic', 'start / pages / blocks / databases / delegation / verify', false)] },
  { method: 'block.validate', description: '只读校验正文块并生成规范结构；不写页面', options: { blocks: { ...json('原生块数组；table 单元格为字符串/行内数组'), required: true } }, examples: [{ blocks: [{ type: 'table', content: { type: 'tableContent', rows: [{ cells: ['模块', '职责'] }, { cells: ['Core', '共享后端'] }] } }] }] },
  { method: 'page.write-markdown', description: '将 Markdown 转为可编辑原生正文并保存到页面；不会只是写 .md 文件', mutates: true, arguments: [arg('pageId', '已有页面 ID')], options: { markdown: { ...string('完整 Markdown；标题/列表/代码/表格由共享解析器转换'), required: true }, mode: string('replace（默认）/ append；replace 仅替换正文，不改 ID/父级/数据库定义'), expectedHash: string('page.read-markdown 返回的正文哈希；防覆盖并发修改') }, examples: [{ pageId: 'PAGE_ID', markdown: '## 技术实现\n\n| 模块 | 职责 |\n| --- | --- |\n| Core | 共享后端 |\n', mode: 'append' }] },
  { method: 'page.read-markdown', description: '读取页面的 Markdown 文本投影、正文哈希及块数；特殊块以文本投影表示', arguments: [arg('pageId', '已有页面 ID')] },
  { method: 'page.audit', description: '验收一个页面树：完整 ID、父级、深度、正文字符数、空页面和真实数据库视图', arguments: [arg('pageId', '待验收主页面 ID')] },
  {
    method: 'ui.register',
    description: '声明当前交互客户端已就绪或退出，不创建窗口；与嵌入界面共用生命周期接口',
    mutates: true,
    options: { ready: flag('客户端是否就绪；传 false 取消注册') },
  },
  {
    method: 'agent.revert',
    description: '预览或撤销 Codex 回合的文件差异，内容冲突时拒绝覆盖',
    mutates: true,
    arguments: [arg('pageId', '空间 ID'), arg('turnId', '原生回合 ID')],
    options: { file: string('仅撤销指定文件，使用 agent.diff 的 path'), apply: flag('执行撤销；默认只预览') },
  },
  {
    method: 'file.resolve',
    description: '同步并定位 Workspace 文件链接（支持绝对/相对路径、file URL 和行号）',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
    options: { path: string('文件路径，可含 :行号 或 #L行号') },
  },
  {
    method: 'agent.review',
    description: 'Codex 原生代码审查：当前会话或独立审查会话',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
    options: {
      target: json('uncommittedChanges / baseBranch+branch / commit+sha / custom+instructions'),
      delivery: string('inline/detached；默认 inline'),
    },
  },
  {
    method: 'agent.diff',
    description: '文件审阅文本投影：每轮最终差异和逐次文件操作',
    arguments: [arg('pageId', '空间 ID')],
    options: { query: string('按路径或修改内容搜索') },
  },
  {
    method: 'agent.rewind',
    description: '预览或恢复到 Claude 用户消息对应的文件检查点',
    mutates: true,
    arguments: [arg('pageId', '空间 ID'), arg('messageId', '用户消息 ID')],
    options: { apply: flag('执行恢复；默认只预览') },
  },
  {
    method: 'space.purge',
    description: '重试清理已永久删除 Workspace 的物理文件和全部会话日志',
    mutates: true,
    arguments: [arg('pageId', '已删除的空间 ID')],
  },
  {
    method: 'space.sync',
    description: '扫描物理工作目录，把 Agent 或外部工具写入的文件和文件夹同步到页面',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
  },
  {
    method: 'overview.get',
    description: '跨空间综合页面：全部事项、来源、日期、完成状态、提醒与跳转地址',
    options: {
      view: string('agenda/calendar/board/table/timeline'),
      date: string('参考日期 YYYY-MM-DD'),
      scope: string('all/today/upcoming/overdue/unscheduled'),
      spaceId: string('限定空间'),
      query: string('搜索'),
      hideCompleted: flag('隐藏已完成'),
    },
  },
  {
    method: 'overview.render',
    description: '综合页面的精确文本投影，包含分组和日历日期格',
    options: { view: string('视图'), date: string('日期') },
  },
  {
    method: 'overview.configure',
    description: '保存综合页面视图、日期、空间和筛选设置',
    mutates: true,
    options: { changes: json('view/date/scope/spaceId/query/hideCompleted') },
  },
  {
    method: 'agent.capabilities',
    description: '连接官方 CLI 引擎并读取真实模型、命令和能力',
    arguments: [arg('pageId', '空间 ID')],
  },
  {
    method: 'agent.protocol',
    description: '读取本机引擎完整原生方法及参数 Schema（Codex 由本机 CLI 生成）',
    arguments: [arg('pageId', '空间 ID')],
  },
  {
    method: 'agent.context',
    description: '查询本 Workspace 可引用的页面、记录和文件；与 Agent @ 菜单同源',
    arguments: [arg('pageId', '空间 ID')],
    options: { query: string('按名称或位置搜索') },
  },
  {
    method: 'agent.context-usage',
    description: '读取原生引擎上下文用量，与累计输入/输出区分',
    arguments: [arg('pageId', '空间 ID')],
  },
  {
    method: 'agent.command',
    description: '执行 Agent 斜杠命令，与面板使用同一分发器',
    arguments: [arg('pageId', '空间 ID')],
    options: { text: string('完整斜杠命令') },
  },
  {
    method: 'agent.configure',
    description: '保存模型、思考强度、模式、审批和任意原生配置',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
    options: {
      options: json(
        'model / effort / mode / approval / config / focusView；Claude sdk 对象可配置 mcpServers、tools、extraArgs 等运行参数',
      ),
      replace: flag('替换完整配置；省略的字段恢复默认'),
      before: json('编辑前配置；用于合并其他控件或 CLI 的同期修改'),
    },
  },
  {
    method: 'agent.control',
    description: '调用官方引擎控制协议；Codex 使用 RPC 方法和参数，Claude 使用 SDK 方法及 params.args',
    arguments: [arg('pageId', '空间 ID')],
    options: { method: string('原生控制方法'), params: json('原生参数') },
  },
  {
    method: 'agent.respond',
    description: '回答引擎的审批、问题或其他交互请求',
    mutates: true,
    arguments: [arg('pageId', '空间 ID'), arg('requestId', '交互请求 ID')],
    options: { result: json('原生响应对象') },
  },
  {
    method: 'agent.steer',
    description: '在运行中追加指令',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
    options: { text: string('追加指令') },
  },
  {
    method: 'agent.queue',
    description: '查看、编辑、移除或继续执行待发送消息',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
    options: {
      action: string('list/update/remove/run；默认 list'),
      messageId: string('队列消息 ID'),
      text: string('修改后的消息正文'),
      context: json('修改后的页面/块引用数组'),
    },
  },
  { method: 'agent.sessions', description: '列出此空间的所有会话', arguments: [arg('pageId', '空间 ID')] },
  {
    method: 'agent.rename',
    description: '重命名当前会话，同时保存到原生 CLI 与空间历史',
    mutates: true,
    arguments: [arg('pageId', '空间 ID'), arg('title', '会话名称')],
  },
  {
    method: 'agent.new',
    description: '新建并切换会话，其他会话继续在后台运行，继承当前配置',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
  },
  {
    method: 'agent.fork',
    description: '保留原会话，从当前上下文建立新分支',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
  },
  {
    method: 'agent.close',
    description: '关闭会话标签并停止其执行；保留历史，可重新打开',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
  },
  {
    method: 'agent.resume',
    description: '恢复属于此空间的历史会话',
    mutates: true,
    arguments: [arg('pageId', '空间 ID'), arg('sessionId', '会话 ID')],
  },
  {
    method: 'schema',
    description: '查看全部 API 命令、参数和支持的类型',
    arguments: [arg('method', '具体方法名称', false)],
    options: { compact: flag('省略图标全集与外观全集；保留命令字段、内容格式和示例') },
  },
  { method: 'status', description: '服务、工作空间与数据状态' },
  { method: 'workspace.get', description: '读取完整工作空间' },
  {
    method: 'workspace.init',
    description: '初始化尚不存在的工作空间',
    mutates: true,
    options: { name: string('工作空间名称'), empty: flag('不添加入门示例') },
  },
  {
    method: 'workspace.rename',
    description: '重命名工作空间',
    mutates: true,
    arguments: [arg('name', '名称')],
  },
  {
    method: 'workspace.patch',
    description: '应用 GUI/CLI 共用的差异修改，检测并发冲突',
    mutates: true,
    options: { patch: json('包含 before/after 的工作空间补丁'), force: flag('明确覆盖发生冲突的字段') },
  },
  {
    method: 'workspace.replace',
    description: '以完整工作空间替换当前数据（需要确认及版本号）',
    mutates: true,
    options: {
      workspace: json('完整工作空间'),
      confirm: flag('确认替换'),
      revision: { type: 'number', description: '预期修订号' },
    },
  },
  {
    method: 'page.list',
    description: '列出页面',
    options: {
      parentId: string('父页面 ID；root 表示顶层'),
      trash: flag('包含回收站'),
      favorites: flag('仅收藏'),
      databases: flag('仅数据库'),
      full: flag('包含完整正文'),
    },
  },
  {
    method: 'page.tree',
    description: '读取页面树；文件夹模式按物理目录逐层展示',
    options: { parentId: string('父页面 ID'), trash: flag('包含回收站'), files: flag('额外包含普通文件预览；默认只显示页面和目录') },
  },
  { method: 'page.get', description: '读取页面及其全部内容', arguments: [arg('pageId', '页面 ID')] },
  {
    method: 'page.create',
    description: '创建页面',
    mutates: true,
    options: {
      title: string('页面标题'),
      parentId: string('父页面 ID'),
      icon: string('emoji / icon:<name>:<color> / 本地图片；schema 返回完整图标目录'),
      cover: string('封面名称或附件 URL'),
      appearance: json('页面外观；字段详见 schema 的 appearance.page'),
      blocks: json('块数组'),
      values: json('数据库属性值'),
      favorite: flag('收藏页面'),
      fullWidth: flag('全宽页面'),
    },
  },
  {
    method: 'page.update',
    description: '修改标题、图标、封面、字体、宽度及 appearance 外观等页面属性',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
    options: {
      changes: json('页面属性变更'),
      title: string('标题'),
      icon: string('emoji / icon:<name>:<color> / 本地图片；schema 返回完整图标目录'),
      cover: string('封面'),
      font: string('default / serif / mono'),
      fullWidth: flag('全宽'),
      smallText: flag('小号文本'),
      locked: flag('锁定'),
    },
  },
  {
    method: 'page.move',
    description: '移动页面及其子页面',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
    options: { parentId: string('目标父页面；root 表示顶层'), beforeId: string('放在此页面之前') },
  },
  {
    method: 'page.duplicate',
    description: '复制页面、子页面及内部引用',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
  },
  {
    method: 'page.favorite',
    description: '设置收藏状态',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
    options: { remove: flag('取消收藏') },
  },
  { method: 'page.trash', description: '移到回收站', mutates: true, arguments: [arg('pageId', '页面 ID')] },
  {
    method: 'page.restore',
    description: '从回收站恢复页面',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
  },
  {
    method: 'page.purge',
    description: '永久删除页面及其子页面',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
    options: { confirm: flag('确认永久删除') },
  },
  {
    method: 'page.open',
    description: '在图形端打开页面',
    arguments: [arg('pageId', '页面 ID')],
    options: { viewId: string('切换到指定数据库视图'), blockId: string('定位正文块'), mode: string('full/side/center/tab') },
  },
  {
    method: 'block.list',
    description: '读取块及稳定 ID',
    arguments: [arg('pageId', '页面 ID')],
    options: { flat: flag('展开为含父 ID 的列表') },
  },
  {
    method: 'block.get',
    description: '读取一个块',
    arguments: [arg('pageId', '页面 ID'), arg('blockId', '块 ID')],
  },
  {
    method: 'block.append',
    description: '插入文本、标题、待办、表格、媒体等块',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
    options: {
      type: string('块类型'),
      text: string('文本内容'),
      blocks: json('完整块数组'),
      props: json('块属性'),
      children: json('子块'),
      parentId: string('父块 ID'),
      beforeId: string('位置：在此块之前'),
      afterId: string('位置：在此块之后'),
    },
  },
  {
    method: 'block.update',
    description: '更新块内容、类型或属性',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('blockId', '块 ID')],
    options: {
      changes: json('块变更'),
      text: string('文本内容'),
      type: string('块类型'),
      props: json('块属性'),
    },
  },
  {
    method: 'block.replace',
    description: '替换页面的整个块文档',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
    options: { blocks: json('新的块数组') },
  },
  {
    method: 'block.move',
    description: '移动块，支持缩进及调整顺序',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('blockId', '块 ID')],
    options: {
      parentId: string('目标父块；root 表示顶层'),
      beforeId: string('放在此块之前'),
      afterId: string('放在此块之后'),
      targetPageId: string('移动到其他页面'),
    },
  },
  {
    method: 'block.duplicate',
    description: '复制块及其子块',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('blockId', '块 ID')],
  },
  {
    method: 'block.delete',
    description: '删除一个或多个块',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
    options: { ids: list('逗号分隔的块 ID') },
  },
  {
    method: 'block.format',
    description: '格式化块文本（加粗、颜色、链接等样式）',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('blockId', '块 ID')],
    options: {
      styles: json('格式对象，例如 {"bold":true}'),
      from: { type: 'number', description: '起始字符位置' },
      to: { type: 'number', description: '结束字符位置' },
    },
  },
  {
    method: 'database.create',
    description: '创建数据库',
    mutates: true,
    options: {
      title: string('数据库名称'),
      appearance: json('数据库页面外观'),
      parentId: string('父页面'),
      columns: json('属性定义数组'),
      view: string('初始视图类型'),
    },
  },
  {
    method: 'database.get',
    description: '读取数据库定义与视图',
    arguments: [arg('databaseId', '数据库 ID')],
  },
  {
    method: 'database.embed',
    description: '在正文中创建内联数据库或独立的关联视图',
    mutates: true,
    arguments: [arg('pageId', '所在页面 ID')],
    options: {
      databaseId: string('引用已有数据库；省略时新建内联数据库'),
      title: string('新数据库名称'),
      view: string('初始视图类型'),
      afterId: string('放在此块之后'),
      beforeId: string('放在此块之前'),
      parentBlockId: string('父块 ID'),
    },
  },
  {
    method: 'record.list',
    description: '查询记录，使用与 GUI 相同的筛选、排序和公式',
    arguments: [arg('databaseId', '数据库 ID')],
    options: {
      viewId: string('视图 ID'),
      query: string('搜索文字'),
      filters: json('筛选组'),
      sorts: json('排序数组'),
      full: flag('包含正文'),
    },
  },
  {
    method: 'record.create',
    description: '创建数据库记录',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID')],
    options: { title: string('名称'), values: json('属性 ID → 值的对象；也接受唯一属性名称，落盘统一使用 ID'), blocks: json('正文块'), icon: string('emoji / icon:<name>:<color> / 本地图片；schema 返回完整图标目录'), appearance: json('记录页及其卡片的外观') },
  },
  {
    method: 'record.update',
    description: '更新记录属性和内容',
    mutates: true,
    arguments: [arg('pageId', '记录页面 ID')],
    options: { values: json('属性 ID → 值的变更；也接受唯一属性名称'), title: string('名称'), changes: json('其他页面变更') },
  },
  {
    method: 'record.bulk',
    description: '批量更新记录属性',
    mutates: true,
    options: { ids: list('记录 ID'), values: json('属性 ID → 值的变更；也接受唯一属性名称') },
  },
  { method: 'property.list', description: '列出数据库属性', arguments: [arg('databaseId', '数据库 ID')] },
  {
    method: 'property.add',
    description: '添加属性，包括公式和关联',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID')],
    options: {
      name: string('名称'),
      type: string('属性类型'),
      options: list('单选/多选选项'),
      formula: string('公式表达式'),
      definition: json('完整属性定义'),
    },
  },
  {
    method: 'property.update',
    description: '修改属性定义',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('propertyId', '属性 ID')],
    options: {
      changes: json('定义变更'),
      optionRenames: json('选项重命名映射：旧名称到新名称'),
      name: string('名称'),
      type: string('类型'),
      formula: string('公式'),
      options: list('选项'),
    },
  },
  {
    method: 'property.delete',
    description: '删除属性，并移除相关视图条件',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('propertyId', '属性 ID')],
  },
  { method: 'view.list', description: '列出所有保存的视图', arguments: [arg('databaseId', '数据库 ID')] },
  {
    method: 'view.create',
    description: '创建表格、看板、计划、日历、时间线、图表等视图',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID')],
    options: { type: string('视图类型'), name: string('视图名称'), config: json('完整视图配置') },
  },
  {
    method: 'view.update',
    description: '设置布局、筛选、排序、分组、列宽、属性显示等',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('viewId', '视图 ID')],
    options: { changes: json('视图变更'), unset: list('移除可选配置字段，恢复默认值') },
  },
  {
    method: 'view.select',
    description: '选择视图并在 GUI 同步',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('viewId', '视图 ID')],
  },
  {
    method: 'view.duplicate',
    description: '复制视图及其独立配置',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('viewId', '视图 ID')],
    options: { name: string('新名称') },
  },
  {
    method: 'view.delete',
    description: '删除视图（不会删除记录）',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('viewId', '视图 ID')],
  },
  {
    method: 'view.reorder',
    description: '调整视图顺序',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID')],
    options: { ids: list('按顺序排列的全部视图 ID') },
  },
  {
    method: 'view.navigate',
    description: '切换计划/日历/时间线的日期，与 GUI 同步',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('viewId', '视图 ID')],
    options: { date: string('YYYY-MM-DD'), direction: string('previous / next / today') },
  },
  {
    method: 'view.render',
    description: '以结构化数据/文本查看图形视图的内容',
    arguments: [arg('databaseId', '数据库 ID')],
    options: { viewId: string('视图 ID'), from: string('日期范围起点'), to: string('日期范围终点') },
  },
  {
    method: 'form.submit',
    description: '提交表单，遵守必填配置',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('viewId', '表单视图 ID')],
    options: { title: string('名称'), values: json('回答') },
  },
  {
    method: 'formula.evaluate',
    description: '在记录上下文中计算 Notion 公式',
    arguments: [arg('pageId', '记录 ID')],
    options: { expression: string('公式表达式'), propertyId: string('现有公式属性 ID') },
  },
  {
    method: 'search',
    description: '搜索标题、正文和属性',
    arguments: [arg('query', '关键词')],
    options: {
      limit: { type: 'number', description: '最多返回数量' },
      titleOnly: flag('仅匹配标题'), inPageId: string('限定页面及其子页面'),
      kind: string('all/page/database'), sort: string('relevance/edited-desc/edited-asc/created-desc/created-asc'),
      dateField: string('edited/created'), after: string('日期范围起点 YYYY-MM-DD'), before: string('日期范围终点 YYYY-MM-DD'),
    },
  },
  { method: 'settings.get', description: '读取工作空间偏好设置' },
  {
    method: 'settings.set',
    description: '配置主题、侧栏与拼写检查',
    mutates: true,
    options: { changes: json('设置对象'), theme: string('light / dark / system') },
  },
  { method: 'template.list', description: '列出可用的内置模板' },
  {
    method: 'template.use',
    description: '用模板创建页面',
    mutates: true,
    arguments: [arg('templateId', '模板 ID')],
    options: { parentId: string('父页面'), title: string('页面标题') },
  },
  { method: 'history.list', description: '页面历史版本', arguments: [arg('pageId', '页面 ID')] },
  {
    method: 'history.operations',
    description: '最近 150 项 GUI/CLI 数据操作',
    options: { pageId: string('按页面筛选') },
  },
  {
    method: 'history.undo',
    description: '撤销数据操作；检测与后续编辑的冲突',
    mutates: true,
    options: { pageId: string('撤销此页面的最近操作'), id: string('指定操作 ID') },
  },
  {
    method: 'history.redo',
    description: '重做已撤销的数据操作',
    mutates: true,
    options: { pageId: string('重做此页面的最近操作'), id: string('指定操作 ID') },
  },
  { method: 'history.snapshot', description: '立即保存一个页面版本', arguments: [arg('pageId', '页面 ID')] },
  {
    method: 'history.restore',
    description: '恢复页面版本',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('versionId', '历史版本 ID')],
  },
  { method: 'asset.list', description: '列出本地附件' },
  { method: 'asset.add', description: '导入本地附件', arguments: [arg('path', '文件路径')] },
  {
    method: 'asset.get',
    description: '导出或定位附件',
    arguments: [arg('url', '附件 URL')],
    options: { output: string('导出路径') },
  },
  {
    method: 'file.import',
    description: '导入 Markdown、HTML、CSV、文本或 JSON',
    mutates: true,
    arguments: [arg('path', '文件路径')],
    options: { parentId: string('父页面'), pageId: string('追加到现有页面') },
  },
  {
    method: 'file.export',
    description: '导出页面与附件',
    arguments: [arg('pageId', '页面 ID')],
    options: { output: string('输出文件'), type: string('md / html / json / csv / pdf') },
  },
  {
    method: 'backup.export',
    description: '导出含附件的完整备份',
    arguments: [arg('path', '输出 .mininotion 文件')],
  },
  {
    method: 'backup.restore',
    description: '从完整备份恢复',
    mutates: true,
    arguments: [arg('path', '备份文件')],
    options: { confirm: flag('确认替换当前工作空间') },
  },
  { method: 'conflict.list', description: '列出保留的并发冲突草稿' },
  { method: 'conflict.get', description: '读取冲突双方数据', arguments: [arg('id', '冲突 ID')] },
  {
    method: 'conflict.resolve',
    description: '处理冲突草稿',
    mutates: true,
    arguments: [arg('id', '冲突 ID')],
    options: { strategy: string('local / remote') },
  },
  {
    method: 'batch',
    description: '原子执行多条数据修改，失败则全部不提交',
    mutates: true,
    options: { operations: json('方法与参数组成的数组') },
  },
  {
    method: 'ui.command',
    description: '文本控制 GUI：打开搜索、设置、页面、侧栏等',
    arguments: [arg('command', 'GUI 命令')],
    options: { params: json('命令参数') },
  },
  { method: 'service.stop', description: '停止本地 API 服务' },
];
commands.push(
  { method: 'person.list', description: '列出本地作者和可选择的人员' },
  {
    method: 'person.create',
    description: '创建本地人员名片',
    mutates: true,
    options: { name: string('姓名'), email: string('邮箱') },
  },
  {
    method: 'person.update',
    description: '更新本地人员资料及已有引用',
    mutates: true,
    arguments: [arg('id', '人员 ID')],
    options: { name: string('姓名'), email: string('邮箱') },
  },
  {
    method: 'person.delete',
    description: '从人员选择列表移除；保留已有记录的署名',
    mutates: true,
    arguments: [arg('id', '人员 ID')],
  },
);
commands.push(
  {
    method: 'sync.list',
    description: '列出共享同步内容和引用位置',
    options: { trash: flag('包含回收站中的源内容') },
  },
  {
    method: 'sync.create',
    description: '把连续内容块转换为共享同步内容',
    mutates: true,
    arguments: [arg('pageId', '所在页面 ID')],
    options: {
      blockIds: list('要转换的块 ID'),
      blocks: json('新同步内容，未选择已有块时使用'),
      name: string('共享内容名称'),
      parentId: string('父块 ID'),
      beforeId: string('插入位置'),
      afterId: string('插入位置'),
    },
  },
  {
    method: 'sync.get',
    description: '读取共享正文及所有引用位置',
    arguments: [arg('sourceId', '同步源 ID')],
  },
  {
    method: 'sync.update',
    description: '修改同步正文；也可使用 block 命令直接编辑 sourceId',
    mutates: true,
    arguments: [arg('sourceId', '同步源 ID')],
    options: { blocks: json('完整正文'), name: string('名称') },
  },
  {
    method: 'sync.link',
    description: '在另一个位置插入同步引用',
    mutates: true,
    arguments: [arg('sourceId', '同步源 ID'), arg('pageId', '目标页面 ID')],
    options: { parentId: string('父块'), beforeId: string('在此块前'), afterId: string('在此块后') },
  },
  {
    method: 'sync.unlink',
    description: '将一个同步引用转换为独立正文',
    mutates: true,
    arguments: [arg('pageId', '所在页面 ID'), arg('blockId', '同步引用块 ID')],
  },
  {
    method: 'sync.delete',
    description: '将源内容移到回收站，可先取消全部同步',
    mutates: true,
    arguments: [arg('sourceId', '同步源 ID')],
    options: { detach: flag('先把所有引用转换为独立正文') },
  },
);
commands.push(
  {
    method: 'comment.list',
    description: '列出页面或块的评论讨论',
    arguments: [arg('pageId', '页面 ID')],
    options: {
      blockId: string('只查看此块'),
      status: string('open / resolved / all'),
      deleted: flag('包含已删除评论'),
    },
  },
  {
    method: 'comment.get',
    description: '读取完整评论讨论',
    arguments: [arg('pageId', '页面 ID'), arg('threadId', '讨论 ID')],
  },
  {
    method: 'comment.add',
    description: '添加页面或内容块评论',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
    options: {
      text: string('评论内容'),
      blockId: string('关联的块 ID'),
      quote: string('选中文字'),
      author: string('本地署名'),
    },
  },
  {
    method: 'comment.reply',
    description: '回复讨论；已解决的讨论会重新打开',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('threadId', '讨论 ID')],
    options: { text: string('回复内容'), author: string('本地署名') },
  },
  {
    method: 'comment.update',
    description: '编辑评论内容',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('threadId', '讨论 ID'), arg('commentId', '评论 ID')],
    options: { text: string('新内容') },
  },
  {
    method: 'comment.delete',
    description: '删除讨论或其中一条评论，可恢复',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('threadId', '讨论 ID')],
    options: { commentId: string('省略时删除整个讨论') },
  },
  {
    method: 'comment.restore',
    description: '恢复已删除讨论或评论',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('threadId', '讨论 ID')],
    options: { commentId: string('需要恢复的评论 ID') },
  },
  {
    method: 'comment.resolve',
    description: '将讨论标记为已解决',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('threadId', '讨论 ID')],
  },
  {
    method: 'comment.reopen',
    description: '重新打开讨论',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('threadId', '讨论 ID')],
  },
  {
    method: 'comment.react',
    description: '切换本地表情反馈',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('threadId', '讨论 ID'), arg('commentId', '评论 ID')],
    options: { emoji: string('表情'), remove: flag('取消反馈') },
  },
);
commands.push({
  method: 'record.schedule',
  description: '安排或取消记录日期，移动时保留持续时间',
  mutates: true,
  arguments: [arg('pageId', '记录 ID'), arg('date', 'YYYY-MM-DD 或 ISO 日期时间；none 清除日期')],
  options: {
    end: string('结束日期或时间；省略结束属性时使用单属性范围'),
    timeZone: string('IANA 时区，如 Asia/Shanghai'),
    allDay: flag('移除具体时间，保留日期范围'),
    startProperty: string('开始日期属性 ID'),
    endProperty: string('结束日期属性 ID'),
    viewId: string('使用此视图的日期属性'),
  },
});
commands.push(
  {
    method: 'database.configure',
    description: '配置子项目、依赖和自动排期',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID')],
    options: {
      changes: json('数据库设置'),
      subItems: flag('启用子项目'),
      dependencies: json('enabled/dateProperty/endProperty/shift/avoidWeekends'),
    },
  },
  {
    method: 'subitem.create',
    description: '在某条记录下创建子项目',
    mutates: true,
    arguments: [arg('pageId', '父记录 ID')],
    options: { title: string('名称'), values: json('属性值'), templateId: string('模板 ID；none 表示空白') },
  },
  {
    method: 'subitem.set',
    description: '指定父项目或提升为顶层记录',
    mutates: true,
    arguments: [arg('pageId', '子记录 ID')],
    options: { parentId: string('父记录 ID；none 表示移出父项目') },
  },
  {
    method: 'subitem.children',
    description: '列出直接或全部下级子项目',
    arguments: [arg('pageId', '父记录 ID')],
    options: { recursive: flag('包含全部下级') },
  },
  {
    method: 'dependency.add',
    description: '追加一个前置依赖',
    mutates: true,
    arguments: [arg('pageId', '后续记录 ID'), arg('predecessorId', '前置记录 ID')],
  },
  {
    method: 'dependency.remove',
    description: '移除一个前置依赖，保留其他依赖',
    mutates: true,
    arguments: [arg('pageId', '后续记录 ID'), arg('predecessorId', '前置记录 ID')],
  },
  {
    method: 'dependency.set',
    description: '设置前置依赖，检测循环和跨数据库引用',
    mutates: true,
    arguments: [arg('pageId', '记录 ID')],
    options: { blockedBy: list('前置记录 ID') },
  },
  {
    method: 'dependency.list',
    description: '列出数据库中的依赖边',
    arguments: [arg('databaseId', '数据库 ID')],
    options: { pageId: string('只查看此记录的前置依赖') },
  },
  {
    method: 'relation.set',
    description: '设置普通关联、父/子项目或双向依赖属性',
    mutates: true,
    arguments: [arg('pageId', '记录 ID'), arg('propertyId', '关联属性 ID')],
    options: { ids: list('关联记录 ID；空数组可清除') },
  },
);
commands.push(
  {
    method: 'template.create',
    description: '创建可编辑正文、属性和子页面的数据库模板',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID')],
    options: {
      title: string('模板名称'),
      fromPageId: string('从已有页面创建'),
      blocks: json('正文块'),
      values: json('默认属性值'),
      icon: string('emoji / icon:<name>:<color> / 本地图片；schema 返回完整图标目录'),
    },
  },
  { method: 'template.get', description: '读取数据库模板', arguments: [arg('templateId', '模板页面 ID')] },
  {
    method: 'template.update',
    description: '编辑数据库模板，正文也可使用 block 命令',
    mutates: true,
    arguments: [arg('templateId', '模板页面 ID')],
    options: {
      title: string('名称'),
      changes: json('页面样式等变更'),
      blocks: json('正文'),
      values: json('默认属性值变更'),
    },
  },
  {
    method: 'template.duplicate',
    description: '复制数据库模板及其子页面',
    mutates: true,
    arguments: [arg('templateId', '模板页面 ID')],
  },
  {
    method: 'template.delete',
    description: '将数据库模板移入回收站',
    mutates: true,
    arguments: [arg('templateId', '模板页面 ID')],
  },
  {
    method: 'template.default',
    description: '为数据库或某个视图设置默认模板',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID')],
    options: { templateId: string('模板 ID；none 表示空白'), viewId: string('只设置此视图') },
  },
  {
    method: 'template.apply',
    description: '把模板应用到已有记录并保留已填写属性',
    mutates: true,
    arguments: [arg('templateId', '模板页面 ID'), arg('pageId', '记录页面 ID')],
    options: { mode: string('append / replace；默认追加正文') },
  },
);
for (const method of ['record.create', 'page.create']) {
  const command = commands.find((command) => command.method === method)!;
  command.options = {
    ...command.options,
    templateId: string('数据库模板 ID；none 表示空白'),
    viewId: string('使用此视图的默认模板'),
  };
}
for (const method of ['page.list', 'page.tree'])
  commands.find((command) => command.method === method)!.options = {
    ...commands.find((command) => command.method === method)!.options,
    templates: flag('包含数据库模板及模板子页面'),
  };
commands.find((command) => command.method === 'view.render')!.options = {
  ...commands.find((command) => command.method === 'view.render')!.options,
  date: string('只为此次查询指定日期，不改变保存的视图'),
};
commands.find((command) => command.method === 'template.list')!.options = {
  query: string('按名称、描述搜索内置模板'),
  category: string('基础 / 工作 / 学习 / 生活 / 创作'),
  databaseId: string('指定数据库；省略时列出内置模板'),
};
commands.find((command) => command.method === 'template.use')!.options = {
  ...commands.find((command) => command.method === 'template.use')!.options,
  values: json('覆盖模板的初始属性值'),
};
for (const command of commands) {
  if (
    command.method.startsWith('view.') ||
    ['record.list', 'record.create', 'form.submit'].includes(command.method)
  ) {
    command.options = {
      ...command.options,
      ownerPageId: string('关联视图所在页面 ID'),
      blockId: string('关联数据库块 ID；与 owner-page-id 一起使用'),
    };
  }
}

for (const method of ['page.list', 'page.tree']) {
  const command = commands.find((command) => command.method === method)!;
  command.options = { ...command.options, internal: flag('包含模板与同步内容源') };
}

commands.push(
  {
    method: 'repeat.list',
    description: '列出循环模板与下一次执行时间',
    options: { databaseId: string('数据库 ID，可省略') },
  },
  {
    method: 'repeat.get',
    description: '读取循环模板的规则与执行状态',
    arguments: [arg('templateId', '模板 ID')],
  },
  {
    method: 'repeat.configure',
    description: '设置循环规则；保存后后台自动执行',
    mutates: true,
    arguments: [arg('templateId', '模板 ID')],
    options: {
      rule: json('frequency/interval/startDate/time/timeZone/weekdays/catchUp/dateProperty 等设置'),
    },
  },
  {
    method: 'repeat.preview',
    description: '预览未来的触发时刻，不生成页面',
    arguments: [arg('templateId', '模板 ID')],
    options: {
      rule: json('临时规则覆盖'),
      after: string('从此 ISO 时刻之后预览'),
      count: { type: 'number', description: '预览数量，1–100' },
    },
  },
  {
    method: 'repeat.pause',
    description: '暂停循环，保留规则和进度',
    mutates: true,
    arguments: [arg('templateId', '模板 ID')],
  },
  {
    method: 'repeat.resume',
    description: '恢复循环，按补发策略处理错过的时刻',
    mutates: true,
    arguments: [arg('templateId', '模板 ID')],
  },
  {
    method: 'repeat.remove',
    description: '移除循环设置，保留模板与已生成页面',
    mutates: true,
    arguments: [arg('templateId', '模板 ID')],
  },
  {
    method: 'repeat.run',
    description: '立即生成一次，不影响固定循环的执行进度',
    mutates: true,
    arguments: [arg('templateId', '模板 ID')],
    options: { at: string('用作本次页面日期的 ISO 时刻') },
  },
  {
    method: 'repeat.history',
    description: '查看最近 300 次模板生成记录',
    options: { templateId: string('只看此模板') },
  },
  { method: 'scheduler.status', description: '查看本地循环、提醒与调度错误' },
  {
    method: 'scheduler.run',
    description: '检查并处理到期计划；与自动后台调度使用相同队列',
    mutates: true,
    options: { at: string('推进到此 ISO 时刻，会实际生成页面和提醒；仅预览请用 repeat.preview') },
  },
  {
    method: 'reminder.list',
    description: '列出页面提醒与计算后的触发时间',
    options: { pageId: string('只看此页面'), all: flag('包含回收站与已删除提醒') },
  },
  {
    method: 'reminder.get',
    description: '读取提醒定义',
    arguments: [arg('pageId', '页面 ID'), arg('reminderId', '提醒 ID')],
  },
  {
    method: 'reminder.add',
    description: '添加固定时间或日期属性提醒',
    mutates: true,
    arguments: [arg('pageId', '页面 ID')],
    options: {
      at: string('固定 ISO 日期时间'),
      propertyId: string('绑定日期属性 ID'),
      offset: { type: 'number', description: '提前量；负数表示之后' },
      unit: string('minutes 或 days'),
      dayTime: string('全天日期的提醒时刻，默认 09:00'),
      timeZone: string('IANA 时区'),
      text: string('提醒内容'),
    },
  },
  {
    method: 'reminder.update',
    description: '更新提醒定义或启停状态',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('reminderId', '提醒 ID')],
    options: { changes: json('提醒字段，如 at、offset、unit、enabled、text') },
  },
  {
    method: 'reminder.delete',
    description: '删除提醒，可恢复',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('reminderId', '提醒 ID')],
  },
  {
    method: 'reminder.restore',
    description: '恢复已删除提醒',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('reminderId', '提醒 ID')],
  },
  {
    method: 'reminder.snooze',
    description: '将当前提醒推迟到指定未来时刻',
    mutates: true,
    arguments: [arg('pageId', '页面 ID'), arg('reminderId', '提醒 ID')],
    options: { until: string('未来 ISO 日期时间'), inboxId: string('关联通知 ID，可省略') },
  },
  {
    method: 'inbox.list',
    description: '读取本地提醒收件箱',
    options: { status: string('active / unread / archived / all') },
  },
  { method: 'inbox.get', description: '读取一条通知', arguments: [arg('id', '通知 ID')] },
  ...(['read', 'unread', 'archive', 'restore'] as const).map((action) => ({
    method: `inbox.${action}`,
    description: (
      { read: '标为已读', unread: '标为未读', archive: '归档通知', restore: '取消归档' } as const
    )[action],
    mutates: true,
    arguments: [arg('id', '通知 ID', false)],
    options: { all: flag('处理全部通知') },
  })),
);

commands.push(
  {
    method: 'button.list',
    description: '列出页面按钮块和数据库按钮属性',
    options: { pageId: string('只看此页面') },
  },
  {
    method: 'button.create',
    description: '创建按钮块，或创建数据库按钮属性',
    mutates: true,
    arguments: [arg('pageId', '所在页面/数据库 ID')],
    options: {
      label: string('按钮名称'),
      actions: json('动作数组'),
      confirmation: string('可选确认文字'),
      property: flag('创建数据库按钮属性'),
      beforeId: string('放在此块之前'),
      afterId: string('放在此块之后'),
    },
  },
  {
    method: 'button.get',
    description: '读取按钮定义',
    arguments: [arg('pageId', '所在页面或记录 ID')],
    options: { blockId: string('按钮块 ID'), propertyId: string('按钮属性 ID') },
  },
  {
    method: 'button.configure',
    description: '修改按钮名称、确认文字和动作',
    mutates: true,
    arguments: [arg('pageId', '所在页面/数据库 ID')],
    options: {
      blockId: string('按钮块 ID'),
      propertyId: string('按钮属性 ID'),
      config: json('按钮配置'),
      label: string('名称'),
      actions: json('动作数组'),
    },
  },
  {
    method: 'button.preview',
    description: '只读预览动作及其触发的自动化变更',
    arguments: [arg('pageId', '运行上下文页面 ID')],
    options: {
      blockId: string('按钮块 ID'),
      propertyId: string('按钮属性 ID'),
      config: json('临时预览配置'),
    },
  },
  {
    method: 'button.run',
    description: '原子执行按钮动作；配置了确认文字时需要 --confirm',
    mutates: true,
    arguments: [arg('pageId', '运行上下文页面 ID')],
    options: {
      blockId: string('按钮块 ID'),
      propertyId: string('按钮属性 ID'),
      confirm: flag('确认执行'),
      expectedConfig: json('可选的预期配置，拒绝执行已变更的按钮'),
    },
  },
  {
    method: 'automation.list',
    description: '列出数据库自动化',
    options: { databaseId: string('只看此数据库') },
  },
  {
    method: 'automation.get',
    description: '读取一条自动化定义',
    arguments: [arg('databaseId', '数据库 ID'), arg('automationId', '自动化 ID')],
  },
  {
    method: 'automation.create',
    description: '创建有触发条件的数据库自动化',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID')],
    options: { rule: json('name/enabled/triggers/filters/actions/schedule 等设置') },
  },
  {
    method: 'automation.update',
    description: '修改数据库自动化',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('automationId', '自动化 ID')],
    options: { rule: json('自动化设置') },
  },
  ...(['pause', 'resume', 'delete'] as const).map((action) => ({
    method: `automation.${action}`,
    description: { pause: '暂停自动化', resume: '恢复自动化', delete: '删除自动化' }[action],
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('automationId', '自动化 ID')],
  })),
  {
    method: 'automation.preview',
    description: '预览某条记录上的自动化动作',
    arguments: [arg('databaseId', '数据库 ID'), arg('automationId', '自动化 ID')],
    options: { pageId: string('触发记录 ID'), rule: json('临时预览配置') },
  },
  {
    method: 'automation.run',
    description: '手动执行自动化，不触发其他自动化',
    mutates: true,
    arguments: [arg('databaseId', '数据库 ID'), arg('automationId', '自动化 ID')],
    options: { pageId: string('触发记录 ID') },
  },
  {
    method: 'action.history',
    description: '查看最近 300 次按钮/自动化执行记录',
    options: { pageId: string('只看此触发页面'), ownerId: string('只看此所属页面/数据库') },
  },
);

commands.push(
  {
    method: 'space.list',
    description: '列出全部空间（每个顶层页面即一个空间）',
  },
  {
    method: 'space.get',
    description: '读取空间配置、文件夹与文件',
    arguments: [arg('pageId', '空间页面 ID')],
  },
  {
    method: 'space.create',
    description: '新建空间：创建一个顶层页面并绑定引擎',
    mutates: true,
    options: {
      title: string('空间名称'),
      engine: string('agent 引擎：claude 或 codex'),
      parentId: string('仅支持 root，空间必须是顶层页面'),
    },
  },
  {
    method: 'space.configure',
    description: '修改空间名称；引擎固定绑定',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID')],
    options: { title: string('空间名称'), engine: string('claude 或 codex') },
  },
  {
    method: 'space.convert',
    description: '将现有顶层页面转换为空间',
    mutates: true,
    arguments: [arg('pageId', '顶层页面 ID')],
    options: { engine: string('claude 或 codex') },
  },
  {
    method: 'space.upload',
    description: '把本地文件上传到空间的文件夹',
    arguments: [arg('pageId', '空间页面 ID')],
    options: { path: string('本地文件路径'), folderId: string('目标文件夹 ID；省略表示根目录') },
  },
  {
    method: 'space.remove-file',
    description: '移除空间文件，可撤销；永久删除空间时清理磁盘',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID'), arg('fileId', '文件 ID')],
  },
  {
    method: 'space.reveal',
    description: '返回空间目录路径，便于在文件管理器中打开',
    arguments: [arg('pageId', '空间页面 ID')],
  },
  {
    method: 'folder.list',
    description: '列出空间中的文件夹',
    arguments: [arg('pageId', '空间页面 ID')],
  },
  {
    method: 'folder.create',
    description: '新建文件夹，可自定义层级',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID')],
    options: { name: string('文件夹名称'), parentId: string('父文件夹 ID') },
  },
  {
    method: 'folder.rename',
    description: '重命名文件夹',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID'), arg('folderId', '文件夹 ID')],
    options: { name: string('新名称') },
  },
  {
    method: 'folder.move',
    description: '移动文件夹到另一个文件夹或根目录',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID'), arg('folderId', '文件夹 ID')],
    options: { parentId: string('目标父文件夹 ID；省略表示根目录') },
  },
  {
    method: 'folder.delete',
    description: '删除文件夹及其内容',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID'), arg('folderId', '文件夹 ID')],
    options: { confirm: flag('确认删除非空文件夹') },
  },
  {
    method: 'file.list',
    description: '列出空间中的文件',
    arguments: [arg('pageId', '空间页面 ID')],
  },
  {
    method: 'file.record',
    description: '登记一个已上传的文件记录',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID')],
    options: {
      name: string('文件名'),
      url: string('附件 URL'),
      folderId: string('文件夹 ID'),
      bytes: { type: 'number', description: '字节数' },
      mimeType: string('MIME 类型'),
    },
  },
  {
    method: 'file.move',
    description: '移动文件到另一个文件夹',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID'), arg('fileId', '文件 ID')],
    options: { folderId: string('目标文件夹 ID；省略表示根目录') },
  },
  {
    method: 'file.remove',
    description: '移除文件记录',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID'), arg('fileId', '文件 ID')],
  },
  {
    method: 'agent.start',
    description: '启动空间 Agent 并发送首条消息；立即返回，用 mininotion watch 或 agent.history 查看进度',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID')],
    options: { prompt: string('自然语言指令'), engine: string('claude 或 codex，必须与空间已绑定引擎一致') },
  },
  {
    method: 'agent.send',
    description: '向空间 Agent 发送下一轮消息并续接会话；立即返回，用 watch 或 agent.history 查看进度',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID')],
    options: { text: string('消息内容') },
  },
  {
    method: 'agent.stop',
    description: '停止当前执行并保留 Agent 会话',
    mutates: true,
    arguments: [arg('pageId', '空间页面 ID')],
  },
  {
    method: 'agent.history',
    description: '读取 Agent 会话记录',
    arguments: [arg('pageId', '空间页面 ID')],
    options: { limit: { type: 'number', description: '返回的消息条数' } },
  },
  {
    method: 'agent.status',
    description: '查看 Agent 状态、会话 ID 与用量',
    arguments: [arg('pageId', '空间页面 ID')],
  },
);

commands.push(
  {
    method: 'file.get',
    description: '读取空间文件元信息',
    arguments: [arg('pageId', '空间 ID'), arg('fileId', '文件 ID')],
  },
  {
    method: 'file.read',
    description: '读取空间文件内容与磁盘路径',
    arguments: [arg('pageId', '空间 ID'), arg('fileId', '文件 ID')],
    options: { encoding: string('utf8 / base64') },
  },
  {
    method: 'file.create',
    description: '创建空间文件并登记到主页面',
    mutates: true,
    arguments: [arg('pageId', '空间 ID')],
    options: {
      name: string('文件名'),
      content: string('内容'),
      encoding: string('utf8 / base64'),
      folderId: string('文件夹 ID'),
      mimeType: string('MIME 类型'),
    },
  },
  {
    method: 'file.write-content',
    description: '编辑现有空间文件内容',
    mutates: true,
    arguments: [arg('pageId', '空间 ID'), arg('fileId', '文件 ID')],
    options: { content: string('内容'), encoding: string('utf8 / base64') },
  },
  {
    method: 'file.rename',
    description: '重命名空间文件',
    mutates: true,
    arguments: [arg('pageId', '空间 ID'), arg('fileId', '文件 ID')],
    options: { name: string('文件名') },
  },
);
for (const method of ['agent.start', 'agent.send', 'agent.steer']) {
  const command = commands.find((command) => command.method === method)!;
  command.options = {
    ...command.options,
    files: list('本地文件路径数组；先持久化再发送，可不传文本'),
    fileIds: list('已保存到此空间的文件 ID 数组'),
    delivery: string('运行时 queue 排队 / steer 追加 / interrupt 中断后执行'),
    context: json('页面或块引用：[{pageId, blockId?, quote?}]'),
  };
}
commands.find((command) => command.method === 'agent.history')!.options!.raw =
  flag('返回引擎原始 JSONL 事件');
commands.find((command) => command.method === 'space.upload')!.mutates = true;

for (const command of commands)
  if (commandExamples[command.method]) command.examples = commandExamples[command.method];

for (const command of commands)
  if (
    command.method.startsWith('agent.') &&
    !['agent.new', 'agent.resume', 'agent.fork', 'agent.sessions', 'agent.context'].includes(command.method)
  )
    command.options = {
      ...command.options,
      conversationId: string('目标会话的稳定 ID；省略时使用当前标签，不改变选中标签'),
    };

// Color is a first-class creation contract; JSON --data and CLI flags share validation.
for (const method of ['page.create', 'database.create', 'record.create', 'space.create', 'subitem.create', 'template.create', 'template.use', 'page.update', 'record.update', 'database.embed']) {
  const definition = commands.find((entry) => entry.method === method)!;
  const required = ['page.create', 'database.create', 'record.create', 'space.create', 'subitem.create'].includes(method);
  definition.options = { ...definition.options,
    color: { type: 'string', description: `${required ? '必填。' : ''}页面与日历事件共用颜色：white 默认白色、blue 常规、orange 重要、red 关键、green 资料、gray 低优先；也支持其他预设色或 #RRGGBB`, required },
    textColor: { type: 'string', description: '页面与事件默认文字颜色；default 自动适配背景，或预设色 / #RRGGBB' },
  };
}

// Selection variants reuse the same atomic Core operations and preserve single-block responses.
for (const method of ['block.update', 'block.duplicate', 'block.move']) {
  const command = commands.find(value => value.method === method)!;
  command.options = { ...command.options, ids: list('多块选区 ID；按文档顺序操作，已选父块的子块不重复处理') };
}
