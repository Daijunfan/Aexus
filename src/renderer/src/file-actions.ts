import type {FileLocation} from '../../shared/transfers'
import {api} from './api'
import {translate as uiText} from './i18n'
import {downloadBrowserFile} from './web/files'

export async function revealFile(from?:FileLocation){
 if(!from)throw Error(uiText('This is a view folder or a cloud-only document. Choose a physical workspace, or download the document first.'))
 try{return await api.call('workspace.reveal',{from})}catch(error){throw Error(uiText((error as Error).message))}
}
export async function downloadFile(from:FileLocation){
 if(api.mode==='web'){
  // Check availability first so a failed request is visible inside the workspace.
  await api.call('transfer.download-info',{from})
  return downloadBrowserFile(from)
 }
 const result=await api.call('transfer.download-save',{from})
 if(result.saved)await revealFile({local:true,path:result.path})
 return result
}
