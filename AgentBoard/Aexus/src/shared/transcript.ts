// Transcript building, shared by the GUI and the CLI so both produce the same
// conversation from the same engine events. No React, no Electron, no browser
// APIs — this module runs in plain Node.

import type { Block, Item, Session } from './types'

let seq = 0
export const uid = (): string => `i${Date.now().toString(36)}_${++seq}`

export function summarize(input: any): string {
  if (!input || typeof input !== 'object') return ''
  const v =
    input.command ??
    input.file_path ??
    input.path ??
    input.pattern ??
    input.query ??
    input.url ??
    input.description
  if (typeof v === 'string') return v.length > 90 ? `${v.slice(0, 90)}…` : v
  const k = Object.keys(input)[0]
  return k ? `${k}: ${String(input[k]).slice(0, 70)}` : ''
}

export function format(v: any): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export function truncate(s: string, n = 3000): string {
  return s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more chars)` : s
}

export function apply(s: Session, m: any): Session {
  if(m.type==='conversation_reset')return {...s,items:[],open:false,error:undefined}
  if(m.type==='system'&&m.subtype==='local_command_output')return {...s,items:[...s.items,{role:'assistant',id:m.uuid??uid(),blocks:[{kind:'text',text:String(m.content??'')}]}],open:false}
  if(m.type==='system'&&m.subtype==='task_notification')return {...s,items:[...s.items,{role:'notice',id:m.uuid??uid(),text:`后台任务 ${m.task_id}：${m.summary}`,tone:m.status==='failed'?'error':'info'}]}
  if (m.type === 'stream_event') return applyStream(s, m)

  if (m.type === 'assistant') {
    const items = [...s.items]
    const idx = openIndex(s)
    const blocks: Block[] = []
    for (const c of m.message?.content ?? []) {
      if (c.type === 'text' && c.text) blocks.push({ kind: 'text', text: c.text })
      else if (c.type === 'thinking' && c.thinking)
        blocks.push({ kind: 'thinking', text: c.thinking, done: true })
      else if (c.type === 'tool_use')
        blocks.push({ kind: 'tool', id: c.id, name: c.name, input: c.input, running: true })
    }
    if (!blocks.length) return s
    if (idx >= 0) {
      const prev = items[idx] as any
      items[idx] = { ...prev, blocks: reconcile(prev.blocks, blocks) }
    } else {
      items.push({ role: 'assistant', id: uid(), blocks })
    }
    return { ...s, items, activity: describe(m) ?? s.activity }
  }

  if (m.type === 'user') {
    const content = m.message?.content
    if (!Array.isArray(content)) return s
    const results = new Map<string, { text: string; isError: boolean }>()
    for (const c of content) {
      if (c.type === 'tool_result')
        results.set(c.tool_use_id, { text: stringify(c.content), isError: !!c.is_error })
    }
    if (!results.size) return s
    const items = s.items.map((it) =>
      it.role === 'assistant'
        ? {
            ...it,
            blocks: it.blocks.map((b) => {
              if (b.kind !== 'tool' || !results.has(b.id)) return b
              const r = results.get(b.id)!
              return { ...b, result: r.text, isError: r.isError, running: false }
            })
          }
        : it
    )
    return { ...s, items, open: false, activity: 'Thinking…' }
  }

  if (m.type === 'tool_progress') {
    const items = s.items.map((it) =>
      it.role === 'assistant'
        ? {
            ...it,
            blocks: it.blocks.map((b) =>
              b.kind === 'tool' && b.id === m.tool_use_id
                ? { ...b, elapsed: Math.round(m.elapsed_time_seconds) }
                : b
            )
          }
        : it
    )
    return { ...s, items, activity: `Running ${m.tool_name}…` }
  }

  if (m.type === 'result') {
    return {
      ...s,
      busy: false,
      open: false,
      activity: undefined,
      error: m.is_error ? String(m.result ?? 'Request failed') : undefined
    }
  }

  if (m.type === 'system' && m.subtype === 'init') {
    return {
      ...s,
      claudeSessionId: m.session_id,
      model: s.model ?? m.model,
      permissionMode: m.permissionMode ?? s.permissionMode,
      terminalCommands: m.terminal_slash_commands ?? s.terminalCommands ?? []
    }
  }

  if (m.type === 'system' && m.subtype === 'status' && m.status) {
    return { ...s, activity: titleCase(m.status) }
  }

  if (m.type === 'system' && m.subtype === 'compact_boundary') {
    return {
      ...s,
      items: [
        ...s.items,
        { role: 'notice', id: uid(), text: 'Context compacted', tone: 'info' as const }
      ]
    }
  }

  return s
}

// Codex emits whole items rather than token deltas and has no message
// boundaries, so consecutive blocks accumulate into one assistant turn until a
// turn ends. The block shapes match the Claude path exactly, which is what lets
// one renderer serve both engines.
export const applyCodex=(s:Session,ev:any)=>applyAgent(s,ev)

/** Shared normalized text/tool events from process-based Coding Agents. */
export function applyAgent(s: Session, ev: any): Session {
  const items = [...s.items]
  const trailing = items[items.length - 1]
  // A codex turn owns the trailing assistant item for its whole duration, so
  // text and tool updates land in place rather than opening a new item each.
  const existing=ev.id?items.findIndex(item=>item.role==='assistant'&&item.blocks.some(block=>'id' in block&&block.id===ev.id)):-1
  const idx = existing>=0?existing:trailing && trailing.role === 'assistant' ? items.length - 1 : -1
  const target =
    idx >= 0 ? { ...(items[idx] as any) } : ({ role: 'assistant', id: uid(), blocks: [] } as any)
  const blocks: Block[] = [...(target.blocks ?? [])]
  const commit = (): Session => {
    target.blocks = blocks
    if (idx >= 0) items[idx] = target as Item
    else items.push(target as Item)
    return { ...s, items, open: true }
  }

  switch (ev?.kind) {
    case 'text-delta':case 'reasoning-delta': {
      const kind=ev.kind==='text-delta'?'text':'thinking',at=blocks.findIndex(b=>b.kind===kind&&b.id===ev.id)
      if(at>=0){const previous=blocks[at] as Extract<Block,{kind:'text'|'thinking'}>;blocks[at]={...previous,text:previous.text+String(ev.text??'')}}
      else blocks.push(kind==='text'?{kind:'text',id:ev.id,text:String(ev.text??'')}:{kind:'thinking',id:ev.id,text:String(ev.text??''),done:false})
      return commit()
    }
    case 'tool-delta': {
      const at=blocks.findIndex(b=>b.kind==='tool'&&b.id===ev.id);if(at<0)return s
      const previous=blocks[at] as Extract<Block,{kind:'tool'}>;blocks[at]={...previous,result:(previous.result??'')+String(ev.output??'')};return commit()
    }
    case 'text': {
      const text = String(ev.text ?? '').trim()
      if (!text) return s
      const streamed=ev.id?blocks.findIndex(b=>b.kind==='text'&&b.id===ev.id):-1
      if(streamed>=0){blocks[streamed]={kind:'text',id:ev.id,text};return commit()}
      // Codex repeats the final message verbatim at the end of a turn.
      if (blocks.some((b) => b.kind === 'text' && b.text.trim() === text)) return s
      blocks.push({ kind: 'text', text })
      return commit()
    }
    case 'reasoning': {
      const at=ev.id?blocks.findIndex(b=>b.kind==='thinking'&&b.id===ev.id):-1,value:Block={kind:'thinking',id:ev.id,text:String(ev.text),done:true}
      if(at>=0)blocks[at]=value;else blocks.push(value)
      return commit()
    }
    case 'tool-start':
      if (blocks.some((b) => b.kind === 'tool' && b.id === ev.id)) return s
      blocks.push({
        kind: 'tool',
        id: ev.id,
        name: ev.name || 'shell',
        input: { command: ev.command },
        running: true
      })
      return commit()
    case 'tool-end': {
      const at = blocks.findIndex((b) => b.kind === 'tool' && b.id === ev.id)
      const done: Block = {
        kind: 'tool',
        id: ev.id,
        name: ev.name || 'shell',
        input: { command: ev.command },
        result: String(ev.output ?? '').trim() || '(no output)',
        isError: typeof ev.exitCode === 'number' && ev.exitCode !== 0,
        running: false
      }
      if (at >= 0) blocks[at] = done
      else blocks.push(done)
      return commit()
    }
    case 'notice':
      if(ev.level!=='error')return {...s,items:[...s.items,{role:'notice',id:uid(),text:String(ev.text),tone:'info'}]}
      return {
        ...s,
        error: String(ev.text),
        items: [
          ...s.items,
          { role: 'notice', id: uid(), text: String(ev.text), tone: 'error' as const }
        ]
      }
    case 'turn-end':
      return { ...s, open: false, busy: false, activity: undefined }
    default:
      return s
  }
}

export function applyStream(s: Session, m: any): Session {
  const ev = m.event
  if (ev?.type === 'message_start') return { ...s, open: false }
  if (ev?.type === 'message_stop') {
    return { ...s, open: false, items: sealThinking(s.items) }
  }

  if (ev?.type === 'content_block_start') {
    const idx = openIndex(s)
    const items = [...s.items]
    const target = idx >= 0 ? { ...(items[idx] as any) } : { role: 'assistant', id: uid(), blocks: [] }
    const blocks: Block[] = [...(target.blocks ?? [])]
    const cb = ev.content_block
    if (cb?.type === 'tool_use')
      blocks.push({ kind: 'tool', id: cb.id, name: cb.name, input: {}, running: true })
    else if (cb?.type === 'thinking')
      blocks.push({ kind: 'thinking', text: '', done: false })
    target.blocks = blocks
    if (idx >= 0) items[idx] = target as Item
    else items.push(target as Item)
    return { ...s, items, open: true, activity: 'Thinking…' }
  }

  if (ev?.type === 'content_block_stop') {
    const idx = openIndex(s)
    if (idx < 0) return s
    const items = [...s.items]
    const target = { ...(items[idx] as any) }
    target.blocks = (target.blocks ?? []).map((b: Block) =>
      b.kind === 'thinking' ? { ...b, done: true } : b
    )
    items[idx] = target as Item
    return { ...s, items }
  }

  if (ev?.type === 'content_block_delta') {
    const d = ev.delta
    const idx = openIndex(s)
    const items = [...s.items]
    const target = idx >= 0 ? { ...(items[idx] as any) } : { role: 'assistant', id: uid(), blocks: [] }
    const blocks: Block[] = [...(target.blocks ?? [])]

    if (d?.type === 'text_delta') {
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'text') blocks[blocks.length - 1] = { ...last, text: last.text + d.text }
      else blocks.push({ kind: 'text', text: d.text })
    } else if (d?.type === 'thinking_delta') {
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'thinking')
        blocks[blocks.length - 1] = { ...last, text: last.text + d.thinking }
      else blocks.push({ kind: 'thinking', text: d.thinking, done: false })
    } else if (d?.type === 'input_json_delta') {
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'tool') {
        const merged = (last as any)._raw ? (last as any)._raw + d.partial_json : d.partial_json
        blocks[blocks.length - 1] = { ...last, _raw: merged, input: tryParse(merged) } as any
      }
    }

    target.blocks = blocks
    if (idx >= 0) items[idx] = target as Item
    else items.push(target as Item)
    return { ...s, items, open: true }
  }

  return s
}

export function sealThinking(items: Item[]): Item[] {
  return items.map((it) =>
    it.role === 'assistant'
      ? {
          ...it,
          blocks: it.blocks.map((b) => (b.kind === 'thinking' ? { ...b, done: true } : b))
        }
      : it
  )
}

export function openIndex(s: Session): number {
  const last = s.items[s.items.length - 1]
  if (!s.open || !last || last.role !== 'assistant') return -1
  return s.items.length - 1
}

export function reconcile(streamed: Block[], final: Block[]): Block[] {
  // The final assistant frame is authoritative for what it contains, but a
  // streamed block it does not mention (e.g. thinking, which can arrive as its
  // own message) must survive rather than be dropped.
  const out = final.map((b) => {
    if (b.kind !== 'tool') return b
    const prev = streamed.find((p) => p.kind === 'tool' && p.id === b.id)
    if (!prev || prev.kind !== 'tool') return b
    return {
      ...b,
      running: false,
      result: prev.result,
      isError: prev.isError,
      elapsed: prev.elapsed,
      input: b.input ?? prev.input
    }
  })
  const keptFinal = (b: Block) => final.some((f) => sameBlock(f, b))
  return [...streamed.filter((b) => !keptFinal(b)), ...out]
}

function sameBlock(a: Block, b: Block): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'tool' && b.kind === 'tool') return a.id === b.id
  return true
}

function describe(m: any): string | undefined {
  const tools = (m.message?.content ?? []).filter((c: any) => c.type === 'tool_use')
  if (tools.length) return `Running ${tools.map((t: any) => t.name).join(', ')}…`
  return undefined
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

function stringify(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? '[image]' : ''))
      .join('')
  return ''
}

function tryParse(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return { _partial: s }
  }
}

/**
 * Render items as plain text. The CLI prints this, so a conversation can be
 * inspected (and asserted on) without a window.
 */
export function renderTranscript(items: Item[]): string {
  const out: string[] = []
  for (const item of items) {
    if (item.role === 'user') {
      if(item.reply)out.push(`> [Reply to ${item.reply.id}] ${Array.from(item.reply.text.replace(/\s+/g,' ').trim()).slice(0,200).join('')||'[photo]'}`)
      out.push(`> ${item.text}`,...(item.images??[]).map(path=>`> [图片] ${path}`),...(item.files??[]).map(file=>`> [File] ${file.name} (${file.bytes} bytes): ${file.path}`))
      continue
    }
    if (item.role === 'notice') {
      out.push(item.tone === 'error' ? `! ${item.text}` : `- ${item.text}`)
      continue
    }
    for (const b of item.blocks) {
      if (b.kind === 'text') out.push(b.text)
      else if (b.kind === 'thinking') out.push(`[thinking] ${b.text}`)
      else {
        const mark = b.running ? '…' : b.isError ? '✗' : '✓'
        out.push(`${mark} ${b.name} ${summarize(b.input)}`.trimEnd())
        if (b.result !== undefined && b.result !== '') {
          const body = b.result
            .split('\n')
            .map((l) => `    ${l}`)
            .join('\n')
          out.push(body)
        }
      }
    }
  }
  return out.join('\n')
}
