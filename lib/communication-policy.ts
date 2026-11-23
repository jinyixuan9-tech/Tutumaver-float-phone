import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { getActiveCalendarBusy } from "./chat-busy-hold";
import { loadChatMessages, loadChatSessions } from "./chat-storage";
import { loadSms } from "./sms-storage";
import { loadPhoneState } from "./phone-storage";
export type ContactChannel = "chat" | "sms" | "phone" | "request";
export type CommunicationOptions = { excludedCharacterIds?: string[]; busyEnabled: boolean; busyCharacterIds: string[]; proactiveCharacterIds: string[]; callbackCharacterIds: string[] };
export type CommunicationPolicy = { sms: CommunicationOptions; phone: CommunicationOptions };
const KEY = "ai_phone_communication_policy_v1";
const RUN_KEY = "ai_phone_communication_runtime_v1";
registerKvMigration(KEY); registerKvMigration(RUN_KEY);
const defaults = (): CommunicationOptions => ({busyEnabled:false,busyCharacterIds:[],proactiveCharacterIds:[],callbackCharacterIds:[]});
export function loadCommunicationPolicy(): CommunicationPolicy {
  try { const raw=JSON.parse(kvGet(KEY)||"{}"); return {sms:{...defaults(),...raw.sms},phone:{...defaults(),...raw.phone}}; } catch {return {sms:defaults(),phone:defaults()};}
}
export function saveCommunicationPolicy(value: CommunicationPolicy) {kvSet(KEY,JSON.stringify(value));if(typeof window!=="undefined")window.dispatchEvent(new Event("communication-policy-updated"));}
export function communicationBusy(channel:"sms"|"phone",characterId:string) {const p=loadCommunicationPolicy()[channel];return p.busyEnabled&&p.busyCharacterIds.includes(characterId)?getActiveCalendarBusy(characterId):null;}
export type SmsPending = {threadId:string; dueAt:number; messageId?:string};
type Runtime = { smsBriefEvents:Record<string,string>; pending:SmsPending[]; attempts:Record<string,{at:number;channel:ContactChannel;reason:string}>; checked:Record<string,number>; callbacks: string[] };
export function loadContactRuntime():Runtime {try{return {smsBriefEvents:{},pending:[],attempts:{},checked:{},callbacks:[],...JSON.parse(kvGet(RUN_KEY)||"{}")};}catch{return {smsBriefEvents:{},pending:[],attempts:{},checked:{},callbacks:[]};}}
export function saveContactRuntime(v:Runtime){kvSet(RUN_KEY,JSON.stringify(v));}
export function queueBusySms(threadId:string,dueAt:number,messageId?:string){const s=loadContactRuntime();const old=s.pending.find(p=>p.threadId===threadId);s.pending=[...s.pending.filter(p=>p.threadId!==threadId),{threadId,dueAt:old?Math.max(old.dueAt,dueAt):dueAt,messageId}];saveContactRuntime(s);}
export function clearBusySms(threadId:string,messageId?:string){const s=loadContactRuntime();s.pending=s.pending.filter(p=>p.threadId!==threadId||(messageId!==undefined&&p.messageId!==messageId));saveContactRuntime(s);}
const locks=new Set<string>();
export function acquireContact(characterId:string):boolean {if(locks.has(characterId))return false;locks.add(characterId);return true;}
export function releaseContact(characterId:string){locks.delete(characterId);}
export function noteContact(characterId:string,channel:ContactChannel,reason:string){const s=loadContactRuntime();s.attempts[characterId]={at:Date.now(),channel,reason};saveContactRuntime(s);}
export function latestContactAt(characterId:string):number {
 const sessions=loadChatSessions().filter(s=>!s.isGroup&&s.contactId===characterId);
 const chat=sessions.flatMap(s=>loadChatMessages(s.id)).filter(m=>m.role==="user"||m.role==="assistant").map(m=>Date.parse(m.createdAt));
 const sms=loadSms(),ids=new Set(sms.threads.filter(t=>t.characterId===characterId&&t.identityId==="real").map(t=>t.id));
 return Math.max(0,...chat,...sms.messages.filter(m=>ids.has(m.threadId)&&m.delivered).map(m=>m.createdAt),...loadPhoneState().calls.filter(c=>c.characterId===characterId).map(c=>c.endedAt),loadContactRuntime().attempts[characterId]?.at||0);
}
export const CONTACT_MOTIVE_RULES = "主动联系开关仅是许可，不要求发送。优先考虑普通 Chat；短信和电话需要具体自然理由，例如继续短信话题、Chat无法联系、实际有急事、想听声音或关系情绪。焦虑、争吵或思念不等于必定打电话，也可克制等待。不要凭空编造紧急事故，不因拉黑就固定绕行。每轮最多选一个渠道；结合所有渠道最后消息、未接和拒接，不重复追同一话题。只知道用户明确告诉你的安排，不可读取或猜成用户私人日历。";

let activeCallCharacter:string|null=null;
export function setCommunicationCallActive(characterId:string|null){activeCallCharacter=characterId;}
export function isCommunicationCallActive(characterId:string){return activeCallCharacter===characterId;}

/** Missing field keeps existing contacts on upgrade; exclusions never delete histories. */
export function communicationContactEnabled(channel:"sms"|"phone",characterId:string){return !loadCommunicationPolicy()[channel].excludedCharacterIds?.includes(characterId);}
