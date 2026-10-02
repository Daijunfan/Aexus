import type {ReactNode} from 'react'
import {FileWorkspace} from './FileWorkspace'
import {EmployeeTerminal} from './EmployeeTerminal'

/** Messages never opens a terminal or polls a file tree. The existing workbench remains explicit. */
export function ConversationBody({messages,employee,explorerWidth,terminalHeight,onAttachImage,children}:{messages:boolean;employee:string;explorerWidth?:number;terminalHeight?:number;onAttachImage:(path:string)=>void;children:ReactNode}){
  if(messages)return <div className="message-chat-body">{children}</div>
  return <div className="employee-workbench"><FileWorkspace explorerWidth={explorerWidth} onAttachImage={onAttachImage} key={'files-'+employee} employee={employee}>{children}</FileWorkspace><EmployeeTerminal terminalHeight={terminalHeight} key={'terminal-'+employee} employee={employee}/></div>
}
