import { kvGet, kvSet, registerKvMigration } from "./kv-db";
const KEY = "ai_phone_chat_call_archives_v1";
registerKvMigration(KEY);
export type CallArchiveLine = { id: string; speaker: string; text: string; action?: boolean };
export type CallArchive = { id: string; sourceId: string; sessionId: string; kind: "voice" | "video"; title: string; date: number; duration: string; lines: CallArchiveLine[]; createdAt: number; mode: "auto" | "manual" };
type Data = { autoSessions: string[]; archives: CallArchive[] };
function read(): Data {
  try {
    const data = JSON.parse(kvGet(KEY) || "{}");
    return { autoSessions: Array.isArray(data.autoSessions) ? data.autoSessions : [], archives: Array.isArray(data.archives) ? data.archives : [] };
  } catch { return { autoSessions: [], archives: [] }; }
}
export function isAutoCallArchive(sessionId: string): boolean { return read().autoSessions.includes(sessionId); }
export function setAutoCallArchive(sessionId: string, enabled: boolean): void {
  const data = read();
  data.autoSessions = enabled ? [...new Set([...data.autoSessions, sessionId])] : data.autoSessions.filter(id => id !== sessionId);
  kvSet(KEY, JSON.stringify(data));
}
export function loadCallArchives(sessionId: string): CallArchive[] { return read().archives.filter(a => a.sessionId === sessionId).sort((a,b) => b.date-a.date); }
export function saveCallArchive(input: Omit<CallArchive,"id" | "createdAt">): boolean {
  const lines = input.lines.map(l => ({ id: l.id, speaker: l.speaker, text: l.text, action: l.action })).filter(l => l.text.trim());
  if (!lines.length) return false;
  const data = read();
  if (input.mode === "auto" && data.archives.some(a => a.sessionId === input.sessionId && a.mode === "auto" && a.sourceId === input.sourceId)) return false;
  data.archives.push({ ...input, lines, id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `archive-${Date.now()}-${Math.random()}`, createdAt: Date.now() });
  kvSet(KEY, JSON.stringify(data));
  return true;
}
export function renameCallArchive(id: string, title: string): void {
  const data = read(); const archive = data.archives.find(a => a.id === id);
  if (!archive || !title.trim()) return;
  archive.title = title.trim(); kvSet(KEY, JSON.stringify(data));
}
export function deleteCallArchive(id: string): void {
  const data = read(); data.archives = data.archives.filter(a => a.id !== id);
  kvSet(KEY, JSON.stringify(data));
}

/** These are immutable text-only snapshots and must never enter AI context or memory. */
export type CallArchiveSourceLine = {
 id:string; sessionId:string; role:string; content:string; createdAt:string; senderName?:string;
 mediaType?:string; mediaData?:{label?:string;callLineKind?:"speech"|"action";callEvent?:string;callDuration?:string;callId?:string;callType?:"voice"|"video"};
};
const callMarker = /\[[^\]\n]*(?:发起了(?:群)?(?:语音|视频)通话|(?:挂断了|拒绝了|取消了)(?:群)?(?:语音|视频)通话|(?:语音|视频)通话已结束)\]/;
export function callArchiveLines(messages:CallArchiveSourceLine[],kind:"voice"|"video"):CallArchiveLine[]{
 return messages.flatMap(m=>{
  if(m.role==="system"||m.mediaData?.callEvent||callMarker.test(m.content.trim())||m.mediaType&&m.mediaType!=="audio")return [];
  const raw=(m.mediaType==="audio"?m.mediaData?.label||m.content:m.content).trim();
  if(!raw)return [];
  const action=m.mediaData?.callLineKind==="action"||/^【动作】/.test(raw);
  if(action&&kind!=="video")return [];
  const text=action?raw.replace(/^【动作】\s*/,"").trim():raw;
  return text?[{id:m.id,speaker:m.role==="user"?"我":m.senderName||"TA",text,action}]:[];
 });
}
export function archiveCallSnapshot(input:{
 sessionId:string;sourceId:string;kind:"voice"|"video";date:number;duration:string;
 messages:CallArchiveSourceLine[];mode:"auto"|"manual";title?:string;
}):boolean{
 return saveCallArchive({sessionId:input.sessionId,sourceId:input.sourceId,kind:input.kind,
  title:input.title||(input.kind==="video"?"视频通话":"语音通话"),date:input.date,
  duration:input.duration,mode:input.mode,lines:callArchiveLines(input.messages,input.kind)});
}
export function autoArchiveEndedCall(ended:CallArchiveSourceLine,allMessages:CallArchiveSourceLine[]):boolean{
 if(!isAutoCallArchive(ended.sessionId))return false;
 const callId=ended.mediaData?.callId;
 const kind=ended.mediaData?.callType||(/视频通话/.test(ended.content)?"video":/语音通话/.test(ended.content)?"voice":null);
 if(!kind||!(ended.mediaData?.callEvent==="end"||/(?:挂断了|拒绝了|取消了)(?:群)?(?:语音|视频)通话|(?:语音|视频)通话已结束/.test(ended.content)))return false;
 const messages=allMessages.filter(m=>m.sessionId===ended.sessionId);
 const end=messages.findIndex(m=>m.id===ended.id);if(end<0)return false;
 let start=-1;
 if(callId)start=messages.findIndex((m,i)=>i<end&&m.mediaData?.callId===callId&&m.mediaData?.callEvent==="start");
 if(start<0)for(let i=end-1;i>=0;i--){
  const m=messages[i];
  if(/发起了(?:群)?(?:语音|视频)通话/.test(m.content)&&m.content.includes(kind==="video"?"视频通话":"语音通话")){start=i;break;}
  if(m.mediaData?.callEvent==="end")break;
 }
 if(start<0)return false;
 return archiveCallSnapshot({sessionId:ended.sessionId,sourceId:callId||messages[start].id,kind,
  date:Date.parse(messages[start].createdAt)||Date.now(),duration:ended.mediaData?.callDuration||"",
  messages:messages.slice(start,end+1).filter(m=>!callId||!m.mediaData?.callId||m.mediaData.callId===callId),mode:"auto"});
}
