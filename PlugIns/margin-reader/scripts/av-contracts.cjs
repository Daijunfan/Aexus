'use strict';
exports.register=({command,str,num})=>{
 command('document.av.info','Read duration, media streams and the saved playback position of a local audio/video document.',false,{id:str('Registered media document UUID.',true)});
 command('study.av.excerpt','Create a durable video frame or audio waveform card from a local media interval, linked to its original timeline.',true,{setId:str('Study UUID.',true),expectedRevision:num('Current study revision.',true,{integer:true,minimum:1}),documentId:str('Member media document UUID.',true),expectedSourceVersion:str('Version from document.open/get.',true),start:num('Starting time in seconds.',true,{minimum:0}),end:num('Ending time in seconds; omit for a point marker. Maximum interval is 600 seconds.',false,{minimum:0}),title:str('Optional card title.'),text:str('Optional note text, at most 20000 characters.'),color:str('Palette or #RRGGBB color.')});
};
