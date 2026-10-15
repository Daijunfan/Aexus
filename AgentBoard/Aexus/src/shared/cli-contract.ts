/** Optional CLI spellings belong to the same command as its public input schema. */
export type CliSpec={
  positionals?:string[]
  aliases?:Partial<Record<string,string>>
  defaults?:Record<string,unknown>
  required?:string[]
  truthy?:string[]
  booleanValues?:string[]
  rawPositionals?:boolean
}|string[]
export type CliField=[name:string,source:string|number,type:'text'|'number'|'boolean'|'boolean-value'|'json',required:boolean,truthy:boolean]
export type CliInput={fields:CliField[];defaults?:Record<string,unknown>;rawPositionals?:boolean}
export function compileCliInputs(commands:readonly {name:string;cli?:CliSpec;inputSchema?:Record<string,any>}[]):Record<string,CliInput>{
  return Object.fromEntries(commands.filter(command=>command.cli).map(command=>{
    const cli=command.cli!
    // Compact declarations preserve literal positional values on older commands.
    if(Array.isArray(cli))return [command.name,{fields:cli.map((name,index):CliField=>[name,index,'text',false,false]),rawPositionals:true}]
    const properties=command.inputSchema?.properties
    if(!properties)throw Error('CLI command requires an object input schema: '+command.name)
    for(const name of [...(cli.positionals??[]),...Object.keys(cli.aliases??{}),...Object.keys(cli.defaults??{}),...(cli.required??[]),...(cli.truthy??[]),...(cli.booleanValues??[])]){
      if(!Object.hasOwn(properties,name))throw Error('Unknown CLI field '+command.name+'.'+name)
    }
    const fields=Object.entries(properties).map(([name,raw]):CliField=>{
      const schema=raw as Record<string,any>,position=cli.positionals?.indexOf(name)??-1
      const source=position<0?cli.aliases?.[name]??name.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase()):position
      const types=Array.isArray(schema.type)?schema.type:[schema.type]
      const type=cli.booleanValues?.includes(name)?'boolean-value':types.includes('object')||types.includes('array')||schema.oneOf||schema.anyOf?'json':types.includes('integer')||types.includes('number')?'number':types.includes('boolean')||typeof schema.const==='boolean'?'boolean':'text'
      return [name,source,type,!!cli.required?.includes(name),!!cli.truthy?.includes(name)]
    })
    return [command.name,{fields,...(cli.defaults?{defaults:cli.defaults}:{}),...(cli.rawPositionals?{rawPositionals:true}:{})}]
  }))
}
