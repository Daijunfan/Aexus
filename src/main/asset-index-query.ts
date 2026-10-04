type Binding={source:{id:string};prefix:string}
/** Parameterized index predicates. Membership lists are resolved by Core, not supplied by a client. */
export function assetIndexQuery(args:Record<string,any>,sources:{id:string;remote?:boolean}[],bindings:Map<string,Binding>){
 const clauses:string[]=[],values:any[]=[]
 if(!args.hidden)clauses.push('hidden=0')
 if(args.query){clauses.push("(name LIKE ? ESCAPE '!' OR path LIKE ? ESCAPE '!' OR owner LIKE ? ESCAPE '!')");const needle='%'+String(args.query).replace(/[!%_]/g,'!$&')+'%';values.push(needle,needle,needle)}
 if(args.view){clauses.push("json_extract(owner,'$.view')=?");values.push(args.view)}
 if(args.conversation){clauses.push("json_extract(owner,'$.conversation')=?");values.push(args.conversation)}
 const shared=()=>{const ids:string[]=args.sharedConversations??[];return {sql:ids.length?"(json_extract(owner,'$.employee') IS NULL AND json_extract(owner,'$.conversation') IN ("+ids.map(()=>'?').join(',')+'))':'0',values:ids}}
 if(args.team){const also=shared();clauses.push("(json_extract(owner,'$.team')=? OR "+also.sql+')');values.push(args.team,...also.values)}
 if(args.employee){const also=shared();clauses.push("(json_extract(owner,'$.employee')=? OR "+also.sql+" OR (json_extract(owner,'$.employee') IS NULL AND json_extract(owner,'$.conversation') IS NULL AND json_extract(owner,'$.team')=?))");values.push(args.employee,...also.values,args.employeeTeam??'')}
 if(args.kind&&args.kind!=='all'){clauses.push('kind=?');values.push(args.kind)}
 if(args.storage){const ids=sources.filter(root=>args.storage==='remote'?root.remote:args.storage==='local'?!root.remote:false).map(root=>root.id);clauses.push(ids.length?'root IN ('+ids.map(()=>'?').join(',')+')':'0');values.push(...ids)}
 const scopes=args.scopes??(args.root?[{id:args.root,path:'.'}]:undefined)
 if(scopes){const terms:string[]=[];for(const scope of scopes){const binding=bindings.get(scope.id);if(!binding)continue;const prefix=[binding.prefix,scope.path==='.'?'':scope.path].filter(Boolean).join('/');if(prefix){terms.push('(root=? AND substr(path,1,?)=?)');values.push(binding.source.id,prefix.length+1,prefix+'/')}else{terms.push('root=?');values.push(binding.source.id)}}clauses.push(terms.length?'('+terms.join(' OR ')+')':'0')}
 const order=args.sort==='modified'?'modified DESC,name COLLATE NOCASE,root,path':args.sort==='size'?'bytes DESC,name COLLATE NOCASE,root,path':'name COLLATE NOCASE,root,path'
 return {where:clauses.length?' WHERE '+clauses.join(' AND '):'',values,order}
}
