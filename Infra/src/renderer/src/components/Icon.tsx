import {iconPaths} from './iconPaths'
/** Keep the established name/size contract; accessible labels belong on the control. */
export function Icon({name}:{name:string}){const path=iconPaths[name];return <span className={`codicon codicon-${name}${path?' vector-icon':''}`} aria-hidden="true">{path&&<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={path}/></svg>}</span>}
