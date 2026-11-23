import { loadCharacters } from "./character-storage";
import { schedulePublicContentSuffix } from "./schedule-public-content";
import { calendarPublicClues } from "./calendar-public-clues";
import { isPublicCalendarItem } from "./calendar-master";
import { loadOwnerCalendarPlans } from "./calendar-storage";


export type RoleSocialSources = { includeCalendar: boolean; includeWeverseSchedule: boolean };
export const DEFAULT_ROLE_SOCIAL_SOURCES: RoleSocialSources = { includeCalendar: false, includeWeverseSchedule: false };

/** Only the selected character's sources are read; anonymous public feeds never get this context. */
export function roleSocialContext(characterId: string, setting?: RoleSocialSources, audience: "self" | "public" = "public"): string {
  if (!setting?.includeCalendar) return "";
  const now = Date.now();
  const lower = new Date(now - 3 * 86400000).toISOString().slice(0, 10);
  const upper = new Date(now + 35 * 86400000).toISOString().slice(0, 10);
  const lines: string[] = [];
  if (setting.includeCalendar) {
    for (const plan of loadOwnerCalendarPlans(characterId === "user" ? "user" : "character", characterId === "user" ? "self" : characterId)) {
      for (const item of plan.items) if ((audience === "self" || isPublicCalendarItem(item)) && item.date >= lower && item.date <= upper) {
        lines.push(`日历[${isPublicCalendarItem(item) ? "公开" : "私人，仅本人可知"}] ${item.date} ${item.startTime} ${item.title.slice(0, 80)}${schedulePublicContentSuffix(item,now,loadCharacters().find(c=>c.id===characterId)?.timeZone)}`);
      }
    }
  }
  if(audience === "public" && characterId!=="user") lines.unshift(...calendarPublicClues(characterId,now));
  return lines.slice(0, 14).join("；").slice(0, 1800);
}
