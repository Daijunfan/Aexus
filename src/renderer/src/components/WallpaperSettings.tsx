import type {CSSProperties} from 'react'
import {DEFAULT_MESSAGE_WALLPAPER,WALLPAPER_PATTERNS,type MessageWallpaperSettings} from '../../../shared/message-wallpaper'
import {readableThemeAccent,type ViewAppearance} from '../../../shared/preferences'
import {MessageWallpaper} from '../chat/MessageWallpaper'
import {translate as uiText} from '../i18n'
import {Icon} from './Icon'
import '../styles/wallpaper-settings.css'

const labels={daydream:'Daydream',botanical:'Botanical',cosmos:'Cosmos',studio:'Studio',geometric:'Geometry',none:'No pattern'}
export function WallpaperSettings({value,appearance,onChange}:{value:MessageWallpaperSettings;appearance:ViewAppearance;onChange:(patch:Partial<MessageWallpaperSettings>,delay?:number)=>void}){
 const palette=`theme-sample sample-${appearance.theme}`,style={'--custom-theme-color':appearance.themeColor,'--custom-theme-accent':readableThemeAccent(appearance.themeColor)} as CSSProperties
 return <section className="wallpaper-settings" aria-label={uiText('Chat wallpaper')}>
  <div className="settings-section-heading"><h3>{uiText('Chat wallpaper')}</h3><button type="button" onClick={()=>onChange(DEFAULT_MESSAGE_WALLPAPER)}>{uiText('Reset wallpaper')}</button></div>
  <p className="wallpaper-help">{uiText('Small details, a quieter conversation. Applies to private chats, groups and channels.')}</p>
  <div className={`wallpaper-preview ${palette}`} style={style} role="img" aria-label={uiText('Chat wallpaper preview')}>
   <MessageWallpaper settings={value}/><div className="wallpaper-preview-caption"><Icon name="eye"/>{uiText('Live preview')}</div>
   <div className="wallpaper-preview-bubbles"><span>{uiText('A little room for good ideas.')}<small>10:24</small></span><span>{uiText('Make it feel like you.')}<small>10:25 <Icon name="check-all"/></small></span></div>
  </div>
  <div className="wallpaper-patterns" role="group" aria-label={uiText('Pattern collection')}>{WALLPAPER_PATTERNS.map(pattern=><button type="button" key={pattern} data-pattern-option={pattern} aria-label={uiText(labels[pattern])} aria-pressed={value.pattern===pattern} onClick={()=>onChange({pattern})}>
   <span className={`wallpaper-swatch ${palette}`} style={style} aria-hidden="true"><MessageWallpaper settings={{...value,pattern,opacity:24,density:130}}/>{pattern==='none'&&<Icon name="circle-slash"/>}</span>
   <span className="wallpaper-pattern-label">{uiText(labels[pattern])}{value.pattern===pattern&&<Icon name="check"/>}</span>
  </button>)}</div>
  <fieldset className="wallpaper-adjustments" disabled={value.pattern==='none'}><legend>{uiText('Pattern arrangement')}</legend>
   <div className="wallpaper-layouts" role="group" aria-label={uiText('Pattern arrangement')}>{(['ordered','scattered'] as const).map(layout=><button type="button" key={layout} data-wallpaper-layout-option={layout} aria-pressed={value.layout===layout} onClick={()=>onChange({layout})}><Icon name={layout==='ordered'?'layout':'sparkle'}/><span>{uiText(layout==='ordered'?'Ordered':'Scattered')}<small>{uiText(layout==='ordered'?'Aligned, even spacing':'Loose, gently rotated')}</small></span><Icon name={value.layout===layout?'pass-filled':'circle-large-outline'}/></button>)}</div>
   <label className="settings-range"><span>{uiText('Pattern density')}<output>{value.density}%</output></span><input name="wallpaper-density" aria-label={uiText('Pattern density')} type="range" min="70" max="160" step="5" value={value.density} onChange={event=>onChange({density:Number(event.target.value)},180)}/><small>{uiText('Higher density makes the drawings smaller and closer together.')}</small></label>
   <label className="settings-range"><span>{uiText('Pattern opacity')}<output>{value.opacity}%</output></span><input name="wallpaper-opacity" aria-label={uiText('Pattern opacity')} type="range" min="0" max="45" step="1" value={value.opacity} onChange={event=>onChange({opacity:Number(event.target.value)},180)}/></label>
  </fieldset>
 </section>
}
