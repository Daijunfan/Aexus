// Keep common reading controls visible while the complete secondary toolbar
// scrolls horizontally. Existing nodes and their public API handlers are reused.
export function organizeReaderToolbar() {
  const tools=document.querySelector('.reader-toolbar .reader-tools');
  if(!tools)return;
  const common=['font-smaller','font-larger','search-document','reopen-document','export-document'];
  for(const id of [...common].reverse()){
    const button=document.getElementById(id);if(button)tools.prepend(button);
  }
  tools.setAttribute('role','group');tools.setAttribute('aria-label','阅读工具，可横向滚动查看更多');
  for(const bar of [tools,document.getElementById('study-reading-bar'),document.getElementById('study-ink-tools')].filter(Boolean)){
    bar.addEventListener('focusin',event=>{
      const element=event.target;if(!(element instanceof HTMLElement))return;
      const item=element.getBoundingClientRect(),view=bar.getBoundingClientRect();
      if(item.left<view.left)bar.scrollLeft+=item.left-view.left-6;
      else if(item.right>view.right)bar.scrollLeft+=item.right-view.right+6;
    });
  }
}
