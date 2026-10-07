'use strict';
const {folded}=require('./literal-links.cjs');
// Offsets returned to the reader always address the original UTF-16 content.
function* literalMatches(text,query,caseSensitive=false){
  const normalized=folded(text,caseSensitive),term=caseSensitive?query:query.toLocaleLowerCase();
  if(!term)return;
  let from=0,last=-1;
  while(from<normalized.value.length){
    const at=normalized.value.indexOf(term,from);if(at<0)return;
    const end=at+term.length,startOriginal=normalized.start?normalized.start[at]:at,endOriginal=normalized.end?normalized.end[end-1]:end;
    if(startOriginal>last){yield {start:startOriginal,end:endOriginal};last=startOriginal;}
    from=end;
  }
}
function firstLiteral(text,query,caseSensitive=false){return literalMatches(text,query,caseSensitive).next().value||null;}
module.exports={literalMatches,firstLiteral};
