import path from 'node:path'
import {execFileSync} from 'node:child_process'

// Read the actual bundle entry so current and legacy package names both work.
export function desktopExecutable(application) {
  if(!application?.endsWith('.app'))return application
  const name=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleExecutable',path.join(application,'Contents/Info.plist')],{encoding:'utf8'}).trim()
  return path.join(application,'Contents/MacOS',name)
}
