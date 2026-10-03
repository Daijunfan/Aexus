import {expect} from '@playwright/test'
/** Exercise real initialization; never turn a pending employee into a mocked ready record. */
export async function readyEmployee(call,id){
 await expect.poll(async()=>{const state=(await call('session.status',{employee:id}))[0];if(state?.initialization?.status==='failed')throw Error(state.initialization.error);return state?.initialization?.status},{timeout:20000}).toBe('ready')
}
export async function createReady(call,args){const card=await call('card.create',args);await readyEmployee(call,card.id);return card}
/** Idle before an asynchronous UI dispatch is not proof the submitted message completed. */
export async function acceptedMessage(call,id,text){
 await expect.poll(async()=>(await call('session.transcript',{employee:id})).items.some(item=>item.role==='user'&&item.text===text),{timeout:15000}).toBe(true)
 await expect.poll(async()=>(await call('session.status',{employee:id}))[0].busy).toBe(false)
 return (await call('session.transcript',{employee:id})).items.find(item=>item.role==='user'&&item.text===text)
}
