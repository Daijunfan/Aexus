import {Icon} from './Icon'
import {translate as uiText} from '../i18n'
/** Shared location and hit area; the caller owns the actual return destination. */
export function BackButton({onClick,label='Back to conversation',ariaLabel,disabled=false,className=''}:{onClick:()=>void;label?:string;ariaLabel?:string;disabled?:boolean;className?:string}){
 return <button type="button" className={'employee-back '+className} aria-label={uiText(ariaLabel??label)} title={uiText(label)} disabled={disabled} onClick={onClick}><Icon name="arrow-left"/><span>{uiText('Back')}</span></button>
}
