export type CalendarOwnerType = "user" | "character";

export type CalendarColorKey =
  | "blue"
  | "green"
  | "amber"
  | "rose"
  | "violet"
  | "teal"
  | "slate"
  | "lilac";

/** 角色日程期间的可联系程度；数字越大越难及时回复。 */
export type CalendarBusyLevel = 1 | 2 | 3 | 4;

export type CalendarScheduleItem = {
  linkedLiveId?: string;
  contentDescription?: string;
  encounterScene?: string;
  visibility?: "private" | "public";
  kind?: "event" | "milestone";
  publicAt?: string;
  wvsType?: import("./weverse-storage").WeverseScheduleType;
  id: string;
  date: string;       // YYYY-MM-DD
  weekday: string;    // 周一 ~ 周日
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  location: string;
  title: string;
  /** 事项 emoji 图标（可选，一个 emoji） */
  emoji?: string;
  colorKey: CalendarColorKey;
  source: "manual" | "generated" | "weverse";
  /** 外部平台同步来源；用于把同一条 WVS 工作日程与手机日历关联起来。 */
  externalSource?: "weverse";
  externalId?: string;
  /** Same real-world event mirrored to several character calendars. */
  sharedGroupId?: string;
  sharedCharacterIds?: string[];
  /** AI 生成时按事项强度随机匹配；用户可在编辑日程时手动调整。 */
  busyLevel?: CalendarBusyLevel;
  createdAt: string;
  updatedAt: string;
};

export type CalendarWeekPlan = {
  id: string;
  ownerType: CalendarOwnerType;
  ownerId: string;
  weekStart: string; // YYYY-MM-DD, Monday
  items: CalendarScheduleItem[];
  updatedAt: string;
};
