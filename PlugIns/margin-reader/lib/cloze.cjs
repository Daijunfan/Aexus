'use strict';
const {assert}=require('./safety.cjs');
/** UTF-16 ranges match document selections. Legacy {{answer}} remains one group. */
function parse(value) {
  assert(typeof value==='string'&&value.length<=20000,'INVALID_PARAMS','Cloze text exceeds 20000 characters.');
  if(!value)return {text:'',groups:[],tokens:[],plain:''};
  const tokens=[];
  for(const m of value.matchAll(/\{\{(?:c([1-9]\d{0,2})::)?([^{}]+)\}\}/g)) {
    const [answer,...hint]=m[2].split('::');
    assert(answer.trim(),'INVALID_PARAMS','A cloze answer cannot be empty.');
    tokens.push({start:m.index,end:m.index+m[0].length,group:m[1]?'c'+m[1]:'cloze',answer,hint:hint.join('::')});
  }
  assert(tokens.length>0&&tokens.length<=200,'INVALID_PARAMS','Mark 1–200 answers with {{answer}} or {{c1::answer::hint}}.');
  const groups=[...new Set(tokens.map(t=>t.group))];
  assert(groups.length<=100,'INVALID_PARAMS','Use at most 100 cloze groups.');
  const result={text:value,groups,tokens};result.plain=render(result,null,true);return result;
}
function render(parsed,group=null,revealed=false) {
  let text='',end=0;
  for(const token of parsed.tokens) {
    text+=parsed.text.slice(end,token.start);
    text+=revealed||group&&token.group!==group?token.answer:`[ ${token.hint||'…'} ]`;
    end=token.end;
  }
  return text+parsed.text.slice(end);
}
function renderGroups(parsed,groups){const shown=new Set(groups);let text='',end=0;for(const token of parsed.tokens){text+=parsed.text.slice(end,token.start)+(shown.has(token.group)?token.answer:`[ ${token.hint||'…'} ]`);end=token.end;}return text+parsed.text.slice(end);}
module.exports={parse,render,renderGroups};
