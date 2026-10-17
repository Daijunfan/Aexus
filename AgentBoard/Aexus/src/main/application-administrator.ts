import {credentialIssued} from './agent-access'
import {readStore} from './store'
import {requestContext} from './request-context'
import {rolePolicy} from '../shared/roles'
import type {PrincipalRef} from '../shared/management'

/** Administration is an explicit role grant, never a substituted operator identity. */
export function isApplicationAdministrator(principal:PrincipalRef=requestContext().principal){
 if(principal.kind==='operator')return true
 const card=readStore().sessions.find(card=>card.id===principal.employeeId&&!card.deleting)
 return !!card&&!!rolePolicy(card.managementRole).appAdministrator
}
export function requireApplicationAdministrator(){if(!isApplicationAdministrator())throw Error('Only the user or a Secretary may administer the application')}
/** An Agent must not remove the last ready Secretary. The human retains recovery authority. */
export function retainSecretary(excludedIds:string[]){
 if(requestContext().principal.kind==='operator')return
 const cards=readStore().sessions
 if(!cards.some(card=>excludedIds.includes(card.id)&&card.managementRole==='secretary'))return
 if(!cards.some(card=>!excludedIds.includes(card.id)&&!card.deleting&&card.managementRole==='secretary'&&credentialIssued(card.id)&&(!card.initialization||card.initialization.status==='ready')))throw Error('Keep at least one ready Secretary; create or initialize a replacement first')
}
