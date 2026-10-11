'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const {assert}=require('./safety.cjs');
const MAX_PIXELS=24000000;
function dimensions(bytes){
  let width,height;
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);}
  else if(bytes.length>=10&&/^GIF8[79]a$/.test(bytes.toString('ascii',0,6))){width=bytes.readUInt16LE(6);height=bytes.readUInt16LE(8);}
  else if(bytes.length>=12&&bytes[0]===255&&bytes[1]===216){
    let at=2;
    while(at+4<=bytes.length){if(bytes[at]!==255){at++;continue;}let marker=bytes[at+1];at+=2;if(marker===255)continue;if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;
      const length=bytes.readUInt16BE(at);assert(length>=2&&at+length<=bytes.length,'INVALID_MEDIA','Damaged JPEG marker.');
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){assert(length>=7,'INVALID_MEDIA','Missing JPEG dimensions.');height=bytes.readUInt16BE(at+3);width=bytes.readUInt16BE(at+5);break;}at+=length;
    }
  }else if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    const type=bytes.toString('ascii',12,16);
    if(type==='VP8X'){width=1+bytes.readUIntLE(24,3);height=1+bytes.readUIntLE(27,3);}
    else if(type==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=bytes.readUInt16LE(26)&16383;height=bytes.readUInt16LE(28)&16383;}
    else if(type==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
  }
  assert(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=16000&&height<=16000&&width*height<=MAX_PIXELS,'INVALID_MEDIA','Choose a PNG, JPEG, GIF or WebP image within 24 megapixels and 16000 pixels per side.');
  return {width,height};
}
async function encode(canvas,kind){const bytes=await canvas.encode('png');assert(bytes.length<=8*1024*1024,'TOO_LARGE','The normalized image exceeds 8 MiB.');return {bytes,width:canvas.width,height:canvas.height,mimeType:'image/png',kind};}
async function normalize(args){
  const bytes=Buffer.from(args.bytes);dimensions(bytes);const image=await loadImage(bytes);
  assert(image.width*image.height<=MAX_PIXELS,'TOO_LARGE','Image decoded past the pixel budget.');
  const scale=Math.min(1,Math.sqrt(6000000/(image.width*image.height))),canvas=createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return encode(canvas,'image');
}
async function transform(args){
  const bytes=Buffer.from(args.bytes);dimensions(bytes);const image=await loadImage(bytes);
  const crop=args.crop||{x:0,y:0,width:1,height:1};
  assert(crop&&typeof crop==='object'&&!Array.isArray(crop)&&Object.keys(crop).every(k=>['x','y','width','height'].includes(k))&&['x','y','width','height'].every(k=>Number.isFinite(crop[k]))&&crop.x>=0&&crop.y>=0&&crop.width>0&&crop.height>0&&crop.x+crop.width<=1.000001&&crop.y+crop.height<=1.000001,'INVALID_PARAMS','Crop must lie inside the image.');
  assert([0,90,180,270].includes(args.rotation||0),'INVALID_PARAMS','Use a right-angle image rotation.');
  const w=Math.max(1,Math.round(image.width*crop.width)),h=Math.max(1,Math.round(image.height*crop.height)),rotation=args.rotation||0;
  const canvas=createCanvas(rotation%180?h:w,rotation%180?w:h),ctx=canvas.getContext('2d');
  if(rotation===90){ctx.translate(h,0);ctx.rotate(Math.PI/2);}else if(rotation===180){ctx.translate(w,h);ctx.rotate(Math.PI);}else if(rotation===270){ctx.translate(0,w);ctx.rotate(-Math.PI/2);}
  ctx.drawImage(image,crop.x*image.width,crop.y*image.height,crop.width*image.width,crop.height*image.height,0,0,w,h);return encode(canvas,'image');
}
async function combine(args){
  assert(Array.isArray(args.parts)&&args.parts.length>0&&args.parts.length<=32,'INVALID_PARAMS','A composite accepts 1–32 excerpts.');
  const parts=args.parts.map(value=>({bytes:Buffer.from(value.bytes),...dimensions(Buffer.from(value.bytes)),label:String(value.label||'').slice(0,160)}));
  assert(parts.reduce((n,p)=>n+p.width*p.height,0)<=40000000,'TOO_LARGE','Combined source images exceed the 40 megapixel decode budget.');
  const width=Math.min(1100,Math.max(...parts.map(p=>p.width))),heights=parts.map(p=>Math.round(p.height*Math.min(1,width/p.width))+32);
  const initialHeight=heights.reduce((a,b)=>a+b,0)+16,scale=Math.min(1,12000/initialHeight,Math.sqrt(8000000/(width*initialHeight)));
  const canvas=createCanvas(Math.max(1,Math.round((width+24)*scale)),Math.max(1,Math.round(initialHeight*scale))),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(scale,scale);
  let top=8;const placements=[];
  for(let i=0;i<parts.length;i++){const p=parts[i],image=await loadImage(p.bytes),w=Math.min(width,p.width),h=p.height*w/p.width;
    ctx.fillStyle='#526073';ctx.font='14px sans-serif';ctx.fillText(p.label,12,top+15,width);ctx.drawImage(image,12,top+24,w,h);placements.push({x:12*scale/canvas.width,y:(top+24)*scale/canvas.height,width:w*scale/canvas.width,height:h*scale/canvas.height});top+=heights[i];
  }
  return {...await encode(canvas,'composite'),placements};
}
async function compare(args){
 const expected=Buffer.from(args.expected),actual=Buffer.from(args.actual),a=dimensions(expected),b=dimensions(actual);if(a.width!==b.width||a.height!==b.height)return {matches:false};
 const canvases=[];for(const bytes of [expected,actual]){const image=await loadImage(bytes),canvas=createCanvas(a.width,a.height);canvas.getContext('2d').drawImage(image,0,0);canvases.push(canvas);}
 const regions=args.regions||[{x:0,y:0,width:1,height:1}];
 for(const r of regions){const x=Math.max(0,Math.floor(r.x*a.width)),y=Math.max(0,Math.floor(r.y*a.height)),w=Math.min(a.width-x,Math.ceil((r.x+r.width)*a.width)-x),h=Math.min(a.height-y,Math.ceil((r.y+r.height)*a.height)-y);assert(w>0&&h>0,'INVALID_MEDIA','Invalid image comparison region.');for(let row=0;row<h;row+=256){const [left,right]=canvases.map(c=>c.getContext('2d').getImageData(x,y+row,w,Math.min(256,h-row)).data);if(!Buffer.from(left.buffer,left.byteOffset,left.byteLength).equals(Buffer.from(right.buffer,right.byteOffset,right.byteLength)))return {matches:false};}}
 return {matches:true};
}
(async()=>workerData.operation==='compare'?compare(workerData):workerData.operation==='combine'?combine(workerData):workerData.operation==='transform'?transform(workerData):normalize(workerData))().then(result=>parentPort.postMessage({result}),error=>parentPort.postMessage({error:{code:error.code||'INVALID_MEDIA',message:error.message}}));
