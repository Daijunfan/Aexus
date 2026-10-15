import {english} from './i18n-dictionary.js'
import {refreshStyledSelectLabels} from './styled-select.js'

// The application preserves user-entered host names, files, directory names,
// terminal output and model conversations verbatim. Only interface copy is
// translated; no message or prompt sent to a Coding Agent passes through here.
const reverse=new Map(Object.entries(english).map(([ch,en])=>[en,ch]))
// This label also appears on secondary panels as 'Add Host'; keep the top toolbar's original Chinese copy.
reverse.set('+ Add Host','＋ 新建主机')
const originals=new WeakMap(),attributes=new WeakMap()
const attributeNames=['title','aria-label','placeholder','alt']
const skip='script,style,template,noscript,textarea,input,pre,code,.xterm,.terminal-hscroll-content,.agent-event,.agent-conversation-log,.agent-role-name,.host-card strong,.board-handle strong,.file-tree-name,.file-name,.station-item-name,.station-item-info strong,#station-breadcrumbs [data-folder]:not([data-folder=""]),.file-path,.file-path-option,.agent-approval pre,[data-no-i18n]'
let locale='en',observer

const patterns=[
 [/^(.+) 在 (.+) 运行，文件与命令在 (.+) 执行。请保持本机在线。$/,([,engine,source,target])=>`${engine} runs on ${english[source]||source}; files and commands run on ${target}. Keep this computer online.`],
 [/^(.+) 启动引擎 → 在 (.+) 工作$/,([,source,target])=>`${english[source]||source} starts engine → work on ${english[target]||target}`],
 [/^(\d+)\s*列$/,([,count])=>`${count} columns`],
 [/^(\d+)\s*个角色\s*\/\s*(\d+)\s*个在线$/,([,total,online])=>`${total} roles / ${online} active`],
 [/^(\d+)\s*个角色\s*·\s*(\d+)\s*个会话在线$/,([,total,online])=>`${total} roles · ${online} sessions online`],
 [/^(\d+)\s*个会话\s*·\s*(\d+)\s*个会话在线$/,([,total,online])=>`${total} sessions · ${online} online`],
 [/^(\d+)\s*台主机检查失败$/,([,count])=>`${count} host checks failed`],
 [/^终端\s*(\d+)$/,([,count])=>`Terminal ${count}`],
 [/^文件\s*(\d+)$/,([,count])=>`File ${count}`],
 [/^工作组\s*(\d+)$/,([,count])=>`Workgroup ${count}`],
 [/^端口\s*(\d+)$/,([,count])=>`Port ${count}`],
 [/^(\d+)\s*项$/,([,count])=>`${count} items`],
 [/^已选\s*(\d+)$/,([,count])=>`${count} selected`],
 [/^文件夹\s*·\s*(\d+)$/,([,count])=>`Folder · ${count}`],
 [/^文件\s*·\s*(\d+)$/,([,count])=>`File · ${count}`],
 [/^本地主机\s*·\s*(.+)$/,([,os])=>`Local Host · ${os}`],
 [/^云端工作主机\s*·\s*(.+)$/,([,os])=>`Remote Work Host · ${os}`],
 [/^本地工作主机\s*·\s*(.+)$/,([,os])=>`Local Work Host · ${os}`],
 [/^引擎启动位置：(.+)$/,([,host])=>`Engine started on: ${host}`],
 [/^在\s+(.+)\s+新建\s+Agent$/,([,host])=>`Create Agent on ${host}`],
 [/^从看板隐藏\s+(.+)$/,([,host])=>`Hide ${host} from board`],
 [/^打开\s+(.+)工作台$/,([,host])=>`Open ${host} workspace`],
 [/^打开\s+(.+)\s+的单机工作台$/,([,host])=>`Open ${host} single-host workspace`],
 [/^移出\s+(.+)$/,([,host])=>`Remove ${host}`],
 [/^调整\s+(.+)\s+所在行高度$/,([,host])=>`Resize row for ${host}`],
 [/^(.+)\s+文件窗口高度$/,([,host])=>`${host} file-window height`],
 [/^(.+)\s+目录树$/,([,host])=>`${host} directory tree`],
 [/^(.+)\s+文件视图$/,([,host])=>`${host} file view`],
 [/^(.+)\s+当前绝对路径$/,([,host])=>`${host} current absolute path`],
 [/^(.+)\s+的 Coding Agent 会话，可上下左右滚动$/,([,host])=>`${host} Coding Agent sessions · scroll horizontally or vertically`],
 [/^(.+)\s+原生图标$/,([,engine])=>`${engine} native logo`],
 [/^(.+)\s+终端默认高度$/,([,os])=>`${os} terminal default height`],
 [/^(.+)\s+卡片高度$/,([,host])=>`${host} card height`],
 [/^(.+)\s+工作目录$/,([,host])=>`${host} working directory`],
 [/^(.+)\s*个角色\s*·\s*(\d+)\s*个会话在线$/,([,role,online])=>`${role} roles · ${online} sessions online`],
 [/^已退出\s*·\s*code\s*(.+)$/,([,code])=>`Exited · code ${code}`],
 [/^运行中\s*·\s*(.+)$/,([,kind])=>`Running · ${kind}`],
 [/^连接断开\s*·\s*(.+)$/,([,reason])=>`Disconnected · ${reason}`],
 [/^已选\s*(\d+)\s*项$/,([,count])=>`${count} selected`],
 [/^(.+)\s*·\s*未安装$/,([,name])=>`${name} · not installed`],
 [/^(.+)\s*·\s*仅支持同机$/,([,name])=>`${name} · same-host only`],
]

