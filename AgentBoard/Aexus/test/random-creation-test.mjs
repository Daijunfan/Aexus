// Random managementRole / avatar resolution for card.create and session.new.
// Shared rules and the authorization wiring are bundled once with esbuild (which
// resolves the codebase's extensionless imports) against a synthetic
// AGENTS_COMPANY_HOME so no real user state is touched and no model is called.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-random-creation-')),home=process.env.AGENTS_COMPANY_HOME

try{
  process.env.AGENTS_COMPANY_HOME=path.join(temp,'state')
  fs.mkdirSync(process.env.AGENTS_COMPANY_HOME,{recursive:true})
  fs.writeFileSync(path.join(process.env.AGENTS_COMPANY_HOME,'sessions.json'),JSON.stringify({sessions:[{id:'mgr',managementRole:'manager',group:'Eng'},{id:'gov',managementRole:'governor',group:'Eng'},{id:'sec',managementRole:'secretary',group:'Eng'}],groups:['Eng'],teamSettings:{Eng:{mode:'build'}}}))
  const entrySource=`export {RANDOM_MANAGEMENT_ROLE,resolveManagementRole,randomCreatableRoles} from ${JSON.stringify(path.join(root,'src/shared/management.ts'))}
export {MANAGEMENT_ROLES,rolePolicy} from ${JSON.stringify(path.join(root,'src/shared/roles.ts'))}
export {resolveAvatar,avatarDescription} from ${JSON.stringify(path.join(root,'src/shared/avatars.ts'))}
export {SELECTABLE_AVATARS} from ${JSON.stringify(path.join(root,'src/shared/office.ts'))}
export {resolveRandomManagementRole} from ${JSON.stringify(path.join(root,'src/main/authorization.ts'))}
`
  const entry=path.join(temp,'entry.cjs')
  await build({stdin:{contents:entrySource,resolveDir:root,sourcefile:'entry.ts',loader:'ts'},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
  const {RANDOM_MANAGEMENT_ROLE,resolveManagementRole,randomCreatableRoles,MANAGEMENT_ROLES,rolePolicy,resolveAvatar,avatarDescription,SELECTABLE_AVATARS,resolveRandomManagementRole}=createRequire(import.meta.url)(entry)
  const isRole=value=>Object.hasOwn(MANAGEMENT_ROLES,value)
  const sample=(fn,times=200)=>new Set(Array.from({length:times},fn))

  // 1. Explicit values pass through unchanged (regression).
  assert.equal(resolveManagementRole('governor',['employee'],'worker',false),'governor')
  assert.equal(resolveManagementRole('employee',['employee'],'worker',false),'employee')
  assert.equal(resolveManagementRole('secretary',['employee'],'worker',false),'secretary')

  // 2. Operator may draw any role in a local worker workspace; the sentinel never persists.
  const operatorCreates=Object.keys(MANAGEMENT_ROLES)
  for(const resolved of sample(()=>resolveManagementRole(RANDOM_MANAGEMENT_ROLE,operatorCreates,'worker',false))){assert.ok(isRole(resolved),'operator random must persist a real role');assert.notEqual(resolved,RANDOM_MANAGEMENT_ROLE)}
  assert.deepEqual(new Set(randomCreatableRoles(operatorCreates,'worker',false)),new Set(['employee','manager','governor','secretary']))

  // 3. Cloud-native and cloud-workspace boundaries still reject Secretary.
  assert.deepEqual(new Set(randomCreatableRoles(operatorCreates,'cloud-native-worker',false)),new Set(['employee','manager','governor']))
  assert.deepEqual(new Set(randomCreatableRoles(operatorCreates,'worker',true)),new Set(['employee','manager','governor']))
  assert.throws(()=>resolveManagementRole(RANDOM_MANAGEMENT_ROLE,['secretary'],'cloud-native-worker',false),/No management role is available/)
  assert.throws(()=>resolveManagementRole(RANDOM_MANAGEMENT_ROLE,['secretary'],'worker',true),/No management role is available/)

  // 4. Manager agents only get their allowed roles (employee); Governor follows its own creates.
  assert.deepEqual([...sample(()=>resolveManagementRole(RANDOM_MANAGEMENT_ROLE,rolePolicy('manager').creates,'worker',false))],['employee'])
  assert.deepEqual(new Set(randomCreatableRoles(rolePolicy('governor').creates,'worker',false)),new Set(['employee','manager']))
  assert.ok(!rolePolicy('manager').creates.includes('secretary')&&!rolePolicy('governor').creates.includes('secretary')&&!rolePolicy('secretary').creates.includes('secretary'),'no Agent caller may create a Secretary')

  // 5. Random avatar resolves to a selectable official avatar, style-limited and never combined with an explicit value.
  for(const avatar of sample(()=>resolveAvatar({avatar:'random'}))){assert.ok(SELECTABLE_AVATARS.includes(avatar),'random avatar must be selectable');assert.notEqual(avatar,'random')}
  for(const avatar of sample(()=>resolveAvatar({character:'random',avatarStyle:'chibi'}))){assert.ok(SELECTABLE_AVATARS.includes(avatar));assert.equal(avatarDescription(avatar).style,'chibi')}
  assert.throws(()=>resolveAvatar({avatar:'random',character:'gilgamesh'}),/random cannot be combined/)
  assert.throws(()=>resolveAvatar({avatar:SELECTABLE_AVATARS[0],character:'random'}),/random cannot be combined/)
  assert.ok(SELECTABLE_AVATARS.includes(resolveAvatar({avatar:'random',character:'random'})),'both sentinels together still resolve randomly')
  const known=SELECTABLE_AVATARS[0];assert.equal(resolveAvatar({avatar:known}),known)

  // 6. Authorization wiring: operator uses all roles, manager agent uses rolePolicy(manager).creates, and args mutate in place.
  const managerArgs={managementRole:RANDOM_MANAGEMENT_ROLE,kind:'worker',group:'Eng'}
  resolveRandomManagementRole(managerArgs,{principal:{kind:'agent',employeeId:'mgr'}})
  assert.equal(managerArgs.managementRole,'employee','manager card.create random only resolves to employee')
  const governorArgs={managementRole:RANDOM_MANAGEMENT_ROLE,kind:'worker',group:'Eng'}
  resolveRandomManagementRole(governorArgs,{principal:{kind:'agent',employeeId:'gov'}})
  assert.ok(['employee','manager'].includes(governorArgs.managementRole),'governor random resolves within its creates')
  const operatorArgs={managementRole:RANDOM_MANAGEMENT_ROLE,kind:'cloud-native-worker',group:'Eng'}
  resolveRandomManagementRole(operatorArgs,{principal:{kind:'operator'}})
  assert.ok(['employee','manager','governor'].includes(operatorArgs.managementRole),'operator cloud-native random never yields Secretary')
  const explicitArgs={managementRole:'governor'}
  resolveRandomManagementRole(explicitArgs,{principal:{kind:'operator'}})
  assert.equal(explicitArgs.managementRole,'governor')

  console.log('PASS random-creation: explicit roles pass through; operator/manager/governor/secretary boundaries hold for kind and cloud workspace; random avatar is selectable and style-limited; authorization wiring mutates the real managementRole')
}finally{
  if(home===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=home
  fs.rmSync(temp,{recursive:true,force:true})
}
