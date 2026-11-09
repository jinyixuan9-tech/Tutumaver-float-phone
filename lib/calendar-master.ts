import {scheduleContentUnlockAt} from './schedule-public-content';
import {calendarWallTimeToInstant} from './calendar-time';
import {loadCharacters} from './character-storage';
import {formatZonedPromptTimestamp,getSystemTimeZone} from './character-time';
import {kvGet,kvSet,registerKvMigration} from './kv-db';
import type {CalendarScheduleItem,CalendarWeekPlan} from './calendar-types';
import type {WeverseState,WeverseScheduleItem} from './weverse-storage';
import {getWeekStartIso,getWeekdayLabel} from './calendar-utils';
const CAL='ai_phone_calendar_plans_v1',WVS='ai_phone_weverse_state_v1',MIG='ai_phone_calendar_master_v2';registerKvMigration(MIG);
let running=false;
export const isPublicCalendarItem=(item:CalendarScheduleItem,_now=Date.now())=>item.visibility==='public';
export const calendarWeverseKey = (item: CalendarScheduleItem) => item.externalId || item.sharedGroupId || item.id;
const zoneOf=(id:string)=>loadCharacters().find(c=>c.id===id)?.timeZone||getSystemTimeZone();
/** The only writer of WVS calendar projections; originals, privacy and replay links live in Calendar. */
export function reconcileCalendarMaster(){
 if(typeof window==='undefined'||running)return;running=true;
 try{
  const store=JSON.parse(kvGet(CAL)||'{"plans":[]}') as {plans:CalendarWeekPlan[]};const raw=kvGet(WVS);if(!raw)return;
  const wvs=JSON.parse(raw) as WeverseState;let changed=false;
  const owner=(id:string)=>({type:id.startsWith('user:')?'user' as const:'character' as const,id:id.startsWith('user:')?'self':id});
  const planFor=(id:string,date:string)=>{const who=owner(id),week=getWeekStartIso(new Date(`${date}T00:00:00`));let plan=store.plans.find(p=>p.ownerType===who.type&&p.ownerId===who.id&&p.weekStart===week);if(!plan){plan={id:`master_${id}_${week}`,ownerType:who.type,ownerId:who.id,weekStart:week,items:[],updatedAt:new Date().toISOString()};store.plans.push(plan);}return plan;};
  const stamp=(ts:number,id:string)=>formatZonedPromptTimestamp(new Date(ts),zoneOf(id));
  if(!kvGet(MIG)){
   for(const s of wvs.schedules||[])for(const id of s.memberCharacterIds){
    const start=stamp(s.startsAt,id),finish=stamp(s.endsAt||s.startsAt+3600000,id),date=start.slice(0,10),time=start.slice(11,16),who=owner(id);
    const old=store.plans.filter(p=>p.ownerType===who.type&&p.ownerId===who.id).flatMap(p=>p.items).find(i=>i.externalId===s.id||`cal_${s.communityId}_${i.sharedGroupId||i.id}`===s.id||(i.date===date&&i.startTime===time&&i.title===s.title));
    if(old)continue;
    const now=new Date().toISOString();planFor(id,date).items.push({id:`wvs_${s.id}_${id}`,date,weekday:getWeekdayLabel(date),startTime:time,endTime:s.calendarSync?(finish.slice(0,10)===date&&finish.slice(11,16)>time?finish.slice(11,16):'23:59'):time,title:s.title,location:s.location||'',visibility:s.visibility==='public'?'public':'private',kind:s.calendarSync?'event':'milestone',publicAt:s.publicAt?new Date(s.publicAt).toISOString():undefined,contentDescription:s.contentDescription,wvsType:s.type,source:'weverse',externalSource:'weverse',externalId:s.id,colorKey:'blue',busyLevel:s.calendarSync?s.busyLevel||3:1,createdAt:new Date(s.createdAt).toISOString(),updatedAt:now});changed=true;
   }
   kvSet(MIG,'1');
  }
  const liveIds=new Set((wvs.lives||[]).map(l=>l.id));
  for(const plan of store.plans){const next=plan.items.filter(i=>!i.linkedLiveId||liveIds.has(i.linkedLiveId));if(next.length!==plan.items.length){plan.items=next;changed=true;}}
  for(const live of wvs.lives||[]){
   if(live.official || live.status!=='ended')continue;
   for(const id of live.hostCharacterIds){const who=owner(id),start=stamp(live.startedAt,id),date=start.slice(0,10),time=start.slice(11,16),end=stamp(live.endedAt||live.startedAt+60000,id);
    const rows=store.plans.filter(p=>p.ownerType===who.type&&p.ownerId===who.id).flatMap(p=>p.items);
    if(rows.some(i=>i.linkedLiveId===live.id))continue;
    const matching=rows.find(i=>i.visibility==='public'&&i.kind!=='milestone'&&i.date===date&&i.title===live.title);
    if(matching){matching.linkedLiveId=live.id;changed=true;continue;}
    const now=new Date().toISOString();planFor(id,date).items.push({id:`live_${live.id}_${id}`,linkedLiveId:live.id,title:live.title||'Live',date,weekday:getWeekdayLabel(date),startTime:time,endTime:end.slice(0,10)!==date?'23:59':end.slice(11,16)>time?end.slice(11,16):time==='23:59'?'23:59':`${String(Math.floor((Number(time.slice(0,2))*60+Number(time.slice(3))+1)/60)).padStart(2,'0')}:${String((Number(time.slice(3))+1)%60).padStart(2,'0')}`,location:'',kind:'event',visibility:'public',wvsType:'media',busyLevel:3,colorKey:'rose',source:'weverse',createdAt:now,updatedAt:now});changed=true;
   }
  }
  if(changed)kvSet(CAL,JSON.stringify(store));
  const schedules:WeverseScheduleItem[]=[];
  for(const community of wvs.communities||[])for(const plan of store.plans){
   if(plan.ownerType==='user'?!community.userIdentityId:!community.memberCharacterIds.includes(plan.ownerId))continue;
   const memberId=plan.ownerType==='user'?`user:${community.userIdentityId}`:plan.ownerId;
   for(const item of plan.items){if(!isPublicCalendarItem(item))continue;
    const linkedLive=item.linkedLiveId?(wvs.lives||[]).find(l=>l.id===item.linkedLiveId):undefined;
    if(linkedLive?.official || (linkedLive && linkedLive.communityId!==community.id))continue;
    const id=item.linkedLiveId?`cal_${community.id}_live_${item.linkedLiveId}`:`cal_${community.id}_${calendarWeverseKey(item)}`;
    const existing=schedules.find(s=>s.id===id);if(existing){if(!existing.memberCharacterIds.includes(memberId))existing.memberCharacterIds.push(memberId);continue;}
    const zone=zoneOf(plan.ownerId),live=linkedLive,startsAt=live?.startedAt??calendarWallTimeToInstant(item.date,item.startTime,zone);
    schedules.push({id,communityId:community.id,title:item.title,contentDescription:item.contentDescription,linkedLiveId:item.linkedLiveId,publicAt:item.publicAt?scheduleContentUnlockAt(item,zone):undefined,type:item.wvsType||(item.kind==='milestone'?'release':'performance'),visibility:'public',calendarSync:item.kind!=='milestone',busyLevel:item.kind==='milestone'?1:item.busyLevel||3,startsAt,endsAt:live?.endedAt??(item.kind==='milestone'?undefined:calendarWallTimeToInstant(item.date,item.endTime,zone)),location:undefined,memberCharacterIds:[memberId],source:'manual',createdAt:Date.parse(item.createdAt),updatedAt:Date.parse(item.updatedAt)});
   }
  }
  if(JSON.stringify(wvs.schedules)!==JSON.stringify(schedules)){kvSet(WVS,JSON.stringify({...wvs,schedules}));window.dispatchEvent(new CustomEvent('weverse-updated'));}
  if(changed)window.dispatchEvent(new CustomEvent('calendar-updated'));
 }finally{running=false;}
}
