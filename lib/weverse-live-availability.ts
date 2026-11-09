import { kvGet, kvSet, registerDynamicPrefix } from "./kv-db";
import { loadCharacters } from "./character-storage";
import { formatZonedPromptTimestamp, getSystemTimeZone } from "./character-time";
import { loadOwnerCalendarPlans } from "./calendar-storage";
import { loadWeverseState } from "./weverse-storage";

const PREFIX = "wvs_live_check_v1_";
registerDynamicPrefix(PREFIX);

export function weverseLiveAvailability(characterId: string, at = Date.now(), currentLiveId?: string): {free:boolean;reason:string;scheduledTheme?:string} {
  const char=loadCharacters().find(item=>item.id===characterId);
  if(!char)return {free:false,reason:"角色已不存在"};
  const local=Date.parse(formatZonedPromptTimestamp(new Date(at),char.timeZone||getSystemTimeZone()).replace(" ","T")+":00Z");
  let scheduledTheme: string|undefined;
  for(const item of loadOwnerCalendarPlans("character",characterId).flatMap(plan=>plan.items)) {
    if(item.kind==="milestone")continue;
    const start=Date.parse(`${item.date}T${item.startTime}:00Z`);
    let end=Date.parse(`${item.date}T${item.endTime}:00Z`);if(end<=start)end+=86400000;
    if(!(start<=local&&local<end))continue;
    // Hosting the advertised WVS special is the scheduled work itself.
    const ownSpecial=/(?:weverse|wvs|回归|新剧|首集|作品|新歌|发布|宣传|倒计时)/i.test(item.title)&&/(?:直播|陪看|\bLIVE\b)/i.test(item.title)&&!/(?:youtube|油管)/i.test(item.title);
    if(ownSpecial){scheduledTheme=item.title;continue;}
    if((item.busyLevel??(item.source==="manual"?1:3))>=4 || /驾驶|手术|考试|拍摄|录制|演出|会议/.test(item.title))return {free:false,reason:"当前有其他安排，暂时无法开播"};
  }
  const wvs=loadWeverseState();
  if(wvs.lives.some(live=>!live.official&&live.id!==currentLiveId&&live.status==="live"&&live.activeCharacterIds.includes(characterId)))return {free:false,reason:"该成员已在另一场 Live 中"};
  return {free:true,reason:"",scheduledTheme};
}
/** A refresh is an opportunity, not a fixed broadcast timetable or repeated reroll. */
export function claimWeverseLiveOpportunity(communityId: string, now=Date.now(), random=Math.random): boolean {
  const key=PREFIX+communityId;
  const next=Number(kvGet(key)||0);
  if(next>now)return false;
  kvSet(key,String(now+(4+random()*10)*3600000));
  return random()<.22;
}
