import {useEffect,useState} from 'react'
import type {NoticeReceipt} from '../../../shared/conversation-controls'
import {api} from '../api'
import {Icon} from './Icon'
import {translate as t,useI18n} from '../i18n'
import '../styles/conversation-controls.css'

export function ConversationNoticeBadge({notice}:{notice?:NoticeReceipt}){
 useI18n();return notice?<span className="conversation-notice-badge" data-static-notice={notice.noticeId} title={t('Automatic publication of saved text. No Agent task was executed.')}><Icon name={notice.silent?'bell-slash':'bell'}/>{t('Scheduled notice')}{notice.silent?' · '+t('Quiet'):''}</span>:null
}
/** Attention only. It never marks a message read or triggers work; silent notices raise no event. */
export function ConversationNoticeToast(){
 useI18n();const [notice,setNotice]=useState<{name:string;messageId:string}|null>(null)
 useEffect(()=>api.onEvent(event=>{if(event.channel==='conversation:notification')setNotice(event.payload)}),[])
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),8000);return()=>clearTimeout(timer)},[notice])
 return notice?<aside className="conversation-notice-toast" role="status"><Icon name="bell"/><span><strong>{notice.name}</strong><small>{t('A scheduled notice was posted.')}</small></span><button aria-label={t('Dismiss notification')} onClick={()=>setNotice(null)}><Icon name="close"/></button></aside>:null
}
