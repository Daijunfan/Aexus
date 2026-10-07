// Discoverable aliases for existing public UI actions. No duplicate business logic.
export const TOOL_GROUPS = Object.freeze({all:'全部',reading:'阅读',notes:'笔记',organize:'整理',links:'链接',ink:'手写',review:'复习',appearance:'外观', mindmap:'思维导图'});
export const TOOLS = Object.freeze([
 ['mm-keyword-links','本地关键词关联','mindmap','study','keyword dictionary alias 词条 关键词 别名 字典','配置本地主题标题和别名的自动链接'],
 ['mm-organize','整理脑图主题','mindmap','study','group merge sort summary toc 分组 合并 排序 拆分 子脑图','复用批量编辑、来源整理、摘要和子脑图操作'],
 ['mm-source-links','本地主题与回源链接','mindmap','study','backlinks reference link 反链 跨集 引用','搜索当前文库中的主题和稳定回源链接'],
 ['mm-capture-settings','摘录默认设置','mindmap','study','capture excerpt 摘录 位置 自动 默认 颜色','设置来源摘录的位置、颜色、标签和标注方式'],
 ['mm-content-export','导出主题内容与完整学习集包','mindmap','study','export Markdown OPML Word encrypted 备份 加密 完整包','保存本地内容、大纲或包含原文的完整包'],
 ['mm-zone','自由分支区域','mindmap','card','zone 区域 分组 浮动 移动 折叠','把自由分支圈为可移动、折叠和调整样式的区域'],
 ['mm-outliner','主题大纲','mindmap','study','outliner 大纲 层级 缩进 拖动','以大纲编辑同一批主题，拖动调整层级'],
 ['mm-task-timeline','主题任务时间图','mindmap','study','timeline gantt 日期 任务 日历 CSV 进度','编辑主题任务日期与进度，导出本地 CSV 或日历'],
 ['mm-delete-topic','删除所选主题','mindmap','card','delete 删除 节点 叉号','即时删除并保留子主题；Shift 删除整支，可撤销'],
 ['mm-design-library','我的导图设计','mindmap','study','design save import export custom 保存 配色 骨架','保存、应用、归档及导入导出本地导图设计'],
 ['mm-equation','主题数学与化学公式','mindmap','card','equation latex chemistry 公式 化学','预览与编辑本地矢量公式，拖动调整显示大小'],
 ['mm-pitch-settings','自动编排演示设置','mindmap','study','pitch slides PowerPoint PPTX 演讲者 版式','设置版式、讲述顺序、主题显隐、配色和画面比例'],
 ['mm-collapse-tools','按层级展开或折叠','mindmap','study','fold collapse expand depth 层级','选择整图或当前分支，一步折叠或展开'],
 ['mm-arrange-tools','自由主题对齐与分布','mindmap','card','align distribute reset 对齐 均匀 分布','按共享模型对齐、分布或恢复主题位置'],
 ['mm-enable','切换思维导图 / 摘录卡片','mindmap','study','mind map compact xmind 切换','保持同一学习集、原文和卡片身份，只切换可视化方式'],
 ['mm-organize-roots','将自由分支整理成导图','mindmap','study','中心 汇总 根节点 organize roots','显式创建中心并保留原有分支，可撤销'],
 ['mm-themes','骨架、配色与布局','mindmap','study','theme rainbow structure layout 彩虹 配色 结构','设置主题、分支结构、自动平衡和布局过渡'],
 ['mm-format','主题形状与格式','mindmap','card','shape border font style 颜色 形状 字体','对所选主题设置形状、颜色、文字和标记'],
 ['mm-template','导图模板','mindmap','study','template brainstorm timeline 模板','追加结构化模板，保留原有内容'],
 ['mm-new-child','新建子主题','mindmap','card','child topic tab 子节点','增加子主题并原位编辑标题'],
 ['mm-boundary','添加导图外框','mindmap','card','boundary group 外框 分组','为同级选择添加可编辑外框'],
 ['mm-summary','添加导图概要','mindmap','card','summary bracket 概要 总结','为同级主题添加概要括号与可编辑总结主题'],
 ['mm-callout','添加导图标注','mindmap','card','callout 标注 注释','在所选主题附近添加说明'],
 ['mm-relationship','连接两个主题','mindmap','card','relationship arrow 联系 箭头','Shift 单击选择两个主题后创建联系'],
 ['mm-search','导图查找与替换','mindmap','study','find replace filter markers 查找 替换 优先级','筛选完整导图，预览后再明确替换'],
 ['mm-all-notes','查看全部主题笔记','mindmap','study','notes 全部笔记','集中查阅当前学习集的主题笔记'],
 ['mm-outline-import','快速输入导图大纲','mindmap','study','outline markdown import 大纲 输入','从缩进文本追加可编辑主题'],
 ['mm-walkthrough','导图演示','mindmap','study','presentation pitch slideshow 演示','按公开演示队列展示主题和分支上下文'],
 ['mm-export','导出完整思维导图','mindmap','study','export svg png pdf 矢量 导出','导出完整或当前分支图像，保留原始文档'],
 ['mm-xmind-import','导入 XMind JSON 工作簿','mindmap','study','xmind import 导入 工作簿','检查兼容性后导入独立学习集，不替换原文'],
 ['mm-xmind-export','导出 XMind JSON 工作簿','mindmap','study','xmind export 导出 多画布','把所选学习集导出为公开 JSON 工作簿'],

  ['import-files','导入文档','reading','always','文件 PDF EPUB 本地 upload','把本机文件复制到当前文库'],
  ['library-search-all','全文检索','reading','always','搜索 查找 search','文档与卡片的布尔全文检索'],
  ['new-folder','新建文件夹','organize','always','目录 文件夹 folder','创建当前文库中的文件夹'],
  ['ui-appearance','外观工作室','appearance','always','主题 配色 背景 动画 theme','预览、自定义、导入和导出主题'],
  ['reader-appearance-open','阅读与联动视图','appearance','always','分栏 亮度 沉浸 布局 split','文档与脑图的排列及阅读亮度'],
  ['study-create','新建学习集','organize','always','知识库 notebook 学习集','引用文档并开始主题学习'],
  ['workspace-card-box','全库卡片盒','organize','always','分组 筛选 词条 board','跨学习集过滤与批量编辑'],
  ['study-add-note','新建笔记卡','notes','study','独立 文本 卡片 new','创建独立卡片，不修改原文'],
  ['card-inspector-open','原位编辑卡片','notes','card','详情 标题 正文 笔记 F2 edit','保持阅读位置并在浮动面板编辑'],
  ['study-undo','撤销学习编辑','notes','study','undo 撤回','撤销最近一次可恢复学习操作'],
  ['study-redo','重做学习编辑','notes','study','redo 重做','重新应用已撤销的学习操作'],
  ['map-copy','复制卡片分支','organize','card','copy 副本','复制选中卡片及后代'],
  ['map-cut','剪切卡片分支','organize','card','cut 移动','粘贴成功之前保留原卡片'],
  ['map-paste','粘贴卡片','organize','study','paste 剪贴板','将已复制分支放入当前脑图'],
  ['map-insert','插入相邻节点','organize','card','前后 父 子 节点 insert','在选中卡片附近插入层级节点'],
  ['study-dictionary','个人字典设置','links','study','标题 词条 来源 别名 dictionary','配置子脑图来源和词条颜色'],
  ['study-reference','创建引用卡片','links','study','跨集 reference 实时','建立保留源身份的引用'],
  ['study-merge','合并选中卡片','organize','study','merge 复合','将多个选中卡片组合'],
  ['study-submap','进入卡片子脑图','organize','card','分支 focus 聚焦','围绕当前分支工作'],
  ['study-fullmap','返回完整脑图','organize','study','全图 返回 root','离开当前聚焦分支'],
  ['study-zoom-fit','脑图适合窗口','appearance','study','缩放 zoom fit','保持卡片尺寸关系并调整视口'],
  ['study-card-trash','卡片回收站','organize','study','删除 恢复 trash','恢复可撤销删除的卡片'],
  ['study-pen','文档手写笔','ink','document','钢笔 书写 pen','在 PDF 及留白处书写'],
  ['study-layers','文档手写图层','ink','document','图层 显隐 layers','管理当前学习集的手写图层'],
  ['card-ink-pen','卡片与脑图手写','ink','study','钢笔 canvas pen','在卡片和脑图中书写'],
  ['card-ink-eraser','卡片橡皮擦','ink','study','擦除 eraser','使用当前擦除设置处理笔迹'],
  ['card-ink-lasso','套索处理笔迹','ink','study','选择 移动 lasso','选择并变换手写笔迹'],
  ['card-ink-settings','笔型与橡皮设置','ink','study','压感 透明度 pen settings','笔型、颜色、笔宽和擦除策略'],
  ['study-review-settings','复习设置','review','study','FSRS 牌组 记忆','设置牌组与复习参数'],
  ['reader-compare','打开对照阅读','reading','document','比较 双栏 compare','同时查阅另一份文档'],
  ['reader-page-tools','PDF 页面工具','reading','pdf','折叠 裁剪 旋转 页面','处理页面显示或生成新文档'],
  ['virtual-pages','虚拟书页','reading','pdf','重组 页面 virtual','组合不同文档的页面引用'],
  ['outline-batch-tools','目录整理','organize','document','章节 toc 大纲','生成和批量调整章节目录'],
  ['study-region','框选原文摘录','notes','pdf','截图 矩形 区域 excerpt','框选 PDF 区域并生成图片卡片'],
  ['study-excerpt-lasso','套索原文摘录','notes','pdf','套索 图片 lasso excerpt','按自定义形状捕获 PDF 内容'],
  ['document-textbox','点击放置文本框','notes','pdf','文本框 页内 放置 textbox','在原页点击或拖入文字并确认保存'],
  ['study-extend-note','文档留白笔记','notes','document','文本框 页边 note','在原文旁放置有定位的笔记'],
  ['search-document','搜索当前文档','reading','document','find 搜索 原文','查找当前原文并定位结果'],
  ['export-document','导出当前文档','reading','document','PDF Markdown export','导出可读内容或带标注 PDF'],
  ['reopen-document','重新解析原文','reading','document','刷新 reload 源文件','重新解析已有文件，保留自定义目录'],
  ['open-trash','文件回收站','organize','always','trash 文件 恢复','恢复本地文库中删除的文件']
].map(([id,title,group,scope,keywords,description])=>Object.freeze({id,title,group,scope,keywords,description})));
export function toolMatches(tool, query = '', group = 'all') {
  if(group!=='all'&&tool.group!==group)return false;
  const words=String(query).normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text=[tool.title,tool.id,tool.keywords,tool.description].join(' ').normalize('NFKC').toLocaleLowerCase();
  return words.every(word=>text.includes(word));
}
export function scopeReason(scope, context) {
  if(scope==='study'&&!context.study)return '先打开学习集';
  if(scope==='card'&&(!context.study||!context.card))return '先选择卡片';
  if(scope==='document'&&!context.document)return '先打开文档';
  if(scope==='pdf'&&context.kind!=='pdf')return '先打开 PDF 文档';
  return '';
}
