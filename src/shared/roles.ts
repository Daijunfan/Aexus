import type {ApiPermission} from './api-registry'

/** Role authority is attached to an employee. Team membership only bounds a team-scoped role. */
type RolePolicy={label:string;description:string;scope:'self'|'team'|'global';requiresLocal:boolean;userManaged:boolean;appAdministrator?:boolean;permissions:'all'|readonly ApiPermission[];controls:readonly string[];creates:readonly string[];removes:readonly string[];assigns:readonly string[]}
const personal:ApiPermission[]=['chat','identity','topology','employee.read','workspace','plugin','schedule']
export const MANAGEMENT_ROLES={
  employee:{label:'Employee',description:'使用自己的工作空间与已授权工具，接收任务；不管理其他员工。',scope:'self',requiresLocal:false,userManaged:false,permissions:personal,controls:[],creates:[],removes:[],assigns:[]},
  manager:{label:'Manager',description:'管理本 Team 的全部 Employee，可创建、派发任务和调整位置。',scope:'team',requiresLocal:true,userManaged:false,permissions:[...personal,'relation','host.read','employee.message','employee.configure','employee.create','employee.delete','layout.read','layout.write'],controls:['employee'],creates:['employee'],removes:['employee'],assigns:[]},
  governor:{label:'Governor',description:'跨 Team 管理团队和员工；Governor 的任免由用户或 Secretary 操作。',scope:'global',requiresLocal:true,userManaged:false,permissions:'all',controls:['employee','manager','governor'],creates:['employee','manager'],removes:['employee','manager'],assigns:['employee','manager']},
  secretary:{label:'Secretary',description:'管理 Agents Company 及插件，帮助用户配置软件、组织员工与会话；具体业务工作交给其他员工。',scope:'global',requiresLocal:true,userManaged:true,appAdministrator:true,permissions:'all',controls:['employee','manager','governor','secretary'],creates:['employee','manager','governor'],removes:['employee','manager','governor'],assigns:['employee','manager','governor']}
} as const satisfies Record<string,RolePolicy>
export type ManagementRole=keyof typeof MANAGEMENT_ROLES
export function isManagementRole(value:unknown):value is ManagementRole{return typeof value==='string'&&Object.hasOwn(MANAGEMENT_ROLES,value)}
export function rolePolicy(role:ManagementRole|undefined):RolePolicy{
  if(role!==undefined&&!isManagementRole(role))throw Error('Invalid management role')
  return MANAGEMENT_ROLES[role??'employee']
}
export const isSupervisor=(role:ManagementRole|undefined)=>rolePolicy(role).scope!=='self'
export const roleAllows=(role:ManagementRole|undefined,permission:ApiPermission)=>{const rules=rolePolicy(role).permissions;return rules==='all'||rules.includes(permission)}
export const managementRoles=()=>Object.entries(MANAGEMENT_ROLES).map(([value,policy])=>({value,...policy}))
