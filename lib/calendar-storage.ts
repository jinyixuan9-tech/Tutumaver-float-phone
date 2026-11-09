import {isCalendarItemTimeAllowed} from "./calendar-utils";
import { schedulePublicContentSuffix } from "./schedule-public-content";
import { loadCharacters } from "./character-storage";
import { formatZonedPromptTimestamp, getSystemTimeZone } from "./character-time";
import { calendarWallTimeToInstant } from "./calendar-time";
import { calendarWeverseKey, reconcileCalendarMaster } from "./calendar-master";
import type { CalendarColorKey, CalendarOwnerType, CalendarScheduleItem, CalendarWeekPlan } from "./calendar-types";
import {
  formatIsoDate,
  getOwnerStorageKey,
  getWeekDates,
  getWeekStartIso,
  getWeekdayLabel,
  isCalendarColorKey,
  isCalendarTimeRangeAllowed,
  normalizeTime,
  pickScheduleColorKey,
  sanitizeScheduleEmoji,
  sortScheduleItems,
  timeToMinutes,
} from "./calendar-utils";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";

const STORAGE_KEY = "ai_phone_calendar_plans_v1";
const CALENDAR_CONFIG_KEY = "ai_phone_calendar_config_v1";
registerKvMigration(STORAGE_KEY);
registerKvMigration(CALENDAR_CONFIG_KEY);

type PersistedCalendarStore = {
  plans: CalendarWeekPlan[];
};

export type CalendarConfig = {
  autoGenerateEnabled: boolean;
  theme: string;
  /** 详情页时间轴一页显示的天数（1/2/3/5/7），默认 2 */
  daysPerPage: number;
};

const DEFAULT_CALENDAR_CONFIG: CalendarConfig = {
  autoGenerateEnabled: false,
  theme: "light",
  daysPerPage: 2,
};

export const CALENDAR_DAYS_PER_PAGE_OPTIONS = [1, 2, 3, 5, 7] as const;

export function normalizeCalendarDaysPerPage(value: unknown): number {
  const num = typeof value === "number" ? Math.round(value) : NaN;
  return (CALENDAR_DAYS_PER_PAGE_OPTIONS as readonly number[]).includes(num)
    ? num
    : DEFAULT_CALENDAR_CONFIG.daysPerPage;
}

/** 旧版主题 id → 新版主题 id（v2 改版后主题全部重定义） */
const LEGACY_THEME_MAP: Record<string, string> = {
  ocean: "light",
  orange: "cream",
  honey: "cream",
  melon: "mint",
};

export const CALENDAR_THEME_IDS = ["light", "dark", "cream", "mint", "mist", "sakura"] as const;

export function normalizeCalendarTheme(theme: unknown): string {
  if (typeof theme !== "string" || !theme) return DEFAULT_CALENDAR_CONFIG.theme;
  const mapped = LEGACY_THEME_MAP[theme] ?? theme;
  return (CALENDAR_THEME_IDS as readonly string[]).includes(mapped) ? mapped : DEFAULT_CALENDAR_CONFIG.theme;
}

function loadStore(): PersistedCalendarStore {
  reconcileCalendarMaster();
  if (typeof window === "undefined") return { plans: [] };
  try {
    const raw = kvGet(STORAGE_KEY);
    if (!raw) return { plans: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedCalendarStore>;
    return { plans: Array.isArray(parsed.plans) ? parsed.plans : [] };
  } catch {
    return { plans: [] };
  }
}

function saveStore(store: PersistedCalendarStore): void {
  if (typeof window === "undefined") return;
  kvSet(STORAGE_KEY, JSON.stringify(store));
  reconcileCalendarMaster();
  window.dispatchEvent(new CustomEvent("calendar-updated"));
}

export function loadCalendarConfig(): CalendarConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CALENDAR_CONFIG };
  try {
    const raw = kvGet(CALENDAR_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CALENDAR_CONFIG };
    const parsed = { ...DEFAULT_CALENDAR_CONFIG, ...JSON.parse(raw) } as CalendarConfig;
    parsed.theme = normalizeCalendarTheme(parsed.theme);
    parsed.daysPerPage = normalizeCalendarDaysPerPage(parsed.daysPerPage);
    return parsed;
  } catch {
    return { ...DEFAULT_CALENDAR_CONFIG };
  }
}

export function saveCalendarConfig(config: CalendarConfig): void {
  if (typeof window === "undefined") return;
  kvSet(CALENDAR_CONFIG_KEY, JSON.stringify(config));
}

