import type {ReactNode,CSSProperties} from 'react'
import {Icon} from '../components/Icon'
import {translate as uiText} from '../i18n'
import {mediaTime} from './mediaPresentation'

type Props={state:{current:number;duration:number;buffered:number;playing:boolean;loading:boolean;rate:number;volume:number;muted:boolean};controls:{toggle:()=>void;seek:(value:number)=>void;speed:()=>void;mute:()=>void;volume:(value:number)=>void};status:string;seekable?:boolean;playDisabled?:boolean;children?:ReactNode;volumeActions?:ReactNode}

/** Presentation only: the inline element or background player retains playback ownership. */
export function MediaControls({state,controls,status,seekable=true,playDisabled=false,children,volumeActions}:Props){
 const {current,duration,buffered,playing,loading,rate,volume,muted}=state
 return <>
  <div className="message-media-controls">
   <button className="message-media-play" aria-label={uiText(playing?'Pause media':'Play media')} title={uiText(playing?'Pause media':'Play media')} disabled={playDisabled} onClick={controls.toggle}><Icon name={loading?'loading':playing?'debug-pause':'play'}/></button>
   <div className="message-media-timeline"><label className="message-media-progress" style={{'--played':(duration?current/duration*100:0)+'%','--buffered':(duration?buffered/duration*100:0)+'%'} as CSSProperties}><input type="range" min={0} max={duration||1} step={.1} value={Math.min(current,duration||1)} disabled={!seekable||!duration} aria-label={uiText('Playback position')} aria-valuetext={uiText('{0} elapsed, {1} total',[mediaTime(current),mediaTime(duration)])} onChange={event=>controls.seek(Number(event.target.value))}/></label><span><output aria-label={uiText('Elapsed time')}>{mediaTime(current)}</output><output aria-label={uiText('Media duration')}>{duration?mediaTime(duration):'—'}</output></span></div>
   <button className="message-media-rate" aria-label={uiText('Playback speed {0}',[rate+'×'])} title={uiText('Change playback speed')} onClick={controls.speed}><span>{rate}×</span></button>{children}
  </div>
  <div className="message-media-volume"><button aria-label={uiText(muted?'Unmute media':'Mute media')} title={uiText(muted?'Unmute media':'Mute media')} onClick={controls.mute}><Icon name={muted||volume===0?'mute':'unmute'}/></button><input type="range" min={0} max={1} step={.05} value={muted?0:volume} aria-label={uiText('Media volume')} onChange={event=>controls.volume(Number(event.target.value))}/><span role="status">{uiText(status)}</span>{volumeActions}</div>
 </>
}
