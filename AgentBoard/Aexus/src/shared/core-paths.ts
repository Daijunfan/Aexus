import {homedir} from 'node:os'
import {join,isAbsolute,resolve} from 'node:path'
import {controlEndpoint} from '../../bin/platform.cjs'

// Runtime locations must not pull the command catalogue or Markdown stack into workers.
const configuredHome=process.env.AGENTS_COMPANY_HOME
const legacyHome=join(homedir(),'AgentsCompany')
// CloudHosts must set the private data home BEFORE importing any Aexus module.
if(process.env.AGENTS_COMPANY_EMBEDDED==='1'&&(!configuredHome||!isAbsolute(configuredHome)||resolve(configuredHome)===legacyHome))
  throw Object.assign(Error('Embedded Aexus requires a private AGENTS_COMPANY_HOME outside ~/AgentsCompany'),{code:'EMBEDDED_HOME_REQUIRED'})
export const APP_HOME=configuredHome||legacyHome
export const SOCKET_PATH=controlEndpoint(APP_HOME)