export function loadCalendarWeekPlan(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
): CalendarWeekPlan | null {
  const store = loadStore();
  const plan = store.plans.find(
    entry => entry.ownerType === ownerType && entry.ownerId === ownerId && entry.weekStart === weekStart,
  );
  if (!plan) return null;
  return {
    ...plan,
    items: sortScheduleItems((plan.items || [])
      .filter(item => isCalendarItemTimeAllowed(item))
      .map(item => ({
        ...item,
        weekday: item.weekday || getWeekdayLabel(item.date),
        colorKey: item.colorKey || pickScheduleColorKey(item.startTime),
      }))),
  };
}

export function loadOwnerCalendarPlans(
  ownerType: CalendarOwnerType,
  ownerId: string,
): CalendarWeekPlan[] {
  const store = loadStore();
  return store.plans
    .filter(entry => entry.ownerType === ownerType && entry.ownerId === ownerId)
    .map(entry => ({
      ...entry,
      items: sortScheduleItems((entry.items || []).filter(item => isCalendarItemTimeAllowed(item))),
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function saveCalendarWeekPlan(plan: CalendarWeekPlan): CalendarWeekPlan {
  const store = loadStore();
  const normalized: CalendarWeekPlan = {
    ...plan,
    updatedAt: new Date().toISOString(),
    items: sortScheduleItems(plan.items.map(item => ({
      ...item,
      weekday: item.weekday || getWeekdayLabel(item.date),
      colorKey: item.colorKey || pickScheduleColorKey(item.startTime),
    }))),
  };
  const nextPlans = store.plans.filter(
    entry => !(entry.ownerType === plan.ownerType && entry.ownerId === plan.ownerId && entry.weekStart === plan.weekStart),
  );
  nextPlans.push(normalized);
  saveStore({ plans: nextPlans });
  return normalized;
}

export function replaceCalendarWeekItems(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
  items: CalendarScheduleItem[],
): CalendarWeekPlan {
  const existing = loadCalendarWeekPlan(ownerType, ownerId, weekStart);
  const plan: CalendarWeekPlan = {
    id: existing?.id ?? `calendar_week_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ownerType,
    ownerId,
    weekStart,
    items,
    updatedAt: new Date().toISOString(),
  };
  return saveCalendarWeekPlan(plan);
}

export function upsertCalendarScheduleItem(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
  item: Omit<CalendarScheduleItem, "id" | "weekday" | "colorKey" | "createdAt" | "updatedAt"> & Partial<Pick<CalendarScheduleItem, "id" | "weekday" | "colorKey" | "createdAt" | "updatedAt">>,
): CalendarWeekPlan {
  const plan = loadCalendarWeekPlan(ownerType, ownerId, weekStart);
  const existingItems = plan?.items ?? [];
  const now = new Date().toISOString();
  const normalized: CalendarScheduleItem = {
    id: item.id ?? `calendar_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: item.date,
    weekday: item.weekday || getWeekdayLabel(item.date),
    startTime: item.startTime,
    endTime: item.kind === "milestone" ? item.startTime : item.endTime,
    location: item.location.trim(),
    title: item.title.trim(),
    emoji: sanitizeScheduleEmoji(item.emoji),
    colorKey: item.colorKey || pickScheduleColorKey(item.startTime),
    contentDescription:item.contentDescription?.trim().slice(0,4000), encounterScene:item.encounterScene, visibility: item.visibility || "private", kind: item.kind || "event", publicAt:item.kind==="milestone"?undefined:item.publicAt, wvsType:item.wvsType,
    source: item.source,
    externalSource: item.externalSource,
    externalId: item.externalId,
    linkedLiveId:item.linkedLiveId,
    sharedGroupId: item.sharedGroupId,
    sharedCharacterIds: item.sharedCharacterIds,
    busyLevel: item.kind === "milestone" ? 1 : item.busyLevel,
    createdAt: item.createdAt ?? now,
    updatedAt: now,
  };
  const nextItems = existingItems.filter(entry => entry.id !== normalized.id);
  nextItems.push(normalized);
  return replaceCalendarWeekItems(ownerType, ownerId, weekStart, nextItems);
}

export type CalendarSyncConflict = { ownerId: string; date: string; reason: "overlap" | "daily-limit" };

/** Check all target calendars before mirroring a shared event. */
export function checkCalendarSyncConflicts(
  item: CalendarScheduleItem,
  targetOwnerIds: string[],
): CalendarSyncConflict[] {
  const store = loadStore();
  const conflicts: CalendarSyncConflict[] = [];
  for (const ownerId of targetOwnerIds) {
    const dayItems = store.plans
      .filter(plan => plan.ownerType === "character" && plan.ownerId === ownerId)
      .flatMap(plan => plan.items || [])
      .filter(existing => existing.date === item.date);
    const isSameEvent = (existing: CalendarScheduleItem) => Boolean(item.sharedGroupId && existing.sharedGroupId === item.sharedGroupId)
      || (existing.startTime === item.startTime && existing.endTime === item.endTime && existing.title === item.title && existing.location === item.location);
    const additions = dayItems.filter(existing => !isSameEvent(existing));

    if (item.kind!=="milestone" && additions.some(existing => existing.kind!=="milestone" && existing.startTime < item.endTime && item.startTime < existing.endTime)) {
      conflicts.push({ ownerId, date: item.date, reason: "overlap" });
    }
  }
  return conflicts;
}

/** Mirror a calendar item to selected characters in one storage transaction. */
export function syncCalendarScheduleItemToCharacters(
  sourceOwnerId: string,
  item: CalendarScheduleItem,
  targetOwnerIds: string[],
): void {
  const store = loadStore();
  const now = new Date().toISOString();
  const groupId = item.sharedGroupId || `calendar_shared_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const participantIds = Array.from(new Set([...(item.sharedCharacterIds || []), sourceOwnerId, ...targetOwnerIds]));
  const sharedItem = { ...item, sharedGroupId: groupId, sharedCharacterIds: participantIds, updatedAt: now };
  const nextPlans = store.plans.map(plan => ({
    ...plan,
    items: (plan.items || []).map(existing => existing.sharedGroupId === groupId
      ? { ...existing, sharedCharacterIds: participantIds, updatedAt: now }
      : existing),
  }));
  const put = (ownerId: string, nextItem: CalendarScheduleItem) => {
    const weekStart = getWeekStartIso(new Date(`${nextItem.date}T00:00:00`));
    const at = nextPlans.findIndex(plan => plan.ownerType === "character" && plan.ownerId === ownerId && plan.weekStart === weekStart);
    const plan = at >= 0 ? nextPlans[at] : {
      id: `calendar_week_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ownerType: "character" as const, ownerId, weekStart, items: [], updatedAt: now,
    };
    const existingMatch = ownerId === sourceOwnerId ? undefined : (plan.items || []).find(entry => entry.date === nextItem.date
      && entry.startTime === nextItem.startTime && entry.endTime === nextItem.endTime
      && entry.title === nextItem.title && entry.location === nextItem.location);
    const copy = { ...nextItem, id: ownerId === sourceOwnerId ? item.id : existingMatch?.id || `calendar_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    const updated = { ...plan, updatedAt: now, items: sortScheduleItems([...(plan.items || []).filter(entry => entry.id !== copy.id && entry.sharedGroupId !== groupId), copy]) };
    if (at >= 0) nextPlans[at] = updated;
    else nextPlans.push(updated);
  };
  put(sourceOwnerId, sharedItem);
  for (const ownerId of targetOwnerIds) put(ownerId, sharedItem);
  saveStore({ plans: nextPlans });
}

export function updateLinkedCalendarScheduleItem(groupId: string, item: CalendarScheduleItem): void {
  const store = loadStore();
  const now = new Date().toISOString();
  const plans = store.plans.map(plan => ({ ...plan, items: (plan.items || []).filter(existing => existing.sharedGroupId !== groupId) }));
  for (const ownerId of item.sharedCharacterIds || []) {
    const weekStart = getWeekStartIso(new Date(`${item.date}T00:00:00`));
    const at = plans.findIndex(plan => plan.ownerType === "character" && plan.ownerId === ownerId && plan.weekStart === weekStart);
    const base = at >= 0 ? plans[at] : {
      id: `calendar_week_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ownerType: "character" as const, ownerId, weekStart, items: [], updatedAt: now,
    };
    const mirrored = { ...item, id: at >= 0 ? `calendar_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : item.id, updatedAt: now };
    const updated = { ...base, updatedAt: now, items: sortScheduleItems([...(base.items || []), mirrored]) };
    if (at >= 0) plans[at] = updated;
    else plans.push(updated);
  }
  saveStore({ plans });
}

export function deleteLinkedCalendarScheduleItem(groupId: string): void {
  const store = loadStore();
  saveStore({ plans: store.plans.map(plan => ({
    ...plan,
    items: (plan.items || []).filter(item => item.sharedGroupId !== groupId),
  })) });
}

export type PendingCalendarGroup={id:string;owners:Array<{ownerId:string;item:CalendarScheduleItem}>;conflicts:string[];weverseKey?:string};
const PENDING_KEY="ai_phone_calendar_pending_v1";registerKvMigration(PENDING_KEY);
export function loadPendingCalendarGroups():PendingCalendarGroup[]{try{return JSON.parse(kvGet(PENDING_KEY)||"[]");}catch{return [];}}
export function removePendingCalendarGroup(id:string){kvSet(PENDING_KEY,JSON.stringify(loadPendingCalendarGroups().filter(g=>g.id!==id)));}
export function applyGeneratedCalendarRange(generatedByOwner:Array<{ownerId:string;items:CalendarScheduleItem[]}>,fromDate:string,toDate:string,mode:"supplement"|"replan",weverseKey?:string): {saved:number;pending:number} {
 const store=loadStore();
 const replaced=mode==="replan"?new Set(generatedByOwner.flatMap(({ownerId})=>store.plans.filter(p=>p.ownerType===(ownerId.startsWith("user:")?"user":"character")&&p.ownerId===(ownerId.startsWith("user:")?"self":ownerId)).flatMap(p=>p.items).filter(i=>i.source==="generated"&&i.date>=fromDate&&i.date<=toDate).map(i=>i.sharedGroupId).filter(Boolean))):new Set();
 const plans=store.plans.map(p=>({...p,items:p.items.filter(i=>!((i.sharedGroupId&&replaced.has(i.sharedGroupId))||(mode==="replan"&&generatedByOwner.some(o=>o.ownerId===p.ownerId)&&p.ownerType==="character"&&i.source==="generated"&&i.date>=fromDate&&i.date<=toDate)))}));
 const groups=new Map<string,PendingCalendarGroup>();
 for(const {ownerId,items} of generatedByOwner)for(const item of items){if(item.date<fromDate||item.date>toDate)continue;const key=weverseKey||item.sharedGroupId||item.id;const g=groups.get(key)||{id:key,owners:[],conflicts:[],weverseKey};g.owners.push({ownerId,item});groups.set(key,g);}
 let saved=0;const pending=loadPendingCalendarGroups().filter(group=>!weverseKey||group.id!==weverseKey);
 for(const group of groups.values()){
  group.conflicts=[];
  const additions=weverseKey ? group.owners : group.owners.filter(({ownerId,item})=>!plans.filter(p=>p.ownerType===(ownerId.startsWith("user:")?"user":"character")&&p.ownerId===(ownerId.startsWith("user:")?"self":ownerId)).flatMap(p=>p.items).some(i=>(i.id===item.id&&i.date===item.date&&i.startTime===item.startTime&&i.endTime===item.endTime&&i.title===item.title&&i.visibility===item.visibility&&i.kind===item.kind&&i.publicAt===item.publicAt&&i.contentDescription===item.contentDescription&&i.location===item.location&&i.busyLevel===item.busyLevel)||(i.id!==item.id&&i.date===item.date&&i.startTime===item.startTime&&i.endTime===item.endTime&&i.title===item.title)));
  for(const {ownerId,item} of additions)if(item.kind!=="milestone")for(const existing of plans.filter(p=>p.ownerType===(ownerId.startsWith("user:")?"user":"character")&&p.ownerId===(ownerId.startsWith("user:")?"self":ownerId)).flatMap(p=>p.items))if(existing.id!==item.id&&calendarWeverseKey(existing)!==weverseKey&&existing.kind!=="milestone"&&existing.date===item.date&&existing.startTime<item.endTime&&item.startTime<existing.endTime)group.conflicts.push(`${ownerId}：${existing.date} ${existing.startTime}–${existing.endTime} ${existing.title}`);
  if(group.conflicts.length){pending.push(group);continue;}
  if (weverseKey) for (const plan of plans) plan.items = plan.items.filter(item => calendarWeverseKey(item) !== weverseKey);
  for(const {ownerId,item} of additions){const weekStart=getWeekStartIso(new Date(`${item.date}T00:00:00`));let plan=plans.find(p=>p.ownerType===(ownerId.startsWith("user:")?"user":"character")&&p.ownerId===(ownerId.startsWith("user:")?"self":ownerId)&&p.weekStart===weekStart);if(!plan){plan={id:`calendar_${Date.now()}_${Math.random()}`,ownerType:ownerId.startsWith("user:")?"user":"character",ownerId:ownerId.startsWith("user:")?"self":ownerId,weekStart,items:[],updatedAt:new Date().toISOString()};plans.push(plan);}plan.items=plan.items.filter(i=>i.id!==item.id);for(const other of plans)if(other!==plan&&other.ownerType===(ownerId.startsWith("user:")?"user":"character")&&other.ownerId===(ownerId.startsWith("user:")?"self":ownerId))other.items=other.items.filter(i=>i.id!==item.id);plan.items.push(item);saved++;}
 }
 kvSet(PENDING_KEY,JSON.stringify(pending));saveStore({plans});return {saved,pending:[...groups.values()].filter(g=>g.conflicts.length).length};
}
export function saveAdjustedPendingGroup(id: string, patch: Pick<CalendarScheduleItem, "date" | "startTime" | "endTime">) {
  const group = loadPendingCalendarGroups().find(item => item.id === id);
  if (!group?.owners.length) return { saved: 0, pending: 0 };
  const characters = group.weverseKey ? loadCharacters() : [];
  const zoneFor = (ownerId: string) => characters.find(character => character.id === ownerId)?.timeZone || getSystemTimeZone();
  const zone = zoneFor(group.owners[0].ownerId);
  const startsAt = group.weverseKey ? calendarWallTimeToInstant(patch.date, patch.startTime, zone) : 0;
  const endsAt = group.weverseKey ? calendarWallTimeToInstant(patch.date, patch.endTime, zone) : 0;
  const owners = group.owners.map(({ ownerId, item }) => {
    let dates = patch;
    if (group.weverseKey) {
      const start = formatZonedPromptTimestamp(new Date(startsAt), zoneFor(ownerId));
      const end = formatZonedPromptTimestamp(new Date(endsAt), zoneFor(ownerId));
      const date = start.slice(0, 10);
      dates = { date, startTime: start.slice(11, 16), endTime: end.startsWith(date) ? end.slice(11, 16) : "23:59" };
    }
    return { ownerId, items: [{ ...item, ...dates, weekday: getWeekdayLabel(dates.date) }] };
  });
  const dates = owners.map(owner => owner.items[0].date).sort();
  removePendingCalendarGroup(id);
  return applyGeneratedCalendarRange(owners, dates[0], dates[dates.length - 1], "supplement", group.weverseKey);
}

export function deleteCalendarScheduleItem(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
  itemId: string,
): CalendarWeekPlan {
  const plan = loadCalendarWeekPlan(ownerType, ownerId, weekStart);
  return replaceCalendarWeekItems(ownerType, ownerId, weekStart, (plan?.items ?? []).filter(item => item.id !== itemId));
}

export function formatCalendarScheduleForPrompt(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
): string {
  const plan = loadCalendarWeekPlan(ownerType, ownerId, weekStart);
  if (!plan || plan.items.length === 0) {
    return "本周暂无明确日程安排。";
  }

  const grouped = new Map<string, CalendarScheduleItem[]>();
  for (const item of plan.items) {
    const arr = grouped.get(item.date) || [];
    arr.push(item);
    grouped.set(item.date, arr);
  }

  return getWeekDates(weekStart)
    .map(date => {
      const items = sortScheduleItems(grouped.get(date) || []);
      if (items.length === 0) {
        return `${date} ${getWeekdayLabel(date)}：暂无明确安排`;
      }
      const summary = items
        .map(item => `[${item.visibility === "public" ? "公开" : "私人/内部"}·${item.kind === "milestone" ? "公开节点，不占用时间" : "实际行程"}] ${item.startTime}-${item.endTime} @${item.location || "未定"} ${item.title}${item.visibility === "public" ? schedulePublicContentSuffix(item,Date.now(),loadCharacters().find(c=>c.id===ownerId)?.timeZone) : ""}`)
        .join("；");
      return `${date} ${getWeekdayLabel(date)}：${summary}`;
    })
    .join("\n");
}

export function formatCalendarScheduleItemForPrompt(item: Pick<CalendarScheduleItem, "startTime" | "endTime" | "location" | "title">): string {
  return `${item.startTime}-${item.endTime} @${item.location || "未定"} ${item.title}`;
}

export function getCurrentCalendarScheduleForPrompt(
  ownerType: CalendarOwnerType,
  ownerId: string,
  now = new Date(),
): string {
  const date = formatIsoDate(now);
  const weekStart = getWeekStartIso(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const plan = loadCalendarWeekPlan(ownerType, ownerId, weekStart);
  if (!plan) return "无";

  const activeItems = sortScheduleItems(plan.items).filter(item => {
    if (item.kind === "milestone" || item.date !== date) return false;
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    return start <= currentMinute && currentMinute < end;
  });

  if (activeItems.length === 0) return "无";
  return activeItems.map(formatCalendarScheduleItemForPrompt).join("；");
}

/**
 * 重新生成前清掉本周的 AI 生成条目（保留手动条目）。
 * 否则旧的生成结果会经由日程 marker 进入提示词，被模型原样照抄——
 * 导致"重新生成永远一字不差"。返回被移除的条目，供生成失败时恢复。
 */
export function clearGeneratedWeekItems(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
): CalendarScheduleItem[] {
  const existing = loadCalendarWeekPlan(ownerType, ownerId, weekStart);
  const items = existing?.items ?? [];
  const removed = items.filter(item => item.source === "generated");
  if (removed.length === 0) return [];
  replaceCalendarWeekItems(ownerType, ownerId, weekStart, items.filter(item => item.source !== "generated"));
  return removed;
}

/** 生成失败时，把 clearGeneratedWeekItems 移除的条目加回本周计划。 */
export function restoreCalendarWeekItems(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
  itemsToRestore: CalendarScheduleItem[],
): void {
  if (itemsToRestore.length === 0) return;
  const existing = loadCalendarWeekPlan(ownerType, ownerId, weekStart);
  replaceCalendarWeekItems(ownerType, ownerId, weekStart, sortScheduleItems([
    ...(existing?.items ?? []),
    ...itemsToRestore,
  ]));
}

export function buildCalendarScheduleMarker(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
): string {
  const ownerLabel = ownerType === "user" ? "用户" : "角色";
  return [
    `当前查看周起始日期：${weekStart}`,
    `${ownerLabel}本周日程：`,
    formatCalendarScheduleForPrompt(ownerType, ownerId, weekStart),
  ].join("\n");
}

export function normalizeGeneratedScheduleItems(
  rawItems: Array<{
    date: string;
    startTime: string;
    endTime: string;
    location: string;
    title: string;
    emoji?: string;
    colorKey?: CalendarColorKey;
    contentDescription?: string;
    encounterScene?: string;
    visibility?: "public" | "private"; kind?: "event" | "milestone"; publicAt?: string;
    busyLevel?: 1 | 2 | 3 | 4;
  }>,
): CalendarScheduleItem[] {
  const now = new Date().toISOString();
  const fallbackBusyLevel = (title: string): 1 | 2 | 3 | 4 => {
    const serious = /演唱会|手术|拍摄|录制|直播|舞台|比赛|考试|发布会|重要会议|演出|彩排|采访/.test(title);
    if (serious) return Math.random() < 0.5 ? 3 : 4;
    return Math.random() < 0.65 ? 1 : 2;
  };
  return sortScheduleItems(
    rawItems
      .map(item => ({
        id: `calendar_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        date: item.date,
        weekday: getWeekdayLabel(item.date),
        startTime: normalizeTime(item.startTime) || item.startTime,
        endTime: item.kind==="milestone" ? (normalizeTime(item.startTime)||item.startTime) : normalizeTime(item.endTime) || item.endTime,
        location: item.location.trim(),
        title: item.title.trim(),
        emoji: sanitizeScheduleEmoji(item.emoji),
        busyLevel: item.kind==="milestone"?1 as const:item.busyLevel === 1 || item.busyLevel === 2 || item.busyLevel === 3 || item.busyLevel === 4
          ? item.busyLevel
          : fallbackBusyLevel(item.title),
        colorKey: isCalendarColorKey(item.colorKey) ? item.colorKey : pickScheduleColorKey(item.startTime),
        contentDescription: item.contentDescription?.trim().slice(0,4000),
        encounterScene: item.encounterScene?.trim().slice(0,100),
        visibility: item.visibility === "public" ? "public" as const : "private" as const, kind: item.kind === "milestone" ? "milestone" as const : "event" as const, publicAt:item.kind==="milestone"?undefined:item.publicAt,
        source: "generated" as const,
        createdAt: now,
        updatedAt: now,
      }))
      .filter(item => isCalendarItemTimeAllowed(item)),
  );
}

