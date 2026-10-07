import { useEffect,useRef } from 'react'

/** Keep keyboard focus inside the current overlay and return it to its opener. */
export function useDialogFocus(selector: string, open: boolean, returnFocus?:()=>HTMLElement|null) {
  const restore=useRef(returnFocus);restore.current=returnFocus
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const dialog = document.querySelector<HTMLElement>(selector)
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, iframe, [tabindex="0"]') ?? [])]
      .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden')!=='true' && el.getBoundingClientRect().height > 0)
    // Locate only the initial focus target; avoid measuring every form control.
    const first=[...(dialog?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, iframe, [tabindex="0"]')??[])].find(el=>!el.hasAttribute('disabled')&&el.getAttribute('aria-hidden')!=='true'&&el.getBoundingClientRect().height>0)
    first?.focus({ preventScroll: true })
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Tab'||(event.target as HTMLElement)?.closest('.xterm')) return
      const items = focusable()
      const index = items.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && (index === items.length - 1 || index === -1)) { event.preventDefault(); items[0]?.focus() }
    }
    dialog?.addEventListener('keydown', key)
    return () => { dialog?.removeEventListener('keydown', key); const target=restore.current?.()??opener; if (target?.isConnected) target.focus({ preventScroll: true }) }
  }, [selector, open])
}
