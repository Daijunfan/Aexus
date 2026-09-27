import type { Engine } from '../../../shared/types'

/** Original integration glyphs; names identify the separately licensed engines. */
export function EngineMark({engine,size=26}:{engine:Engine;size?:number}){
  return engine==='codex'?<svg width={size} height={size} viewBox="0 0 24 24" aria-label="Codex" className="engine-mark codex-mark"><rect x="2" y="3" width="20" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m6 8 4 4-4 4m7 0h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>:<svg width={size} height={size} viewBox="0 0 24 24" aria-label="Claude Agent" className="engine-mark claude-mark"><path d="m12 2 8 5v10l-8 5-8-5V7z" fill="none" stroke="#ce7754" strokeWidth="1.7"/><path d="m8 9 4 7 4-7M8 9h8" fill="none" stroke="#ce7754" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
