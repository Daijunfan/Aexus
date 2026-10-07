import marginNote from '../assets/plugin-icons/margin-reader.svg'
import cloudHosts from '../assets/plugin-icons/cloud-hosts.svg'
import {Icon} from './Icon'

const icons:Record<string,string>={'margin-reader':marginNote,'cloud-hosts':cloudHosts}

/** Shared plugin identity in the sidebar and Team headers. */
export function PluginIcon({id}:{id:string}){
  if(id==='mininotion')return <span className="plugin-monogram" aria-hidden="true">N</span>
  if(icons[id])return <img className="plugin-image" data-icon={id} src={icons[id]} alt="" aria-hidden="true" draggable={false}/>
  return <span className="plugin-generic" aria-hidden="true"><Icon name="extensions"/></span>
}
