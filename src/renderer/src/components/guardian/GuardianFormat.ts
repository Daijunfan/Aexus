import type {GuardianSnapshot} from '../../../../shared/guardian'
export const bytes=(value:number|null|undefined,precision=1)=>{if(value==null)return '—';if(value===0)return '0 B';const i=Math.min(4,Math.floor(Math.log(Math.max(1,value))/Math.log(1024)));return `${(value/1024**i).toFixed(i?precision:0)} ${['B','KB','MB','GB','TB'][i]}`}
export const percent=(value:number|null|undefined)=>value==null?'—':`${value.toFixed(1)}%`
export const rate=(value:number|null|undefined)=>value==null?'等待采样':`${bytes(value)}/s`
export const time=(value:number)=>new Date(value).toLocaleTimeString('zh-CN',{hour12:false})
export const pressureLabel={normal:'正常',warn:'偏高',critical:'高压力',unknown:'未知'}
export const palette=['#228b85','#5685c6','#8b79ba','#bb8a45','#6e9da5','#97b9cc']
export function memoryParts(memory:GuardianSnapshot['memory']|undefined){return memory?[
 {id:'wired',label:'固定内存',value:memory.wiredBytes,color:palette[0],description:'系统与驱动必须保留在物理内存中的部分，不能换出。'},
 {id:'compressed',label:'压缩内存',value:memory.compressedBytes,color:palette[2],description:'macOS 压缩后保留在内存中的数据，减少直接写入交换区。'},
 {id:'other',label:'其他驻留',value:Math.max(0,memory.usedBytes-memory.wiredBytes-memory.compressedBytes),color:palette[1],description:'其余物理驻留数据，包含应用和可回收缓存。物理占用高不等于内存压力高。'},
 {id:'free',label:'未占用',value:Math.max(0,memory.totalBytes-memory.usedBytes),color:'#c9dce6',description:'当前尚未分配的物理内存；系统还可以回收一部分已占用缓存。'}]:[]}
