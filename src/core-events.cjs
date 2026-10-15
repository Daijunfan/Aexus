// Authenticated local event stream carries only entity IDs and lifecycle hints.
// The authoritative content stays behind the usual Core read APIs.
const subscribers=new Set();
let seq=0;
function publish(kind,details={}){
 const item={seq:++seq,kind,at:Date.now(),...details};
 for(const listener of subscribers){try{listener(item)}catch(error){console.error('CloudHosts event subscriber:',error.message)}}
 return item;
}
function subscribe(listener){subscribers.add(listener);return ()=>subscribers.delete(listener)}
module.exports={publish,subscribe};
