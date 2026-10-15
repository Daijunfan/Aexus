// Desktop availability is based on the selected host OS or an explicit profile.
export function supportsDesktop(host) {
  return Boolean(host && !host.local && (host.os === 'windows' || host.os === 'macos' ||
    host.desktop?.protocol === 'rdp' || host.desktop?.protocol === 'vnc'))
}

// macOS Screen Sharing speaks VNC. Prefer an SSH tunnel back into that Mac
// instead of exposing port 5900 directly to the controlling computer.
export function desktopDefaults(host = {}) {
  const profile = host.desktop || {}
  return {
    protocol: profile.protocol || (host.os === 'macos' && host.id ? 'vnc' : ''),
    address: profile.address || '127.0.0.1',
    port: profile.port || (profile.protocol === 'vnc' || host.os === 'macos' ? 5900 : 3389),
    viaHostId: profile.viaHostId || (host.os === 'macos' && host.id && !host.desktop ? host.id : '')
  }
}
