export function SessionTitle({title,onOpen}:{title:string;onOpen?:()=>void}) {
  return <span className="session-title" onClick={e=>e.stopPropagation()}>
    {onOpen?<button className="session-title-label" title={title} onClick={onOpen}>{title}</button>:<span className="session-title-label" title="名称创建后不可修改">{title}</span>}
  </span>
}
