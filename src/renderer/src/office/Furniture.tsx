import { useId } from 'react'
import type { RoomDesign } from '../../../shared/office'

export function Plant({ variant = 'monstera', className = '' }: { variant?: 'monstera' | 'fern'; className?: string }) {
  const id = useId().replace(/:/g, '')
  return <svg className={`plant ${className}`} viewBox="0 0 95 150" aria-hidden="true" data-component="plant">
    <defs><linearGradient id={`${id}-leaf`} x2="1" y2="1"><stop stopColor="#779b76" /><stop offset=".5" stopColor="#416c57" /><stop offset="1" stopColor="#193d35" /></linearGradient><linearGradient id={`${id}-pot`}><stop stopColor="#464e55" /><stop offset=".45" stopColor="#838c87" /><stop offset="1" stopColor="#424c50" /></linearGradient></defs>
    <g fill="none" stroke="#496951" strokeWidth="2"><path d="M47 114 Q58 55 42 18 M46 112 Q22 80 17 43 M46 95 Q76 58 80 34 M46 112 Q62 96 80 75" /></g>
    <g fill={`url(#${id}-leaf)`}>{(variant === 'monstera' ? [[40,28,-10],[21,48,-50],[67,44,48],[28,75,-62],[63,78,55],[45,59,8],[77,87,70]] : [[43,21,-5],[23,47,-65],[65,43,65],[21,70,-65],[68,70,68],[32,93,-52],[65,96,52]]).map(([x,y,r],i) => <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}><path d={variant === 'monstera' ? 'M0 26 C-27 10 -24 -21 0 -20 C21 -24 26 7 0 26 M-16 -6 L-4 5 M16 -5 L5 9' : 'M0 26 Q-26 1 0 -28 Q22 -1 0 26'} /><path d="M0 23 L0 -15" stroke="#b2c996" strokeWidth=".7" opacity=".4" /></g>)}</g>
    <ellipse cx="47" cy="119" rx="24" ry="7" fill="#222e2d" /><path d="M24 118 L31 145 Q48 152 65 145 L71 118 Q49 128 24 118" fill={`url(#${id}-pot)`} /><path d="M31 128 L35 143 M39 129 L41 145 M49 130 L49 146 M59 127 L56 144" stroke="#cad3bb" strokeOpacity=".14" />
  </svg>
}

export function Bookshelf() {
  return <svg className="bookshelf" viewBox="0 0 140 130" aria-hidden="true" data-component="shelf">
    <path d="M7 5 L137 5 L137 125 L7 125 Z" fill="#3d3938" stroke="#847769" strokeWidth="4" /><path d="M11 9 H131 V121 H11 Z" fill="#292f32" />
    <g stroke="#73665a" strokeWidth="6"><path d="M8 48 H136 M8 88 H136" /></g>
    <g fill="#bdb59b"><rect x="18" y="18" width="10" height="28" rx="1" /><rect x="39" y="15" width="7" height="31" /><rect x="89" y="65" width="28" height="5" /><rect x="88" y="72" width="31" height="5" /></g>
    <g fill="#749792"><rect x="30" y="20" width="7" height="26" /><rect x="24" y="58" width="8" height="27" /><rect x="55" y="100" width="28" height="5" /></g>
    <g fill="#b78370"><rect x="49" y="23" width="9" height="23" transform="rotate(-12 53 45)" /><rect x="36" y="64" width="9" height="21" /><rect x="58" y="106" width="29" height="5" /></g>
    <rect x="75" y="17" width="29" height="26" fill="#b7a891" /><rect x="79" y="21" width="21" height="18" fill="#5d7e79" /><circle cx="89" cy="29" r="5" fill="#ddc992" />
    <path d="M99 113 V92 M99 107 Q75 89 94 88 M100 100 Q116 80 120 94" fill="#759b72" stroke="#6c8e68" strokeWidth="2" /><path d="M91 106 H109 L106 120 H95 Z" fill="#b28c70" />
    <rect x="17" y="99" width="27" height="20" rx="2" fill="#7e898c" /><path d="M21 104 H40 M21 111 H40" stroke="#a8aaa0" strokeWidth="1" />
  </svg>
}

