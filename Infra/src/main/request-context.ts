import {AsyncLocalStorage} from 'node:async_hooks'
import {randomUUID} from 'node:crypto'
import type {RequestContext} from '../shared/management'
const contexts=new AsyncLocalStorage<RequestContext&{signal?:AbortSignal}>()
export const operatorContext=():RequestContext=>({principal:{kind:'operator'},requestId:randomUUID()})
export function requestContext(){const value=contexts.getStore();if(!value)throw Error('Missing authenticated caller');return value}
export const optionalRequestContext=()=>contexts.getStore()
export const currentClientId=()=>contexts.getStore()?.clientId
export const withCaller=<T>(context:RequestContext&{signal?:AbortSignal},work:()=>T)=>contexts.run(context,work)
