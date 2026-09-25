import macos from '../assets/os/macos.png'
import kali from '../assets/os/kali.svg'

export function TeamOSIcon({os,distribution}:{os:'linux'|'macos'|'windows';distribution?:string}) {
  const kind=os==='windows'?'windows':os==='macos'?'macos':distribution?.toLowerCase()==='kali'?'kali':distribution?.toLowerCase()==='ubuntu'?'ubuntu':'linux'
  const label={windows:'Windows',macos:'macOS',kali:'Kali',ubuntu:'Ubuntu',linux:'Linux'}[kind]
  return <span className={`team-os team-os-${kind}`} data-os={kind} title={label} aria-label={label}>
    {kind==='macos'?<img src={macos} alt=""/>:kind==='kali'?<img src={kali} alt=""/>:kind==='windows'?<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#087cd9" d="M2 3h13v12H2zm15 0h13v12H17zM2 17h13v12H2zm15 0h13v12H17z"/></svg>:kind==='ubuntu'?<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#e95420"/><circle cx="16" cy="16" r="6.3" fill="none" stroke="white" strokeWidth="2"/><circle cx="16" cy="4.7" r="2.1" fill="white"/><circle cx="6.1" cy="21.6" r="2.1" fill="white"/><circle cx="25.9" cy="21.6" r="2.1" fill="white"/></svg>:<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="26" height="21" rx="5" fill="#3c5d82"/><path d="M9 12l5 4-5 4m9 0h6" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    <small>{label}</small>
  </span>
}
