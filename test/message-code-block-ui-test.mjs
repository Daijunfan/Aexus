// Shared source renderer, clipboard and exact quote DOM; no Core, providers or real user state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'

const root=path.resolve(import.meta.dirname,'..'),renderer=path.join(root,'src/renderer/src'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-code-block-')),out=path.join(root,'artifacts/message-code-blocks'),fence=String.fromCharCode(96).repeat(3)
const block=(language,text)=>fence+language+'\n'+text+'\n'+fence
const first='  const answer = "<strong>safe</strong>";  \n\tconsole.log(answer);\n\n',second='def greet(name):\n    return "Hello, " + name\n',unknown='<img src="https://code-unsafe.invalid/pixel" onerror="window.codeExecuted=true">\n<script>window.codeExecuted=true</script>'
const auto='function square(value) {\n  return value * value;\n}\nconsole.log(square(7));',wide='const longValue = "'+('long_unbroken_value_'.repeat(30))+'";',longCode=Array.from({length:120},(_,i)=>'const line'+i+' = '+JSON.stringify('long code line '+i+' — '+'detail '.repeat(18))+';').join('\n')
const large='/* complete large code */\n'+('abcdefghij'.repeat(10001))+'\n/* final sentinel */',medium='plain_'+('0123456789'.repeat(2100))
const source=['First code block',block('javascript',first),'A second independent example',block('python',second),'Unknown language stays literal',block('mystery-language',unknown),'Automatic detection',block('',auto),'Wide private code',block('javascript',wide)].join('\n\n')
const quoteSource=['Opening **precise lead**.',block('javascript','const quotedValue = "repeat target";\nconst tail = 7;'),'Between **middle prose**.',block('python','print("repeat target")'),'Closing **precise tail**.'].join('\n\n')
const styles=[...fs.readFileSync(path.join(renderer,'main.tsx'),'utf8').matchAll(/import\s+(['"])([^'"]+\.css)\1/g)].map(([,quote,file])=>'import '+JSON.stringify(file.startsWith('.')?path.resolve(renderer,file):file)).join('\n')
let browser
try{
 const contents=[
  "import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';",
  "import {BlockView,Turn} from './chat/Chat';import {RichMessageText} from './chat/RichMessageText';import {ChannelNewsCard} from './components/ChannelNewsCard';import {MessengerContext} from './components/useMessenger';import {EMPTY_MESSENGER} from '../../shared/messenger';",
  "import {QuoteSelection} from './chat/QuoteSelection';import {selectedQuote,highlightQuote} from './chat/quoteTextRange';import {quoteText,validateQuote} from '../../shared/message-quotes';",
  "import {setInterfaceLanguage} from './i18n';setInterfaceLanguage('en');",styles,
  'const source='+JSON.stringify(source)+',quoteSource='+JSON.stringify(quoteSource)+',groupSource='+JSON.stringify(block('python',second)+'\n\n'+block('javascript',wide))+',wideSource='+JSON.stringify(block('javascript',wide))+',longSource='+JSON.stringify(block('javascript',longCode))+',largeSource='+JSON.stringify(block('javascript',large))+',mediumSource='+JSON.stringify(block('',medium))+';',
  'window.codeQuoteSource=quoteSource;window.codeProjection=quoteText(quoteSource);window.validateCodeQuote=quote=>validateQuote(quoteSource,quote);window.selectCodeQuote=range=>selectedQuote(document.querySelector(\'[data-chat-item="quote"]\'),quoteSource,range);window.highlightCodeQuote=quote=>highlightQuote(document.querySelector(\'[data-chat-item="quote"]\'),quoteSource,quote);',
  'const post={id:"news-code",channelId:"fixture",sourceId:"author",externalId:"code",plugin:"x",sourceName:"Fixture author",title:"Code in an article",body:wideSource,publishedAt:Date.now(),media:[],saved:false};',
  'const messenger={state:EMPTY_MESSENGER,ready:true,setForward:()=>{},message:async()=>true,setLibrary:()=>{},setReplyTarget:()=>{},setSelection:()=>{}};',
  'function Fixture(){const quoteContainer=useRef(null),[stream,setStream]=useState('+JSON.stringify(block('javascript','const current = 1;'))+');window.updateCodeStream=setStream;return <main className="code-fixture">',
  '<section id="private"><h2>Private message</h2><div className="message-conversation"><div className="turn assistant" data-chat-item="private"><BlockView block={{kind:"text",text:source}} english/></div></div></section>',
  '<section id="group"><h2>Group message</h2><div className="group-message"><BlockView block={{kind:"text",text:groupSource}} english/></div></section>',
  '<section id="news"><h2>Channel article</h2><ChannelNewsCard post={post} onAuthor={()=>{}} onChanged={()=>{}}/></section>',
  '<section id="wide"><h2>Wide code</h2><RichMessageText text={wideSource}/></section>',
  '<section id="stream"><h2>Streaming code</h2><BlockView block={{kind:"text",text:stream}} english/></section>',
  '<section id="short"><h2>Short code</h2><RichMessageText text={'+JSON.stringify(block('javascript','x = 1;'))+'}/></section>',
  '<section><h2>Exact quotes</h2><div ref={quoteContainer} className="transcript quote-fixture" tabIndex={-1}><article data-chat-item="quote"><RichMessageText text={quoteSource} quoteText/></article><QuoteSelection container={quoteContainer} messages={[{id:"quote",source:quoteSource}]} onQuote={(id,quote)=>window.codeQuotes.push({id,quote})}/></div></section>',
  '<section id="long"><h2>Long code with whole-message actions</h2><MessengerContext.Provider value={messenger}><div className="message-view has-conversation"><div className="message-stage"><div className="message-conversation"><div className="transcript long-code-scroll"><Turn item={{id:"long",role:"assistant",blocks:[{kind:"text",text:longSource}]}} messageEmployee="fixture" conversationEmployee="fixture" onReply={()=>{}}/></div></div></div></div></MessengerContext.Provider></section>',
  '<section id="medium"><h2>Large unlabeled code</h2><RichMessageText text={mediumSource}/></section>',
  '<section id="large"><h2>Complete large payload</h2><RichMessageText text={largeSource}/></section>',
  '</main>}createRoot(document.getElementById("root")).render(<Fixture/>);'
 ].join('\n')
 await build({stdin:{contents,resolveDir:renderer,loader:'tsx'},bundle:true,outfile:path.join(temp,'app.js'),jsx:'automatic',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl'},logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})})
 const page=await browser.newPage({viewport:{width:1150,height:900},reducedMotion:'reduce'}),errors=[],external=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://code-fixture.test/',route=>route.fulfill({contentType:'text/html',body:'<html data-theme="violet" data-presentation="messages"><body><div id="root"></div></body></html>'}))
 await page.route('https://code-unsafe.invalid/**',route=>{external.push(route.request().url());return route.abort()})
 await page.goto('https://code-fixture.test/')
 await page.evaluate(()=>{window.codeCopies=[];window.codeQuotes=[];window.calls=[];window.agents={call:async(cmd,args)=>{window.calls.push({cmd,args});throw Error('Unexpected Core call '+cmd)},onEvent:()=>()=>{}};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.codeCopies.push(text)}})})
 await page.addStyleTag({content:fs.readFileSync(path.join(temp,'app.css'),'utf8')+'\nbody{margin:0;overflow:auto}.code-fixture{padding:16px;max-width:980px;margin:auto;display:grid;gap:18px}.code-fixture>section{min-width:0;padding:12px;background:var(--bg-elev);border:1px solid var(--border);border-radius:12px}.code-fixture h2{margin:0 0 10px}.code-fixture .message-conversation{display:block;overflow:visible}.code-fixture .turn,.code-fixture .group-message{width:100%;max-width:100%;margin:0}.code-fixture .transcript{display:block;height:420px;overflow:auto;padding:10px;min-width:0}.code-fixture .quote-fixture{height:500px}.code-fixture .channel-news-card{width:100%;max-width:100%}#long .message-view{display:block;height:420px}#long .message-stage{height:100%}#long .message-conversation{display:flex;height:100%;min-height:0}'})
 await page.addScriptTag({content:fs.readFileSync(path.join(temp,'app.js'),'utf8')});await page.evaluate(()=>document.fonts.ready)
 const codes=page.locator('#private .rich-code-block'),copy=block=>block.getByRole('button',{name:'Copy code',exact:true}),wrap=block=>block.getByRole('button',{name:'Wrap code lines',exact:true})
 await expect(codes).toHaveCount(5);await expect(codes.nth(0).locator('.hljs-keyword').first()).toHaveText('const');await expect(codes.nth(1).locator('.hljs-keyword').first()).toHaveText('def');await expect(codes.nth(0).locator('.rich-code-language')).toContainText('JavaScript');await expect(codes.nth(1).locator('.rich-code-language')).toContainText('Python')
 assert.equal(await codes.nth(0).locator('pre code').textContent(),first);assert.equal(await codes.nth(1).locator('pre code').textContent(),second)
 assert.equal(await codes.nth(2).locator('pre code').textContent(),unknown);await expect(codes.nth(2).locator('pre span,pre img,pre script')).toHaveCount(0);assert.equal(await page.evaluate(()=>window.codeExecuted),undefined);assert.deepEqual(external,[])
 assert.ok(await codes.nth(3).locator('pre code span').count()>0,'unlabeled short code is detected and highlighted')
 await expect(page.locator('#medium pre code span,#large pre code span')).toHaveCount(0);assert.equal(await page.locator('#medium pre code').textContent(),medium);assert.equal(await page.locator('#large pre code').textContent(),large,'large code is complete, including final sentinel')
 await copy(codes.nth(0)).click();assert.equal(await page.evaluate(()=>window.codeCopies.at(-1)),first);await expect(codes.nth(0).getByRole('status')).toHaveText('Copied');await expect(codes.nth(1).getByRole('status')).toHaveText('Copy code')
 await copy(codes.nth(1)).click();assert.equal(await page.evaluate(()=>window.codeCopies.at(-1)),second);await copy(codes.nth(2)).click();assert.equal(await page.evaluate(()=>window.codeCopies.at(-1)),unknown)
 await copy(page.locator('#group .rich-code-block').first()).click();assert.equal(await page.evaluate(()=>window.codeCopies.at(-1)),second)
 const news=page.locator('#news .channel-news-card');if(await news.getByRole('button',{name:'Read more',exact:true}).count())await news.getByRole('button',{name:'Read more',exact:true}).click();await copy(news.locator('.rich-code-block')).click();assert.equal(await page.evaluate(()=>window.codeCopies.at(-1)),wide)
 await copy(page.locator('#large .rich-code-block')).click();assert.equal(await page.evaluate(()=>window.codeCopies.at(-1)),large,'copy never truncates large payloads')

 const stream=page.locator('#stream .rich-code-block');await wrap(stream).click();await expect(wrap(stream)).toHaveAttribute('aria-pressed','true');await stream.locator('pre').focus()
 await stream.locator('pre').evaluate(node=>{window.streamPre=node;window.streamFocus=document.activeElement});const streamed='const current = 2;\nconst next = "still focused";'
 await page.evaluate(value=>window.updateCodeStream(value),block('javascript',streamed)+'\n\nA later streamed paragraph.')
 await expect.poll(()=>stream.locator('pre code').textContent()).toBe(streamed);await expect(stream.locator('pre')).toHaveAttribute('data-wrap','true');await expect(stream.locator('pre')).toHaveCSS('white-space','pre-wrap');assert.ok(await page.evaluate(()=>window.streamPre===document.querySelector('#stream pre')&&window.streamFocus===document.activeElement),'streaming preserves wrapped block and focused DOM node')
 await copy(stream).click();assert.equal(await page.evaluate(()=>window.codeCopies.at(-1)),streamed)
 await page.keyboard.press('Tab');await expect(stream.locator('pre')).toBeFocused();await expect(stream.locator('pre')).toHaveCSS('outline-style','solid');await expect(stream.locator('pre')).toHaveCSS('outline-width','2px')

 const quoteRow=page.locator('[data-chat-item="quote"]'),quoteButton=page.getByRole('button',{name:'Quote selected text',exact:true})
 const select=async(selector,start=0,end)=>{await quoteRow.locator(selector).first().scrollIntoViewIfNeeded();await quoteRow.evaluate((row,{selector,start,end})=>{const node=row.querySelector(selector).firstChild,range=document.createRange();range.setStart(node,start);range.setEnd(node,end??node.textContent.length);getSelection().removeAllRanges();getSelection().addRange(range)}, {selector,start,end})}
 // The chosen text lies inside a highlighted token, rather than matching an entire element.
 await select('.hljs-string',1,7);await expect(quoteButton).toBeVisible();await quoteButton.click();let quote=await page.evaluate(()=>window.codeQuotes.at(-1).quote);assert.equal(quote.text,'repeat');assert.equal(quote.offset,await page.evaluate(()=>window.codeProjection.indexOf('repeat')));assert.deepEqual(await page.evaluate(quote=>window.validateCodeQuote(quote),quote),quote)
 await page.evaluate(quote=>window.highlightCodeQuote(quote),quote);assert.equal(await page.evaluate(()=>[...CSS.highlights.get('agents-message-quote')][0].toString()),'repeat')
 // Cross both toolbars and syntax spans; only source prose/code contributes to the quote.
 await quoteRow.scrollIntoViewIfNeeded();await quoteRow.evaluate(row=>{const start=row.querySelector('strong').firstChild,end=[...row.querySelectorAll('strong')].at(-1).firstChild,range=document.createRange();range.setStart(start,0);range.setEnd(end,end.textContent.length);getSelection().removeAllRanges();getSelection().addRange(range)})
 await expect(quoteButton).toBeVisible();await quoteButton.click();quote=await page.evaluate(()=>window.codeQuotes.at(-1).quote);assert.equal(quote.text,await page.evaluate(()=>window.codeProjection.slice(window.codeProjection.indexOf('precise lead'),window.codeProjection.indexOf('precise tail')+'precise tail'.length)));assert.doesNotMatch(quote.text,/Copy code|Copied|Wrap code lines|JavaScript|Python/);assert.deepEqual(await page.evaluate(quote=>window.validateCodeQuote(quote),quote),quote)
 await page.evaluate(quote=>window.highlightCodeQuote(quote),quote);assert.deepEqual(await page.evaluate(()=>window.selectCodeQuote([...CSS.highlights.get('agents-message-quote')][0])),quote,'highlight round trip retains exact source offsets across code blocks')
 await quoteRow.locator('.rich-code-toolbar').first().evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range)});await expect(quoteButton).toHaveCount(0)
 await page.evaluate(()=>getSelection().removeAllRanges())

 fs.mkdirSync(out,{recursive:true});const layouts=[]
 for(const theme of ['violet','blue','black'])for(const width of [1150,390,320]){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);const wideBlock=page.locator('#wide .rich-code-block');await wideBlock.scrollIntoViewIfNeeded()
  const before=await wideBlock.locator('pre code').textContent();if(await wrap(wideBlock).getAttribute('aria-pressed')==='true')await wrap(wideBlock).click()
  let layout=await wideBlock.evaluate(node=>{const pre=node.querySelector('pre'),toolbar=node.querySelector('.rich-code-toolbar');return {page:document.documentElement.scrollWidth,width:innerWidth,block:node.getBoundingClientRect().width,pre:pre.clientWidth,scroll:pre.scrollWidth,toolbar:toolbar.getBoundingClientRect().width}})
  assert.ok(layout.page<=width+1,theme+' page containment at '+width+': '+JSON.stringify(layout));assert.ok(layout.toolbar<=layout.block+1);assert.ok(layout.scroll>layout.pre,'wide unwrapped code scrolls inside its own pre')
  await wrap(wideBlock).click();await expect(wideBlock.locator('pre')).toHaveAttribute('data-wrap','true');assert.equal(await wideBlock.locator('pre code').textContent(),before);assert.ok(await wideBlock.locator('pre').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'wrapped wide code fits at '+width);await copy(wideBlock).click();assert.equal(await page.evaluate(()=>window.codeCopies.at(-1)),wide)
  // Host wrappers used to override the shared pre style even while data-wrap=true.
  for(const [host,code] of [['private',codes.nth(4)],['group',page.locator('#group .rich-code-block').nth(1)],['news',news.locator('.rich-code-block')]]){
   await code.scrollIntoViewIfNeeded();if(await wrap(code).getAttribute('aria-pressed')==='true')await wrap(code).click()
   const pre=code.locator('pre');await expect(pre).toHaveCSS('white-space','pre');await expect(pre).toHaveCSS('margin-top','0px');await expect(pre).toHaveCSS('margin-bottom','0px');await expect(pre).toHaveCSS('border-top-width','0px');await expect(pre).toHaveCSS('background-color','rgba(0, 0, 0, 0)')
   assert.ok(await pre.evaluate(el=>el.scrollWidth>el.clientWidth),host+' starts horizontally scrollable');await wrap(code).click();await expect(pre).toHaveCSS('white-space','pre-wrap');assert.ok(await pre.evaluate(el=>el.scrollWidth<=el.clientWidth+1),host+' actually wraps within '+width+'px');assert.equal(await pre.locator('code').textContent(),wide)
  }
  const short=page.locator('#short .rich-code-block');await short.scrollIntoViewIfNeeded();const shortLayout=await short.evaluate(node=>{const box=node.getBoundingClientRect(),toolbar=node.querySelector('.rich-code-toolbar').getBoundingClientRect(),pre=node.querySelector('pre').getBoundingClientRect();return {box:box.toJSON(),toolbar:toolbar.toJSON(),pre:pre.toJSON(),buttons:[...node.querySelectorAll('button')].map(button=>button.getBoundingClientRect().toJSON())}});assert.ok(shortLayout.toolbar.bottom<=shortLayout.pre.top+1,'short code header does not cover code');assert.ok(shortLayout.buttons.every(button=>button.left>=shortLayout.box.left&&button.right<=shortLayout.box.right&&button.top>=shortLayout.toolbar.top&&button.bottom<=shortLayout.toolbar.bottom),'short code controls fit at '+width)
  layouts.push({theme,width,...layout});if(width===320)await page.screenshot({path:path.join(out,theme+'-320.png'),animations:'disabled'})
 }
 await page.setViewportSize({width:1150,height:900});await page.evaluate(()=>document.documentElement.dataset.theme='violet')
 const long=page.locator('#long .rich-code-block'),scroller=page.locator('.long-code-scroll');await scroller.scrollIntoViewIfNeeded();await scroller.evaluate(el=>el.scrollTop=900)
 const scrollBefore=await scroller.evaluate(el=>el.scrollTop),scrollerBox=await scroller.boundingBox(),toolbarBox=await long.locator('.rich-code-toolbar').boundingBox();assert.ok(toolbarBox.y>=scrollerBox.y&&toolbarBox.y+toolbarBox.height<=scrollerBox.y+scrollerBox.height,'code toolbar remains visible while deeply scrolled')
 await page.mouse.move(scrollerBox.x+40,scrollerBox.y+140);const outer=page.locator('#long .message-actions');await expect(outer).toHaveCSS('opacity','1')
 const combined=await page.locator('#long').evaluate(node=>{const outer=node.querySelector('.message-actions').getBoundingClientRect(),code=node.querySelector('.rich-code-toolbar').getBoundingClientRect();return {outer:outer.toJSON(),code:code.toJSON(),hit:[...node.querySelectorAll('.message-actions button,.rich-code-toolbar button')].map(button=>{const box=button.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return {label:button.getAttribute('aria-label'),reachable:button===hit||button.contains(hit)}})}})
 fs.writeFileSync(path.join(out,'combined-tools.json'),JSON.stringify(combined,null,2));await page.screenshot({path:path.join(out,'combined-tools.png'),animations:'disabled'})
 assert.ok(combined.outer.bottom<=combined.code.top||combined.code.bottom<=combined.outer.top||combined.outer.right<=combined.code.left||combined.code.right<=combined.outer.left,'whole-message actions and code toolbar never overlap: '+JSON.stringify(combined));assert.ok(combined.hit.every(button=>button.reachable),'both toolbar button centers remain clickable: '+JSON.stringify(combined.hit))
 await copy(long).click();assert.equal(await page.evaluate(()=>window.codeCopies.at(-1)),longCode);assert.ok(Math.abs(await scroller.evaluate(el=>el.scrollTop)-scrollBefore)<2,'copy needs no return to code block top');await page.screenshot({path:path.join(out,'sticky-code-copy.png'),animations:'disabled'})
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.calls),[]);assert.deepEqual(external,[])
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks:['shared private/group/news syntax renderer','known/automatic/unknown language','literal HTML safety','exact per-block copy and whitespace','independent copied state','stream retains wrapping and focused DOM','highlighted token quote offsets','multi-code-block quote/highlight roundtrip excludes UI','320/390 desktop theme containment','sticky long-code copy without scroll jump','20k autodetect limit and complete 100k plain fallback'],layouts,largeCharacters:large.length,realCoreCalls:0,platform:'headless Chrome'},null,2))
 console.log('PASS shared code blocks: safe syntax, exact independent copy, stream state/focus, bounded quotes, narrow wrapping, sticky tools and complete large text')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
