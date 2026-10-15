import workletUrl from './voice-capture.worklet.js?url&no-inline'
import {voiceWav,VOICE_SAMPLE_RATE,VOICE_MAX_SECONDS} from '../../../shared/voice-recording'
export type VoiceResult={blob:Blob;seconds:number;peaks:number[]}
/** One capture session. Pausing stops the input track, while preserving collected samples. */
export class VoiceCapture {
 private context:AudioContext
 private node?:AudioWorkletNode
 private source?:MediaStreamAudioSourceNode
 private stream?:MediaStream
 private chunks:Int16Array[]=[]
 private peaks:number[]=[]
 private count=0
 private cancelled=false
 private finishing=false
 private generation=0
 constructor(private progress:(seconds:number,peaks:number[])=>void,private done:(result:VoiceResult,limited:boolean)=>void,private interrupted:(reason:'device'|'processor')=>void){this.context=new AudioContext({sampleRate:VOICE_SAMPLE_RATE})}
 async start(){
  if(this.cancelled||this.finishing)return false
  const generation=++this.generation,current=()=>!this.cancelled&&!this.finishing&&generation===this.generation
  const resume=this.context.resume();void resume.catch(()=>{})
  let stream:MediaStream|undefined
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})
   if(!current()){this.stopTracks(stream);return false}
   this.stream=stream
   stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(this.stream===stream&&!this.cancelled&&!this.finishing){this.interrupted('device');this.stop()}},{once:true}))
   await resume
   if(!current()){this.stopTracks(stream);return false}
   if(!this.node){
    await this.context.audioWorklet.addModule(workletUrl)
    if(!current()){this.stopTracks(stream);return false}
    this.node=new AudioWorkletNode(this.context,'message-voice-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{maximum:this.context.sampleRate*VOICE_MAX_SECONDS}})
    const silence=this.context.createGain();silence.gain.value=0;this.node.connect(silence).connect(this.context.destination)
    this.node.port.onmessage=({data})=>{if(this.cancelled)return;if(data.type==='samples'){this.chunks.push(data.samples);this.count+=data.samples.length;this.peaks.push(data.peak);this.progress(this.count/this.context.sampleRate,this.peaks)}else if(data.type==='done')this.finish(!!data.limit)}
    this.node.onprocessorerror=()=>{if(this.cancelled)return;this.interrupted('processor');this.finish(false)}
   }
   this.source=this.context.createMediaStreamSource(stream);this.source.connect(this.node);this.node.port.postMessage('record');return true
  }catch(cause){if(stream)this.stopTracks(stream);throw cause}
 }
 private stopTracks(stream=this.stream){if(this.stream===stream){this.source?.disconnect();this.source=undefined;this.stream=undefined}stream?.getTracks().forEach(track=>track.stop())}
 pause(){this.generation++;this.node?.port.postMessage('pause');this.stopTracks()}
 stop(){if(this.finishing||this.cancelled)return;this.finishing=true;this.generation++;this.stopTracks();if(this.node)this.node.port.postMessage('stop');else this.finish(false)}
 private finish(limited:boolean){if(this.cancelled)return;this.finishing=true;this.stopTracks();const result={blob:voiceWav(this.chunks,this.context.sampleRate),seconds:this.count/this.context.sampleRate,peaks:[...this.peaks]};this.cancelled=true;this.node?.disconnect();void this.context.close().catch(()=>{});this.chunks=[];this.peaks=[];this.done(result,limited)}
 cancel(){this.cancelled=true;this.generation++;this.stopTracks();this.node?.disconnect();this.chunks=[];this.peaks=[];void this.context.close().catch(()=>{})}
}
