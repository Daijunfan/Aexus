import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
export function SessionTitle({title,onOpen}:{title:string;onOpen?:()=>void}) {
  useI18n()

  return <span className="session-title" onClick={e=>e.stopPropagation()}>
    {onOpen?<button className="session-title-label" title={title} onClick={onOpen}>{title}</button>:<span className="session-title-label" title={uiText("The name cannot be changed after creation")}>{title}</span>}
  </span>
}
