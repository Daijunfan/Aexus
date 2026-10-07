import fs from 'node:fs'
import path from 'node:path'
/** Original, silent protocol/UI fixtures. No microphone, camera or provider is used. */
export function mediaFiles(directory){
 fs.mkdirSync(directory,{recursive:true});const rate=48000,seconds=12,samples=rate*seconds,data=Buffer.alloc(44+samples*2)
 data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(samples*2,40)
 const audio=path.join(directory,'Quiet notes.wav'),video=path.join(directory,'Motion study.webm');fs.writeFileSync(audio,data)
 fs.copyFileSync(path.join(import.meta.dirname,'playback-sample.webm'),video)
 return {audio,video,audioBytes:data,videoBytes:fs.readFileSync(video),duration:seconds}
}
