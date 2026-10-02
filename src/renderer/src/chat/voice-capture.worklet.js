/** Mono PCM capture. Output stays silent; only explicit recording commands collect samples. */
class MessageVoiceCapture extends AudioWorkletProcessor {
  constructor(options){
    super();this.active=false;this.closed=false;this.count=0;this.total=0;this.peak=0;this.data=new Int16Array(4096);this.maximum=options.processorOptions.maximum
    this.port.onmessage=({data})=>{if(this.closed)return;if(data==='record')this.active=true;else if(data==='pause'){this.active=false;this.flush()}else if(data==='stop'){this.active=false;this.flush();this.closed=true;this.port.postMessage({type:'done'})}}
  }
  flush(){if(!this.count)return;const samples=this.data.slice(0,this.count);this.port.postMessage({type:'samples',samples,peak:this.peak},[samples.buffer]);this.count=0;this.peak=0}
  process(inputs){
    const channels=inputs[0]
    if(this.active&&channels?.length){for(let i=0;i<channels[0].length;i++){let sample=0;for(const channel of channels)sample+=(channel[i]??0)/channels.length;sample=Math.max(-1,Math.min(1,sample));this.data[this.count++]=Math.round(sample*(sample<0?32768:32767));this.peak=Math.max(this.peak,Math.abs(sample));this.total++;if(this.count===this.data.length)this.flush();if(this.total>=this.maximum){this.flush();this.active=false;this.closed=true;this.port.postMessage({type:'done',limit:true});break}}}
    return !this.closed
  }
}
registerProcessor('message-voice-capture',MessageVoiceCapture)
