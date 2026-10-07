import { normalizePageColors } from './core/appearance.ts';
import { makePage, defaultDatabase } from './model.ts';
import { getViews, newView } from './database/model.ts';
import { addDays, dateKey } from './database/dates.ts';
import type { JsonBlock, Page, Workspace } from './types';

const p = (content: string): JsonBlock => ({ type: 'paragraph', content });
const h = (content: string, level = 2): JsonBlock => ({ type: 'heading', props: { level }, content });
const todo = (content: string, checked = false): JsonBlock => ({
  type: 'checkListItem',
  props: { checked },
  content,
});
const bullet = (content: string): JsonBlock => ({ type: 'bulletListItem', content });

export type PageTemplate = { id: string; icon: string; name: string; description: string; category: string; blocks: JsonBlock[] } & Pick<Partial<Page>, 'appearance' | 'cover' | 'font' | 'fullWidth' | 'color' | 'textColor'>;
const callout = (emoji: string, backgroundColor: string, content: string): JsonBlock => ({ type: 'callout', props: { emoji, backgroundColor }, content });
const table = (rows: string[][]): JsonBlock => ({ type: 'table', content: { type: 'tableContent', rows: rows.map((cells) => ({ cells })) } });

const templateDrafts: PageTemplate[] = [
  { id: 'blank', icon: '📄', name: '空白页面', description: '从一个想法开始。', category: '基础', blocks: [] },
  {
    id: 'journal',
    category: '生活', cover: 'paper', appearance: { backgroundColor: 'brown', surface: 'paper', accentColor: 'brown' },
    icon: '☀️',
    name: '每日日记',
    description: '留一点时间，和自己对话。',
    blocks: [
      h('今天，值得记住的事'),
      p(''),
      h('三件感恩的小事'),
      bullet(''),
      bullet(''),
      bullet(''),
      h('此刻的想法'),
      p(''),
      h('给明天的自己'),
      todo(''),
    ],
  },
  {
    id: 'meeting',
    category: '工作', cover: 'blue', appearance: { backgroundColor: 'blue', coverSize: 'compact' },
    icon: '🗓️',
    name: '会议记录',
    description: '让讨论变成清晰的行动。',
    blocks: [
      p('日期：　　参与人：'),
      h('会议目标'),
      p(''),
      h('讨论要点'),
      bullet(''),
      h('决定'),
      bullet(''),
      h('下一步行动'),
      todo(''),
    ],
  },
  {
    id: 'project',
    category: '工作', cover: 'dusk', appearance: { backgroundColor: 'purple', surface: 'paper', accentColor: 'purple' },
    icon: '🎯',
    name: '项目计划',
    description: '从目标出发，一步步推进。',
    blocks: [
      h('项目概览'),
      { type: 'callout', props: { emoji: '💡' }, content: '用一句话描述你想实现的目标。' },
      h('成功的标准'),
      bullet(''),
      h('里程碑'),
      todo('第一阶段 · 探索'),
      todo('第二阶段 · 构建'),
      todo('第三阶段 · 发布'),
      h('资源与参考'),
      p(''),
    ],
  },
  {
    id: 'reading',
    category: '学习', cover: 'paper', font: 'serif', appearance: { backgroundColor: 'brown', surface: 'paper' },
    icon: '📖',
    name: '读书笔记',
    description: '收藏文字，也留下自己的思考。',
    blocks: [
      p('作者：　　开始阅读：'),
      h('这本书讲了什么'),
      p(''),
      h('喜欢的句子'),
      { type: 'quote', content: '' },
      h('我的思考'),
      p(''),
      h('值得实践的事'),
      todo(''),
    ],
  },
  {
    id: 'database',
    category: '工作', appearance: { accentColor: 'blue', coverSize: 'compact' },
    icon: '📋',
    name: '项目数据库',
    description: '用表格、看板和画廊管理事项。',
    blocks: [p('每一条记录都是一个页面。点击标题，记录更多细节。')],
  },
  { id: 'weekly-review', icon: '🌿', name: '周回顾', category: '生活', description: '从成果、精力和小习惯中，找到下一周的重点。', cover: 'sage', appearance: { backgroundColor: 'green', surface: 'paper', accentColor: 'green' },
    blocks: [callout('🌿', 'green', '给这一周一个温柔的收尾，为下一周留出清晰的方向。'), h('本周的三个收获'), bullet('完成了什么？'), bullet('学会了什么？'), bullet('有什么值得感谢？'), h('精力与节奏'), table([['让我充电的事', '让我消耗的事'], ['', '']]), h('下周只抓三件事'), todo('最重要的成果'), todo('一个值得延续的习惯'), todo('一段留给自己的时间')] },
  { id: 'research-note', icon: '🔬', name: '论文精读', category: '学习', description: '把研究问题、方法、证据和自己的判断分开记录。', cover: 'dusk', appearance: { backgroundColor: 'purple', surface: 'paper', accentColor: 'purple' },
    blocks: [callout('🔬', 'purple', '用自己的语言复述论点，再决定它能解决什么问题。'), p('论文标题：　作者：　年份：　来源：'), h('研究问题与贡献'), bullet('作者试图解决什么问题？'), bullet('与已有工作的区别是什么？'), h('方法与证据'), table([['关键方法', '支持证据', '适用条件'], ['', '', '']]), h('局限与疑问'), { type: 'toggleListItem', content: '展开记录需要进一步验证的假设', children: [p('哪些结果还需要复现？')] }, h('下一步'), todo('整理引用与关联资料'), todo('设计一个最小复现或应用实验')] },
  { id: 'course-note', icon: '🎓', name: '课程笔记', category: '学习', description: '从学习目标到自测，把知识整理成自己的结构。', cover: 'blue', appearance: { backgroundColor: 'blue', accentColor: 'blue', coverSize: 'compact' },
    blocks: [callout('🎓', 'blue', '学完这一节后，我希望能够解释、推导或完成什么？'), h('核心概念'), table([['概念', '我的解释', '例子'], ['', '', '']]), h('推导与例题'), p('写下关键步骤，以及每一步成立的条件。'), h('容易混淆的地方'), { type: 'quote', content: '不要只记录答案，也记录为什么。' }, h('课后自测'), todo('不看笔记复述关键概念'), todo('独立完成一道变式题'), todo('补充仍未理解的问题')] },
  { id: 'project-brief', icon: '🧭', name: '项目简报', category: '工作', description: '用一页对齐目标、范围、交付物与验收标准。', cover: 'sunset', appearance: { backgroundColor: 'orange', surface: 'paper', accentColor: 'orange' },
    blocks: [callout('🧭', 'orange', '项目价值：为谁，解决什么问题，带来什么可观察的改变？'), h('目标与范围'), bullet('必须实现的结果'), bullet('这一阶段暂不包含的事项'), h('里程碑'), table([['阶段', '交付物', '验收标准'], ['探索', '', ''], ['构建', '', ''], ['交付', '', '']]), h('风险与依赖'), p('列出需要提前解决的条件、负责人和备选方案。'), h('下一步行动'), todo('确认负责人和协作方式'), todo('确定第一个可以检验的交付物')] },
  { id: 'decision-log', icon: '⚖️', name: '决策记录', category: '工作', description: '保留当时的依据，让决策可以被理解与复盘。', appearance: { backgroundColor: 'gray', surface: 'paper', accentColor: 'blue' },
    blocks: [callout('📌', 'gray', '要做的决定：'), h('背景与约束'), p('当时已经知道什么，还有哪些信息缺失？'), h('可选方案'), table([['方案', '收益', '代价与风险'], ['A', '', ''], ['B', '', '']]), h('决定与理由'), p('写下选择，以及最关键的取舍。'), h('执行与复盘'), todo('明确下一步执行人'), todo('约定何时重新检查这个决定'), { type: 'toggleListItem', content: '后续复盘', children: [p('哪些假设成立了，哪些需要修正？')] }] },
  { id: 'travel-planner', icon: '🧳', name: '旅行手册', category: '生活', description: '把出发准备、想去的地方和旅途记忆放在一起。', cover: 'pink', appearance: { backgroundColor: 'pink', surface: 'paper', accentColor: 'pink' },
    blocks: [callout('🧳', 'pink', '目的地：　同行人：　出行时间：'), h('出发之前'), todo('证件与必要材料'), todo('交通与住宿确认'), todo('行李与应急联系人'), h('想去的地方'), table([['地点', '期待', '备注'], ['', '', '']]), h('行程留白'), p('给散步、偶遇和休息留出一些时间。'), h('旅途碎片'), { type: 'quote', content: '记录一个你愿意再次想起的瞬间。' }] },
  { id: 'creative-brief', icon: '✨', name: '创意提案', category: '创作', description: '用清晰的受众、主张和结构，承载灵感。', cover: 'dusk', appearance: { backgroundColor: 'purple', surface: 'paper', accentColor: 'purple', titleAlign: 'center' },
    blocks: [callout('✨', 'purple', '一句话主张：'), h('为谁而做'), p('受众的处境、需要与期待。'), h('核心表达'), bullet('希望留下的一个印象'), bullet('支撑主张的三个细节'), h('内容草图'), table([['段落 / 场景', '信息', '呈现方式'], ['开场', '', ''], ['展开', '', ''], ['收束', '', '']]), h('反馈与迭代'), todo('确认表达是否易于理解'), todo('收集一轮具体反馈')] },
  { id: 'habit-journal', icon: '🌤️', name: '习惯手账', category: '生活', description: '把目标缩小到可持续的行动，留意真实的变化。', cover: 'sand', appearance: { backgroundColor: 'yellow', surface: 'paper', accentColor: 'orange' },
    blocks: [callout('🌤️', 'yellow', '这段时间，我想温柔而持续地练习：'), h('最小行动'), p('忙碌的一天也能完成的版本是什么？'), h('一周记录'), table([['日期', '是否完成', '感受'], ['周一', '', ''], ['周二', '', ''], ['周三', '', ''], ['周四', '', ''], ['周五', '', ''], ['周六', '', ''], ['周日', '', '']]), h('下一周的调整'), todo('保留一个有用的小方法'), todo('减少一个不必要的阻力')] },
];

