import {homedir} from 'node:os'
import {join} from 'node:path'
import {controlEndpoint} from '../../bin/platform.cjs'

// Runtime locations must not pull the command catalogue or Markdown stack into workers.
export const APP_HOME=process.env.AGENTS_COMPANY_HOME||join(homedir(),'AgentsCompany')
export const SOCKET_PATH=controlEndpoint(APP_HOME)
