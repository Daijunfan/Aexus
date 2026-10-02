'use strict';
const {assert}=require('./safety.cjs');
const FIELDS=new Set(['title','text','note','tag','color','path','type','category']);
/** A bounded literal Boolean grammar. No user-provided regular expressions execute. */
function compile(input,{caseSensitive=false}={}){
 assert(typeof input==='string'&&input.trim()&&input.length<=1000,'INVALID_PARAMS','Search needs 1–1000 characters.');
 const tokens=[];let at=0;
 while(at<input.length){
  if(/\s/u.test(input[at])){at++;continue;}
  const c=input[at];if(c==='('||c===')'){tokens.push({type:c});at++;continue;}
  if(c==='-'||c==='!'){tokens.push({type:'NOT'});at++;continue;}
  let field='',value='',quoted=false;const begin=at;while(at<input.length&&/[A-Za-z]/.test(input[at]))at++;
  if(input[at]===':'){field=input.slice(begin,at).toLowerCase();assert(FIELDS.has(field),'INVALID_QUERY',`Unknown search field: ${field}`);at++;}else at=begin;
  if(input[at]==='"'){quoted=true;at++;let closed=false;while(at<input.length){const ch=input[at++];if(ch==='"'){closed=true;break;}if(ch==='\\'&&at<input.length)value+=input[at++];else value+=ch;}assert(closed,'INVALID_QUERY','Unclosed quoted phrase.');}
  else while(at<input.length&&!/[\s()]/u.test(input[at]))value+=input[at++];
  assert(value,'INVALID_QUERY','A search term is missing.');
  tokens.push(!quoted&&!field&&['AND','OR','NOT'].includes(value.toUpperCase())?{type:value.toUpperCase()}:{type:'term',field,value:caseSensitive?value:value.toLocaleLowerCase()});
  assert(tokens.length<=128,'INVALID_QUERY','Search contains too many terms.');
 }
 let cursor=0;const terms=[];
 function primary(depth,negated=false){assert(depth<=16,'INVALID_QUERY','Search nesting exceeds 16 levels.');const token=tokens[cursor++];assert(token,'INVALID_QUERY','Search expression is incomplete.');
  if(token.type==='NOT'){const test=primary(depth+1,!negated);return row=>!test(row);}
  if(token.type==='('){const test=or(depth+1,negated);assert(tokens[cursor++]?.type===')','INVALID_QUERY','Unmatched search parenthesis.');return test;}
  assert(token.type==='term','INVALID_QUERY','Expected a literal search term.');terms.push({...token,negated});
  return row=>{const values=token.field==='tag'?row.tags||[]:token.field?[row[token.field]??'']:[row.title,row.text,row.note,row.path,row.category,...row.tags||[]];return values.some(value=>(caseSensitive?String(value??''):String(value??'').toLocaleLowerCase()).includes(token.value));};
 }
 function and(depth,negated=false){let left=primary(depth,negated);while(cursor<tokens.length&&!['OR',')'].includes(tokens[cursor].type)){if(tokens[cursor].type==='AND')cursor++;const right=primary(depth,negated),previous=left;left=row=>previous(row)&&right(row);}return left;}
 function or(depth,negated=false){let left=and(depth,negated);while(tokens[cursor]?.type==='OR'){cursor++;const right=and(depth,negated),previous=left;left=row=>previous(row)||right(row);}return left;}
 const matches=or(0);assert(cursor===tokens.length,'INVALID_QUERY','Unexpected search token.');return {matches,terms};
}
module.exports={compile};
