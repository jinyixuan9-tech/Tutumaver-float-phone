import {addFriendRequest,loadFriendRequests,dispatchFriendRequestUpdated} from "./friend-request-storage";
import { loadCharacters } from "./character-storage";
import { loadChatSessions, loadChatMessages } from "./chat-storage";
import { chatStatus } from "./sms-continuity";
import { generateSmsReply } from "./sms-engine";
import { addSmsMessage, ensureSmsThread, loadSms, saveSms, phoneFromPersona, smsId } from "./sms-storage";
import {loadPhoneState} from "./phone-storage";
import {communicationContactEnabled,acquireContact,releaseContact,isCommunicationCallActive,noteContact,latestContactAt,loadCommunicationPolicy,saveCommunicationPolicy,loadContactRuntime,saveContactRuntime,communicationBusy,clearBusySms,queueBusySms} from "./communication-policy";
import {chooseBusyResumeAt} from "./chat-busy-hold";
import {planContact,deferContactCheck,type ContactPlan} from "./contact-planner";
import {isWithinPushQuietHours} from "./push-client";
let running=false;
export async function deliverPlannedContact(characterId:string,plan:ContactPlan):Promise<boolean>{
 if(plan.channel==="wait"||isCommunicationCallActive(characterId))return false;
 if(plan.channel==="request"){const requests=loadFriendRequests().filter(r=>r.characterId===characterId&&Date.now()-Date.parse(r.createdAt)<86400000);if(!plan.requestMessage?.trim()||requests.some(r=>r.status==="pending")||requests.length>=3||!chatStatus(characterId).blocked)return false;addFriendRequest(characterId,plan.requestMessage,requests.length+1);dispatchFriendRequestUpdated();noteContact(characterId,"request",plan.reason);return true;}
 if(plan.channel==="phone"){
  if(!communicationContactEnabled("phone",characterId))return false;
  const permission=loadCommunicationPolicy().phone;
  if(!permission.proactiveCharacterIds.includes(characterId)&&!permission.callbackCharacterIds.includes(characterId))return false;
  if((communicationBusy("phone",characterId)?.level||1)>=3)return false;
  const fresh=loadContactRuntime(),missed=loadPhoneState().calls.find(c=>c.characterId===characterId&&c.direction==="outgoing"&&["missed","busy","declined"].includes(c.status));
  if(missed){fresh.callbacks=[...fresh.callbacks,missed.id].slice(-100);saveContactRuntime(fresh);}
  noteContact(characterId,"phone",plan.reason);
  window.dispatchEvent(new CustomEvent("phone-request-incoming",{detail:{characterId,source:"system"}}));return true;
 }
 if(plan.channel!=="sms"||!communicationContactEnabled("sms",characterId))return false;
 const state=loadSms();const character=loadCharacters().find(c=>c.id===characterId);if(!character)return false;
 const thread=ensureSmsThread(state,characterId,"real",state.characterNumbers[characterId]||phoneFromPersona(character.persona)||"");
 const since=latestContactAt(characterId);const response=await generateSmsReply(thread,state,"proactive",false,true);
 const fresh=loadSms(),live=fresh.threads.find(t=>t.id===thread.id)||thread;
 if(live.blockedByMe||live.blockedByCharacter||latestContactAt(characterId)>since||(communicationBusy("sms",characterId)?.level||1)>=3)return false;
 if(!communicationContactEnabled("sms",characterId)||!loadCommunicationPolicy().sms.proactiveCharacterIds.includes(characterId))return false;
 if(!response.messages.length||response.channel!=="sms"&&response.channel!==undefined)return false;
 if(!fresh.threads.some(t=>t.id===live.id))fresh.threads.push(live);
 const batch=smsId();for(const m of response.messages)addSmsMessage(fresh,live,"incoming",m.original,m.translated,batch);
 if(response.summary)live.summary=response.summary;saveSms(fresh);noteContact(characterId,"sms",plan.reason);return true;
}
async function resumeSms():Promise<void>{
 for(const item of loadContactRuntime().pending){
  if(item.dueAt>Date.now())continue;
  const state=loadSms(),thread=state.threads.find(t=>t.id===item.threadId);
  if(!thread||thread.blockedByMe||thread.blockedByCharacter){clearBusySms(item.threadId);continue;}
  const latest=state.messages.filter(m=>m.threadId===thread.id&&m.delivered).at(-1);
  if(latest?.direction==="incoming"){clearBusySms(item.threadId,item.messageId);continue;}
  const busy=communicationBusy("sms",thread.characterId);
  if(busy&&busy.level>1){queueBusySms(thread.id,chooseBusyResumeAt(busy),item.messageId);continue;}
  if(!acquireContact(thread.characterId))continue;
  try{
   const response=await generateSmsReply(thread,state,"reply");
   const fresh=loadSms(),live=fresh.threads.find(t=>t.id===thread.id);
   if(!live||live.blockedByMe||live.blockedByCharacter||response.deferred)continue;
   if((communicationBusy("sms",thread.characterId)?.level||1)>=3)continue;
   if(response.messages.length){const batch=smsId();for(const m of response.messages)addSmsMessage(fresh,live,"incoming",m.original,m.translated,batch);if(response.summary)live.summary=response.summary;saveSms(fresh);noteContact(thread.characterId,"sms","忙完后回复积累的来信");}
   if(response.channel==="call"){window.dispatchEvent(new CustomEvent("phone-request-incoming",{detail:{characterId:thread.characterId,source:"sms"}}));noteContact(thread.characterId,"phone","回复来信时发起通话");}
   clearBusySms(thread.id,item.messageId);
  }catch{queueBusySms(thread.id,Date.now()+5*60000,item.messageId);}finally{releaseContact(thread.characterId);}
 }
}
/** One shared decision per role across channels. An empty opened thread is never a motive. */
export async function maybeGenerateSmsBackgroundMessage():Promise<void>{
 if(running||typeof window==="undefined"||document.visibilityState!=="visible")return;
 running=true;
 try{
  await resumeSms();
  if(isWithinPushQuietHours(Date.now()))return;
  const state=loadSms();
  // Preserve old opt-in on upgrade only for already established SMS contacts.
  if(["rare","normal","often"].includes(state.proactive)){
   const p=loadCommunicationPolicy();p.sms.proactiveCharacterIds=[...new Set([...p.sms.proactiveCharacterIds,...state.threads.filter(t=>t.identityId==="real"&&state.messages.some(m=>m.threadId===t.id&&m.delivered)).map(t=>t.characterId)])];saveCommunicationPolicy(p);state.proactive="on";saveSms(state);
  }
  const p=loadCommunicationPolicy(),runtime=loadContactRuntime();
  const ids=loadCharacters().filter(c=>{
   if(isCommunicationCallActive(c.id))return false;
   if(!p.sms.proactiveCharacterIds.includes(c.id)&&!p.phone.proactiveCharacterIds.includes(c.id)&&!p.phone.callbackCharacterIds.includes(c.id))return false;
   const thread=state.threads.find(t=>t.characterId===c.id&&t.identityId==="real");
   const hasMessages=thread&&state.messages.some(m=>m.threadId===thread.id&&m.delivered);
   const chatted=loadChatSessions().some(s=>!s.isGroup&&s.contactId===c.id&&loadChatMessages(s.id).some(m=>m.role==="user"));
   const called=loadPhoneState().calls.some(call=>call.characterId===c.id);
   return (hasMessages||chatted||called||chatStatus(c.id).blocked)&&Date.now()-(latestContactAt(c.id)||0)>5*60000&&(runtime.checked[c.id]||0)<=Date.now();
  });
  const c=ids[Math.floor(Math.random()*ids.length)];if(!c||!acquireContact(c.id))return;
  try{const at=latestContactAt(c.id);const plan=await planContact(c.id);deferContactCheck(c.id,plan.nextCheckMinutes);if(latestContactAt(c.id)>at)return;await deliverPlannedContact(c.id,plan);}finally{releaseContact(c.id);}
 }finally{running=false;}
}
