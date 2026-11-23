import {scheduleContentUnlockAt} from './schedule-public-content';
import {loadOwnerCalendarPlans} from './calendar-storage';
import {loadCharacters} from './character-storage';
import {calendarWallTimeToInstant} from './calendar-time';
import {getSystemTimeZone} from './character-time';
export function lysnCalendarContext(id:string, now=Date.now()) {
 const c=loadCharacters().find(c=>c.id===id),zone=c?.timeZone||getSystemTimeZone();
 const rows=loadOwnerCalendarPlans('character',id).flatMap(p=>p.items).map(item=>{const start=calendarWallTimeToInstant(item.date,item.startTime,zone);let end=calendarWallTimeToInstant(item.date,item.endTime||item.startTime,zone);if(end<=start)end+=86400000;return {item,start,end};}).sort((a,b)=>a.start-b.start);
 const active=rows.filter(r=>r.item.kind!=='milestone'&&r.start<=now&&now<r.end);
 const level=Math.max(1,...active.map(r=>r.item.busyLevel??(r.item.source==='manual'?1:3)));
 const selected=rows.filter(r=>r.start>=now-7*86400000&&r.start<=now+86400000).slice(-24);
 const summary=selected.map(({item:i,start})=>{const publicTitle=i.visibility==='public';const unlock=publicTitle&&now>=scheduleContentUnlockAt(i,zone);return `${i.date} ${i.startTime}–${i.endTime} ${publicTitle?i.title:'未公开安排（仅本人参考）：'+i.title}；${unlock?'已解锁公开内容：'+(i.contentDescription||'无额外内容'):'具体内容未公开，禁止泄露项目名、地点、细节；仅允许不识别项目的笼统工作近况'}${i.busyLevel?'；忙闲等级'+i.busyLevel:''}`;}).join('\n');
 return {level,canRead:level<4,canSend:level<3,summary};
}
