import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, defaultDatabase } from '../src/model';
import { createWorkspace } from '../src/seed';
import { eventDate, eventPresenter, eventSignals, eventDescription, repeatSummary, eventValue } from '../src/scheduling/presentation';
import { defaultRule } from '../src/scheduling/commands';
import { arrangeTimeEvents, timeGridProjection } from '../src/database/timeGrid';
import { overviewProjection } from '../src/core/overview';
import { emptyScheduler } from '../src/scheduling/engine';
import { executeWorkspaceCommand } from '../src/core/commands';
import type { DatabaseView } from '../src/types';

const now = new Date('2030-04-08T00:00:00Z');
const view: DatabaseView = { id:'v',name:'时间',type:'plan',planMode:'hourDay',dateAnchor:'2030-04-08',calendarBy:'date',planDoneBy:'status',timeZone:'Asia/Shanghai' };
const root = makePage({id:'root',title:'项目',space:true});
const db = makePage({id:'db',parentId:root.id,title:'事件',database:{...defaultDatabase(),columns:[
  {id:'date',name:'日期',type:'date'},
  {id:'status',name:'状态',type:'select',options:['未开始','进行中','已完成']},
  {id:'owner',name:'负责人',type:'person'},
],views:[view],activeViewId:view.id}});
const record = (id:string,start:string,end?:string) => makePage({id,title:id,parentId:db.id,values:{date:{start,...(end?{end}:{}),timeZone:'Asia/Shanghai'},status:'未开始'}});

test('event labels distinguish all-day, exact short duration, point and midnight range without inventing end times',()=>{
  assert.equal(eventDate('').when,'未排期');
  assert.equal(eventDate('2030-04-08').when,'全天');
  assert.equal(eventDate('2030-04-08','2030-04-10').when,'04/08–04/10 · 全天');
  assert.equal(eventDate('2030-04-08T09:00','2030-04-08T09:05','Asia/Shanghai').when,'09:00–09:05');
  assert.equal(eventDate('2030-04-08T09:00','','Asia/Shanghai').when,'09:00 · 未设结束');
  assert.match(eventDate('2030-04-08T23:45','2030-04-09T00:00','Asia/Shanghai').fullWhen,/2030-04-09 00:00/);
  assert.equal(eventDate('2030-04-08T01:00Z','2030-04-08T02:00Z','Asia/Shanghai').when,'09:00–10:00');
});

test('DST ranges expose offset transitions and calendar dates keep the source zone',()=>{
  const autumn=eventDate('2026-11-01T01:30-04:00','2026-11-01T01:45-05:00','America/New_York');
  assert.match(autumn.fullWhen,/UTC-04:00 → UTC-05:00/);
  const row=record('night','2030-04-08T23:00','2030-04-08T23:30');
  row.values.date={start:'2030-04-08T23:00-04:00',end:'2030-04-08T23:30-04:00',timeZone:'America/New_York'};
  const ws={...createWorkspace(),pages:[root,db,row]};
  assert.equal(eventPresenter(ws,db,{...view,type:'calendar'},now)(row).when,'23:00–23:30');
  assert.equal(eventPresenter(ws,db,view,now)(row).when,'11:00–11:30');
  assert.equal(eventValue([{kind:'person',name:'陈同学'}, {name:'brief.pdf'}, root.id],ws.pages),'陈同学、brief.pdf、项目');
  assert.equal(eventValue({unsupported:true},ws.pages),'');
});

test('recurrence labels distinguish generated records, manual instances, paused series and removed sources',()=>{
  const template=makePage({id:'template',title:'周例会',parentId:db.id,templateFor:db.id,repeat:{...defaultRule(),frequency:'weekly',weekdays:[1,3],enabled:false}});
  const generated=makePage({automationOrigin:{templateId:'template',scheduledFor:now.toISOString()}});
  assert.match(eventSignals(generated,[template]).repeat,/循环.*已暂停.*周一、三/);
  assert.equal(eventSignals({...generated,automationOrigin:{...generated.automationOrigin!,manual:true}},[template]).repeat,'手动生成');
  assert.match(eventSignals(generated,[]).repeat,/原模板已移除/);
  assert.equal(eventSignals(makePage({}),[template]).repeat,'');
  assert.match(repeatSummary({...defaultRule(),frequency:'monthly',monthMode:'lastDay'}),/月末/);
});

