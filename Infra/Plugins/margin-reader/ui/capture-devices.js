import { $, escape, field, showDialog, closeDialog, run, toast } from './dom.js';
import { api } from './transport.js';
async function encoded(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer());let value='';for(let i=0;i<bytes.length;i+=16384)value+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(value);
}
export class CaptureDevices {
 constructor(study){
  this.study=study;this.active=null;this.stop=null;
  const buttons=document.createElement('span');buttons.className='capture-device-tools';buttons.innerHTML='<button id="study-camera">拍照</button><button id="study-microphone">录音</button><button id="study-read-aloud">朗读</button>';
  $('study-media-add').after(buttons);
  $('study-camera').onclick=run(()=>this.capture('image'));$('study-microphone').onclick=run(()=>this.capture('audio'));$('study-read-aloud').onclick=run(()=>this.readAloud());
  const dict=document.createElement('button');dict.id='reader-local-dictionary';dict.textContent='本地词典';$('search-document').before(dict);dict.onclick=()=>this.dictionary();
  window.addEventListener('pagehide',()=>this.stop?.());
 }
 get dirty(){return Boolean(this.active);}
 async capture(kind,card){
  if(!this.study.current)await this.study.ensureNotes();const set=this.study.current;if(!set)throw Error('先打开文档或学习集。');
  const doc=this.study.getDocument(),locator=doc?this.study.getRenderer().currentLocator(doc):null;
  let stream=null,recorder=null,chunks=[],bytes=0,payload=null,closed=false,timer=null,request=0,url=null,recording=false;
  const status=text=>{if($('device-status'))$('device-status').textContent=text;};
  const stopTracks=()=>{stream?.getTracks().forEach(track=>track.stop());stream=null;};
  const cleanup=()=>{closed=true;++request;clearTimeout(timer);if(recorder?.state==='recording'){recorder.onstop=null;recorder.stop();}stopTracks();if(url)URL.revokeObjectURL(url);this.active=null;this.stop=null;};
  const changed=()=>{$('dialog-fields')?.dispatchEvent(new Event('input',{bubbles:true}));this.active=true;};
  const stopRecording=()=>{if(recorder?.state==='recording'){recorder.stop();recording=false;clearTimeout(timer);status('正在完成录音…');}};
  const html=field('title','标题',card?.title||(kind==='image'?'相机笔记':'语音笔记'),{required:true})+
   (kind==='image'?'<video id="device-video" muted playsinline></video><img id="device-photo" hidden alt="拍照预览">':'<audio id="device-audio" controls hidden></audio>')+
   '<div class="board-actions"><button type="button" id="device-start">'+(kind==='image'?'开启相机':'开始录音')+'</button><button type="button" id="device-capture" disabled>'+ (kind==='image'?'拍摄此帧':'停止录音')+'</button><button type="button" id="device-reset" disabled>重新录制</button></div><p id="device-status" role="status">设备尚未开启。点击开启后才会申请权限；关闭窗口即停止设备。</p>'+field('target','保存位置',card?'comment':doc?'document':'card',{choices:[['card','新建独立卡片'],...(card?[['comment','当前卡片的评论']]:[]),...(doc?[['document','当前文档位置']]:[])]});
  showDialog({title:kind==='image'?'拍照并保存笔记':'本地录音笔记',html,submit:'保存',onSubmit:async v=>{
   if(recording)throw Error('请先停止录音再保存。');if(!payload)throw Error(kind==='image'?'请先拍照。':'请先录制音频。');
   const maximum=kind==='image'?8*1024*1024:16*1024*1024;if(payload.size>maximum)throw Error('媒体超过大小限制，请重新录制。');
   const anchor=v.target==='document'?{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,locator,display:'margin'}:null;
   await this.study.change('study.media.import',{kind,title:v.title,name:kind==='image'?'camera.png':'recording.webm',mimeType:payload.type,contentBase64:await encoded(payload),...(v.target==='comment'?{cardId:card.id,target:'comment'}:{}),...(anchor?{anchor}:{})},set.revision);
   cleanup();toast('媒体已保存在当前文库。');
  },afterOpen:()=>{
   this.stop=cleanup;$('dialog').addEventListener('close',cleanup,{once:true});
   $('device-start').onclick=run(async()=>{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('当前窗口不支持设备访问。可以通过“图片 / 音频”导入已有文件。');
    const ticket=++request;$('device-start').disabled=true;status('等待设备授权…');
    try{
     const next=await navigator.mediaDevices.getUserMedia(kind==='image'?{video:{width:{ideal:1600},height:{ideal:1200},facingMode:'environment'},audio:false}:{audio:{echoCancellation:true},video:false});
     if(closed||ticket!==request){next.getTracks().forEach(t=>t.stop());return;}
     stopTracks();stream=next;this.active=true;
     if(kind==='image'){$('device-video').hidden=false;$('device-video').srcObject=stream;await $('device-video').play();status('相机已开启。选择构图后拍摄。');}
     else{
      if(typeof MediaRecorder==='undefined')throw Error('此浏览器未提供音频录制。');
      const type=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));if(!type)throw Error('没有支持的录音编码格式。');
      chunks=[];bytes=0;recorder=new MediaRecorder(stream,{mimeType:type,audioBitsPerSecond:64000});
      recorder.ondataavailable=event=>{if(closed||!event.data.size)return;bytes+=event.data.size;if(bytes>15*1024*1024){stopRecording();status('达到大小上限，录音已停止。');return;}chunks.push(event.data);};
      recorder.onerror=()=>{stopTracks();recording=false;status('录音设备发生错误，请重新录制。');};
      recorder.onstop=()=>{
       stopTracks();recording=false;clearTimeout(timer);if(closed)return;
       payload=new Blob(chunks,{type});if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(payload);$('device-audio').src=url;$('device-audio').hidden=false;$('device-capture').disabled=true;$('device-reset').disabled=false;changed();status(`录音已停止 · ${Math.ceil(payload.size/1024)} KiB。保存后才会加入笔记。`);
      };
      recorder.start(500);recording=true;timer=setTimeout(stopRecording,15*60*1000);status('正在录音 · 最长 15 分钟。');
     }
     $('device-capture').disabled=false;
    }catch(error){stopTracks();this.active=false;if($('device-start'))$('device-start').disabled=false;status('设备未开启：'+error.message);throw error;}
   });
   $('device-capture').onclick=run(async()=>{
    if(kind==='audio'){stopRecording();return;}
    const video=$('device-video');if(!stream||!video.videoWidth)throw Error('等待相机画面就绪。');
    const scale=Math.min(1,1600/video.videoWidth,1600/video.videoHeight),canvas=document.createElement('canvas');canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    payload=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!payload)throw Error('无法生成照片。');
    stopTracks();video.pause();video.srcObject=null;video.hidden=true;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(payload);$('device-photo').src=url;$('device-photo').hidden=false;$('device-capture').disabled=true;$('device-reset').disabled=false;changed();status('照片已拍摄，相机已关闭。可保存或重新拍摄。');
   });
   $('device-reset').onclick=()=>{++request;stopRecording();stopTracks();payload=null;chunks=[];recording=false;this.active=false;if(url)URL.revokeObjectURL(url);url=null;for(const id of ['device-photo','device-audio'])if($(id))$(id).hidden=true;$('device-start').disabled=false;$('device-capture').disabled=true;$('device-reset').disabled=true;status('已清除暂存媒体，设备已关闭。');};
  }});
 }
 async readAloud(card,content){
  card??=this.study.current?.cards.find(c=>c.id===this.study.map.selected||c.id===this.study.current.reviewSession?.current?.id);
  const text=content??(card?((card.editedText??card.text)||card.title):'');const voices=await api('speech.voices');
  if(!voices.available)throw Error('当前系统没有可用的本地语音。此功能不会使用云端语音服务。');
  const set=this.study.current;let audio=null,url=null,serial=0,closed=false;
  showDialog({title:'本地朗读',html:field('voice','声音',voices.voices.find(v=>v.language==='en-US')?.id||voices.voices[0].id,{choices:voices.voices.map(v=>[v.id,`${v.id} · ${v.language}`])})+field('rate','语速',180,{type:'number',min:80,max:400})+'<label class="dialog-field"><span>朗读文本（最多6000字）</span><textarea name="text">'+escape(text.slice(0,6000))+'</textarea></label><button type="button" id="speech-generate">生成试听</button><audio id="speech-preview" controls hidden></audio><p id="speech-status" role="status"></p>'+ (card?'<p class="dialog-note">保存会把试听音频作为当前卡片的评论，不改原文。</p>':''),submit:'保存音频评论',onSubmit:card?async()=>{
   if(!audio)throw Error('先生成试听，再保存这份音频。');await this.study.change('study.media.import',{cardId:card.id,kind:'audio',mimeType:'audio/wav',name:'read-aloud.wav',contentBase64:audio.contentBase64,text:'本地朗读 · '+audio.voice},set.revision);
  }:null,afterOpen:()=>{
   $('dialog').addEventListener('close',()=>{closed=true;++serial;if(url)URL.revokeObjectURL(url);$('speech-preview')?.pause();},{once:true});
   $('speech-generate').onclick=run(async()=>{const ticket=++serial,v=Object.fromEntries(new FormData($('dialog-form')));$('speech-generate').disabled=true;$('speech-status').textContent='正在本机生成…';try{const result=await api('speech.render',{text:v.text,voice:v.voice,rate:Number(v.rate)});if(closed||ticket!==serial)return;audio=result;const bytes=Uint8Array.from(atob(result.contentBase64),c=>c.charCodeAt(0));if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));$('speech-preview').src=url;$('speech-preview').hidden=false;$('speech-status').textContent='已生成；点击播放试听。';}finally{if(!closed)$('speech-generate').disabled=false;}});
  }});
 }
 dictionary(term=''){
  showDialog({title:'本地系统词典',html:field('term','词语或短语',term)+ '<button type="button" id="dictionary-lookup">查询</button><pre id="dictionary-definition" role="status"></pre><button type="button" id="dictionary-save" disabled>保存为笔记卡片</button>',onSubmit:null,afterOpen:()=>{
   let result=null,serial=0;$('dictionary-lookup').onclick=run(async()=>{const ticket=++serial,data=await api('dictionary.lookup',{term:$('dialog-fields').querySelector('[name=term]').value});if(ticket!==serial||!$('dictionary-definition'))return;result=data;$('dictionary-definition').textContent=data.found?data.definition:'本机已启用的词典未找到该词。';$('dictionary-save').disabled=!data.found||!this.study.current;});
   $('dictionary-save').onclick=run(async()=>{if(!result?.found||!this.study.current)return;await this.study.change('study.note.create',{title:result.term,text:result.definition.slice(0,20000)});closeDialog();});
  }});
 }
}
