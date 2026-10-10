import {Icon} from './Icon'

/** Shared plugin identity in the sidebar and Team headers. */
export function PluginIcon({id}:{id:string}){
  return <span data-icon={id} className="plugin-generic" aria-hidden="true"><Icon name="extensions"/></span>
}
