import { calendarWallTimeToInstant } from "./calendar-time";
import { getSystemTimeZone } from "./character-time";
type PublicContent = { contentDescription?: string; publicAt?: string | number; startsAt?: number; date?: string; startTime?: string };
export function scheduleContentUnlockAt(item: PublicContent, zone = getSystemTimeZone()): number {
 const value = item.publicAt;
 if (typeof value === "number" && Number.isFinite(value)) return value;
 if (typeof value === "string" && value.trim()) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  const parsed = match ? calendarWallTimeToInstant(match[1], match[2], zone) : Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
 }
 if (Number.isFinite(item.startsAt)) return item.startsAt!;
 return item.date && item.startTime ? calendarWallTimeToInstant(item.date, item.startTime, zone) : Infinity;
}
export function unlockedScheduleContent(item: PublicContent, now = Date.now(), zone?: string): string {
 return now >= scheduleContentUnlockAt(item, zone) ? item.contentDescription?.trim().slice(0,4000) || "" : "";
}
export function schedulePublicContentSuffix(item: PublicContent, now = Date.now(), zone?: string): string {
 const text=unlockedScheduleContent(item,now,zone);
 return text ? `｜已公开内容：${text}` : item.contentDescription ? "｜具体内容尚未公开，仅已知日程安排" : "";
}
