// Guacamole fields count Unicode code points, not UTF-8 bytes or UTF-16 units.
const instruction=(...values)=>values.map(v=>{v=String(v);return [...v].length+'.'+v}).join(',')+';';
class Parser {
 constructor(receive){this.receive=receive;this.buffer='';this.fields=[];this.remaining=null;this.field='';this.wire='';}
 write(text){
  this.buffer+=text;
  while(this.buffer){
   if(this.remaining===null){
    const dot=this.buffer.indexOf('.');if(dot<0)return;
    const header=this.buffer.slice(0,dot),length=Number(header);
    if(!/^\d+$/.test(header)||!Number.isSafeInteger(length))throw Error('Invalid Guacamole instruction');
    this.remaining=length;this.wire+=header+'.';this.buffer=this.buffer.slice(dot+1);
   }
   let index=0,count=0;
   for(;index<this.buffer.length&&count<this.remaining;count++){
    const first=this.buffer.charCodeAt(index);
    if(first>=0xd800&&first<=0xdbff&&index+1===this.buffer.length)break;
    index+=this.buffer.codePointAt(index)>0xffff?2:1;
   }
   this.field+=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index);this.remaining-=count;
   if(this.remaining||!this.buffer.length)return;
   const end=this.buffer[0];if(end!==','&&end!==';')throw Error('Invalid Guacamole delimiter');
   this.fields.push(this.field);this.wire+=this.field+end;this.field='';this.remaining=null;this.buffer=this.buffer.slice(1);
   if(end===';'){const fields=this.fields,wire=this.wire;this.fields=[];this.wire='';this.receive(fields,wire);}
  }
 }
}
module.exports={instruction,Parser};
