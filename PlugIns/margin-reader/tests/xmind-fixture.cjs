'use strict';
// Deliberately heterogeneous, multi-level content, rather than repeated labels.
const branches=[
 ['研究与发现',[['问题定义',['访谈目标用户','记录真实操作','明确约束条件']],['证据整理',['阅读论文','整理公开数据','核对来源']],['结论验证',['提出可验证假设','寻找反例','记录不确定性']]]],
 ['产品与设计',[['信息架构',['目录与层级','视图切换','查找与回源']],['交互细节',['拖动插入位置','键盘编辑','可恢复操作']],['视觉语言',['层级字体','主题骨架','可读色彩']]]],
 ['实现与工程',[['共享内核',['版本校验','统一命令','工作区隔离']],['渲染与性能',['可见区域绘制','精确坐标','缓存上限']],['数据安全',['保留原件','冲突拒绝','撤销历史']]]],
 ['测试与交付',[['操作测试',['鼠标拖拽','复杂混合拓扑','大图缩放']],['结果检查',['截图逐项检查','核心几何一致','真实安装验证']],['交付记录',['列出通过项','保留失败证据','说明未测范围']]]]
];
exports.outline=(deep=false)=>'本地知识工作台\n'+branches.map(([a,rows])=>'  '+a+'\n'+rows.map(([b,leaves])=>'    '+b+'\n'+leaves.map((c,i)=>'      '+c+(deep?'\n        '+['准备','执行','验收'][i]+'：'+c+'\n          记录结果与后续决策':'')).join('\n')).join('\n')).join('\n');
exports.cards=(deep=false)=>{
 const cards=[],stack=[];for(const [i,line]of exports.outline(deep).split('\n').entries()){
  const depth=line.match(/^ */)[0].length/2,c={id:'fixture-'+i,parentId:depth?stack[depth-1]:null,title:line.trim(),text:'',note:'',tags:[]};cards.push(c);stack[depth]=c.id;
 }return cards;
};
exports.overlap=(a,b)=>a.x<b.x+b.width-.1&&a.x+a.width>b.x+.1&&a.y<b.y+b.height-.1&&a.y+a.height>b.y+.1;