export function WindowWall({ wall }: { wall: RoomDesign['wall'] }) {
  const id = useId().replace(/:/g, '')
  return <div className={`room-wall wall-${wall}`} data-component="wall">
    {wall === 'windows' && <div className="window-panes"><div className="skyline" aria-hidden="true">{[45,68,36,87,50,73,42,58,32,63].map((h,i) => <i key={i} style={{ height: `${h}%`, left: `${i*11-4}%`, width: `${i%2 ? 9 : 13}%` }} />)}</div><div className="window-frame" /><div className="window-glint" /></div>}
    {wall === 'panels' && <div className="wall-panels" />}
    {wall === 'brick' && <svg className="wall-bricks" aria-hidden="true"><defs><pattern id={`${id}-bricks`} width="76" height="40" patternUnits="userSpaceOnUse"><path d="M0 0 H76 M0 20 H76 M0 40 H76 M0 0 V20 M38 20 V40 M76 0 V20" fill="none" stroke="#b7a383" strokeOpacity=".35" strokeWidth="1.5" /><path d="M3 3 H72 M3 23 H33 M41 23 H73" stroke="#ebd5a5" strokeOpacity=".1" /></pattern></defs><rect width="100%" height="100%" fill={`url(#${id}-bricks)`} /></svg>}
  </div>
}

export function Pendant() {
  return <svg className="pendant" viewBox="0 0 90 90" aria-hidden="true" data-component="lamp"><path d="M45 0 V31" stroke="#c3b9a0" strokeWidth="1.5" /><path d="M45 24 Q24 27 17 49 Q45 61 74 49 Q66 27 45 24" fill="#47514f" stroke="#929786" /><ellipse cx="45" cy="50" rx="27" ry="5" fill="#ffdaa0" /><path d="M39 30 Q26 33 23 43" stroke="#c0c4a1" fill="none" opacity=".4" /></svg>
}

export function Poster({ theme }: { theme: string }) {
  return <div className={`room-poster poster-${theme}`} aria-hidden="true" data-component="art"><div className="poster-orbit" /><span>MAKE<br />GOOD<br /><em>things.</em></span><small>A LITTLE EVERY DAY</small></div>
}

export function Laptop({ working }: { working: boolean }) {
  return <svg className={`laptop ${working ? 'screen-on' : ''}`} viewBox="0 0 120 85" aria-hidden="true" data-component="computer">
    <path d="M19 8 Q19 4 23 4 H101 Q105 4 105 8 L97 65 H26 Z" fill="#233543" stroke="#83949d" strokeWidth="1.5" /><path d="M24 10 H100 L93 58 H30 Z" fill={working ? '#152d33' : '#263441'} />
    {working ? <g className="screen-code" strokeWidth="2.3" strokeLinecap="round"><path d="M32 20 H47 M36 27 H66 M36 34 H58 M32 42 H45" stroke="#8ac7a4" /><path d="M52 20 H70 M70 27 H86 M63 34 H81 M50 42 H72 M34 49 H53" stroke="#d6b78e" /></g> : <g opacity=".5"><circle cx="62" cy="32" r="11" fill="none" stroke="#9da6ac" /><path d="M69 26 Q58 22 57 32 Q56 40 67 41 Q56 47 50 36 Q44 24 57 20" fill="#a9b8b8" transform="translate(5 0)" /></g>}
    <path d="M26 62 H97 L116 74 Q119 77 111 78 H10 Q3 77 7 74 Z" fill="#8f9fa7" stroke="#546775" /><path d="M32 66 H91 L103 72 H20 Z" fill="#526776" /><path d="M52 74 H73" stroke="#d0d8d2" strokeWidth="1.5" /><circle cx="62" cy="7" r=".7" fill="#b6c1bf" />
  </svg>
}

