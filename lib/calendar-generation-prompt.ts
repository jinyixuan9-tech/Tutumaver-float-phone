import { loadSchedulePrompts } from "./schedule-prompt-settings";
export const CALENDAR_SCHEDULE_CONTRACT = "每项标visibility(public/private)与kind(event/milestone)。event实际占用时间，milestone为发布、上线、截止、纪念等定时事项，只填startTime，不需endTime，publicAt留空、不占时间；可以与任何时段事项重叠。公开标题只写可预告信息，标题和时间提前可见，contentDescription用一两句确定具体内容，到publicAt才解锁；publicAt留空按日程开始时间解锁，使用角色当地时间。location仅供内部安排，不对公开平台提供；需要对外公开的地点或平台写进可解锁的contentDescription。busyLevel填1立刻回复、2短暂回复、3忙时等待、4无法看手机，节点填1。私人公共场景可填一句encounterScene，仅写路人能短暂看见的动作与宽泛场所。最新进度中的传闻、尚未回应、接洽与考虑仅保留其确定程度，不生成已确定参加的工作；明确确认的事项才据此安排。按指定结构输出。";
export function calendarGenerationPrompt() { return loadSchedulePrompts().calendar + "\n" + CALENDAR_SCHEDULE_CONTRACT; }
// Kept as a default for older callers; engines load the saved prompt at request time.
export const CALENDAR_LIFE_GENERATION_PROMPT = calendarGenerationPrompt();
