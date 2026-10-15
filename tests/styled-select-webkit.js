// Runs in a real native WKWebView with the same source and CSS as Windows WebView2.
window.runStyledSelectChecks=async function(){
  const root=document.querySelector('#root')
  const checks=[],test=(name,exact)=>checks.push({name,exact:!!exact})
  const tick=async()=>{await Promise.resolve();await Promise.resolve()}
  const key=(el,value)=>el.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}))
  root.innerHTML=`<form id="sample">
      <label>SSH 连接<select name="connection" aria-label="SSH 连接" required>
        <option value="ssh">SSH 终端</option>
        <option value="rdp">远程桌面</option>
        <option value="off" disabled>尚不可用</option>
        <option value="vnc">VNC 桌面</option>
      </select></label>
      <label>分组<select name="columns"><option value="1">一列</option><option value="2" selected>两列</option><option value="6">六列</option></select></label>
      <button type="submit">提交</button>
  </form>`
  window.__styledSelect.installStyledSelects()
  await tick()
  const form=root.querySelector('form'),select=form.elements.connection
  const button=form.querySelector('.styled-select-trigger')
  let changes=0,inputs=0
  select.addEventListener('change',()=>changes++)
  select.addEventListener('input',()=>inputs++)
  test('Every native select is visually enhanced',form.querySelectorAll('select.styled-select-native').length===2&&form.querySelectorAll('.styled-select-trigger').length===2)
  test('Value and FormData preserved',select.value==='ssh'&&new FormData(form).get('connection')==='ssh')
  test('Branded trigger suppresses OS picker',getComputedStyle(button).borderRadius==='8px'&&getComputedStyle(select).opacity==='0')
  button.click()
  const menu=()=>document.querySelector('.styled-select-menu')
  test('Custom menu uses web UI overlay and proper ARIA',!!menu()&&menu().parentElement===document.body&&menu().getAttribute('role')==='listbox'&&button.getAttribute('aria-expanded')==='true')
  test('Branded menu has shadow and custom options',getComputedStyle(menu()).boxShadow!=='none'&&menu().querySelectorAll('[role=option]').length===4)
  key(button,'ArrowDown');key(button,'Enter')
  test('Keyboard selection fires one change and input',select.value==='rdp'&&changes===1&&inputs===1&&button.getAttribute('aria-expanded')==='false')
  test('Native form submission keeps chosen value',new FormData(form).get('connection')==='rdp')
  button.click()
  key(button,'End');key(button,'Enter')
  test('End key selects final enabled entry',select.value==='vnc'&&changes===2)
  button.click();key(button,'Escape')
  test('Escape closes without modifying selection',!menu()&&select.value==='vnc')
  button.click()
  const disabled=menu().querySelectorAll('[role=option]')[2]
  test('Disabled options cannot be selected',disabled.disabled===true)
  key(button,'Home');key(button,'ArrowDown');key(button,'ArrowDown');key(button,'Enter')
  test('Arrow keys skip disabled options',select.value==='vnc')
  const other=form.elements.columns
  other.closest('.styled-select').querySelector('button').click()
  test('Only one menu is open',document.querySelectorAll('.styled-select-menu').length===1)
  other.disabled=true;await tick()
  test('Disabling native control disables branded trigger',other.closest('.styled-select').querySelector('button').disabled)
  other.disabled=false;await tick()
  select.value='ssh';select.dispatchEvent(new Event('change',{bubbles:true}))
  test('Programmatic selection refreshes displayed value',button.querySelector('.styled-select-value').textContent==='SSH 终端')
  const added=document.createElement('select')
  added.name='dynamic';added.innerHTML='<option value="x">动态项 X</option><option value="y">动态项 Y</option>'
  root.append(added)
  await tick()
  test('Dynamic select insertion is upgraded',!!added.closest('.styled-select'))
  added.options[1].selected=true;added.dispatchEvent(new Event('change',{bubbles:true}))
  test('Dynamically changed option text is synchronized',added.closest('.styled-select').querySelector('.styled-select-value').textContent==='动态项 Y')
  const native=added
  native.focus()
  test('Programmatic focus goes to visible trigger',document.activeElement===added.closest('.styled-select').querySelector('button'))
  const modal=document.createElement('dialog');modal.id='custom-select-test-modal'
  modal.innerHTML='<form><label>目标目录<select name="parent"><option value="">根目录</option><option value="abc">工作目录</option></select></label></form>'
  document.body.append(modal);modal.showModal()
  await tick()
  const modalSelect=modal.querySelector('select')
  const modalButton=modal.querySelector('.styled-select-trigger')
  modalButton.click()
  test('Modal dropdown stays inside native dialog top-layer',!!modal.querySelector('.styled-select-menu')&&modal.querySelector('.styled-select-menu').parentElement===modal)
  modal.querySelectorAll('.styled-select-option')[1].click()
  test('Modal selection submits original form field',new FormData(modal.querySelector('form')).get('parent')==='abc')
  modal.close();await tick();modal.remove()
  other.closest('.styled-select').querySelector('button').click()
  other.closest('.styled-select').remove()
  await tick()
  test('Unmounting a select removes its popup',!menu())
  test('No accidental form submissions',!form.hasAttribute('data-submitted'))
  return {passed:checks.every(t=>t.exact),checks}
}
