'use strict';
// A per-render literal trie: all dictionary entries are considered, without
// running a regular expression or rescanning every title for every text node.
const word = /[\p{L}\p{N}_]/u;
function before(text,index){if(index<=0)return '';const end=text.charCodeAt(index-1);return end>=0xdc00&&end<=0xdfff&&index>1?text.slice(index-2,index):text[index-1];}
function after(text,index){return index>=text.length?'':String.fromCodePoint(text.codePointAt(index));}
function folded(text,sensitive){
  if(sensitive)return {value:text,start:null,end:null};
  const value=text.toLocaleLowerCase();
  if(value.length===text.length)return {value,start:null,end:null};
  // Some lower-case mappings expand (for example U+0130). Match in the folded
  // string, but slice only at the original UTF-16 boundaries.
  const start=[],end=[];let source=0;
  for(const char of text){const n=char.toLocaleLowerCase().length;for(let i=0;i<n;i++){start.push(source);end.push(source+char.length);}source+=char.length;}
  return {value,start,end};
}
function createMatcher(rows,settings={}){
  const root=new Map(),groups=new Map();
  for(const row of rows){const key=settings.caseSensitive?row.title:row.title.toLocaleLowerCase();if(!groups.has(key))groups.set(key,new Map());groups.get(key).set(row.setId+'/'+row.cardId,row);}
  for(const [term,targets] of groups){let node=root;for(let i=0;i<term.length;i++){const ch=term[i];if(!node.has(ch))node.set(ch,new Map());node=node.get(ch);}
    node.match={targets:[...targets.values()],whole:settings.wholeWords===true&&/^[\p{L}\p{N}_]+$/u.test(term)&&/[a-zA-Z]/.test(term)};
  }
  return {size:groups.size,*matches(original){
    const {value,start,end}=folded(original,settings.caseSensitive),visited=new Set();
    for(let at=0;at<value.length;){let node=root,best=null;
      for(let i=at;i<value.length;i++){
        node=node.get(value[i]);if(!node)break;
        if(node.match){const first=start?start[at]:at,last=end?end[i]:i+1;
          if(!node.match.whole||(!word.test(before(original,first))&&!word.test(after(original,last))))best={at:first,end:last,targets:node.match.targets,foldedEnd:i+1};
        }
      }
      if(best&&!visited.has(best.at)){visited.add(best.at);yield {at:best.at,end:best.end,targets:best.targets};at=best.foldedEnd;}
      else at++;
    }
  }};
}
module.exports={createMatcher,folded};