export function cloneWeekPlanWithManualEdits(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
  generatedItems: CalendarScheduleItem[],
): CalendarWeekPlan {
  const existing = loadCalendarWeekPlan(ownerType, ownerId, weekStart);
  const preservedItems = (existing?.items ?? []).filter(item => item.source === "manual" || item.source === "weverse");
  const nextItems = [...generatedItems.filter(item => item.source === "generated")];
  for (const item of preservedItems) {
    const collides = nextItems.find(
      entry =>
        entry.date === item.date &&
        entry.startTime === item.startTime &&
        entry.endTime === item.endTime &&
        entry.title === item.title,
    );
    if (!collides) {
      nextItems.push(item);
    }
  }
  return replaceCalendarWeekItems(ownerType, ownerId, weekStart, nextItems);
}

export function deleteCalendarItemsByExternalId(externalSource: "weverse", externalId: string): void {
  const store = loadStore();
  let changed = false;
  const plans = store.plans.map((plan) => {
    const nextItems = (plan.items || []).filter((item) => !(item.externalSource === externalSource && item.externalId === externalId));
    if (nextItems.length === (plan.items || []).length) return plan;
    changed = true;
    return { ...plan, items: nextItems, updatedAt: new Date().toISOString() };
  });
  if (changed) saveStore({ plans });
}

