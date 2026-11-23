import {chatStatus} from "./sms-continuity";
import {loadFriendRequests} from "./friend-request-storage";
import {generateChatCompletion, flattenCompletionResult} from "./chat-engine";
import {loadChatSessions,loadChatMessages} from "./chat-storage";
import {loadSms} from "./sms-storage";
import {loadPhoneState,getCharacterPhoneNumber} from "./phone-storage";
import {getActiveCalendarBusy} from "./chat-busy-hold";
import {CONTACT_MOTIVE_RULES,communicationContactEnabled,loadCommunicationPolicy,loadContactRuntime,saveContactRuntime,latestContactAt,type ContactChannel} from "./communication-policy";
export type ContactPlan={channel:ContactChannel|"wait";reason:string;nextCheckMinutes:number;requestMessage?:string};
export async function planContact(characterId:string,allowChat=false,extra=""):Promise<ContactPlan> {
 const policy=loadCommunicationPolicy(); const sms=loadSms();const phone=loadPhoneState();
 const allowed:ContactChannel[]=[];
 const session=loadChatSessions().find(s=>!s.isGroup&&s.contactId===characterId);
 const thread=sms.threads.find(t=>t.characterId===characterId&&t.identityId==="real");
 const blocked=chatStatus(characterId).blocked;
 if(allowChat&&session&&!blocked)allowed.push("chat");
 const requests=loadFriendRequests().filter(r=>r.characterId===characterId&&Date.now()-Date.parse(r.createdAt)<86400000);
 if(blocked&&(allowChat||policy.sms.proactiveCharacterIds.includes(characterId))&&!thread?.blockedByMe&&!requests.some(r=>r.status==="pending")&&requests.length<3)allowed.push("request");
 if(communicationContactEnabled("sms",characterId)&&sms.realNumber.trim()&&policy.sms.proactiveCharacterIds.includes(characterId)&&!thread?.blockedByMe&&!thread?.blockedByCharacter)allowed.push("sms");
 const latestMissed=phone.calls.find(c=>c.characterId===characterId&&c.direction==="outgoing"&&["missed","busy","declined"].includes(c.status));
 const callback=latestMissed&&policy.phone.callbackCharacterIds.includes(characterId)&&latestContactAt(characterId)<=latestMissed.endedAt&&!loadContactRuntime().callbacks.includes(latestMissed.id)&&!phone.calls.some(c=>c.characterId===characterId&&c.startedAt>latestMissed.endedAt&&c.status==="completed");
 if(communicationContactEnabled("phone",characterId)&&getCharacterPhoneNumber(characterId)&&sms.realNumber.trim()&&(policy.phone.proactiveCharacterIds.includes(characterId)||callback))allowed.push("phone");
 if(!allowed.length)return {channel:"wait",reason:"未允许主动联系",nextCheckMinutes:60};
 const active=getActiveCalendarBusy(characterId); // voluntary contact always respects the role's own schedule
 if(active&&active.level>=3)return {channel:"wait",reason:"角色正在忙",nextCheckMinutes:Math.max(10,Math.ceil((active.endsAt-Date.now())/60000))};
 const chat=session?loadChatMessages(session.id).filter(m=>m.role==="user"||m.role==="assistant").slice(-12).map(m=>({role:m.role,text:m.content.slice(0,240),at:m.createdAt})):[];
 const messages=sms.messages.filter(m=>m.threadId===thread?.id&&m.delivered).slice(-10).map(m=>({direction:m.direction,text:m.original.slice(0,240),at:m.createdAt}));
 const context={allowed,chat,sms:messages,calls:phone.calls.filter(c=>c.characterId===characterId).slice(0,5).map(c=>({direction:c.direction,status:c.status,at:c.endedAt})),lastContact:loadContactRuntime().attempts[characterId],callback:callback?latestMissed:null,calendar:active?{title:active.item.title,level:active.level}:"空闲",extra};
 const fallback={id:`contact:${characterId}`,contactId:characterId,unreadCount:0,updatedAt:new Date().toISOString(),isPinned:false};
 try {
 const raw=flattenCompletionResult(await generateChatCompletion(session||fallback,[],{appId:"phone",appTags:["chat","text"],callFormatInstruction:CONTACT_MOTIVE_RULES+"\n现在只判断是否主动联系，不生成聊天或通话。返回 JSON {\"channel\":\"chat/sms/phone/request/wait\",\"reason\":\"自然动机，不能仅写到时间了\",\"nextCheckMinutes\":15到240之间的整数}。request仅指重新发送Chat好友申请，此时额外输出requestMessage作为给用户看的申请附言，不得把私人判断reason当附言。只可从allowed选渠道，通常没有新理由就wait。以下是跨渠道实际记录：\n"+JSON.stringify(context)}));
 const value=JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0]||"{}");
 return {requestMessage:typeof value.requestMessage==="string"?value.requestMessage.slice(0,160):undefined,channel:allowed.includes(value.channel)&&typeof value.reason==="string"&&value.reason.trim()?value.channel:"wait",reason:String(value.reason||"暂不打扰").slice(0,200),nextCheckMinutes:Math.max(15,Math.min(240,Number(value.nextCheckMinutes)||60))};
 }catch{return {channel:"wait",reason:"判断失败，稍后再试",nextCheckMinutes:15};}
}
export function deferContactCheck(characterId:string,minutes:number){const s=loadContactRuntime();s.checked[characterId]=Date.now()+minutes*60000;saveContactRuntime(s);}
