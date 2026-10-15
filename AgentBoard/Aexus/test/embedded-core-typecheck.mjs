// Core typecheck independent of the UI-owned Guardian migration.
import path from 'node:path'
import ts from 'typescript'
const root=path.resolve(import.meta.dirname,'..')
const configPath=path.join(root,'tsconfig.json')
const config=ts.readConfigFile(configPath,ts.sys.readFile)
if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\\n'))
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root)
const files=parsed.fileNames.filter(file=>file.includes('/src/main/')||file.includes('/src/shared/'))
const program=ts.createProgram({rootNames:files,options:{...parsed.options,noEmit:true}})
const errors=[...parsed.errors,...ts.getPreEmitDiagnostics(program)]
if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>root,getNewLine:()=> '\\n'}));process.exitCode=1}
else console.log('PASS Core TypeScript: '+files.length+' root files, 0 diagnostics; excluded 04-ui renderer')