test('event summaries retain state, named people and active reminders consistently across views',()=>{
  const row={...record('评审','2030-04-08T09:00','2030-04-08T10:00'),values:{date:{start:'2030-04-08T09:00',end:'2030-04-08T10:00',timeZone:'Asia/Shanghai'},status:'已完成',owner:[{kind:'person' as const,id:'p',name:'陈同学',email:''}]},
    reminders:[{id:'active',enabled:true},{id:'off',enabled:false},{id:'deleted',enabled:true,deletedAt:1}]};
  const ws={...createWorkspace(),pages:[root,db,row]};
  const before=JSON.stringify(ws);
  for(const type of ['table','board','calendar','timeline','plan'] as const){
    const info=eventPresenter(ws,db,{...view,type},now)(row);
    assert.equal(info.status,'已完成');assert.equal(info.tone,'done');assert.equal(info.owner,'陈同学');assert.equal(info.reminders,1);
    assert.match(eventDescription(info),/09:00.*10:00/);assert.doesNotMatch(eventDescription(info),/object Object/);
  }
  assert.equal(JSON.stringify(ws),before,'presentation must not change content or scheduling');
});

test('minimum-height event lanes prevent optical collisions while preserving timestamps and default API layout',()=>{
  const rows=Array.from({length:6},(_,i)=>record(String(i),`2030-04-08T09:${String(i*5).padStart(2,'0')}`,`2030-04-08T09:${String(i*5+4).padStart(2,'0')}`));
  const day=timeGridProjection(db,view,rows,now).days[0];
  assert.ok(day.events.every(event=>event.columns===1));
  const source=day.events.map(({sourceStart,sourceEnd,minuteStart,minuteEnd})=>({sourceStart,sourceEnd,minuteStart,minuteEnd}));
  arrangeTimeEvents(day.events,60/.9);
  assert.ok(day.events.every(event=>event.columns===6));
  assert.deepEqual(day.events.map(({sourceStart,sourceEnd,minuteStart,minuteEnd})=>({sourceStart,sourceEnd,minuteStart,minuteEnd})),source);
});

test('overview and its CLI projection show snoozed reminder time in its own zone and reject stale delivered state',()=>{
  const at='2030-04-07T16:30:00.000Z',until='2030-04-08T02:45:00.000Z';
  const note=makePage({id:'note',parentId:root.id,title:'发布提醒',reminders:[{id:'rem',enabled:true,at,timeZone:'Asia/Shanghai'}]});
  const ws={...createWorkspace(),pages:[root,db,note],scheduler:{...emptyScheduler(),reminders:{rem:{key:at,snoozedUntil:until}}}};
  let items=overviewProjection(ws,{date:'2030-04-08',hideCompleted:false}).items;
  assert.equal(items[0].start,'2030-04-08');assert.equal(items[0].time,'10:45');assert.equal(items[0].status,'稍后提醒');
  assert.match(items[0].dateLabel!,/Asia\/Shanghai/);
  const result=executeWorkspaceCommand(ws,'overview.render',{date:'2030-04-08',hideCompleted:false}).result;
  assert.deepEqual(result.items,items);
  ws.scheduler.reminders.rem={key:'2029-01-01T00:00:00.000Z',deliveredAt:1} as any;
  items=overviewProjection(ws,{date:'2030-04-08',hideCompleted:false}).items;
  assert.equal(items[0].done,false);assert.equal(items[0].time,'00:30');assert.equal(items[0].status,'待提醒');
});