export function loadCalendarItemsByExternalId(externalSource: "weverse", externalId: string): Array<{ ownerType: CalendarOwnerType; ownerId: string; weekStart: string; item: CalendarScheduleItem }> {
  const store = loadStore();
  const rows: Array<{ ownerType: CalendarOwnerType; ownerId: string; weekStart: string; item: CalendarScheduleItem }> = [];
  for (const plan of store.plans) {
    for (const item of plan.items || []) {
      if (item.externalSource === externalSource && item.externalId === externalId) rows.push({ ownerType: plan.ownerType, ownerId: plan.ownerId, weekStart: plan.weekStart, item });
    }
  }
  return rows;
}

export function loadCalendarEntriesByWeverseKey(key: string) {
  return loadStore().plans.flatMap(plan => plan.items.filter(item => calendarWeverseKey(item) === key)
    .map(item => ({ ownerId: plan.ownerType === "user" ? "user:self" : plan.ownerId, item })));
}

export function deleteCalendarEntriesByWeverseKey(key: string) {
  const store = loadStore();
  removePendingCalendarGroup(key);
  saveStore({ plans: store.plans.map(plan => ({ ...plan, items: plan.items.filter(item => calendarWeverseKey(item) !== key) })) });
}

export function validateScheduleDraft(item: {
  kind?: "event"|"milestone";
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  title: string;
}): string | null {
  const start = normalizeTime(item.startTime);
  const end = normalizeTime(item.endTime);
  if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return "请选择日期";
  if (!start || (item.kind!=="milestone"&&!end)) return "请输入正确的时间格式";
  if (item.kind!=="milestone" && start! >= end!) return "结束时间需要晚于开始时间";
  if (!item.title.trim()) return "请输入事项";
  return null;
}

export function getCalendarOwnerLabel(ownerType: CalendarOwnerType, ownerName: string): string {
  return ownerType === "user" ? `${ownerName}的日程` : `${ownerName}的日程`;
}

export function getCalendarOwnerKey(ownerType: CalendarOwnerType, ownerId: string): string {
  return getOwnerStorageKey(ownerType, ownerId);
}

/** Public user plans are shared facts; unreleased descriptions stay out of model input. */
export function buildUserPublicCalendarContext(): string {
 const now=Date.now(),lower=new Date(now-7*86400000).toISOString().slice(0,10),upper=new Date(now+35*86400000).toISOString().slice(0,10);
 const rows=loadOwnerCalendarPlans("user","self").flatMap(p=>p.items).filter(i=>i.visibility==="public"&&i.date>=lower&&i.date<=upper).sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime)).slice(0,20).map(i=>`${i.date} ${i.startTime} ${i.title}${schedulePublicContentSuffix(i)}`);
 return rows.length?`用户已公开的日程安排（仅作可知事实，按话题自然使用）：\n${rows.join("\n")}`.slice(0,6000):"";
}