export function Desk({ material = 'walnut' }: { material?: RoomDesign['desk'] }) {
  const wood = material === 'oak' ? '#bb9270' : material === 'cloud' ? '#adb6ae' : '#826251'
  return <svg className="desk-furniture" viewBox="0 0 230 96" aria-hidden="true" data-component="desk">
    <ellipse cx="115" cy="84" rx="103" ry="9" fill="#122124" opacity=".22" />
    <path d="M33 29 V85 L43 83 L48 29 M185 27 L190 84 H198 L199 28" fill="#303c40" /><path d="M41 32 L47 81 M188 32 L193 81" stroke="#6a7270" strokeWidth="2" />
    <path d="M18 14 L206 14 L224 33 L224 44 Q117 59 5 44 V33 Z" fill="#463e36" /><path d="M22 10 Q113 5 201 10 L224 32 Q120 48 5 32 Z" fill={wood} stroke="#d4b38a" strokeOpacity=".4" /><path d="M10 34 Q119 49 221 34" stroke="#e2c69b" strokeOpacity=".35" strokeWidth="2" />
    <path d="M24 21 Q94 29 151 19 M37 31 Q79 36 113 31 M151 29 L205 24" stroke="#f2cf9f" strokeOpacity=".09" fill="none" />
    <path d="M174 48 H209 V70 H174 Z" fill="#756657" stroke="#3e4442" /><path d="M184 55 H199" stroke="#b4a48e" strokeWidth="2" />
  </svg>
}

export function Mug() {
  return <svg className="desk-mug" viewBox="0 0 42 58" aria-hidden="true" data-component="mug"><path className="coffee-steam" d="M17 24 Q9 14 19 5 M27 23 Q19 14 28 7" fill="none" stroke="#e0d6bc" strokeWidth="1.5" opacity=".3" /><path d="M30 31 Q45 28 40 42 Q36 48 29 44" fill="none" stroke="#aaa793" strokeWidth="4" /><path d="M9 29 H32 V49 Q21 58 9 49 Z" fill="#c3bda1" /><ellipse cx="20" cy="30" rx="11" ry="4" fill="#62675d" /><ellipse cx="20" cy="30" rx="8" ry="2" fill="#53473d" /><path d="M13 36 V48" stroke="#eee3b6" strokeOpacity=".5" strokeWidth="2" /></svg>
}

export function Lounge() {
  return <div className="office-lounge" aria-hidden="true" data-component="lounge">
    <Plant className="lounge-plant" />
    <svg className="lounge-sofa" viewBox="0 0 400 155" data-component="sofa"><ellipse cx="202" cy="140" rx="174" ry="12" fill="#152326" opacity=".3" /><path d="M53 117 L48 141 M338 117 L345 141" stroke="#6b5142" strokeWidth="10" /><rect x="47" y="23" width="297" height="89" rx="25" fill="#52726a" /><rect x="48" y="29" width="295" height="75" rx="24" fill="#648479" /><path d="M147 30 V105 M247 30 V105" stroke="#42665e" strokeWidth="2" /><rect x="42" y="88" width="310" height="44" rx="16" fill="#314f48" /><path d="M55 90 Q103 80 147 91 V112 H55 Z M150 91 Q201 80 246 91 V112 H150 Z M249 91 Q300 80 346 91 V112 H249 Z" fill="#668475" /><rect x="30" y="65" width="36" height="69" rx="15" fill="#52756a" /><rect x="334" y="65" width="36" height="69" rx="15" fill="#52756a" /><path d="M79 55 L117 42 L132 80 L91 88 Z" fill="#c1a87b" /><path d="M273 47 L313 53 L306 88 L268 82 Z" fill="#ac927c" /><path d="M187 51 Q215 40 226 60 L219 92 L183 91 Z" fill="#869b8b" /></svg>
    <div className="lounge-message"><span>ROOM TO THINK.</span><p>Small agents.<br /><em>Big possibilities.</em></p><small>让每一个好想法，都有一起实现的伙伴。</small></div>
    <svg className="lounge-table" viewBox="0 0 200 120" data-component="table"><path d="M42 66 L36 111 M159 66 L166 111" stroke="#484742" strokeWidth="9" /><ellipse cx="100" cy="66" rx="95" ry="29" fill="#55463d" /><ellipse cx="100" cy="59" rx="95" ry="26" fill="#9c7b5e" /><path d="M71 53 L105 48 L125 57 L89 66 Z" fill="#c5b18f" /><path d="M72 50 L107 45 L124 54 L89 63 Z" fill="#617e77" /><rect x="141" y="36" width="13" height="23" rx="4" fill="#bbba9f" /><ellipse cx="148" cy="36" rx="7" ry="3" fill="#596556" /><path d="M148 35 V20 M148 27 Q130 17 138 11 M148 24 Q164 12 164 24" fill="#608166" stroke="#608166" strokeWidth="2" /></svg>
  </div>
}
