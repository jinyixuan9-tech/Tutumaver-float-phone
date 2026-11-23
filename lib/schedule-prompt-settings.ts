import { kvGet, kvSet, registerKvMigration } from "./kv-db";
export type SchedulePromptKind = "calendar" | "weverse";
export const SCHEDULE_PROMPT_KEY = "ai_phone_schedule_prompts_v1";
registerKvMigration(SCHEDULE_PROMPT_KEY);
export const DEFAULT_SCHEDULE_PROMPTS: Record<SchedulePromptKind, string> = {
 calendar: "为角色构思一段有工作推进、个人兴趣和关系往来的生活。安排可以来自已有项目、角色主动想尝试的事情、他人的邀请或新出现的机会。结合职业阶段和兴趣拓展参与方式，让不同角色有各自的选择与来由。可以参考跨领域合作、做客节目、前后辈企划、工作花絮、兴趣创作、观赛旅行或阶段性个人安排，每次选择适合的方向展开。兼顾已有项目与新机会，数量随事件自然形成，各周自然疏密、日期可以留白。固定上班、上课、健身等作息及普通吃饭购物省略，连续同项准备合并。公开内容用一两句写清选曲、主题、主要环节或看点，作为各平台共同底稿；实际拍摄与后续发布可以安排在不同日期。专题宣传直播围绕作品和重要节点安排，日常随性开播留给平台自主触发。沿用已有约定，按本次补充或重排模式生成。",
 weverse: "为社区补充有辨识度的公开工作与作品节点。结合成员职业阶段、兴趣、关系和当前项目，兼顾项目推进与新机会，拓展合作对象和内容形式。可以从做客节目、一日企划、同公司前后辈合作、采访、舞台合作、录音或拍摄花絮、个人影像企划中选择适合的方向。数量少而具体，节奏随工作自然疏密。每项公开内容用一两句确定主题、选曲或主要环节，形成各平台共用的底稿；拍摄录制和后续发布分别安排。LIVE选取需要提前安排的作品宣传或专题活动，日常随性开播交由平台自主触发。"
};
export function loadSchedulePrompts(): Record<SchedulePromptKind, string> {
 let raw: Partial<Record<SchedulePromptKind,string>> = {};
 try { raw = JSON.parse(kvGet(SCHEDULE_PROMPT_KEY) || "{}") || {}; } catch {}
 return { calendar: (typeof raw.calendar === "string" && raw.calendar.trim() ? raw.calendar : DEFAULT_SCHEDULE_PROMPTS.calendar) + (raw.weverse && raw.weverse!==DEFAULT_SCHEDULE_PROMPTS.weverse && !raw.calendar?.includes(raw.weverse) ? `\n职业构思补充：${raw.weverse}` : ""),
 weverse: typeof raw.weverse === "string" && raw.weverse.trim() ? raw.weverse : DEFAULT_SCHEDULE_PROMPTS.weverse };
}
export function saveSchedulePrompt(kind: SchedulePromptKind, text: string) {
 // Opening the calendar editor already displays any legacy customized Weverse text,
 // appended once by loadSchedulePrompts(). Saving it makes that combined text the
 // calendar source of truth so future edits can remove it without re-injection.
 const previous = loadSchedulePrompts();
 const next = kind === "calendar"
  ? { calendar: text.trim() || DEFAULT_SCHEDULE_PROMPTS.calendar, weverse: DEFAULT_SCHEDULE_PROMPTS.weverse }
  : { calendar: previous.calendar, weverse: text.trim() || DEFAULT_SCHEDULE_PROMPTS.weverse };
 kvSet(SCHEDULE_PROMPT_KEY, JSON.stringify(next));
 return next;
}
