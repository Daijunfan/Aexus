import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
export function sshFixture(directory){
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'ssh'),`#!/usr/bin/env python3
import os,sys,socket,socketserver,select
if 'offline' in sys.argv:sys.exit(255)
if 'slow-fixture' in sys.argv:
 import time;time.sleep(.7)
if '-L' not in sys.argv:os.execv('/bin/sh',['sh','-c',sys.argv[-1]])
spec=sys.argv[sys.argv.index('-L')+1].split(':');port=int(spec[1]);host=spec[2];remote=int(spec[3])
class Forward(socketserver.BaseRequestHandler):
 def handle(self):
  try:
   with socket.create_connection((host,remote),timeout=3) as peer:
    while True:
     ready,_,_=select.select([self.request,peer],[],[],5)
     for source in ready:
      data=source.recv(65536)
      if not data:return
      (peer if source is self.request else self.request).sendall(data)
  except OSError:pass
class Server(socketserver.ThreadingTCPServer):
 allow_reuse_address=True
 daemon_threads=True
with Server(('127.0.0.1',port),Forward) as server:server.serve_forever()
`,{mode:0o755})
}
export async function vncFixture(){
 const sockets=new Set(),events={keys:[],pointers:[],frames:0,connections:0}
 const server=net.createServer(socket=>{
  events.connections++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{})
  socket.write('RFB 003.008\n');let buffer=Buffer.alloc(0),phase=0,sent=false
  socket.on('data',data=>{buffer=Buffer.concat([buffer,data]);for(;;){
   if(phase===0){if(buffer.length<12)return;buffer=buffer.subarray(12);socket.write(Buffer.from([1,1]));phase=1}
   else if(phase===1){if(buffer.length<1)return;buffer=buffer.subarray(1);socket.write(Buffer.alloc(4));phase=2}
   else if(phase===2){if(buffer.length<1)return;buffer=buffer.subarray(1);const name=Buffer.from('Ubuntu · Protocol Fixture'),init=Buffer.alloc(24);init.writeUInt16BE(640,0);init.writeUInt16BE(360,2);init.set([32,24,0,1,0,255,0,255,0,255,16,8,0],4);init.writeUInt32BE(name.length,20);socket.write(Buffer.concat([init,name]));phase=3}
   else{
    if(!buffer.length)return;const type=buffer[0];let length
    if(type===0)length=20
    else if(type===2){if(buffer.length<4)return;length=4+4*buffer.readUInt16BE(2)}
    else if(type===3)length=10
    else if(type===4)length=8
    else if(type===5)length=6
    else if(type===6){if(buffer.length<8)return;length=8+buffer.readUInt32BE(4)}
    else{socket.destroy();return}
    if(buffer.length<length)return
    if(type===4)events.keys.push({down:buffer[1],key:buffer.readUInt32BE(4)})
    if(type===5)events.pointers.push({mask:buffer[1],x:buffer.readUInt16BE(2),y:buffer.readUInt16BE(4)})
    if(type===3&&!sent){sent=true;const header=Buffer.alloc(16);header.writeUInt16BE(1,2);header.writeUInt16BE(640,8);header.writeUInt16BE(360,10);const pixels=Buffer.alloc(640*360*4);for(let y=0;y<360;y++)for(let x=0;x<640;x++){const at=(y*640+x)*4;pixels[at]=Math.floor(55+x/5);pixels[at+1]=Math.floor(35+y/3);pixels[at+2]=35;pixels[at+3]=0}socket.write(Buffer.concat([header,pixels]));events.frames++}
    buffer=buffer.subarray(length)
   }
  }})
 });await new Promise(r=>server.listen(0,'127.0.0.1',r))
 return {port:server.address().port,events,close:async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r))}}
}
