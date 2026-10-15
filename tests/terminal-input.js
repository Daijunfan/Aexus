// Replays the committed-text ordering reported in xterm.js #5887. The real
// terminal pane and xterm run in WebKit; only the transport is replaced here.
window.runTerminalInputChecks = async function () {
  const received = [], checks = [], timers = [], commands=[]
  // Hidden WebKit views throttle timers. Flush zero-delay callbacks explicitly
  // to preserve each captured IME event turn without opening a window.
  const nativeTimeout = window.setTimeout
  window.setTimeout = (callback, delay, ...args) => delay === 0 ? (timers.push(() => callback(...args)), -timers.length) : nativeTimeout(callback, delay, ...args)
  const tick = async () => {await Promise.resolve(); while (timers.length) timers.shift()(); await Promise.resolve()}
  class Socket {
    static OPEN = 1; static CONNECTING = 0; readyState = 1
    constructor(url) {this.session=new URL(url).searchParams.get('terminal');setTimeout(() => this.onopen?.(), 0)}
    send(raw) {const event = JSON.parse(raw); if (event.op === 'input') received.push({session:this.session,data:event.data})}
    close() {this.readyState = 3}
  }
  window.WebSocket = Socket
  const root = document.querySelector('#root')
  const dispose = cloudClients.terminal(root, {id:'fixture', name:'输入回归', os:'ubuntu', host:'fixture'}, async (method,args) => {commands.push({method,args});return method === 'hosts.terminal-list' ? [{id:'one',running:true},{id:'two',running:true}] : true}, () => {}, null, null)
  await tick(); await tick()
  // An X on a live terminal must not terminate an executing job without an
  // explicit second confirmation. Cancelling leaves the PTY alive.
  const originalClose=commands.filter(row=>row.method==='hosts.terminal-close').length
  root.querySelector('#terminal-close').click()
  const pop=document.querySelector('.compact-popover')
  checks.push({name:'Closing a running terminal first displays terminate-running-task confirmation',
   expectedCharacters:0,actualCharacters:0,
   exact:!!pop?.textContent.includes('运行任务')&&commands.filter(x=>x.method==='hosts.terminal-close').length===originalClose})
  pop?.querySelector('[data-cancel]')?.click()
  await tick()
  checks.push({name:'Cancelling close confirmation leaves the terminal alive',expectedCharacters:0,actualCharacters:0,
   exact:commands.filter(x=>x.method==='hosts.terminal-close').length===originalClose&&!!root.querySelector('.terminal-view:not([hidden])')})
  const horizontal=root.querySelector('.terminal-view:not([hidden])')
  const inner=horizontal?.querySelector('.terminal-hscroll-content')
  const hasScroll=!!inner&&horizontal.scrollWidth>horizontal.clientWidth&&inner.getBoundingClientRect().width>horizontal.clientWidth
  checks.push({name:'Narrow terminal has a real horizontal scrollbar',expectedCharacters:0,actualCharacters:0,exact:hasScroll})
  if(hasScroll)horizontal.scrollLeft=130
  checks.push({name:'Horizontal terminal scroll never writes input',expectedCharacters:0,actualCharacters:0,exact:hasScroll&&horizontal.scrollLeft>0&&received.length===0})
  const input = () => root.querySelector('.terminal-view:not([hidden]) .xterm-helper-textarea')||root.querySelector('.xterm-helper-textarea')
  const key = (type, text, code, extra = {}) => input().dispatchEvent(new KeyboardEvent(type, {key:text, code:'Key'+text.toUpperCase(), keyCode:code, which:code, bubbles:true, cancelable:true, ...extra}))
  const committed = text => {input().value += text; input().dispatchEvent(new InputEvent('input', {data:text, inputType:'insertText', isComposing:false, composed:true, bubbles:true}))}
  async function check(name, expected, action) {
    const start = received.length
    await action(); await tick(); await tick()
    const actual = received.slice(start).map(item=>item.data).join('')
    checks.push({name, expectedCharacters:[...expected].length, actualCharacters:[...actual].length, exact:actual===expected, ...(actual!==expected ? {expected,actual} : {})})
  }
  async function ime(text, before, release) {
    for (const char of text) {
      if (before) committed(char)
      key('keydown',char,229)
      if (!before) committed(char)
      if (release) key('keyup',char,229)
      await tick()
    }
    if (!release) for (const char of text) key('keyup',char,229)
  }
  await check('Doubao input before overlapping keydowns', 'pwdclear'.repeat(50), () => ime('pwdclear'.repeat(50),true,false))
  await check('Legitimate repeated characters', 'pppp'.repeat(25), () => ime('pppp'.repeat(25),true,false))
  await check('Input after IME keydown is not emitted twice', 'clear'.repeat(20), () => ime('clear'.repeat(20),false,true))
  await check('Held Shift and direct punctuation', ':#"「「', async () => {key('keydown','Shift',16,{shiftKey:true}); await ime(':#"「「',true,false); key('keyup','Shift',16)})
  await check('Emoji committed without composition events', '🙂中文🙂', () => ime('🙂中文🙂',true,false))
  await check('Ordinary physical keyboard', 'pwdABCDEFGHIJKLMNOPQRSTUVWXYZ123! ', async () => {
    for (const char of 'pwdABCDEFGHIJKLMNOPQRSTUVWXYZ123! ') {
      const code = char === '!' ? 49 : char.toUpperCase().charCodeAt(0), modifiers = {shiftKey:/[A-Z!]/.test(char)}
      if (key('keydown',char,code,modifiers)) {key('keypress',char,char.charCodeAt(0),{...modifiers,charCode:char.charCodeAt(0)}); committed(char)}
      key('keyup',char,code); await tick()
    }
  })
  await check('Fast physical input without deprecated keypress', 'pwdclearABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(40), async () => {
    for (const char of 'pwdclearABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(40)) {
      key('keydown',char,char.toUpperCase().charCodeAt(0))
      committed(char)
      await tick()
    }
    key('keyup','r',82)
  })
  await check('Tab and Shift-Tab stay in the shell', '\t\u001b[Z', async () => {
    key('keydown','Tab',9);key('keyup','Tab',9)
    key('keydown','Tab',9,{shiftKey:true});key('keyup','Tab',9,{shiftKey:true})
  })
  await check('Control keys keep terminal semantics', '\r\u007f\u001b[D\u0003', async () => {
    key('keydown','Enter',13);key('keyup','Enter',13)
    key('keydown','Backspace',8);key('keyup','Backspace',8)
    key('keydown','ArrowLeft',37);key('keyup','ArrowLeft',37)
    key('keydown','c',67,{ctrlKey:true});key('keyup','c',67,{ctrlKey:true})
  })
  await check('Chinese composition commits exactly once', '你好', async () => {
    for (const char of '你好') {
      const prefix = input().value
      input().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))
      key('keydown','Process',229)
      input().value = prefix+'ni';input().dispatchEvent(new CompositionEvent('compositionupdate',{data:'ni',bubbles:true})); await tick()
      input().value = prefix+char;input().dispatchEvent(new CompositionEvent('compositionupdate',{data:char,bubbles:true})); await tick()
      input().dispatchEvent(new CompositionEvent('compositionend',{data:char,bubbles:true}))
      input().dispatchEvent(new InputEvent('input',{data:char,inputType:'insertText',isComposing:false,composed:true,bubbles:true}))
      key('keyup','Process',229);await tick();await tick()
    }
  })
  const switchStart=received.length
  await check('Terminal tab switch preserves IME input', 'pwdclear', async () => {
    root.querySelector('[data-terminal="two"]').click();await tick();await ime('pwd',true,false)
    root.querySelector('[data-terminal="one"]').click();await tick();await ime('clear',true,false)
  })
  checks.push({name:'Switched input keeps its session owner',expectedCharacters:8,actualCharacters:8,exact:received.slice(switchStart).filter(r=>r.session==='two').map(r=>r.data).join('')==='pwd'&&received.slice(switchStart).filter(r=>r.session==='one').map(r=>r.data).join('')==='clear'})
  await check('Large clipboard paste reaches the same input path once', 'ab🙂中文'.repeat(4000), async()=>{
    const clipboard=new DataTransfer();clipboard.setData('text/plain','ab🙂中文'.repeat(4000))
    input().dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}))
  })
  dispose();window.setTimeout = nativeTimeout
  return {engine:navigator.userAgent,checks,passed:checks.every(c=>c.exact),characters:checks.reduce((sum,c)=>sum+c.expectedCharacters,0)}
}
