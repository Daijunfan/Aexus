// Answers the CLI's questions about what is on screen. Everything here reads
// the live DOM, so a passing check means something actually rendered.

import type { UiElement, UiSnapshot } from '../../shared/protocol'
import { flushPlugins } from './plugins'

type Request = { id: string; op: string; args: Record<string, unknown> }
type Answer = (a: { id: string; data?: unknown; error?: string }) => void

function textOf(el: Element | null): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
}

/** A structured description of the current screen. */
function snapshot(): UiSnapshot {
  const onHome = !document.querySelector('.conversation-dialog')
  // A desk lives inside a room; the room's sign gives the department.
  const cards = [...document.querySelectorAll('.employee[data-card-id]')].map((el) => {
    const room = el.closest('.room')
    const mark = el.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? ''
    return {
      title: textOf(el.querySelector('.employee-name')),
      engine: el.getAttribute('data-engine') || mark.toLowerCase(),
      group: el.getAttribute('data-group') || textOf(room ? room.querySelector('.room-sign h2') : null)
    }
  })

  const counts: Record<string, number> = {
    departments: document.querySelectorAll('.world-room').length,
    cards: cards.length,
    turns: document.querySelectorAll('.turn').length,
    toolCalls: document.querySelectorAll('.tool').length,
    thinkingBlocks: document.querySelectorAll('.thinking').length
  }

  const base: UiSnapshot = {
    view: onHome ? 'home' : 'session',
    departments: [...document.querySelectorAll('.team-title strong')].map((n) => textOf(n)),
    cards,
    counts
  }

  if (!onHome) {
    const toggle = document.querySelector('.toggle') as HTMLButtonElement | null
    base.session = {
      title: textOf(document.querySelector('.session-heading')),
      engine: document
        .querySelector('.session-heading svg[aria-label]')
        ?.getAttribute('aria-label')
        ?.toLowerCase() ?? '',
      model: textOf(document.querySelector('[data-control="model"] .ctl-label')),
      permission: textOf(document.querySelector('[data-control="perm"] .ctl-label,.work-permission')),
      thinking: textOf(toggle),
      thinkingEnabled: toggle ? !toggle.disabled && toggle.classList.contains('on') : false,
      busy: !!document.querySelector('.status-line'),
      turns: counts.turns,
      hasBackButton: !!document.querySelector('.back')
    }
  }
  return base
}

function query(selector: string): UiElement[] {
  return [...document.querySelectorAll(selector)].map((el) => ({
    tag: el.tagName.toLowerCase(),
    cls: el.getAttribute('class') ?? '',
    text: textOf(el),
    visible: isVisible(el)
  }))
}

/** Fire a real click, exactly as a user would. */
function click(selector: string): void {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) throw new Error(`nothing matches '${selector}'`)
  if (el instanceof SVGElement) el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  else el.click()
}

/** Type into an input the way React's onChange expects to see it. */
function type(selector: string, value: string): void {
  const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  if (!el) throw new Error(`nothing matches '${selector}'`)
  if(el.disabled||('readOnly' in el&&el.readOnly))throw new Error('此字段不可编辑')
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  if (el instanceof HTMLSelectElement) el.dispatchEvent(new Event('change', { bubbles: true }))
}

async function waitFor(selector: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (document.querySelector(selector)) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

export function installUiInspector(answer: Answer): void {
  const api = (window as any).agents
  api.onUiRequest(async (req: Request) => {
    const { id, op, args } = req
    try {
      switch (op) {
        case 'flush':
          await flushPlugins()
          return answer({id,data:{saved:true}})
        case 'view':
          return answer({ id, data: snapshot() })
        case 'snapshot':
          return answer({ id, data: snapshot() })
        case 'dom':
          return answer({ id, data: query(String(args.selector ?? 'body')) })
        case 'text': {
          const root = document.querySelector('.home, .main') ?? document.body
          return answer({ id, data: textOf(root) })
        }
        case 'click':
          click(String(args.selector))
          return answer({ id, data: { clicked: args.selector } })
        case 'type':
          type(String(args.selector), String(args.value ?? ''))
          return answer({ id, data: { typed: args.value } })
        case 'rect': {
          const el=document.querySelector(String(args.selector))
          if(el?.closest('.office-panel,.employee-inspector'))el.scrollIntoView({block:'center',inline:'nearest'})
          const rect=el?.getBoundingClientRect()
          if(!rect)throw new Error('Element not found')
          return answer({id,data:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}})
        }
        // Lets a test assert on appearance — a check can prove a room is
        // actually styled, not merely present in the DOM.
        case 'style': {
          const el = document.querySelector(String(args.selector))
          if (!el) throw new Error(`nothing matches '${args.selector}'`)
          const cs = getComputedStyle(el)
          return answer({
            id,
            data: {
              background: cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor,
              color: cs.color,
              border: cs.borderColor,
              radius: cs.borderRadius,
              shadow: cs.boxShadow,
              opacity: cs.opacity,
              animation: cs.animationName,
              transform: cs.transform,
              left: cs.left,
              top: cs.top,
              width: Math.round(el.getBoundingClientRect().width),
              height: Math.round(el.getBoundingClientRect().height)
            }
          })
        }

        case 'wait': {
          const found = await waitFor(String(args.selector), Number(args.timeout ?? 5000))
          return answer({ id, data: { found } })
        }
        default:
          return answer({ id, error: `unknown ui op '${op}'` })
      }
    } catch (err) {
      answer({ id, error: err instanceof Error ? err.message : String(err) })
    }
  })
}
