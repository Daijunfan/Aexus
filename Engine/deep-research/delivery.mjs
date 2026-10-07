const encoder=new TextEncoder()
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0})
const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
const concat=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length}return out}
/** A portable store-only ZIP containing exactly the final manifest files. */
export function deliveryZip(files){
 let offset=0;const parts=[],directory=[]
 for(const file of files){
  const name=encoder.encode(file.name),data=encoder.encode(file.content),checksum=crc(data),local=new Uint8Array(30+name.length),v=new DataView(local.buffer)
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30)
  const central=new Uint8Array(46+name.length),c=new DataView(central.buffer)
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,checksum,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46)
  parts.push(local,data);directory.push(central);offset+=local.length+data.length
 }
 const central=concat(directory),end=new Uint8Array(22),v=new DataView(end.buffer)
 v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,central.length,true);v.setUint32(16,offset,true)
 return concat([...parts,central,end])
}
