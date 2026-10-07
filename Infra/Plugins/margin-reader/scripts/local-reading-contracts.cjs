"use strict";
exports.register=({command,str,num,opt,obj})=>{
 command('speech.voices','List installed local macOS speech voices without downloading a voice or playing audio.',false);
 command('speech.render','Synthesize bounded text to WAV bytes using an installed local voice. Does not play audio or modify source documents.',false,{text:str('1–6000 characters.',true),voice:str('Exact installed voice ID from speech.voices.'),rate:num('Words per minute; default 180.',false,{minimum:80,maximum:400})});
 command('dictionary.lookup','Look up a word or phrase through the public macOS Dictionary Services API, returning plain text.',false,{term:str('1–256 characters.',true)});
 command('study.speech.attach','Render a card field as local speech and save it as an immutable audio comment, with a revision check before and after synthesis.',true,{setId:str('Study UUID.',true),expectedRevision:num('Current study revision.',true,{integer:true,minimum:1}),cardId:str('Card UUID.',true),field:str('Card field to read; default text.',false,{enum:['title','text','note','front','back']}),voice:str('Installed local voice.'),rate:num('Words per minute.',false,{minimum:80,maximum:400})});
};
