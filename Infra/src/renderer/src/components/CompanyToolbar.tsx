import {useLayoutEffect,useRef,type ReactNode} from 'react'
import {centerCompanyToolbar} from './company-toolbar-center.mjs'
import '../styles/company-toolbar-center.css'

export function CompanyToolbar({children}:{children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null)
 useLayoutEffect(()=>{
  const toolbar=ref.current;if(!toolbar)return
  const update=()=>{centerCompanyToolbar(toolbar)},resize=new ResizeObserver(update)
  resize.observe(toolbar)
  const root=toolbar.closest('.aexus-home'),nav=toolbar.querySelector<HTMLElement>(':scope > .company-navigation')
  if(root)resize.observe(root);if(nav)resize.observe(nav)
  const mutation=new MutationObserver(update);mutation.observe(toolbar,{childList:true,subtree:true})
  window.addEventListener('resize',update);update()
  return()=>{resize.disconnect();mutation.disconnect();window.removeEventListener('resize',update);nav?.style.removeProperty('--company-center-offset')}
 },[])
 return <div className="infra-toolbar" ref={ref}>{children}</div>
}
