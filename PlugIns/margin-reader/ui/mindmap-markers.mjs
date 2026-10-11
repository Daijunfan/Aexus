import {SYMBOL_PATHS} from './mindmap-view.mjs';
import {escapeXml as E} from './mindmap-style.mjs';
// Vector counterparts of the live topic badges, used by printable exports.
export function markerSvg(style,width,y,ink,paper){
 const markers=[];
 if(style.priority)markers.push(`<rect width="19" height="19" rx="5" fill="#D7735E"/><text x="9.5" y="13" text-anchor="middle" fill="#FFFFFF" font-family="system-ui" font-size="11" font-weight="700">${style.priority}</text>`);
 if(style.progress!==undefined){const c=2*Math.PI*8.5;markers.push(`<circle cx="10.5" cy="10.5" r="8.5" fill="${paper}" stroke="#8B98AF" stroke-opacity="0.333333" stroke-width="4"/><circle cx="10.5" cy="10.5" r="8.5" fill="none" stroke="${style.accent||ink}" stroke-width="4" stroke-dasharray="${c*style.progress/100} ${c}" transform="rotate(-90 10.5 10.5)"/><text x="10.5" y="13.3" text-anchor="middle" fill="${ink}" font-family="system-ui" font-size="7.5">${style.progress}</text>`);}
 const symbol=(id,color)=>`<svg width="20" height="20" viewBox="0 0 24 24"><path d="${SYMBOL_PATHS[id]}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
 if(style.status&&style.status!=='none')markers.push(symbol(style.status==='done'?'check':style.status==='blocked'?'warning':'clock',style.status==='done'?'#4A9D74':style.status==='blocked'?'#C76860':ink));
 if(style.symbol)markers.push(symbol(style.symbol,ink));
 if(style.flagColor)markers.push(`<path d="M4 2V20 M4 3 Q10 0 17 3 V13 Q10 10 4 13" fill="${style.flagColor}" stroke="${style.flagColor}" stroke-width="1.5"/>`);
 const start=(width-(markers.length*21+Math.max(0,markers.length-1)*6))/2;
 return markers.map((v,i)=>`<g data-topic-marker="${i}" transform="translate(${start+i*27} ${y})">${v}</g>`).join('');
}
