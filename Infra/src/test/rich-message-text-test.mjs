// Actual source rendering and DOM quote boundaries; no Core/provider/user state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'../../..'),renderer=path.join(root,'Infra/src/renderer/src'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-rich-text-')),out=path.join(root,'.aexus/artifacts/rich-message-text'),tick=String.fromCharCode(96)
const source=[
 '# A clear scientific note','',
 '**Bold**, *emphasis*, ~~removed~~ and [a safe source](https://example.com/research).','',
 '- First finding','- [x] Verified result','','> A quoted observation.','',
 '| Quantity | Definition |','| --- | --- |','| Energy | $E=mc^2$ |',
 '| Sample | This_is_a_long_unbroken_label_that_must_stay_inside_a_small_message_bubble |','',
 'Inline $e^{i\\pi}+1=0$ and \\(a^2+b^2=c^2\\).','',
 '$$','\\sum_{n=1}^{100} n = \\frac{100(100+1)}{2}','$$','',
 '\\[','\\underbrace{'+Array(45).fill('x').join('+')+'}_{\\text{A deliberately wide equation}}','\\]','',
 'Cost $5 and $10. Escaped \\$25 stays literal.','',
 tick+'code $x$ \\(literal\\)'+tick,'',
 tick.repeat(3)+'ts','const source = "\\\\(not mathematics\\\\)";','const price = "$5";',tick.repeat(3),'',
 'Raw <script>window.unsafeExecuted=true</script> remains text.',
 'Dangerous $\\href{javascript:alert(1)}{link}$ and $\\includegraphics{https://evil.invalid/pixel}$ stay untrusted.',
 'Malformed $\\frac{1}{$ remains readable.'
].join('\n')
const quoteSource='Lead **precise phrase** before $E=mc^2$. After the formula, **another precise phrase**.\n\nBracket \\(a+b=c\\), then **a bounded final quote**.'
const styles=[...fs.readFileSync(path.join(renderer,'main.tsx'),'utf8').matchAll(/import\s+(['"])([^'"]+\.css)\1/g)].map(([,q,file])=>'import '+JSON.stringify(file.startsWith('.')?path.resolve(renderer,file):file)).join('\n')
let browser
try{
 const contents=[
  "import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';",
  "import {BlockView} from './chat/Chat';import {RichMessageText,mathMarkdown} from './chat/RichMessageText';",
  "import {MessageActions} from './chat/MessageActions';import {QuoteSelection} from './chat/QuoteSelection';",
  "import {ChannelNewsCard} from './components/ChannelNewsCard';",
  "import {highlightQuote} from './chat/quoteTextRange';import {quoteText,validateQuote} from '../../shared/message-quotes';",
  "import {setInterfaceLanguage} from './i18n';setInterfaceLanguage('en');",styles,
  'const source='+JSON.stringify(source)+',quoteSource='+JSON.stringify(quoteSource)+';',
  'const post={id:"news-fixture",channelId:"channel-fixture",sourceId:"source-fixture",externalId:"item",plugin:"x",sourceName:"Fixture author",title:"Scientific article",body:source,url:"https://example.com/article",publishedAt:Date.now(),media:[],saved:false};window.fixturePost=post;',
  'window.quoteProjection=quoteText(quoteSource);window.validate=quote=>validateQuote(quoteSource,quote);',
  'window.highlight=quote=>highlightQuote(document.querySelector(\'[data-chat-item="quote"]\'),quoteSource,quote);window.normalize=mathMarkdown;',
  'function Fixture(){const container=useRef(null),[news,setNews]=useState(post);window.updateNews=patch=>setNews(old=>({...old,...patch}));return <main ref={container} className="fixture" tabIndex={-1}>',
  '<section className="message-conversation"><h2>Private message</h2><div className="turn assistant" data-chat-item="private"><BlockView block={{kind:"text",text:source}} english/><MessageActions text={source}/></div></section>',
  '<section><h2>Group message</h2><div className="group-message" data-chat-item="group"><BlockView block={{kind:"text",text:source}} english/></div></section>',
  '<section id="news"><h2>Channel article</h2><ChannelNewsCard post={news} onAuthor={()=>{}} onChanged={value=>window.newsChanges.push(value)}/></section>',
  '<section data-chat-item="quote"><BlockView block={{kind:"text",text:quoteSource}} english/></section>',
  '<section id="json"><BlockView block={{kind:"text",text:JSON.stringify({answer:42,formula:"$x$"})}} english/></section>',
  '<QuoteSelection container={container} messages={[{id:"quote",source:quoteSource}]} onQuote={(id,quote)=>window.quotes.push({id,quote})}/>',
  '</main>}createRoot(document.getElementById("root")).render(<Fixture/>);'
 ].join('\n')
 await build({stdin:{contents,resolveDir:renderer,loader:'tsx'},bundle:true,outfile:path.join(temp,'app.js'),jsx:'automatic',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl'},logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})})
 const page=await browser.newPage({viewport:{width:1150,height:900}}),errors=[],external=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://rich-fixture.test/',route=>route.fulfill({contentType:'text/html',body:'<html data-theme="violet"><body><div id="root"></div></body></html>'}))
 await page.route('https://evil.invalid/**',route=>{external.push(route.request().url());return route.abort()})
 await page.goto('https://rich-fixture.test/')
 await page.evaluate(()=>{window.calls=[];window.quotes=[];window.copies=[];window.newsChanges=[];window.agents={call:async(cmd,args)=>{window.calls.push({cmd,args});return cmd==='channel.save'?{...window.fixturePost,saved:args.saved}:cmd==='channel.image'?{mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0JkAAAAASUVORK5CYII='}:{}},onEvent:()=>()=>{}};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copies.push(text)}})})
 await page.addStyleTag({content:fs.readFileSync(path.join(temp,'app.css'),'utf8')+'\nbody{margin:0;overflow:auto}.fixture{padding:20px;max-width:960px;margin:auto;display:grid;gap:18px}.fixture>section{min-width:0;padding:18px;background:white;border:1px solid var(--border);border-radius:14px}.fixture .message-conversation{overflow:visible;display:block}.fixture .turn{width:100%;max-width:100%;margin:0}.fixture .group-message{max-width:100%;margin:0}.fixture .message-actions{position:static;opacity:1;pointer-events:auto}.fixture h2{margin:0 0 12px}'})
 await page.addScriptTag({content:fs.readFileSync(path.join(temp,'app.js'),'utf8')})
 await page.evaluate(()=>document.fonts.ready)
 const privateRow=page.locator('[data-chat-item="private"]'),quoteRow=page.locator('[data-chat-item="quote"]')
 await expect(privateRow.locator('table')).toHaveCount(1)
 await expect(privateRow.locator('blockquote')).toHaveCount(1)
 await expect(privateRow.locator('input[type=checkbox]')).toBeChecked()
 await expect(privateRow.locator('.rich-math-block')).toHaveCount(2)
 assert.ok(await privateRow.locator('.rich-math-inline').count()>=5)
 await expect(privateRow).toContainText('Cost $5 and $10.')
 await expect(privateRow.locator('pre')).toContainText('not mathematics')
 assert.equal(await privateRow.locator('pre .katex').count(),0)
 await expect(privateRow.locator('code').filter({hasText:'code $x$'})).toHaveCount(1)
 assert.equal(await page.locator('a[href^="javascript:"],.rich-math img').count(),0)
 assert.equal(await page.evaluate(()=>window.unsafeExecuted),undefined)
 assert.deepEqual(external,[])
 await privateRow.getByRole('link',{name:'a safe source'}).click()
 assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),{cmd:'external.open',args:{url:'https://example.com/research'}})
 await privateRow.getByRole('button',{name:'Copy message',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.copies.at(-1)),source,'whole-message copy retains original Markdown and TeX')
 await expect(page.locator('#json .command-data')).toBeVisible()
 assert.equal(await page.locator('#json .rich-math').count(),0)
 const news=page.locator('#news .channel-news-card')
 await news.getByRole('button',{name:'Read more',exact:true}).click()
 await expect(news.getByRole('button',{name:'Show less',exact:true})).toHaveAttribute('aria-expanded','true')
 await expect(news.locator('.rich-math-block')).toHaveCount(2)
 await news.getByRole('button',{name:'Copy message',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.copies.at(-1)),['Scientific article',source,'https://example.com/article'].join('\n\n'))
 await news.getByRole('button',{name:'Save article',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.newsChanges.at(-1).saved),true)
 await news.getByRole('button',{name:'Original',exact:true}).click()
 assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),{cmd:'external.open',args:{url:'https://example.com/article'}})
 const media=[{id:'photo-one',name:'one.png',mimeType:'image/png',bytes:68,sha256:'one'},{id:'photo-two',name:'two.png',mimeType:'image/png',bytes:68,sha256:'two'}]
 await page.evaluate(media=>window.updateNews({media}),media)
 await news.getByRole('button',{name:'Preview two.png',exact:true}).click()
 const viewer=page.getByRole('dialog',{name:'Image preview',exact:true})
 await expect(viewer.locator('.message-image-viewport img')).toHaveAttribute('alt','two.png')
 await page.evaluate(()=>window.updateNews({saved:true,title:'Updated article title'}))
 await expect(viewer).toBeVisible()
 await page.evaluate(media=>window.updateNews({media:[media[0]]}),media)
 await expect(viewer).toHaveCount(0)
 await page.evaluate(media=>window.updateNews({media}),media)
 await expect(viewer).toHaveCount(0)
 await news.getByRole('button',{name:'Preview one.png',exact:true}).click()
 await expect(viewer).toBeVisible()
 await page.evaluate(media=>window.updateNews({media:[media[1],media[0]]}),media)
 await expect(viewer).toHaveCount(0)
 const toolbar=page.getByRole('button',{name:'Quote selected text',exact:true})
 const select=async locator=>{await locator.scrollIntoViewIfNeeded();await locator.evaluate(node=>{const r=document.createRange();r.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(r)});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
 for(const phrase of ['precise phrase','another precise phrase','a bounded final quote']){
  await select(quoteRow.locator('strong').filter({hasText:new RegExp('^'+phrase+'$')}));await expect(toolbar).toBeVisible();await toolbar.click()
  const quote=await page.evaluate(()=>window.quotes.at(-1).quote)
  assert.deepEqual(await page.evaluate(value=>window.validate(value),quote),quote)
  assert.equal(quote.offset,await page.evaluate(value=>window.quoteProjection.indexOf(value),phrase));assert.equal(quote.text,phrase)
  await page.evaluate(value=>window.highlight(value),quote)
  assert.equal(await page.evaluate(()=>[...CSS.highlights.get('agents-message-quote')][0].toString()),phrase)
 }
 await select(quoteRow.locator('.rich-math').first());await expect(toolbar).toHaveCount(0)
 await select(quoteRow.locator('p').first());await expect(toolbar).toHaveCount(0)
 assert.equal(await page.evaluate(value=>window.normalize(value),tick+'\\(code\\)'+tick+'\n\n\\(x+y\\)'),tick+'\\(code\\)'+tick+'\n\n$x+y$')
 assert.equal(await page.evaluate(value=>window.normalize(value),'\\\\(escaped\\\\)'),'\\\\(escaped\\\\)')
 fs.mkdirSync(out,{recursive:true})
 for(const width of [1150,390,320]){
  await page.setViewportSize({width,height:900});await privateRow.scrollIntoViewIfNeeded()
  const layout=await page.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth,math:[...document.querySelectorAll('.rich-math-block')].map(node=>({width:node.clientWidth,scroll:node.scrollWidth})),inline:[...document.querySelectorAll('.rich-math-inline')].map(node=>({height:node.getBoundingClientRect().height,width:node.getBoundingClientRect().width,text:node.textContent}))}))
  assert.ok(layout.page<=width+1,'no page overflow at '+width+': '+JSON.stringify(layout))
  assert.ok(layout.inline.every(item=>item.height<100),'invalid/untrusted inline TeX remains readable: '+JSON.stringify(layout.inline.filter(item=>item.height>=100)))
  if(width===320)assert.ok(layout.math.some(value=>value.scroll>value.width+30),'long formula scrolls inside message')
  await page.screenshot({path:path.join(out,'rich-'+width+'.png'),animations:'disabled'})
 }
 assert.deepEqual(errors,[])
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks:['private/group/news shared renderer','GFM/code/raw HTML','inline/block and alternate TeX delimiters','untrusted math links/images','literal prices','original Markdown copy','surrounding exact quotes/highlights','math selection guard','320px formula/table containment','JSON view preserved'],platform:'headless Chromium on macOS',providerCalls:0},null,2))
 console.log('PASS rich text source: GFM/KaTeX, safe trust boundaries, original copy, precise surrounding quotes, math selection guard and narrow layouts')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
