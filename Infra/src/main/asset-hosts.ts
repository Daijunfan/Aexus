import os from 'node:os'
import {createHash} from 'node:crypto'
import {listCloudHosts} from './cloud-hosts'
import type {AssetHost} from '../shared/asset-schema'
import type {TeamSettings} from '../shared/types'
export const localAssetHost=():AssetHost=>({id:'core',name:'Core host',kind:'local',os:process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'linux'})
/** Display identity only; no address, private key path or implicit health probe. */
export function assetHost(settings?:TeamSettings):AssetHost{
 if(settings?.mode!=='cloud')return localAssetHost()
 const host=listCloudHosts().find(host=>host.id===settings.hostId||!settings.hostId&&host.host===settings.remote?.host)
 const id=host?.id??'unregistered:'+createHash('sha256').update(JSON.stringify([settings.hostId,settings.remote?.host,settings.remote?.port])).digest('hex').slice(0,20)
 return {id,name:host?.name??'Unregistered remote host',kind:'remote',os:host?.os??settings.remote?.os,distribution:host?.distribution??settings.remote?.distribution}
}
export const coreMachineName=()=>os.hostname()
