/** Read-only observations of the Core host. A connection is not an attack verdict. */
export type GuardianLocation={latitude:number;longitude:number;label:string;country?:string;countryCode?:string;city?:string;source:'manual'|'ipwho.is'}
export type GuardianSettings={geoLookupEnabled:boolean;home:GuardianLocation|null}
export type GuardianConnection={id:string;pid:number|null;process:string;localAddress:string;localPort:number;remoteAddress:string|null;remotePort:number|null;state:string;scope:'public'|'private'|'loopback'|'listening';direction:'inbound'|'unknown';location:GuardianLocation|null;rxBytes:number;txBytes:number}
export type GuardianInterface={name:string;addresses:string[];rxBytes:number;txBytes:number;rxBytesPerSecond:number|null;txBytesPerSecond:number|null}
export type GuardianSecurityCheck={id:'firewall'|'filevault'|'sip';label:string;status:'enabled'|'disabled'|'unknown';detail:string;checkedAt:number}
export type GuardianHistoryPoint={at:number;cpuPercent:number|null;cores:number[];memoryPercent:number;memory:GuardianSnapshot['memory'];disk:GuardianSnapshot['disk'];rxBytesPerSecond:number|null;txBytesPerSecond:number|null}
export type GuardianStorageEntry={name:string;path:string;kind:'directory'|'file';bytes:number;files:number;directories:number;partial:boolean}
export type GuardianStorageScan={
  id:string;path:string;status:'running'|'completed'|'partial'|'cancelled'|'failed'
  startedAt:number;updatedAt:number;finishedAt:number|null
  bytes:number;files:number;directories:number;pendingDirectories:number
  entries:GuardianStorageEntry[];largestFiles:{name:string;path:string;bytes:number}[]
  otherBytes:number;otherEntries:number;skippedSymlinks:number;skippedSpecial:number
  errorCount:number;errors:{path:string;message:string}[]
}
export type GuardianSnapshot={
  sampledAt:number;intervalMs:number|null
  host:{hostname:string;platform:string;arch:string;cpuModel:string;cpuCount:number;uptimeSeconds:number}
  cpu:{usagePercent:number|null;cores:number[]}
  memory:{totalBytes:number;usedBytes:number;availableBytes:number;freeBytes:number;wiredBytes:number;compressedBytes:number;activeBytes:number;inactiveBytes:number;cachedBytes:number;swapUsedBytes:number;swapTotalBytes:number;pressure:'normal'|'warn'|'critical'|'unknown'}
  disk:{path:string;totalBytes:number;usedBytes:number;availableBytes:number;usedPercent:number}|null
  network:{rxBytesPerSecond:number|null;txBytesPerSecond:number|null;interfaces:GuardianInterface[];connections:GuardianConnection[];listening:number;publicConnections:number}
  processes:{pid:number;name:string;cpuPercent:number;memoryBytes:number}[]
  security:GuardianSecurityCheck[]
  settings:GuardianSettings
  geo:{provider:'ipwho.is';enabled:boolean;status:'disabled'|'idle'|'resolving'|'ready'|'error';pending:number;error:string|null;publicIp:string|null;publicLocation:GuardianLocation|null}
  issues:string[];history:GuardianHistoryPoint[]
}
