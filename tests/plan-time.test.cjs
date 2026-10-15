const {test}=require('node:test'),assert=require('node:assert/strict');
const time=require('../src/plan-time.cjs');
test('Aexus weekly weekday 9 AM Asia/Shanghai is computed in the selected timezone',()=>{
 const rule=time.validate({kind:'weekly',time:'09:00',timezone:'Asia/Shanghai',days:[1,2,3,4,5]},Date.parse('2026-10-12T00:00:00Z'));
 const dates=time.preview(rule,Date.parse('2026-10-12T02:00:00Z'),5);
 assert.deepEqual(dates.map(v=>new Date(v).toISOString()),[
  '2026-10-13T01:00:00.000Z','2026-10-14T01:00:00.000Z',
  '2026-10-15T01:00:00.000Z','2026-10-16T01:00:00.000Z','2026-10-19T01:00:00.000Z']);
});
test('timezone daylight-saving gap shifts scheduled time, not the calendar date',()=>{
 const rule=time.validate({kind:'weekly',time:'02:30',timezone:'America/New_York',days:[7]});
 assert.equal(new Date(time.next(rule,Date.parse('2026-03-07T00:00:00Z'))).toISOString(),'2026-03-08T07:30:00.000Z');
});
test('DST overlap executes once at earlier offset and does not repeat a local time',()=>{
 const rule=time.validate({kind:'weekly',time:'01:30',timezone:'America/New_York',days:[7]});
 const first=new Date(time.next(rule,Date.parse('2026-11-01T00:00:00Z'))).toISOString();
 assert.equal(first,'2026-11-01T05:30:00.000Z');
 assert.equal(new Date(time.next(rule,Date.parse('2026-11-01T05:32:00Z'))).toISOString(),'2026-11-08T06:30:00.000Z');
});
test('monthly 31st skips shorter months, last day follows month length',()=>{
 const last=time.validate({kind:'monthly',day:'last',time:'18:00',timezone:'UTC'});
 assert.equal(new Date(time.next(last,Date.parse('2026-02-01T00:00:00Z'))).toISOString(),'2026-02-28T18:00:00.000Z');
 const only31=time.validate({kind:'monthly',day:31,time:'18:00',timezone:'UTC'});
 assert.equal(new Date(time.next(only31,Date.parse('2026-02-01T00:00:00Z'))).toISOString(),'2026-03-31T18:00:00.000Z');
});
test('invalid timezone, clock, weekdays, and short intervals fail without executing an Agent',()=>{
 assert.throws(()=>time.validate({kind:'weekly',time:'25:99',days:[1],timezone:'UTC'}),/HH:mm/);
 assert.throws(()=>time.validate({kind:'weekly',time:'09:00',days:[0],timezone:'UTC'}),/Weekdays/);
 assert.throws(()=>time.validate({kind:'weekly',time:'09:00',days:[1],timezone:'GMT+8'}),/IANA timezone/);
 assert.throws(()=>time.validate({kind:'interval',everySeconds:5}),/60 seconds/);
});
