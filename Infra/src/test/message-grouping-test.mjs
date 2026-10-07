import assert from 'node:assert/strict'
import {messageGroups} from '../renderer/src/chat/messagePresentation.ts'
const time=new Date(2026,9,1,12).getTime(),message=(id,author,offset=0)=>({id,author,time:time+offset})
const positions=items=>[...messageGroups(items).values()]
assert.deepEqual(positions([message('a','you'),message('b','you',1000),message('c','you',2000)]),['first','middle','last'])
assert.deepEqual(positions([message('a','you'),message('b','aster'),message('c','rowan')]),['single','single','single'],'a different sender starts a new bubble group')
assert.deepEqual(positions([message('a','you'),message('b','you',5*60_000)]),['single','single'],'a five-minute pause starts a new group')
assert.deepEqual(positions([{id:'a',author:'you',time:new Date(2026,9,1,23,59).getTime()},{id:'b',author:'you',time:new Date(2026,9,2,0,0).getTime()}]),['single','single'],'date separators always split groups')
assert.deepEqual(positions([{id:'old',author:'aster'},message('new','aster')]),['single','single'],'unknown historical dates are not invented')
assert.deepEqual(positions([message('a','you'),{...message('hidden','you'),break:true},message('c','you')]),['single','single','single'],'hidden or special messages break the visible chain')
assert.deepEqual(positions([message('later','you',2000),message('earlier','you')]),['single','single'],'out-of-order times are not treated as a continuous interval')
assert.deepEqual(positions([message('a','aster'),{...message('b','aster',1000),breakBefore:true},message('c','aster',2000)]),['single','first','last'],'an unread divider starts a fresh group without breaking the following chain')
console.log('PASS bubble groups: speaker changes, five-minute pauses, local midnight, unknown historical timestamps, hidden/reply boundaries and out-of-order dates')
