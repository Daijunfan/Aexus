import type {GuardianSnapshot} from './guardian'

/** An observation is a bounded local record; risk and causality are never inferred from a TCP endpoint. */
export type GuardianEventKind='network-change'|'cpu-rise'|'memory-pressure'|'security-change'|'manual'
export type GuardianEventStatus='open'|'reviewed'|'dismissed'
export type GuardianEventSubject={process?:string;pid?:number;remoteAddress?:string;remotePort?:number;security?:string}
export type GuardianEventEntry={at:number;by:'observation'|'user';text:string}
/** Small, explicitly requested system snapshots; no raw files, task messages or packet bodies. */
export type GuardianEventMeasurement={
 at:number;hostCpuPercent:number|null;memoryPressure:GuardianSnapshot['memory']['pressure']
 processObserved:boolean|null;processCpuPercent:number|null;processMemoryBytes:number|null
 tcpPeerObserved:boolean|null;securityStatus:'enabled'|'disabled'|'unknown'|null
 issues:string[]
}
export type GuardianEvent={
 id:string;fingerprint:string;kind:GuardianEventKind;status:GuardianEventStatus;importance:'notice'|'attention'
 title:string;summary:string;subject:GuardianEventSubject
 firstSeenAt:number;lastSeenAt:number;count:number;entries:GuardianEventEntry[];measurements:GuardianEventMeasurement[]
}
export type GuardianEventFeed={
 events:GuardianEvent[];retentionDays:number
 coverage:{mode:'on-demand';startedAt:number|null;lastSampledAt:number|null;sampleCount:number}
}
export type GuardianManualEvent={title:string;summary:string;subject?:GuardianEventSubject}
export type GuardianEventChange={id:string;status:GuardianEventStatus;note?:string}
export type GuardianEventNote={id:string;note:string}
export type GuardianProcess=GuardianSnapshot['processes'][number]
