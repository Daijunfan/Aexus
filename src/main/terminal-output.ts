/** Bounded UTF-16 cursor history. Append only touches a small tail block, never the whole history. */
export class TerminalOutput {
  cursor=0
  private length=0
  private chunks:string[]=[]
  constructor(private readonly limit=256000){}
  append(data:string){
    if(!data)return
    this.cursor+=data.length
    if(data.length>=this.limit){this.chunks=[data.slice(-this.limit)];this.length=this.limit}
    else{
      const last=this.chunks.length-1
      if(last>=0&&this.chunks[last].length+data.length<=4096)this.chunks[last]+=data
      else this.chunks.push(data)
      this.length+=data.length
      while(this.length>this.limit){
        const excess=this.length-this.limit,first=this.chunks[0]
        if(first.length<=excess){this.chunks.shift();this.length-=first.length}
        else{this.chunks[0]=first.slice(excess);this.length-=excess}
      }
    }
    // Trimming may land between the two UTF-16 units of a supplementary character.
    const first=this.chunks[0]?.charCodeAt(0)
    if(first>=0xdc00&&first<=0xdfff){this.chunks[0]=this.chunks[0].slice(1);this.length--;if(!this.chunks[0])this.chunks.shift()}
  }
  read(cursor=0){
    const start=this.cursor-this.length,reset=cursor<start
    let skip=Math.max(0,cursor-start)
    if(skip>=this.length)return {output:'',cursor:this.cursor,reset}
    const result:string[]=[]
    for(const chunk of this.chunks){if(skip>=chunk.length)skip-=chunk.length;else{result.push(skip?chunk.slice(skip):chunk);skip=0}}
    return {output:result.join(''),cursor:this.cursor,reset}
  }
}
