import { kvGet, kvSet, registerKvMigration } from "./kv-db";
export type MediaPreference = "none" | "text" | "balanced" | "free";
export type PhotoDeliveryMode = "text" | "auto";
export const MEDIA_APPS = { chat: "Chat", moments: "朋友圈", lysn: "LYSN", twitter: "X", weverse: "WVS Artist", diary: "iCity", theqoo: "Theqoo" } as const;
export type MediaApp = keyof typeof MEDIA_APPS;
export type MediaPreferences = { global: MediaPreference; apps: Partial<Record<MediaApp, MediaPreference>>; delivery: Partial<Record<MediaApp, PhotoDeliveryMode>> };
export const DEFAULT_PHOTO_DELIVERY: Record<MediaApp, PhotoDeliveryMode> = { chat: "text", lysn: "text", moments: "auto", twitter: "auto", weverse: "auto", diary: "text", theqoo: "text" };
export function effectivePhotoDelivery(appId: string): PhotoDeliveryMode {
  if (!(appId in DEFAULT_PHOTO_DELIVERY)) return "text";
  const value = loadMediaPreferences().delivery[appId as MediaApp];
  return value === "text" || value === "auto" ? value : DEFAULT_PHOTO_DELIVERY[appId as MediaApp];
}
const KEY = "ai_phone_media_preferences_v1";
const RECENT = "ai_phone_media_decisions_v1";
registerKvMigration(KEY); registerKvMigration(RECENT);
export function loadMediaPreferences(): MediaPreferences {
  try { const value = JSON.parse(kvGet(KEY) || "{}"); return { global: valid(value.global) ? value.global : "text", apps: Object.fromEntries(Object.entries(value.apps || {}).filter(([key, mode]) => key in MEDIA_APPS && valid(mode))), delivery: Object.fromEntries(Object.entries(value.delivery || {}).filter(([key, mode]) => key in MEDIA_APPS && (mode === "text" || mode === "auto"))) }; }
  catch { return { global: "text", apps: {}, delivery: {} }; }
}
function valid(mode: unknown): mode is MediaPreference { return mode === "none" || mode === "text" || mode === "balanced" || mode === "free"; }
export function saveMediaPreferences(value: MediaPreferences): void { kvSet(KEY, JSON.stringify(value)); }
export function effectiveMediaPreference(appId: string,actorId?:string): MediaPreference { const value = loadMediaPreferences(); return mediaScope(appId,actorId).intent || value.apps[appId as MediaApp] || value.global; }
type Decision = { image: boolean; selfie: boolean; at: number };
function decisions(): Record<string, Decision[]> { try { return JSON.parse(kvGet(RECENT) || "{}"); } catch { return {}; } }
export function recordMediaDecision(appId: string, actorId: string, image: boolean, description = ""): void {
  if (!(appId in MEDIA_APPS)) return;
  const all = decisions(); const key = `${appId}:${actorId}`;
  all[key] = [...(all[key] || []), { image, selfie: /自拍|selfie|셀카|对镜/i.test(description), at: Date.now() }].slice(-6);
  // Bounded history, ordered by last activity.
  const compact = Object.fromEntries(Object.entries(all).sort((a,b) => (b[1].at(-1)?.at || 0) - (a[1].at(-1)?.at || 0)).slice(0, 200));
  kvSet(RECENT, JSON.stringify(compact));
}
export function mediaPreferencePrompt(appId: string, actorId: string): string {
  if (!(appId in MEDIA_APPS)) return "";
  const mode = effectiveMediaPreference(appId,actorId);
  const recent = (decisions()[`${appId}:${actorId}`] || []).filter(item => Date.now() - item.at < 86400000);
  const baseline = appId === "diary" ? "日记按真实生活自然配图，不必每篇有图。" : appId === "chat" || appId === "lysn" ? "这是聊天渠道，基础习惯明显少图。" : appId === "moments" ? "朋友圈适合生活记录，配图可以比聊天自然地多一些。" : appId === "twitter" ? "X 以短文字为主，偶尔配图。" : "WVS 艺人分享比私聊更适合配图，但不要求每帖有图。";
  return ["AI 配图倾向（仅主动发图，不约束用户手动图片或明确的索图请求）：", baseline,
    mode === "none" ? "纯文字：不要主动提出图片，不生成图片描述或图片标记。" : mode === "text" ? "文字优先：纯文字是默认；只有明确的视觉分享动机才发图，普通问候、疲惫或闲聊不要配图。" : mode === "balanced" ? "平衡：先判断视觉动机，生活记录、工作后台、旅行、食物、穿搭可自然配图，仍应有纯文字内容。" : "自由判断：按人设和平台习惯决定，不强制少图或多图。",
    "先判断是否值得发图，再决定相册匹配或生图。相册丰富不是发图理由。不发图时不要填写照片描述、photoId 或发图标记。",
    "刚发过图片则降低下一次发图意愿；连续两次有图则下一次强烈倾向纯文字。近期发过自拍，进一步降低自拍意愿；明确索图、刚换造型或值得展示的新事物等强视觉动机可突破冷却。",
    recent.length ? `最近主动内容的媒体记录：${recent.map(item => item.image ? item.selfie ? "自拍" : "有图" : "纯文字").join(" → ")}。` : "",
    "JSON 格式的配图内容请另填 mediaReason，简述具体分享动机；纯文字时留空。不要把判断过程写进用户可见的正文。",
  ].filter(Boolean).join("\n");
}
export function allowMediaIntent(appId: string, actorId: string, description: string, reason?: string, explicitlyRequested = false): boolean {
  if (!description.trim()) return false;
  if (!explicitlyRequested && effectiveMediaPreference(appId,actorId) === "none") return false;
  if (explicitlyRequested || effectiveMediaPreference(appId,actorId) === "free") return true;
  const recent = (decisions()[`${appId}:${actorId}`] || []).filter(item => Date.now() - item.at < 86400000);
  const last = recent.at(-1); const consecutive = last?.image && recent.at(-2)?.image;
  const selfieRepeat = /自拍|selfie|셀카|对镜/i.test(description) && recent.slice(-2).some(item => item.selfie);
  // Concrete motive can override cooldown; this is not a hard probability.
  if ((consecutive || selfieRepeat || (effectiveMediaPreference(appId,actorId) === "text" && last?.image)) && !reason?.trim()) return false;
  return true;
}

// 076: Per-app/character photo-source overrides. Preserves the share edition's existing media defaults.
export type MediaScope={intent?:MediaPreference;source?:'album_only'|'album_then_generated'|'generated_only'};
export type MediaScopeSettings={global:MediaScope;apps:Record<string,MediaScope>;actors:Record<string,MediaScope>;actorApps:Record<string,MediaScope>};
const MEDIA_SCOPES_KEY='ai_phone_media_scopes_v1';registerKvMigration(MEDIA_SCOPES_KEY);
export function loadMediaScopes():MediaScopeSettings{try{const v=JSON.parse(kvGet(MEDIA_SCOPES_KEY)||'{}');return{global:v.global||{},apps:v.apps||{},actors:v.actors||{},actorApps:v.actorApps||{}};}catch{return{global:{},apps:{},actors:{},actorApps:{}};}}
export function saveMediaScopes(v:MediaScopeSettings){kvSet(MEDIA_SCOPES_KEY,JSON.stringify(v));}
export function mediaScope(app:string,actor?:string):MediaScope{const v=loadMediaScopes();return{...v.global,...v.apps[app],...(actor?v.actors[actor]:{}),...(actor?v.actorApps[actor+':'+app]:{})};}
