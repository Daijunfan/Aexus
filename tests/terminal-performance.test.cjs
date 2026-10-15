const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),{once}=require('node:events'),{WebSocket}=require('ws');
const {attach,FRAME_CHARS,OUTPUT_WINDOW}=require('../src/terminal-stream.cjs');
const {TerminalOutput}=require('../src/terminal-output.cjs');

test('bounded output reads preserve Unicode and return continuation cursors',()=>{
  const buffer=new TerminalOutput(1024);buffer.append('ab🙂cd中ef');let cursor=0,result='';
  while(cursor<buffer.cursor){const frame=buffer.read(cursor,3);assert.ok(frame.output.length<=3);assert.ok(!/[\uD800-\uDBFF]$/.test(frame.output));assert.ok(frame.cursor>cursor);result+=frame.output;cursor=frame.cursor;}
  assert.equal(result,'ab🙂cd中ef');
});

test('output flow has a bounded pipeline while input ACKs stay responsive',async()=>{
  const source='x'.repeat(OUTPUT_WINDOW*3)+'🙂tail',inputs=[],frames=[],messages=[];
  const dispatch=async(method,params,signal)=>{
    assert.equal(params.id,'owner');assert.equal(params.terminal,'terminal');
    if(method==='hosts.terminal-input'){inputs.push(params.data);return true;}
    if(params.cursor>=source.length){await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return {output:'',cursor:source.length,running:true};}
    const output=source.slice(params.cursor,params.cursor+(params.maxChars||source.length));return {output,cursor:params.cursor+output.length,running:true};
  };
  const server=http.createServer(),wss=attach(server,'/token/',dispatch);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/token/terminal-stream?host=owner&terminal=terminal&flow=1`);
  const until=async condition=>{const deadline=Date.now()+2000;while(!condition()){if(Date.now()>deadline)throw Error('Timed out waiting for protocol state');await new Promise(resolve=>setTimeout(resolve,2));}};
  ws.on('message',raw=>{const event=JSON.parse(raw);messages.push(event);if(event.output!==undefined)frames.push(event)});
  try{
    await once(ws,'open');await until(()=>frames.length===4);
    await new Promise(resolve=>setTimeout(resolve,25));assert.equal(frames.length,4);
    assert.equal(frames.reduce((n,f)=>n+f.output.length,0),OUTPUT_WINDOW);
    ws.send(JSON.stringify({op:'input',data:'abc',seq:7}));await until(()=>messages.some(m=>m.inputAck===7));assert.deepEqual(inputs,['abc']);
    let accepted=0,received='';
    while(received.length<source.length){
      while(accepted<frames.length){const frame=frames[accepted++];assert.ok(frame.output.length<=FRAME_CHARS);received+=frame.output;ws.send(JSON.stringify({op:'ack',seq:frame.seq}));}
      if(received.length<source.length)await until(()=>accepted<frames.length);
    }
    assert.equal(received,source);
  }finally{ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}
});

test('canonical terminal traffic performs no configuration reads and keeps owner checks',async()=>{
  const registry=require('../src/registry.cjs'),terminals=require('../src/terminals.cjs');
  const get=registry.get,owner=terminals.terminalOwner,input=terminals.input;let reads=0,count=0;
  registry.get=()=>{reads++;throw Error('Disk access is forbidden in this hot path')};
  terminals.terminalOwner=()=> 'host:uuid';terminals.input=async()=>{count++;return true};
  const {dispatch}=require('../src/core.cjs');
  try{for(let i=0;i<2000;i++)await dispatch('hosts.terminal-input',{id:'uuid',terminal:'owned',data:'p'});assert.equal(count,2000);assert.equal(reads,0);await assert.rejects(dispatch('hosts.terminal-input',{id:'different',terminal:'owned',data:'p'}));}
  finally{registry.get=get;terminals.terminalOwner=owner;terminals.input=input;}
});
