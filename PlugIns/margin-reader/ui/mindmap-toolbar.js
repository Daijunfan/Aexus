const paths={
 themes:'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4h-1a1 1 0 0 1 0-2h2a6 6 0 0 0 0-12ZM6 10h.1M9 6h.1M15 6h.1M18 10h.1',
 format:'M4 6h16M7 3v6M4 17h16M16 14v6',topic:'M3 7h7v6H3ZM14 7h7v6h-7ZM10 10h4M17 16v6m-3-3h6',child:'M3 3h7v6H3ZM14 15h7v6h-7ZM7 9v9h7M17 7v5m-3-2.5h6',
 boundary:'M5 3H3v5M19 3h2v5M3 16v5h5M21 16v5h-5M8 7h8v10H8Z',summary:'M3 5h6M3 12h6M3 19h6M12 3q3 0 3 3v3q0 3 3 3-3 0-3 3v3q0 3-3 3m6-9h4',callout:'M4 3h16v13H9l-5 5ZM8 7h8M8 11h6',
 relationship:'M3 17C3 4 21 4 21 17m-4-3 4 4 2-5',template:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',focus:'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8Z',zen:'M3 5h18v14H3ZM8 5v14',export:'M12 3v12m-4-8 4-4 4 4M4 14v7h16v-7',
 search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',notes:'M4 3h16v18H4ZM8 7h8M8 11h8M8 15h5',outline:'M4 5h16M7 10h13M10 15h10M7 20h13',copy:'M8 8h13v13H8ZM16 8V3H3v13h5',paste:'M8 4H4v17h16V4h-4M8 2h8v5H8Z',style:'m5 3 11 6-4 6L1 9ZM15 13l5 5a2 2 0 0 1-3 3l-5-5',play:'M5 3h14v18H5ZM10 8l6 4-6 4Z',more:'M4 12h.1M12 12h.1M20 12h.1',collapse:'M4 5h16M4 19h16M8 10l4 4 4-4',arrange:'M3 3v18M7 5h13v5H7ZM7 14h9v5H7Z',design:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3Zm14 0v8m-4-4h8',equation:'M18 4H7l6 8-6 8h11M3 7v10',import:'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4',organize:'M9 2h6v6H9ZM3 16h6v6H3Zm12 0h6v6h-6ZM12 8v4M6 16v-4h12v4'
};
const buttons={'mm-pitch-settings':'format','mm-themes':'themes','mm-format':'format','mm-new-topic':'topic','mm-new-child':'child','mm-boundary':'boundary','mm-summary':'summary','mm-callout':'callout','mm-relationship':'relationship','mm-template':'template','mm-organize-roots':'organize','mm-focus':'focus','mm-zen':'zen','mm-export':'export','mm-search':'search','mm-all-notes':'notes','mm-outline-import':'outline','mm-copy-style':'copy','mm-paste-style':'paste','mm-quick-style':'style','mm-walkthrough':'play','mm-more-tools':'more','mm-collapse-tools':'collapse','mm-arrange-tools':'arrange','mm-design-library':'design','mm-equation':'equation','mm-xmind-import':'import','mm-xmind-export':'export'};
const labels=new Set(['mm-themes','mm-format','mm-new-child']);
const hints={
 'mm-themes':'选择导图骨架与配色；可为不同分支设置不同结构。','mm-format':'设置所选主题的形状、文字、连线和标记。','mm-new-topic':'添加同级主题；选中中心时添加主分支。Enter。','mm-new-child':'为所选主题添加子主题。Tab。',
 'mm-boundary':'为同级主题添加外框，标明它们属于同一组。Shift 点击多选。','mm-summary':'为选中的同级主题创建概要；概要也是可编辑的主题。','mm-callout':'给所选主题添加一条说明标注。','mm-relationship':'为两个主题建立关系线；Shift 点击选择两个主题。',
 'mm-template':'从本地模板追加一组主题，保留已有内容。','mm-focus':'聚焦所选分支；再次点击返回完整导图。','mm-zen':'隐藏周围工具，扩大脑图画布。','mm-export':'将完整导图或当前分支保存为 SVG、PNG、PDF 或 PPTX。',
 'mm-search':'查找、筛选主题，预览并批量替换文字。','mm-all-notes':'浏览整张导图的主题笔记并跳到对应主题。','mm-outline-import':'粘贴缩进文本或 Markdown 标题，快速建立主题层级。','mm-copy-style':'复制主题外观，保留内容、任务和来源。','mm-paste-style':'将复制的外观应用到选中的主题。',
 'mm-quick-style':'为选中主题、同级或后代应用重要、已废弃等样式。','mm-walkthrough':'按主题或分支演示导图，可查看笔记和原文。','mm-collapse-tools':'按层级展开或折叠整张导图或所选分支。','mm-arrange-tools':'对齐、均匀分布自由主题，或恢复自动布局。','mm-design-library':'保存、应用和交换本地导图设计。','mm-equation':'为主题插入数学或化学公式，完全在本地渲染。','mm-xmind-import':'检查并导入本地 .xmind 工作簿，新建独立学习集。','mm-xmind-export':'将学习集保存为本地 .xmind 工作簿。'
};
export function refineToolbar(bar){
 for(const [id,key]of Object.entries(buttons)){const button=bar.querySelector('#'+id);if(!button)continue;const title=button.textContent.trim();button.setAttribute('aria-label',title);button.title=button.title||title;if(hints[id])button.dataset.tooltip=hints[id];button.classList.add('mm-tool-icon');button.classList.toggle('mm-tool-labeled',labels.has(id));button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[key]}"/></svg><span>${title}</span>`;}
 for(const id of ['mm-new-topic','mm-template','mm-copy-style','mm-collapse-tools','mm-xmind-import'])bar.querySelector('#'+id)?.classList.add('mm-tool-section');
}
