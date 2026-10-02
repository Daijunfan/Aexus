import { $, escape, showDialog, run, toast, field, describeError } from './dom.js';
import { api } from './transport.js';
import { PALETTES, BACKDROPS, VISUAL_DEFAULTS, applyTheme } from './visual-theme.mjs';
import { validColor } from './color-contrast.mjs';
const paintIcon='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.3a2.2 2.2 0 0 0 1.5-3.8 1.6 1.6 0 0 1 1.1-2.8h2A3.2 3.2 0 0 0 21 11.2 8.6 8.6 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="11" cy="6.8" r=".8"/><circle cx="15.5" cy="7.6" r=".8"/></svg>';
const modes = { light:'明亮', dark:'深夜', sepia:'暖纸' };
const appearanceKeys = ['theme', ...Object.keys(VISUAL_DEFAULTS)];
function customColor(name, label, value, fallback) {
  return `<label class="appearance-color-field"><span>${label}</span><div><input type="color" data-theme-picker="${name}" value="${escape(value||fallback)}" aria-label="${label}取色器"><input name="${name}" value="${escape(value||'')}" placeholder="自动 · #RRGGBB" maxlength="7" aria-label="${label}色值"></div></label>`;
}
export class VisualAppearance {
  constructor(settingsChanged) {
    this.settingsChanged=settingsChanged;this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    const button=document.createElement('button');button.id='ui-appearance';button.className='appearance-launch';button.title='外观 · 配色、背景与动效';button.setAttribute('aria-label','外观 · 配色、背景与动效');button.innerHTML=paintIcon+'<span>外观</span>';
    $('theme').before(button);button.onclick=run(()=>this.open());
    this.motion.addEventListener('change',()=>this.apply(this.settings||{}));
    document.addEventListener('visibilitychange',()=>{document.body.dataset.uiPaused=String(document.hidden);});
  }
  apply(settings) {
    this.settings=settings;applyTheme(document.body,settings);
    document.body.dataset.uiMotion=this.motion.matches||settings.uiMotion==='reduced'?'reduced':'full';
  }
  async open() {
    const snapshot=await api('appearance.get'),initial=snapshot.appearance;
    const choose=(name,value,label,content,cls='')=>`<label class="appearance-choice ${cls}"><input type="radio" name="${name}" value="${value}" ${initial[name]===value?'checked':''}><span>${content||escape(label)}</span><small>${escape(label)}</small></label>`;
    const palettes=Object.entries(PALETTES).map(([id,p])=>choose('uiPalette',id,p.title,`<i style="--swatch:${p.fill};--swatch-glow:${p.glow}"></i>`,'palette-choice')).join('');
    const backgrounds=Object.entries(BACKDROPS).map(([id,label])=>choose('uiBackdrop',id,label,`<i data-sample="${id}"></i>`,'backdrop-choice')).join('');
    const custom=`<details class="appearance-custom" id="appearance-custom"><summary>自定义配色与便携主题</summary><div class="appearance-custom-colors">${customColor('uiCustomAccent','强调色',initial.uiCustomAccent,'#2278be')}${customColor('uiCustomGlow','柔光色',initial.uiCustomGlow,'#7de0dd')}</div><p class="dialog-note">留空使用预设。系统自动调整文字和按钮深浅以保持可读性，不改变原始标注。</p><label class="dialog-field"><span>背景浓度 <output id="theme-strength-output"></output></span><input name="uiBackgroundStrength" type="range" min="0" max="1" step="0.05" value="${initial.uiBackgroundStrength}"></label><div class="theme-transfer"><button type="button" id="theme-import-file">导入主题文件</button><input id="theme-upload-input" type="file" accept=".json" hidden></div>${field('themeTitle','导出主题名称','我的阅读主题')}${field('themePath','保存到文库中的新文件','我的阅读主题.mrtheme.json')}<button type="button" id="theme-export-file">导出当前预览</button><p id="theme-transfer-status" role="status"></p></details>`;
    const previewHtml=`<section class="appearance-preview-column" aria-label="外观实时预览"><div class="visual-preview"><header><span class="preview-avatar">阅</span><div><strong>我的学习空间</strong><small>本地保存 · 专注阅读</small></div><span class="preview-online" aria-hidden="true"></span></header><div class="preview-scene"><span class="preview-date">灵感正在连接</span><article class="preview-note"><span class="preview-note-label">阅读笔记</span><h3>把零散的想法连成线</h3><p>从原文摘录、关联概念，再把知识变成自己的理解。</p><div class="preview-tags"><span>设计</span><span>长期学习</span></div></article><article class="preview-note accent-note"><span>知识卡片</span><strong>阅读 → 理解 → 回忆</strong><small>随时回到最初的那一页</small></article><div class="preview-reaction"><span>3 个关联</span><span>已保存 ✓</span></div></div><footer><span class="preview-compose">记下一个新想法…</span><span class="preview-add" aria-hidden="true">＋</span></footer></div><p id="appearance-preview-status" class="appearance-preview-status" role="status"></p><p class="dialog-note">此处为示例预览。点击“应用外观”后，保存到当前文库。</p></section>`;
    let transferBusy=false;
    const values=()=>{
      const form=Object.fromEntries(new FormData($('dialog-form'))),result={};
      for(const key of appearanceKeys)result[key]=form[key];
      for(const key of ['uiCustomAccent','uiCustomGlow']){
        result[key]=form[key]?.trim().toLowerCase()||null;
        if(result[key]!==null&&!validColor(result[key]))throw Error('自定义颜色需要完整的 #RRGGBB，或留空使用预设。');
      }
      result.uiBackgroundStrength=Number(form.uiBackgroundStrength);
      return result;
    };
    showDialog({title:'外观工作室',submit:'应用外观',html:`<div class="appearance-studio"><section class="appearance-controls"><p class="appearance-eyebrow">属于你的阅读空间</p><p class="appearance-intro">配色、柔光与轻量动效。让每一次打开都有熟悉的质感。</p><fieldset><legend>主题配色</legend><div class="palette-grid">${palettes}</div></fieldset><fieldset><legend>明暗模式</legend><div class="appearance-modes">${Object.entries(modes).map(([id,label])=>choose('theme',id,label,'','mode-choice')).join('')}</div></fieldset><fieldset><legend>工作区背景</legend><div class="backdrop-grid">${backgrounds}</div></fieldset>${field('uiMotion','界面动效',initial.uiMotion,{choices:[['system','跟随系统'],['full','轻量动效'],['reduced','减少动态']]})}${custom}<p class="dialog-note">系统开启“减少动态”时，始终停用装饰动画。配色不改变原文、摘录颜色或手写笔迹。</p><button id="appearance-reset" type="button">恢复默认外观</button></section>${previewHtml}</div>`,onSubmit:async()=>{
      if(transferBusy)throw Error('主题文件正在处理中，请稍候。');
      const current=values(),patch={};
      for(const key of appearanceKeys)if(current[key]!==initial[key])patch[key]=current[key];
      if(Object.keys(patch).length){await this.settingsChanged({...patch,expectedAppearanceVersion:snapshot.version});toast('外观已应用');}
    },afterOpen:()=>{
      const root=$('dialog-fields').querySelector('.appearance-studio');
      const control=name=>root.querySelector(`[name="${name}"]`);
      const preview=()=>{
        if(!root.isConnected||!$('dialog').open)return;
        try{
          const current=values(),el=root.querySelector('.visual-preview');applyTheme(el,current);el.dataset.theme=current.theme;
          el.dataset.uiMotion=this.motion.matches||current.uiMotion==='reduced'?'reduced':'full';
          $('appearance-preview-status').textContent=(current.uiCustomAccent?'自定义配色':PALETTES[current.uiPalette].title)+' · '+modes[current.theme]+' · '+BACKDROPS[current.uiBackdrop];
          $('theme-strength-output').textContent=Math.round(current.uiBackgroundStrength*100)+'%';
        }catch(error){$('appearance-preview-status').textContent=error.message;}
      };
      const fill=state=>{
        for(const key of appearanceKeys){
          const el=root.querySelector(`[name="${key}"][value="${state[key]}"]`)||control(key);
          if(el.type==='radio')el.checked=true;else el.value=state[key]??'';
        }
        for(const picker of root.querySelectorAll('[data-theme-picker]'))picker.value=control(picker.dataset.themePicker).value||'#2278be';
        root.dispatchEvent(new Event('input',{bubbles:true}));preview();
      };
      root.addEventListener('change',preview);root.addEventListener('input',preview);
      for(const picker of root.querySelectorAll('[data-theme-picker]'))picker.oninput=()=>{control(picker.dataset.themePicker).value=picker.value;preview();};
      $('appearance-reset').onclick=()=>fill({...VISUAL_DEFAULTS,theme:'light'});
      const transfer=async fn=>{
        if(transferBusy)return;transferBusy=true;
        try{await fn();}catch(error){if(root.isConnected)$('theme-transfer-status').textContent=describeError(error);}
        finally{transferBusy=false;}
      };
      $('theme-import-file').onclick=()=>$('theme-upload-input').click();
      $('theme-upload-input').onchange=event=>transfer(async()=>{
        const file=event.target.files?.[0];event.target.value='';if(!file)return;
        if(file.size>65536)throw Error('主题文件不能超过 64 KiB。');
        const inspected=await api('appearance.theme.inspect',{content:await file.text()});
        if(!root.isConnected||!$('dialog').open)return;
        fill(inspected.theme.settings);control('themeTitle').value=inspected.theme.title;
        $('theme-transfer-status').textContent=`已验证「${inspected.theme.title}」。当前仅预览，应用后才保存。`;
      });
      $('theme-export-file').onclick=()=>transfer(async()=>{
        const result=await api('appearance.theme.export',{path:control('themePath').value,title:control('themeTitle').value,settings:values()});
        if(root.isConnected&&$('dialog').open)$('theme-transfer-status').textContent=`已导出：${result.path}。未改变当前外观。`;
      });
      preview();
    }});
  }
}
