import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadCharacters } from "./character-storage";
import { loadCharacterWorldGroups } from "./character-world-storage";
import { loadUserIdentities, resolveUserIdentity } from "./settings-storage";
import { loadChatSessions } from "./chat-storage";
import { loadSms } from "./sms-storage";
import type { CheckPhoneChatConversation, CheckPhoneMessageThread, CheckPhoneCallLog } from "./checkphone-config";
const KEY="ai_phone_shared_communications_v1";
registerKvMigration(KEY);
export const COMMUNICATIONS_UPDATED_EVENT="checkphone-communications-updated";
type Kind="chat"|"sms"|"phone";
type Row=CheckPhoneChatConversation|CheckPhoneMessageThread|CheckPhoneCallLog;
type Event={id:string;kind:Kind;owner:string;peer:string;row:Row};
function read():Event[]{try{return JSON.parse(kvGet(KEY)||"[]");}catch{return [];}}
const norm=(s:string)=>s.normalize("NFKC").replace(/[\s+()（），,]/g,"").toLowerCase();
export function isUserCommunicationName(owner:string,name:string):boolean {
 const sms=loadSms();
 const labels=["用户","user","{{user}}","我","你","您",...loadUserIdentities().map(i=>i.name),resolveUserIdentity(owner,"chat")?.name||"",resolveUserIdentity(owner,"checkphone")?.name||"",sms.realNumber,...sms.identities.map(i=>i.number),...loadChatSessions().filter(s=>s.contactId===owner&&!s.isGroup).map(s=>s.characterRemarkForUser||"")].filter(Boolean).map(norm);
 const label=norm(name);
 return labels.some(value=>label===value || (value.length>=2 && label.startsWith(value) && /^[（(【\[]/.test(name.slice(value.length).trim())));
}
function counterpart(owner:string,name:string){
 const chars=loadCharacters(); const group=loadCharacterWorldGroups().find(g=>g.memberIds.includes(owner));
 const matches=chars.filter(c=>group?.memberIds.includes(c.id)&&norm(c.name)===norm(name));
 if(matches.length!==1)return null;
 const peer=matches[0];
 if(peer.id===owner||!group?.relations.some(r=>(r.fromCharacterId===owner&&r.toCharacterId===peer.id)||(r.toCharacterId===owner&&r.fromCharacterId===peer.id)))return null;
 return peer;
}
function invert(direction:string){return direction==="incoming"?"outgoing":"incoming";}
function project(event:Event,owner:string):Row {
 const peerId=event.owner===owner?event.peer:event.owner;
 const name=loadCharacters().find(c=>c.id===peerId)?.name||"角色";
 const row=event.row;
 const mirrored=owner!==event.owner;
 if(event.kind==="phone") {
  const call=row as CheckPhoneCallLog;
  // A missed incoming call is an unconnected outgoing call at the other end.
  return {...call,id:event.id,name,direction:mirrored?(call.direction==="missed"?"outgoing":(call.direction === "outgoing" && /未接|未通|未接通/.test(call.durationLabel) ? "missed" : invert(call.direction)) as CheckPhoneCallLog["direction"]):call.direction,innerThought:"",summary:call.summary};
 }
 const thread=row as CheckPhoneChatConversation|CheckPhoneMessageThread;
 const messages=thread.messages.map(m=>({...m,direction:mirrored?invert(m.direction) as "incoming"|"outgoing":m.direction}));
 return event.kind==="chat"?{...(row as CheckPhoneChatConversation),id:event.id,name,messages}:{...(row as CheckPhoneMessageThread),id:event.id,sender:name,messages};
}
/** Only refresh commits generated records. Viewing caches never creates a second event. */
export function sharedCommunicationRows<T extends Row>(owner:string,kind:Kind,rows:T[],commit=false):T[]{
 const chars=loadCharacters();let events=read();let changed=false;
 const unrelated:T[]=[];
 for(const row of rows){
  if(row.id.startsWith("shared:"))continue;
  const name=kind==="sms"?(row as CheckPhoneMessageThread).sender:(row as CheckPhoneChatConversation|CheckPhoneCallLog).name;
  if(isUserCommunicationName(owner,name))continue;
  const peer=counterpart(owner,name);
  if(!peer){if(!chars.some(c=>norm(c.name)===norm(name)))unrelated.push(row);continue;}
  if(!commit)continue;
  const pair=[owner,peer.id].sort().join(":");
  const signature=kind==="phone"?`${(row as CheckPhoneCallLog).createdAt}:${(row as CheckPhoneCallLog).durationLabel}`:"thread";
  const id=`shared:${kind}:${pair}:${signature}`;
  const existing=events.find(e=>e.id===id);
  if(existing){
   if(kind!=="phone"){
    const previous=project(existing,owner) as CheckPhoneChatConversation|CheckPhoneMessageThread;
    const incoming=row as CheckPhoneChatConversation|CheckPhoneMessageThread;
    const matches=incoming.messages.length>previous.messages.length && previous.messages.every((m,i)=>m.text===incoming.messages[i]?.text && m.direction===incoming.messages[i]?.direction && m.timeLabel===incoming.messages[i]?.timeLabel);
    if(matches){
     const extended=incoming.messages.map(m=>({...m,direction:owner===existing.owner?m.direction:invert(m.direction) as "incoming"|"outgoing"}));
     existing.row={...existing.row,messages:extended,preview:incoming.preview,timeLabel:incoming.timeLabel} as Row;changed=true;
    }
   }
   continue;
  }
  events.push({id,kind,owner,peer:peer.id,row});changed=true;
 }
 if(changed){kvSet(KEY,JSON.stringify(events));window.dispatchEvent(new Event(COMMUNICATIONS_UPDATED_EVENT));}
 const shared=events.filter(e=>e.kind===kind&&(e.owner===owner||e.peer===owner)&&chars.some(c=>c.id===e.owner)&&chars.some(c=>c.id===e.peer)).map(e=>project(e,owner) as T);
 return [...shared,...unrelated];
}

export function sharedCommunicationsPrompt(owner:string):string {
 return read().filter(e=>e.owner===owner||e.peer===owner).map(e=>`${e.kind}: ${JSON.stringify(project(e,owner))}`).join("\n");
}