export const templates = templateDrafts.map(normalizePageColors);

export function filterTemplates(query = '', category = '') {
  const needle = query.trim().toLocaleLowerCase();
  return templates.filter((template) => (!category || template.category === category) &&
    `${template.name} ${template.description} ${template.category}`.toLocaleLowerCase().includes(needle));
}

export function createWorkspace(): Workspace {
  const home = makePage({
    id: 'welcome',
    title: '我的空间',
    icon: '🌱',
    cover: 'paper',
    favorite: true,
    blocks: [
      {
        type: 'callout',
        props: { emoji: '☀️' },
        content: '把想法写下来，让美好的事情慢慢发生。这里是属于你的安静角落。',
      },
      h('从这里开始'),
      p('笔记、计划、灵感，以及生活里的小事。把它们放在一起，让每一天更有条理。'),
      { type: 'pageLink', props: { pageId: 'quick-start' } },
      { type: 'pageLink', props: { pageId: 'weekly' } },
      { type: 'pageLink', props: { pageId: 'projects' } },
      { type: 'divider' },
      h('今天的小目标'),
      todo('为自己留出一段专注的时间'),
      todo('记录一个突然冒出来的好点子'),
      todo('开始使用我的本地笔记空间', true),
      { type: 'paragraph', content: '' },
      { type: 'quote', content: '不必一次走得很远，只要每一天都向前一点。' },
      p(''),
    ],
  });
  const guide = makePage({
    id: 'quick-start',
    parentId: 'welcome',
    title: '开始使用',
    icon: '👋',
    blocks: [
      p('欢迎来到 Mini Notion。写作、整理、思考，一切都从一个页面开始。'),
      h('像 Notion 一样写作'),
      bullet('在空白处输入 /，插入标题、待办、列表、表格、图片或代码块。'),
      bullet('选中文字，即可加粗、标记颜色或添加链接。⌘B 加粗，⌘I 斜体。'),
      bullet('将鼠标移到文字左侧，拖动 ⋮⋮ 调整顺序，点击它打开块菜单。'),
      bullet('输入 # 空格创建标题，- 空格创建列表，[] 空格创建待办。'),
      bullet('Tab 缩进列表，Shift + Tab 减少缩进。⌘Z 撤销编辑。'),
      h('让页面井井有条'),
      bullet('点击侧栏的 + 新建页面；悬停在页面上点击 +，创建子页面。'),
      bullet('拖动侧栏页面可以调整顺序或放到另一个页面内。'),
      bullet('点击右上角的星标收藏页面，使用 ⌘K 快速搜索全部笔记。'),
      bullet('输入 /页面 创建子页面，或输入 @ 链接到已有页面。'),
      h('一切都在这台 Mac 上'),
      {
        type: 'callout',
        props: { emoji: '🔒' },
        content:
          '不需要账号，也不需要网络。编辑自动保存到本机。你可以在设置中打开数据文件夹，或导出包含附件的完整备份。',
      },
      p('试着修改这段文字，再为自己的空间换一个图标吧。'),
    ],
  });
  const weekly = makePage({
    id: 'weekly',
    title: '每周计划',
    icon: '🗓️',
    favorite: true,
    blocks: [
      { type: 'callout', props: { emoji: '🎯' }, content: '少一点忙碌，多一点有意义的进展。' },
      h('本周重点'),
      todo('完成最重要的那个项目'),
      todo('读完一本一直想读的书'),
      todo('至少三次散步或运动'),
      h('周一 · 开个好头'),
      bullet('梳理这一周的工作，给重要的事情安排时间。'),
      h('周三 · 检查进度'),
      bullet('留意进展，也给自己一点调整的空间。'),
      h('周五 · 回顾与记录'),
      { type: 'toggleListItem', content: '这一周，我学到了什么？', children: [p('在这里写下你的收获。')] },
      { type: 'toggleListItem', content: '下周想做得更好的事', children: [p('')] },
    ],
  });
  const ideas = makePage({
    id: 'ideas',
    title: '灵感收集箱',
    icon: '💡',
    blocks: [
      p('给还没成形的想法，一个暂时停靠的地方。'),
      h('突然想到'),
      bullet('做一个只属于自己的数字花园。'),
      bullet('寻找一条新的周末散步路线。'),
      h('以后也许会做'),
      p(''),
    ],
  });
  const reading = makePage({
    id: 'reading',
    title: '阅读笔记',
    icon: '📚',
    blocks: [
      p('有些文字，值得多停留一会儿。'),
      h('正在阅读'),
      bullet('在这里记录你正在读的书。'),
      h('摘录与思考'),
      { type: 'quote', content: '我们读书，因为我们并不孤单。' },
      p(''),
    ],
  });
  const project = makePage({
    id: 'projects',
    title: '项目与任务',
    icon: '📋',
    fullWidth: true,
    database: defaultDatabase(),
    blocks: [p('专注重要的事情，把想法一步步变成现实。')],
  });
  project.database = {
    ...project.database!,
    views: [...getViews({ ...project.database!, views: undefined }), newView('plan')],
    activeViewId: 'legacy-table',
  };
  const rows = [
    ['整理个人知识库', '进行中', '高', ['工作']],
    ['设计自己的阅读清单', '未开始', '中', ['生活']],
    ['记录每周的灵感', '进行中', '中', ['灵感']],
    ['建立一个安静的工作空间', '已完成', '低', ['生活']],
  ].map(([title, status, priority, tags], index) =>
    makePage({
      title: title as string,
      parentId: project.id,
      icon: '📄',
      values: { status, priority, tags, date: dateKey(addDays(new Date(), [0, 1, 3, -2][index])) } as any,
      blocks: [
        h('目标', 2),
        p(
          [
            '把分散的笔记整理为一个可检索、有联系的知识库。',
            '选出本月最想读的书，给每本书留一个思考的空间。',
            '每周整理零散想法，选出一个值得实践的方向。',
            '让工作空间安静、简单，只留下真正重要的事。',
          ][index],
        ),
        h('下一步', 3),
        todo(
          ['归档已有资料', '列出本月阅读清单', '回顾本周的灵感', '整理桌面与文件'][index],
          status === '已完成',
        ),
        todo('记录进展与收获', status === '已完成'),
      ],
    }),
  );
  return {
    version: 1,
    name: '我的工作空间',
    pages: [home, guide, weekly, project, ideas, reading, ...rows],
    activePageId: 'welcome',
    expanded: ['welcome'],
    recent: ['welcome'],
    settings: { theme: 'light', sidebarWidth: 248, sidebarHidden: false, spellcheck: false },
  };
}
