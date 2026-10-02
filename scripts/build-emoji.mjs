// Keep searchable, bilingual Unicode data separate from renderer code and load it on demand.
import fs from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),en=require('emojibase-data/en/data.json'),zh=new Map(require('emojibase-data/zh/data.json').map(item=>[item.hexcode,item]))
// Retain the original compact picker's searchable names while CLDR supplies canonical labels.
const catalog=fs.readFileSync(new URL('../src/renderer/src/i18n/zh-CN.ts',import.meta.url),'utf8'),translations=JSON.parse(catalog.slice(catalog.indexOf('= ')+2))
const aliases=new Map([
 ['😀','Smile'],['😊','Happy'],['😂','Laugh'],['🥰','Love'],['😎','Cool'],['🤔','Thinking'],['🙌','Celebrate'],['👏','Applause'],['👍','Thumbs up'],['👀','Looking'],['❤️','Heart'],['✨','Sparkles'],
 ['✅','Done'],['🎯','Target'],['💡','Idea'],['🚀','Launch'],['📌','Pin'],['📎','Attachment'],['📝','Notes'],['📅','Calendar'],['⏰','Reminder'],['🔍','Search'],['🛠️','Tools'],['💻','Computer'],
 ['🎉','Celebration'],['☕','Coffee'],['🌱','Growth'],['🌈','Rainbow'],['🌟','Star'],['🔥','Fire'],['🎨','Art'],['🎵','Music'],['📚','Books'],['🍀','Good luck'],['🌻','Sunflower'],['🫶','Heart hands']
].map(([emoji,label])=>[emoji.replaceAll('\uFE0F',''),label+' '+translations[label]]))
const items=en.filter(item=>item.group!==undefined&&item.group!==2).sort((a,b)=>a.order-b.order).map(item=>{
 const chinese=zh.get(item.hexcode)
 return [item.emoji,item.label,chinese?.label??item.label,item.group,[...(item.tags??[]),...(chinese?.tags??[]),aliases.get(item.emoji.replaceAll('\uFE0F',''))??''].filter(Boolean).join(' '),(item.skins??[]).filter(skin=>typeof skin.tone==='number').map(skin=>[skin.tone,skin.emoji])]
})
fs.writeFileSync(new URL('../src/renderer/src/chat/emoji-data.json',import.meta.url),JSON.stringify(items)+'\n')
console.log(`Built ${items.length} bilingual emoji entries from emojibase-data 17.0.0`)
