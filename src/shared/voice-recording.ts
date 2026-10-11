export const VOICE_SAMPLE_RATE=24000,VOICE_MAX_SECONDS=600
export function voiceWav(chunks:Int16Array[],sampleRate:number){
 const count=chunks.reduce((sum,chunk)=>sum+chunk.length,0),bytes=new ArrayBuffer(44+count*2),view=new DataView(bytes)
 const text=(at:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i))}
 text(0,'RIFF');view.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*2,true)
 let offset=44;for(const chunk of chunks)for(const sample of chunk){view.setInt16(offset,sample,true);offset+=2}
 return new Blob([bytes],{type:'audio/wav'})
}
