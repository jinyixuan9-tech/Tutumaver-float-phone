import { scheduleContentUnlockAt } from "./schedule-public-content";
import { calendarWallTimeToInstant } from "./calendar-time";
import { loadCharacters } from "./character-storage";
import { formatZonedPromptTimestamp, getSystemTimeZone } from "./character-time";
import { applyGeneratedCalendarRange, deleteCalendarEntriesByWeverseKey, loadCalendarEntriesByWeverseKey } from "./calendar-storage";
import { getWeekdayLabel } from "./calendar-utils";
import type { CalendarScheduleItem } from "./calendar-types";
import { loadWeverseState, type WeverseScheduleItem } from "./weverse-storage";

const calendarOwner = (id: string) => id.startsWith("user:") ? "user:self" : id;

function scheduleKey(item: WeverseScheduleItem) {
  const prefix = `cal_${item.communityId}_`;
  return item.id.startsWith(prefix) ? item.id.slice(prefix.length) : item.id;
}

function toDateParts(timestamp: number, zone: string) {
  const value = formatZonedPromptTimestamp(new Date(timestamp), zone);
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

export function syncWeverseScheduleItemToCalendar(item: WeverseScheduleItem) {
  if (!item.memberCharacterIds.length || item.linkedLiveId) return { saved: 0, pending: 0 };
  const key = scheduleKey(item);
  const previous = loadCalendarEntriesByWeverseKey(key);
  const community = loadWeverseState().communities.find(row => row.id === item.communityId);
  const localOwners = new Set((community?.memberCharacterIds ?? item.memberCharacterIds).map(calendarOwner));
  const ownerIds = new Set(item.memberCharacterIds.map(calendarOwner));
  // Another community can show this same event with a subset of its participants.
  for (const row of previous) if (!localOwners.has(row.ownerId)) ownerIds.add(row.ownerId);

  const characters = loadCharacters();
  const now = new Date().toISOString();
  const rows = Array.from(ownerIds, ownerId => {
    const existing = previous.find(row => row.ownerId === ownerId)?.item;
    const zone = characters.find(character => character.id === ownerId)?.timeZone || getSystemTimeZone();
    const start = toDateParts(item.startsAt, zone);
    const end = toDateParts(item.endsAt ?? item.startsAt + 3600000, zone);
    const endTime = end.date === start.date && end.time > start.time ? end.time : "23:59";
    const entry: CalendarScheduleItem = {
      ...existing,
      id: existing?.id || `wvs_${key}_${ownerId}`,
      date: start.date,
      weekday: getWeekdayLabel(start.date),
      startTime: start.time,
      endTime: item.calendarSync ? endTime : start.time,
      title: item.title,
      location: item.location ?? "",
      contentDescription: item.contentDescription,
      publicAt: item.publicAt ? new Date(item.publicAt).toISOString() : undefined,
      colorKey: existing?.colorKey || "blue",
      visibility: item.visibility === "public" ? "public" : "private",
      kind: item.calendarSync ? "event" : "milestone",
      wvsType: item.type,
      source: "weverse",
      externalSource: "weverse",
      externalId: key,
      sharedGroupId: undefined,
      sharedCharacterIds: undefined,
      busyLevel: item.calendarSync ? item.busyLevel || 3 : 1,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    return { ownerId, items: [entry] };
  });
  const dates = rows.map(row => row.items[0].date).sort();
  return applyGeneratedCalendarRange(rows, dates[0], dates[dates.length - 1], "supplement", key);
}

export function removeWeverseScheduleItemEverywhere(itemId: string): void {
  const matched = loadWeverseState().schedules.find(item => item.id === itemId);
  deleteCalendarEntriesByWeverseKey(matched ? scheduleKey(matched) : itemId);
}

export function syncCalendarProjectionBackToWeverse(
  externalId: string,
  ownerId: string,
  patch: Pick<CalendarScheduleItem, "date" | "startTime" | "endTime" | "location" | "title" | "contentDescription" | "publicAt" | "visibility" | "kind" | "busyLevel">,
) {
  const state = loadWeverseState();
  const current = state.schedules.find(item => scheduleKey(item) === externalId);
  const previous = loadCalendarEntriesByWeverseKey(externalId);
  const original = previous.find(row => row.ownerId === (ownerId === "self" ? "user:self" : ownerId))?.item;
  if (!original || original.linkedLiveId) return;
  const zone = loadCharacters().find(character => character.id === ownerId)?.timeZone || getSystemTimeZone();
  const startsAt = calendarWallTimeToInstant(patch.date, patch.startTime, zone);
  const endsAt = calendarWallTimeToInstant(patch.date, patch.endTime, zone);
  const calendarSync = patch.kind !== "milestone";
  return syncWeverseScheduleItemToCalendar({
    id: current?.id ?? externalId,
    communityId: current?.communityId ?? "",
    memberCharacterIds: current?.memberCharacterIds ?? previous.map(row => row.ownerId),
    source: current?.source ?? "manual",
    type: original.wvsType || (patch.kind === "milestone" ? "release" : "performance"),
    createdAt: Date.parse(original.createdAt),
    title: patch.title.trim() || original.title,
    contentDescription: patch.contentDescription,
    publicAt: patch.publicAt ? scheduleContentUnlockAt({ ...patch, startsAt }, zone) : undefined,
    location: patch.location.trim() || undefined,
    startsAt,
    endsAt: calendarSync ? endsAt : undefined,
    calendarSync,
    busyLevel: patch.busyLevel,
    visibility: patch.visibility === "public" ? "public" : "internal",
    updatedAt: Date.now(),
  });
}

export function calendarForWeverseProjection(item: WeverseScheduleItem) {
  return loadCalendarEntriesByWeverseKey(scheduleKey(item))[0]?.item;
}
