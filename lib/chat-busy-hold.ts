import {getCharacterSleep} from "./character-routine";
import { kvGet, kvRemove, kvSet, registerDynamicPrefix } from "./kv-db";
import { loadOwnerCalendarPlans } from "./calendar-storage";
import type { CalendarBusyLevel, CalendarScheduleItem } from "./calendar-types";
import {loadCharacters} from "./character-storage";
import {formatZonedPromptTimestamp,getSystemTimeZone} from "./character-time";

const BUSY_HOLD_PREFIX = "chat_busy_hold_v1_";
registerDynamicPrefix(BUSY_HOLD_PREFIX);

export type BusyHoldPending = {
  sessionId: string;
  dueAt: number;
  queued: boolean;
  eventId?: string;
  attempts?: number;
  wakeCheckedId?: string;
};

export type ActiveCalendarBusy = {
  item: CalendarScheduleItem;
  level: CalendarBusyLevel;
  endsAt: number;
  sleeping?: boolean;
};

function keyFor(sessionId: string): string { return `${BUSY_HOLD_PREFIX}${sessionId}`; }

export function loadBusyHoldPending(sessionId: string): BusyHoldPending | null {
  try {
    const raw = kvGet(keyFor(sessionId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<BusyHoldPending>;
    if (value.sessionId !== sessionId || !Number.isFinite(value.dueAt) || typeof value.queued !== "boolean") return null;
    return value as BusyHoldPending;
  } catch { return null; }
}

export function saveBusyHoldPending(pending: BusyHoldPending): void {
  kvSet(keyFor(pending.sessionId), JSON.stringify(pending));
}

export function clearBusyHoldPending(sessionId: string): void { kvRemove(keyFor(sessionId)); }

function inferredLevel(item: CalendarScheduleItem): CalendarBusyLevel {
  if (item.busyLevel === 1 || item.busyLevel === 2 || item.busyLevel === 3 || item.busyLevel === 4) return item.busyLevel;
  if (item.source === "manual") return 1;
  const title = `${item.title} ${item.location}`;
  if (/演唱会|手术|拍摄|录制|直播|舞台|比赛|考试|发布会|重要会议/.test(title)) return 4;
  if (/演出|彩排|会议|采访|工作|活动|出差|课程|训练/.test(title)) return 3;
  return 2;
}

export function getActiveCalendarBusy(characterId: string, at = new Date()): ActiveCalendarBusy | null {
  const character=loadCharacters().find(c=>c.id===characterId);
  const zone=character?.timeZone||getSystemTimeZone();
  // Compare wall-clock calendar values in the role's timezone; include yesterday's overnight items.
  const localStamp=Date.parse(formatZonedPromptTimestamp(at,zone).replace(" ","T")+":00Z");
  const items=loadOwnerCalendarPlans("character",characterId).flatMap(plan=>plan.items);
  const active=items.flatMap(item=>{
    if(item.kind==="milestone")return [];
    const start=Date.parse(`${item.date}T${item.startTime}:00Z`);
    let end=Date.parse(`${item.date}T${item.endTime}:00Z`);
    if(end<=start)end+=86400000;
    return start<=localStamp&&localStamp<end?[{item,level:inferredLevel(item),endsAt:at.getTime()+end-localStamp}]:[];
  });
  const calendar=active.sort((a,b)=>b.level-a.level||b.endsAt-a.endsAt)[0]||null;
  const sleep=getCharacterSleep(characterId,at);
  if(calendar&&calendar.level>1)return calendar;
  if(sleep?.sleeping)return {item:{id:sleep.cycleId,title:"正在休息"} as CalendarScheduleItem,level:4,endsAt:sleep.endsAt,sleeping:true};
  if(sleep?.briefAwake)return {item:{id:sleep.cycleId+":wake",title:"夜间短暂醒来"} as CalendarScheduleItem,level:2,endsAt:sleep.endsAt,sleeping:true};
  return calendar;
}

/** Randomized once and persisted with the pending item, so polling never moves the deadline. */
export function chooseBusyResumeAt(active: ActiveCalendarBusy): number {
  const bufferMin = active.level >= 3 ? 15 : 5;
  const bufferMax = active.level >= 3 ? 45 : 20;
  const buffer = bufferMin + Math.floor(Math.random() * (bufferMax - bufferMin + 1));
  return active.endsAt + buffer * 60_000;
}

