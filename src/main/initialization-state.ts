import {AsyncLocalStorage} from 'node:async_hooks'
import {randomUUID} from 'node:crypto'
import {readStore} from './store'
import {employeeReady,type EmployeeInitialization} from '../shared/types'

// The bypass is private to the Core job. JSON arguments and Agent credentials cannot select it.
const initializer = new AsyncLocalStorage<string>()
export const withInitializer = <T>(id:string,work:()=>T) => initializer.run(id,work)
export const isInitializer = (id:string) => initializer.getStore() === id
export const pendingInitialization = ():EmployeeInitialization => ({status:'pending',attemptId:randomUUID(),createdAt:Date.now()})
export const readyInitialization = ():EmployeeInitialization => {const now=Date.now();return {status:'ready',attemptId:randomUUID(),createdAt:now,finishedAt:now}}
export class EmployeeInitializationError extends Error {
  readonly code:string
  constructor(failed=false){
    super(failed?'该人物初始化失败，请重试初始化后再交互。':'该人物正在初始化中，请稍等片刻。')
    this.code=failed?'EMPLOYEE_INITIALIZATION_FAILED':'EMPLOYEE_INITIALIZING'
  }
}
export function assertEmployeeReady(id?:string){
  if(!id||isInitializer(id))return
  const card=readStore().sessions.find(value=>value.id===id)
  if(card&&!employeeReady(card))throw new EmployeeInitializationError(card.initialization?.status==='failed')
}
// Status queries and lifecycle recovery remain available; interaction never queues behind onboarding.
export function assertInitializationRequest(command:string,id?:string){
  if(!id)return
  if(['card.update','config.engine'].includes(command)&&readStore().sessions.find(card=>card.id===id)?.initialization?.status==='failed')return
  if(['card.profile','session.list','session.status','session.info','session.search','card.initialize','card.remove'].includes(command))return
  if(command.startsWith('session.')||command.startsWith('config.')||command.startsWith('commands.')||command.startsWith('approval.')||command.startsWith('card.')||command==='engine.inspect'||command==='engine.skill'||command==='management.global'||command.startsWith('terminal.')||['schedule.create','schedule.run'].includes(command))assertEmployeeReady(id)
}
