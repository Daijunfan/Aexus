// Focused disposable Core regression: a team Manager may visually cancel an existing explicit
// Secretary/Governor binding scoped to its own Team, without gaining bind/enable or creator-line authority.
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore()
const pair=(source,target)=>edge=>edge.managerId===source.id&&edge.employeeId===target.id
const topology=token=>f.call(token,'management','topology')
const denied=async(token,command,args)=>assert.equal((await f.request(token,command,args)).ok,false,command+' should reject')
try{
  await f.cli('group','add','A');await f.cli('group','add','B');await f.cli('group','add','C')
  // The Secretary homes in its own operations group (mirroring the live "Secretary Operations"), but its
  // authority is global: a Manager still cancels its bindings into the Manager's own Team.
  const secretary=await f.create('Secretary','C','secretary')
  const manager=await f.create('Manager','A','manager')
  const peer=await f.create('Peer manager','A','manager')
  const worker=await f.create('Worker','A')
  const other=await f.create('Other worker','B')
  const st=await f.token(secretary.id),mt=await f.token(manager.id),pt=await f.token(peer.id)
  // Secretary creates an explicit binding to the Manager-team employee.
  const bound=await f.call(st,'management','bind','--manager',secretary.id,'--employee',worker.id)
  assert.equal(bound.bound,true);assert.equal(bound.changed,true)
  // The global Secretary homes outside the Manager's team, so the operator (global) topology carries
  // the edge while the Manager's team view omits the out-of-team source node.
  const secEdge=(await f.cli('management','topology')).edges.find(pair(secretary,worker))
  assert.ok(secEdge,'operator topology shows the Secretary binding')
  assert.ok(!(await topology(mt)).edges.some(pair(secretary,worker)),'Manager team view omits the global Secretary node')
  // Manager disables the higher-source binding by ID; the edge disappears from global topology.
  const cancel=await f.call(mt,'management','unbind',secEdge.id)
  assert.equal(cancel.bound,false);assert.equal(cancel.changed,true);assert.equal(cancel.relation,null)
  assert.ok(!(await f.cli('management','topology')).edges.some(pair(secretary,worker)),'operator topology hides the canceled edge')
  // The Manager cannot re-create / re-enable the external Secretary source.
  await denied(mt,'management.bind',{manager:secretary.id,employee:worker.id})
  // A Manager cannot cancel a binding in another Team.
  await f.call(st,'management','bind','--manager',secretary.id,'--employee',other.id)
  await denied(mt,'management.unbind',{manager:secretary.id,employee:other.id})
  // A Manager cannot cancel a peer Manager's non-global binding in the same Team.
  await f.call(pt,'management','bind','--manager',peer.id,'--employee',worker.id)
  await denied(mt,'management.unbind',{manager:peer.id,employee:worker.id})
  const peerEdge=(await topology(mt)).edges.find(pair(peer,worker))
  assert.ok(peerEdge);await denied(mt,'management.unbind',{id:peerEdge.id})
  // A Manager cannot hide a Secretary creation line, even with an explicit override present.
  const made=await f.call(st,'card','create','--title','Secretary made','--group','A','--management-role','employee','--engine','codex','--model','gpt-6-luna','--effort','low');await f.ready(made.id)
  const lineEdge=(await f.cli('management','topology')).edges.find(pair(secretary,made))
  assert.ok(lineEdge,'Secretary creation line is visible');assert.equal(lineEdge.id,'created-'+made.id)
  await f.call(st,'management','unbind',lineEdge.id)
  await f.call(st,'management','bind','--manager',secretary.id,'--employee',made.id)
  await denied(mt,'management.unbind',{id:lineEdge.id})
  // The higher source retains its own authority over the same line.
  assert.equal((await f.call(st,'management','bind','--manager',secretary.id,'--employee',worker.id)).changed,true)
  assert.ok((await f.cli('management','topology')).edges.some(pair(secretary,worker)),'Secretary re-binds after the Manager cancel')
  console.log('PASS manager cancellation of higher-source bindings: own-Team disable, hidden topology, other-Team/peer/creator-line rejections, and source re-bind')
}finally{await f.close()}
