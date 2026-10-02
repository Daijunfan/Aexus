'use strict';
const {parentPort,workerData:a}=require('node:worker_threads');
async function run(){
 const {createCanvas,loadImage}=require('@napi-rs/canvas'),width=Math.max(1,Math.ceil(a.width*a.scale)),height=Math.max(1,Math.ceil(a.height*a.scale));
 const source=a.svg.replace(/width="\d+" height="\d+"/,`width="${width}" height="${height}"`),image=await loadImage(Buffer.from(source));
 const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,width,height);const png=await canvas.encode('png');
 if(a.format==='png')return {bytes:png};
 const {PDFDocument}=require('pdf-lib'),pdf=await PDFDocument.create(),embedded=await pdf.embedPng(png),scale=Math.min(1,14000/Math.max(width,height));
 const page=pdf.addPage([width*scale,height*scale]);page.drawImage(embedded,{x:0,y:0,width:width*scale,height:height*scale});pdf.setTitle(a.title);pdf.setCreator('Margin Reader');return {bytes:await pdf.save()};
}
run().then(result=>parentPort.postMessage({result}),error=>parentPort.postMessage({error:{code:error.code||'EXPORT_FAILED',message:error.message}}));
