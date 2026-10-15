// Extracted from the time-rule approach used by Aexus scheduler/time.ts.
// No employee/role, notifications or Agent execution dependencies.
const {Temporal}=require('@js-temporal/polyfill');
const ms=instant=>Temporal.Instant.from(instant).epochMilliseconds;
const iso=instant=>Temporal.Instant.fromEpochMilliseconds(instant).toString({smallestUnit:'millisecond'});
const zoned=(at,zone)=>Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone);
function zone(value){
 if(typeof value!=='string'||!value.trim()||/^[+-]/.test(value))throw Error('Use an IANA timezone, e.g. Asia/Shanghai');
 try{zoned(0,value)}catch{throw Error('Use a valid IANA timezone, e.g. Asia/Shanghai')}return value;
}
function clock(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('Use HH:mm time');return value}
function weekdays(value){
 if(!Array.isArray(value)||!value.length||value.some(day=>!Number.isInteger(day)||day<1||day>7))throw Error('Weekdays must be 1 (Mon) to 7 (Sun)');
 return [...new Set(value)].sort();
}
function validate(rule,now=Date.now()){
 if(!rule||typeof rule!=='object'||Array.isArray(rule))throw Error('Choose a schedule rule');
 if(rule.kind==='once'){
  if(typeof rule.at!=='string')throw Error('Use a valid ISO date/time');
  let at;try{at=ms(rule.at)}catch{throw Error('Use a valid ISO timestamp with UTC offset')}
  if(at<now-60000)throw Error('Plan time is in the past');return {kind:'once',at:iso(at)};
 }
 if(rule.kind==='interval'){
  if(!Number.isInteger(rule.everySeconds)||rule.everySeconds<60||rule.everySeconds>31536000)
   throw Error('Interval must be between 60 seconds and one year');
  const anchor=rule.anchor?ms(rule.anchor):now+rule.everySeconds*1000;
  return {kind:'interval',everySeconds:rule.everySeconds,anchor:iso(anchor)};
 }
 if(rule.kind==='weekly')return {kind:'weekly',time:clock(rule.time),days:weekdays(rule.days),timezone:zone(rule.timezone)};
 if(rule.kind==='monthly'){
  if(rule.day!=='last'&&(!Number.isInteger(rule.day)||rule.day<1||rule.day>31))throw Error('Monthly day must be 1..31 or last');
  return {kind:'monthly',day:rule.day,time:clock(rule.time),timezone:zone(rule.timezone)};
 }
 throw Error('Use a once, interval, weekly or monthly rule');
}
function next(rule,after=Date.now()){
 if(rule.kind==='once')return ms(rule.at)>after?iso(ms(rule.at)):null;
 if(rule.kind==='interval'){
  const anchor=ms(rule.anchor),period=rule.everySeconds*1000;
  return iso(anchor+Math.max(0,Math.floor((after-anchor)/period)+1)*period);
 }
 const current=zoned(after,rule.timezone).toPlainDate();
 if(rule.kind==='monthly'){
  const month=current.with({day:1});
  for(let offset=0;offset<14;offset++){
   const candidate=month.add({months:offset}),day=rule.day==='last'?candidate.daysInMonth:rule.day;
   if(day>candidate.daysInMonth)continue;
   const at=candidate.with({day}).toZonedDateTime({timeZone:rule.timezone,plainTime:rule.time}).epochMilliseconds;
   if(at>after)return iso(at);
  }
  return null;
 }
 for(let offset=0;offset<=7;offset++){
  const day=current.add({days:offset});
  if(!rule.days.includes(day.dayOfWeek))continue;
  // DST gaps shift to the first valid local time; duplicated hours use the
  // earlier offset so a repeated 01:30 does not run twice on fallback.
  const at=day.toZonedDateTime({timeZone:rule.timezone,plainTime:rule.time}).epochMilliseconds;
  if(at>after)return iso(at);
 }
 return null;
}
function preview(rule,after=Date.now(),count=5){
 if(!Number.isInteger(count)||count<1||count>100)throw Error('Preview count must be 1..100');
 const result=[];let cursor=after;
 for(let i=0;i<count;i++){
  const n=next(rule,cursor);if(!n)break;result.push(n);cursor=ms(n);
 }
 return result;
}
module.exports={validate,next,preview};
