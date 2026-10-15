export function osName(host){return host.os==='windows'?'Windows':host.os==='macos'?'macOS':host.distribution||'Linux'}
export function osIcon(host){
  const type=host.os==='windows'?'windows':host.os==='macos'?'macos':['ubuntu','kali','debian'].includes(host.distribution)?host.distribution:'linux'
  const name={windows:'Windows',macos:'macOS',ubuntu:'Ubuntu',kali:'Kali',debian:'Debian',linux:'Linux'}[type]
  return `<span class="os-icon os-${type}"><img src="./os/${type}.svg" alt="${name}" draggable="false"></span>`
}
