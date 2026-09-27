import {useEffect,useState,type ReactNode} from 'react'
import {initializeWeb,onWebState,loginWeb,logoutWeb} from './transport'
export function WebGate({children}:{children:ReactNode}){
  const [state,setState]=useState({authenticated:false,checking:true,connected:false})
  const [opened,setOpened]=useState(false),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{
    const off=onWebState(value=>{setState(value);if(value.authenticated)setOpened(true)})
    void initializeWeb();return off
  },[])
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('')
    try{await loginWeb(token);setToken('')}catch(cause){setError((cause as Error).message)}finally{setBusy(false)}
  }
  return <>
    {opened&&children}
    {state.authenticated?
      <div className="web-connection" role="status">{state.connected?'已连接后端':'正在重新连接 · 任务仍在后端运行'}<button onClick={()=>void logoutWeb()}>退出登录</button></div>:
      <div className="web-login-overlay"><form className="web-login" onSubmit={submit}>
        <div className="brand-symbol" aria-hidden="true"><i/><i/><i/><i/></div>
        <h1>Agents Company</h1><p>连接自己的 Agent 工作空间。</p>
        {state.checking?<p>正在连接…</p>:<>
          <label>访问令牌<input type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} autoFocus required/></label>
          <small>在后端机器运行 <code>agents web token</code> 获取令牌。令牌仅用于建立会话，不保存在浏览器本地存储。</small>
          {error&&<p role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{busy?'正在登录…':'进入工作空间'}</button>
        </>}
      </form></div>}
  </>
}
