// Keep the exit control inside the expanded desktop on every browser.
export function desktopFullscreen(root,button){
 const active=()=>document.fullscreenElement===root||root.classList.contains('desktop-expanded')
 const update=()=>{button.textContent=active()?'退出全屏':'全屏';button.setAttribute('aria-pressed',String(active()))}
 async function exit(){root.classList.remove('desktop-expanded');if(document.fullscreenElement===root)await document.exitFullscreen();update()}
 button.onclick=async()=>{if(active()){await exit();return}try{if(!root.requestFullscreen)throw Error('Fullscreen unavailable');await root.requestFullscreen()}catch{root.classList.add('desktop-expanded')}update()}
 const escape=event=>{if(event.key==='Escape'&&active()){event.preventDefault();event.stopImmediatePropagation();void exit()}}
 document.addEventListener('fullscreenchange',update);document.addEventListener('keydown',escape,true);update()
 const dispose=()=>{void exit();document.removeEventListener('fullscreenchange',update);document.removeEventListener('keydown',escape,true)}
 dispose.exit=exit;return dispose
}
