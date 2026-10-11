import { $, escape, field, showDialog, run } from './dom.js';
import { api } from './transport.js';
const colors = [['blue','蓝色'],['green','绿色'],['red','红色'],['purple','紫色']];
export async function configureDictionary(study) {
  const set = study.current; if (!set) return;
  const listing = await api('study.list'), settings = set.linkSettings || {};
  const names = new Map(listing.sets.map(s => [s.id,s.title])), submaps = new Map();
  let sources = structuredClone(settings.sources || []), serial = 0;
  showDialog({ title: '关键词字典 · 文档与卡片', html:
    field('titleLinks','自动关联',settings.titleLinks===false?'no':'yes',{choices:[['yes','启用'],['no','关闭']]})+
    field('documentLinks','正文关键词下划线',settings.documentLinks===false?'no':'yes',{choices:[['yes','显示'],['no','隐藏（保留卡片内链接）']]})+
    field('keywordSource','关键词来源',settings.keywordSource||'title',{choices:[['title','标题和分号分隔的别名'],['tags','卡片标签']]})+
    field('caseSensitive','大小写',settings.caseSensitive?'yes':'no',{choices:[['no','不区分'],['yes','区分']]})+
    field('wholeWords','拉丁词边界',settings.wholeWords?'yes':'no',{choices:[['no','匹配子串'],['yes','完整单词']]})+
    field('scopeMode','字典范围',settings.sources!==undefined?'explicit':'legacy',{choices:[['legacy','旧版学习集规则（未选时为全部）'],['explicit','仅下方列出的学习集 / 子脑图']]})+
    '<details><summary>旧版学习集来源</summary>'+listing.sets.map(s=>`<label class="study-file-choice"><input type="checkbox" data-dictionary="${s.id}" ${settings.dictionarySetIds?.includes(s.id)?'checked':''}>${escape(s.title)}</label>`).join('')+'</details>'+
    '<p class="dialog-note">选择主脑图时包含全部下级。指定子脑图可隔离术语，并为各来源使用独立链接颜色。显式列表为空时不使用任何词条。</p><div id="dictionary-scope-list"></div>'+
    field('sourceSet','添加来源学习集',set.id,{choices:listing.sets.map(s=>[s.id,s.title])})+
    field('sourceRoot','来源子脑图','',{choices:[['','主脑图 · 全部卡片']]})+
    field('sourceColor','关键词颜色','blue',{choices:colors})+'<button type="button" id="dictionary-scope-add">添加 / 更新此来源</button>',
    onSubmit: async v => {
      if (study.current?.id !== set.id) throw new Error('学习集已切换，请重新打开字典设置。');
      await study.change('study.links.settings',{titleLinks:v.titleLinks==='yes',documentLinks:v.documentLinks==='yes',keywordSource:v.keywordSource,caseSensitive:v.caseSensitive==='yes',wholeWords:v.wholeWords==='yes',sources:v.scopeMode==='explicit'?sources:null,dictionarySetIds:[...$('dialog-fields').querySelectorAll('[data-dictionary]:checked')].map(e=>e.dataset.dictionary)},set.revision);
      study.dictionary.schedule();
    },
    afterOpen: () => {
      const control = name => $('dialog-fields').querySelector(`[name=${name}]`);
      const dirty = () => { control('scopeMode').value='explicit'; $('dialog-fields').dispatchEvent(new Event('input',{bubbles:true})); };
      const paint = () => {
        $('dictionary-scope-list').innerHTML = sources.map((s,i)=>`<div class="study-link-row"><span>${escape(names.get(s.setId)||'来源不可用')} / ${escape(s.rootId?submaps.get(s.rootId)||s.rootId.slice(0,8):'主脑图')} · ${escape(colors.find(c=>c[0]===(s.color||'blue'))?.[1])}</span><button type="button" data-remove-scope="${i}">移除</button></div>`).join('')||'<p class="dialog-note">未指定子脑图来源。</p>';
        $('dictionary-scope-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{sources.splice(Number(b.dataset.removeScope),1);dirty();paint();});
      };
      const load = async () => {
        const ticket=++serial, id=control('sourceSet').value, value=id===set.id?set:await api('study.get',{setId:id});
        if(ticket!==serial||!$('dictionary-scope-list'))return;
        for(const submap of value.submaps||[])submaps.set(submap.id,submap.title);
        control('sourceRoot').innerHTML='<option value="">主脑图 · 全部卡片</option>'+(value.submaps||[]).map(s=>`<option value="${s.id}">${escape(s.title)}</option>`).join('');paint();
      };
      control('sourceSet').onchange=run(load);
      $('dictionary-scope-add').onclick=()=>{
        const value={setId:control('sourceSet').value,rootId:control('sourceRoot').value||null,color:control('sourceColor').value};
        const old=sources.find(s=>s.setId===value.setId&&(s.rootId||null)===value.rootId);
        if(old)Object.assign(old,value);else sources.push(value);dirty();paint();
      };
      paint();run(load)();
    }
  });
}