function convert(source,target){
 const prefix=source.match(/^\s*/)[0],suffix=source.match(/\s*$/)[0]
 const text=source.trim()
 if(!text)return source
 if(target==='en'){
  const direct=english[text]
  if(direct!==undefined)return prefix+direct+suffix
  for(const [pattern,format] of patterns){const match=text.match(pattern);if(match)return prefix+format(match)+suffix}
 }else{
  const direct=reverse.get(text)
  if(direct!==undefined)return prefix+direct+suffix
 }
 return source
}

function ignored(node){
 const owner=node.nodeType===Node.TEXT_NODE?node.parentElement:node
 if(owner?.matches('.board-handle strong')&&owner.closest('[data-host="local"]'))return false
 return !owner||!!owner.closest(skip)
}
function textNode(node){
 if(ignored(node))return
 const current=node.nodeValue
 const remembered=originals.get(node)
 const original=!remembered||current!==remembered.rendered?current:remembered.original
 const value=convert(original,locale)
 originals.set(node,{original,rendered:value})
 if(value!==current)node.nodeValue=value
}
function attributesFor(element){
 if(!element||element.closest('script,style,template,noscript,.xterm,.agent-event,.agent-conversation-log,.agent-role-name,.file-tree-name,.file-name,.station-item-name,.station-item-info strong,#station-breadcrumbs [data-folder]:not([data-folder=""]),.file-path,[data-no-i18n]'))return
 let originalsFor=attributes.get(element)
 if(!originalsFor){originalsFor=new Map();attributes.set(element,originalsFor)}
 for(const name of attributeNames){
  if(!element.hasAttribute(name))continue
  const current=element.getAttribute(name)
  const remembered=originalsFor.get(name)
  const original=!remembered||current!==remembered.rendered?current:remembered.original
  const value=convert(original,locale)
  originalsFor.set(name,{original,rendered:value})
  if(value!==current)element.setAttribute(name,value)
 }
}
function apply(node){
 if(node.nodeType===Node.TEXT_NODE){textNode(node);return}
 if(node.nodeType!==Node.ELEMENT_NODE)return
 attributesFor(node)
 if(ignored(node))return
 for(const child of node.childNodes)apply(child)
}
function repaint(){
 apply(document.body)
 refreshStyledSelectLabels()
 document.documentElement.lang=locale==='zh'?'zh-CN':'en'
 document.title=locale==='zh'?'云主机':'Cloud Hosts'
}
export function currentLanguage(){return locale}
export function setLanguage(next){
 if(!['en','zh'].includes(next))throw Error('Unsupported UI language')
 locale=next
 repaint()
 const event={type:'language',value:locale}
 window.webkit?.messageHandlers?.station?.postMessage(event)
 window.chrome?.webview?.postMessage(event)
}
export function installLanguage(){
 if(observer)return
 repaint()
 observer=new MutationObserver(records=>{
  const altered=new Set()
  let optionsChanged=false
  for(const record of records){
   if(record.type==='characterData'){altered.add(record.target);if(record.target.parentElement?.closest('option'))optionsChanged=true}
   else if(record.type==='attributes')altered.add(record.target)
   else for(const child of record.addedNodes){altered.add(child);if(child.nodeType===Node.ELEMENT_NODE&&(child.matches('option')||child.querySelector('option')))optionsChanged=true}
  }
  for(const node of altered)apply(node)
  if(optionsChanged)refreshStyledSelectLabels()
 })
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributeNames})
}
export function localizeUIString(text){return convert(text,locale)}
