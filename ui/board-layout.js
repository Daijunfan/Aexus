// Equal columns and a shared content height keep every visual row aligned.
export function boardRows(entries,group,columns){
  const rows=[]
  for(let start=0;start<entries.length;start+=columns){
    const row=entries.slice(start,start+columns)
    const height=Math.max(...row.map(({host})=>group.sizes[host.id]?.height??group.osHeights?.[host.distribution]??group.osHeights?.[host.os]??group.cardHeight))
    rows.push({entries:row,height})
  }
  return rows
}
