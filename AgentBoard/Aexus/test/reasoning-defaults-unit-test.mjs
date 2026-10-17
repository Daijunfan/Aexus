import assert from 'node:assert/strict'
import {employeeReasoning,REASONING_DEFAULTS,validateEffort} from '../src/shared/reasoning-defaults.ts'
import {mergePreferences} from '../src/shared/preferences.ts'
const preferences=mergePreferences({}, {defaultCodexEffort:'ultra',defaultClaudeEffort:'max',defaultClaudeThinking:true,defaultOpenCodeEffort:'high'})
assert.deepEqual(employeeReasoning('codex',preferences),{effort:'ultra',thinking:false})
assert.deepEqual(employeeReasoning('claude',preferences),{effort:'max',thinking:true})
assert.deepEqual(employeeReasoning('opencode',preferences),{effort:'high',thinking:false})
assert.deepEqual(employeeReasoning('claude',preferences,{effort:'default',thinking:false}),{effort:undefined,thinking:false})
for(const engine of ['cline','pi']){
 assert.deepEqual(employeeReasoning(engine,preferences),{effort:undefined,thinking:false})
 assert.throws(()=>employeeReasoning(engine,preferences,{effort:'high'}),/does not support/)
}
for(const engine of ['codex','opencode','cline','pi'])assert.throws(()=>employeeReasoning(engine,preferences,{thinking:true}),/not supported/)
for(const value of ['',true,0,'maximum',[],{}])assert.throws(()=>validateEffort(value),/effort/)
assert.throws(()=>employeeReasoning('claude',preferences,{thinking:'off'}),/boolean/)
const saved=employeeReasoning('codex',preferences)
assert.deepEqual(saved,{effort:'ultra',thinking:false})
assert.equal(mergePreferences(preferences,{defaultCodexEffort:'default'}).defaultClaudeEffort,'max')
assert.equal(mergePreferences({}).defaultCodexEffort,REASONING_DEFAULTS.defaultCodexEffort)
console.log('PASS reasoning defaults: exact effort levels including ultra; explicit default/off override; unsupported adapters fail; partial settings and legacy defaults preserved')
