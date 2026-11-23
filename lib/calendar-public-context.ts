import {loadCharacters} from './character-storage';
import {loadOwnerCalendarPlans} from './calendar-storage';
import {schedulePublicContentSuffix} from './schedule-public-content';
/** Public facts only. Internal locations are never part of this projection. */
export function publicCalendarContext(now=Date.now()):string[]{
 const from=new Date(now-7*86400000).toISOString().slice(0,10),to=new Date(now+35*86400000).toISOString().slice(0,10);
 const owners=[{type:'user' as const,id:'self',name:'用户',timeZone:undefined as string|undefined},...loadCharacters().map(c=>({type:'character' as const,id:c.id,name:c.name,timeZone:c.timeZone}))];
 return owners.flatMap(o=>loadOwnerCalendarPlans(o.type,o.id).flatMap(p=>p.items).filter(i=>i.visibility==='public'&&i.date>=from&&i.date<=to).map(i=>`${i.date} ${i.startTime} ${o.name}：${i.title}${schedulePublicContentSuffix(i,now,o.timeZone)}`)).slice(0,24);
}
