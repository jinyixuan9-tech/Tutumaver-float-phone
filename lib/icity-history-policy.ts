import type { MemoryEntry } from './memory-types';
import type { Visibility } from './icity-store';
import type { NativeTimelineEntry } from './short-term-assembler';
export type HistoryScope = 'world' | 'friends' | 'private';
export type CityHistoryResult = {total:number;world:number;friends:number;private:number;entryIds:string[];authors:string[]};
/** Assign the audience before writing, rather than republishing a private draft. */
export function planCityHistoryScopes(count:number,friend:boolean,random=Math.random):HistoryScope[]{
 const scopes:HistoryScope[]=count>0?['world']:[];
 if(count>1)scopes.push(friend?'friends':'world');
 while(scopes.length<count){const v=(['world','friends','private'] as const)[Math.min(2,Math.floor(random()*3))];scopes.push(v==='friends'&&!friend?'world':v);}
 for(let i=scopes.length-1;i>0;i--){const j=Math.min(i,Math.floor(random()*(i+1)));[scopes[i],scopes[j]]=[scopes[j],scopes[i]];}
 return scopes;
}
function datedEnd(value:unknown):number{
 if(typeof value==='number')return value;
 if(typeof value!=='string'||!value)return NaN;
 const month=/^(\d{4})-(\d{2})$/.exec(value);
 if(month)return +month[2]>=1&&+month[2]<=12?new Date(+month[1],+month[2],1).getTime()-1:NaN;
 const d=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 return d?new Date(+d[1],+d[2]-1,+d[3]+1).getTime()-1:Date.parse(value);
}
/** Newer summaries may supply old dated segments, never their mixed future paragraphs. */
export function cityHistoricalMemory(entry:MemoryEntry,cutoff:number){
 const segments=entry.metadata?.summarySegments;
 if(Array.isArray(segments)&&segments.length){
  const kept=segments.filter(s=>{const end=datedEnd(s?.occurredTo||s?.occurredFrom),start=datedEnd(s?.occurredFrom||s?.occurredTo);return typeof s?.content==='string'&&Number.isFinite(end)&&Number.isFinite(start)&&start<=end&&end<cutoff;});
  if(!kept.length)return null;
  return {text:kept.map(s=>s.content).join('\n').slice(0,12000),date:kept.map(s=>String(s.occurredTo||s.occurredFrom)).sort().at(-1)!,type:entry.type,backgroundOnly:false};
 }
 const spanDates=String(entry.metadata?.timeSpan||'').match(/20\d{2}-\d{2}-\d{2}/g)||[];
 const boundedDate=entry.metadata?.occurredTo||entry.metadata?.eventDate||spanDates.at(-1);
 // An archive written later is usable when its complete event range is demonstrably old.
 if(boundedDate){const end=datedEnd(boundedDate),start=datedEnd(entry.metadata?.occurredFrom||spanDates[0]||boundedDate);if(!Number.isFinite(end)||!Number.isFinite(start)||start>end||end>=cutoff)return null;return {text:entry.content.slice(0,12000),date:String(boundedDate),type:entry.type,backgroundOnly:false};}
 const created=datedEnd(entry.createdAt),updated=datedEnd(entry.updatedAt||entry.createdAt),occurred=entry.metadata?.occurredFrom;
 if(!Number.isFinite(created)||!Number.isFinite(updated)||created>=cutoff||updated>=cutoff)return null;
 if(occurred&&(!Number.isFinite(datedEnd(occurred))||datedEnd(occurred)>=cutoff))return null;
 return {text:entry.content.slice(0,12000),date:String(occurred||entry.createdAt),type:entry.type,backgroundOnly:!occurred};
}
export function cityHistoricalTimeline(entries:NativeTimelineEntry[],author:string,cutoff:number){
 return entries.filter(e=>{const at=Date.parse(e.timestamp),end=e.occurredTo?datedEnd(e.occurredTo):at;return Number.isFinite(at)&&Number.isFinite(end)&&at<cutoff&&end<cutoff&&(!e.knownByCharacterIds?.length||e.knownByCharacterIds.includes(author));}).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
}
export function countCityHistory(entries:{id:string;author:string;visibility:Visibility}[]):CityHistoryResult{
 return {total:entries.length,world:entries.filter(e=>e.visibility==='world').length,friends:entries.filter(e=>e.visibility==='friends').length,private:entries.filter(e=>e.visibility==='private').length,entryIds:entries.map(e=>e.id),authors:[...new Set(entries.map(e=>e.author))]};
}
export function cityHistorySummary(r:CityHistoryResult){return `补写${r.total}篇：公开${r.world}、好友可读${r.friends}、私密${r.private}`;}
