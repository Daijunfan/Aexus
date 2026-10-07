import {Temporal} from '@js-temporal/polyfill'
import type {NoticeRule} from '../shared/conversation-controls'

export function noticeInstant(value:unknown){
 if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value))throw Error('Notice timestamps require an explicit UTC offset or Z')
 try{return Temporal.Instant.from(value).toString()}catch{throw Error('Invalid notice timestamp')}
}
export function noticeRule(value:unknown):NoticeRule{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose a notice time rule')
 const rule=value as Record<string,any>,keys=rule.kind==='once'?['kind','at']:rule.kind==='interval'?['kind','everySeconds','anchor']:rule.kind==='weekly'?['kind','time','days','timezone']:[]
 if(!keys.length||Object.keys(rule).some(key=>!keys.includes(key)))throw Error('Notices accept only once, interval or weekly rules; Plan actions are not accepted')
 if(rule.kind==='once')return {kind:'once',at:noticeInstant(rule.at)}
 if(rule.kind==='interval'){
  if(!Number.isSafeInteger(rule.everySeconds)||rule.everySeconds<60||rule.everySeconds>31536000)throw Error('Notice repeat interval must be 60–31536000 seconds')
  return {kind:'interval',everySeconds:rule.everySeconds,anchor:noticeInstant(rule.anchor)}
 }
 if(typeof rule.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.time)||!Array.isArray(rule.days)||!rule.days.length||rule.days.length>7||rule.days.some(day=>!Number.isInteger(day)||day<1||day>7)||new Set(rule.days).size!==rule.days.length)throw Error('Choose time HH:mm and unique weekdays 1–7')
 if(typeof rule.timezone!=='string'||!rule.timezone||/^[+-]/.test(rule.timezone))throw Error('Choose an IANA timezone')
 try{Temporal.Now.instant().toZonedDateTimeISO(rule.timezone)}catch{throw Error('Invalid notice timezone')}
 return {kind:'weekly',time:rule.time,days:[...rule.days].sort(),timezone:rule.timezone}
}
/** Strictly after the cursor; calendar reminders keep their local wall-clock time. */
export function nextNoticeAt(rule:NoticeRule,after:number):string|null{
 if(rule.kind==='once')return Date.parse(rule.at)>after?rule.at:null
 if(rule.kind==='interval'){const anchor=Date.parse(rule.anchor),step=rule.everySeconds*1000;return new Date(anchor+Math.max(0,Math.floor((after-anchor)/step)+1)*step).toISOString()}
 const date=Temporal.Instant.fromEpochMilliseconds(after).toZonedDateTimeISO(rule.timezone).toPlainDate()
 for(let n=0;n<9;n++){const candidate=date.add({days:n});if(!rule.days.includes(candidate.dayOfWeek))continue;const instant=candidate.toZonedDateTime({timeZone:rule.timezone,plainTime:rule.time}).toInstant();if(instant.epochMilliseconds>after)return instant.toString()}
 throw Error('Cannot resolve the next notification occurrence')
}
export function noticePreview(rule:NoticeRule,from:number){const result:string[]=[];let cursor=from;for(let n=0;n<5;n++){const next=nextNoticeAt(rule,cursor);if(!next)break;result.push(next);cursor=Date.parse(next)}return result}
