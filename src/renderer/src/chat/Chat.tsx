// Rendering one conversation: turns, and the blocks inside them.

import { memo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {EngineData,RawData} from '../components/EngineData'
import {api} from '../api'
import type { Block, Item } from '../../../shared/types'
import { format, summarize, truncate } from '../../../shared/transcript'

export const Turn=memo(function Turn({ item,replyId }: { item: Item;replyId?:string }) {

  if (item.role === 'user') {
    return (
      <div className="turn user">
        <div className="bubble">{item.text}{item.images?.map(path=><div className="message-image-label" key={path}>🖼 {path}</div>)}</div>
      </div>
    )
  }
  if (item.role === 'notice') {
    return <div className={`turn notice ${item.tone}`}>{item.text}</div>
  }
  return (
    <div className="turn assistant">
      {item.blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
      {replyId&&<span className="reply-seen-marker" data-reply-id={replyId} aria-hidden="true"/>}
    </div>
  )
})

export function BlockView({ block }: { block: Block }) {
  if (block.kind === 'text') {
    // JSON replies remain intact in the CLI transcript; the UI adds a readable view.
    let data:unknown
    try { if(block.text.trim().startsWith('{'))data=JSON.parse(block.text) } catch {}
    if(data&&typeof data==='object')return <details className="command-data" open><summary>返回结果</summary><EngineData data={data}/><RawData data={data}/></details>
    return <div className="text markdown"><Markdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=>href&&/^https?:\/\//i.test(href)?<a href={href} onClick={event=>{event.preventDefault();void api.call('external.open',{url:href})}}>{children}</a>:<span>{children}</span>}}>{block.text}</Markdown></div>
  }
  if (block.kind === 'thinking') return <Thinking text={block.text} done={block.done} />
  return <ToolCall block={block} />
}

export function Thinking({ text, done }: { text: string; done: boolean }) {
  const [open, setOpen] = useState(false)
  const streaming = !done
  return (
    <div className={`thinking ${streaming ? 'streaming' : ''}`}>
      <button className="thinking-head" onClick={() => setOpen((v) => !v)}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        <span className="thinking-label">
          {streaming ? 'Thinking…' : 'Thought'}
          {streaming && <span className="ellipsis" />}
        </span>
      </button>
      {(open || streaming) && <div className="thinking-body">{text}</div>}
    </div>
  )
}

export function ToolCall({ block }: { block: Block }) {
  if (block.kind !== 'tool') return null
  const [open, setOpen] = useState(false)
  const detail = summarize(block.input)
  return (
    <div className={`tool ${block.running ? 'running' : ''} ${block.isError ? 'errored' : ''}`}>
      <button className="tool-head" onClick={() => setOpen((v) => !v)}>
        <span className={`status ${block.running ? 'spin' : block.isError ? 'bad' : 'good'}`}>
          {block.running ? '◐' : block.isError ? '✕' : '✓'}
        </span>
        <span className="tool-name">{block.name}</span>
        <span className="tool-arg">{detail}</span>
        {block.running && block.elapsed !== undefined && (
          <span className="tool-elapsed">{block.elapsed}s</span>
        )}
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="tool-detail">
          {block.input && Object.keys(block.input).length > 0 && (
            <pre className="tool-io">{format(block.input)}</pre>
          )}
          {block.result !== undefined && (
            <pre className={`tool-io result ${block.isError ? 'bad' : ''}`}>
              {truncate(block.result)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
