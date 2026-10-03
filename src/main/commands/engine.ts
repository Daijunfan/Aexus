import { engineCapabilities } from '../../shared/engines'
import { engineList,checkEngine,invalidateEngine } from '../engines/registry'
import { configureEngine } from '../engines/configuration'
import { engineInstallPlan,installEngine,installationStatus,cancelInstallation } from '../engines/installer'
import { beginEngineLogin,engineLoginStatus,cancelEngineLogin } from '../engines/login'
import { probeEngine } from '../engines/probe'
import { exposeClaudeSdk } from '../engines/claude-sdk'
import { engineModels } from '../engine-models'
import { inspectEngine,invokeSkill } from '../engine-tools'
import { checkCloudNative,listCloudNativeSessions } from '../cloud-native'
export async function engineRequest(command:string,a:Record<string,any>){
 const s=(value:unknown)=>String(value)
 switch(command){
    case 'engine.list': return engineList()
    case 'engine.capabilities': return engineCapabilities(a.engine)
    case 'engine.check': return checkEngine(a.engine,{team:a.team,force:a.force===true})
    case 'engine.probe': return probeEngine(a.engine,a.confirm===true,a.model)
    case 'engine.configure': {const result=configureEngine(a.engine,a.patch??{});invalidateEngine(a.engine);exposeClaudeSdk();return result}
    case 'engine.install-plan': return engineInstallPlan(a.engine)
    case 'engine.install': return installEngine(a.engine,a.confirm===true)
    case 'engine.install-status': return installationStatus(s(a.id))
    case 'engine.cancel-install': return cancelInstallation(s(a.id))
    case 'engine.login': return beginEngineLogin(s(a.engine))
    case 'engine.login-status': return engineLoginStatus(s(a.id))
    case 'engine.cancel-login': return cancelEngineLogin(s(a.id))
    case 'engine.remote-check': return checkCloudNative(s(a.team),s(a.engine) as 'codex'|'claude',a.directory)
    case 'engine.remote-sessions': return listCloudNativeSessions(s(a.team),s(a.engine) as 'codex'|'claude')
    case 'engine.models': return engineModels(a.engine,a.kind,a.team)
    case 'engine.inspect': return inspectEngine(s(a.id),s(a.section??'capabilities'))
    case 'engine.skill': return {sent:await invokeSkill(s(a.id),s(a.name),s(a.prompt??''))}
 default:throw Error('Unknown engine command')
 }
}
