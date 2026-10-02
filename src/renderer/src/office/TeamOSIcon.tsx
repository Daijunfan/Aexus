import kali from '../assets/os/kali.svg'
import apple from '../assets/os/macos-device.svg'

export function TeamOSIcon({os,distribution}:{os:'linux'|'macos'|'windows';distribution?:string}) {
  const kind=os==='windows'?'windows':os==='macos'?'macos':/\bkali\b/i.test(distribution??'')?'kali':/\bubuntu\b/i.test(distribution??'')?'ubuntu':'linux'
  const label={windows:'Windows',macos:'macOS',kali:'Kali',ubuntu:'Ubuntu',linux:'Linux'}[kind]
  return <span className={`team-os team-os-${kind}`} data-os={kind} title={label} aria-label={label}>
    {kind==='macos'?<span className="team-os-apple" style={{maskImage:`url("${apple}")`,WebkitMaskImage:`url("${apple}")`}} aria-hidden="true"/>:kind==='kali'?<img src={kali} alt=""/>:kind==='windows'?<svg viewBox="1 1 30 30" aria-hidden="true"><path fill="#087cd9" d="M2 3h13v12H2zm15 0h13v12H17zM2 17h13v12H2zm15 0h13v12H17z"/></svg>:kind==='ubuntu'?<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#e95420"/><circle cx="16" cy="16" r="6.3" fill="none" stroke="white" strokeWidth="2"/><circle cx="16" cy="4.7" r="2.1" fill="white"/><circle cx="6.1" cy="21.6" r="2.1" fill="white"/><circle cx="25.9" cy="21.6" r="2.1" fill="white"/></svg>:<svg viewBox="0 0 50 50" aria-hidden="true"><ellipse cx="25" cy="27" rx="15" ry="20" fill="#17202b" stroke="#f7f8fa" strokeWidth="1.5"/><ellipse cx="25" cy="33" rx="10" ry="12" fill="#f7f8fa"/><circle cx="20" cy="17" r="2.2" fill="#f7f8fa"/><circle cx="30" cy="17" r="2.2" fill="#f7f8fa"/><path d="M21 22 25 25 29 22Z" fill="#f6aa42"/><ellipse cx="15" cy="46" rx="7" ry="3" fill="#f6aa42"/><ellipse cx="35" cy="46" rx="7" ry="3" fill="#f6aa42"/></svg>}
  </span>
}
