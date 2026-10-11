import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import ts from 'typescript'
const root=path.resolve(import.meta.dirname,'..'),catalogFile=path.join(root,'src/renderer/src/i18n/zh-CN.ts'),raw=fs.readFileSync(catalogFile,'utf8'),catalog=JSON.parse(raw.slice(raw.indexOf('= ')+2)),aliases=new Set(Object.values(catalog).map(value=>value.replace(/\s+/g,' ').trim()))
for(const [key,value] of Object.entries(catalog)){assert.ok(value.trim(),key+' has no Chinese copy');assert.deepEqual((value.match(/\{\d+\}/g)??[]).sort(),(key.match(/\{\d+\}/g)??[]).sort(),key+' loses an interpolation value')}
const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory()&&!['assets','i18n'].includes(entry.name))walk(path.join(dir,entry.name));else if(entry.isFile()&&/\.tsx?$/.test(entry.name))files.push(path.join(dir,entry.name))}}walk(path.join(root,'src/renderer/src'))
let calls=0,localizedOptions=0
for(const file of files){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 const visit=node=>{
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='uiText'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){const key=node.arguments[0].text.replace(/\s+/g,' ').trim();assert.ok(catalog[key]!==undefined||aliases.has(key),'Missing translation: '+key+' in '+path.relative(root,file));calls++}
  if(ts.isJsxAttribute(node)&&node.initializer&&ts.isJsxExpression(node.initializer)&&['key','value'].includes(node.name.getText(source)))assert.ok(!node.initializer.expression?.getText(source).startsWith('uiText('),'Do not translate identity or value attributes in '+path.relative(root,file))
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(source)==='option'&&node.children.some(child=>ts.isJsxExpression(child)&&child.expression?.getText(source).includes('uiText('))){assert.ok(node.openingElement.attributes.properties.some(attr=>attr.name?.getText(source)==='value'),'Translated option must preserve an explicit API value in '+path.relative(root,file));localizedOptions++}
  ts.forEachChild(node,visit)
 };visit(source)
}
assert.ok(calls>1000);console.log(`PASS interface copy: ${Object.keys(catalog).length} translations, ${calls} literal call sites, preserved interpolation values and ${localizedOptions} explicit translated select values`)
