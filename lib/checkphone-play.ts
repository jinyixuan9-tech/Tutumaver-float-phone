import {undoBrowserShares} from './browser-video-share';
import {kvGet,kvSet,registerKvMigration} from './kv-db';
import {loadCharacters} from './character-storage';
import {loadCharacterWorldGroups} from './character-world-storage';
import {isUserCommunicationName} from './checkphone-communications';
import {phoneOperationId,currentPhoneVisit,phoneVisits,savePhoneVisit,phoneAccess,savePhoneAccess,type PhoneVisit} from './checkphone-access';
import {createOrGetSession,pushChatMessage,deleteChatMessagesByIds,type ChatMessage} from './chat-storage';
import type {CheckPhoneChatBubble,CheckPhoneChatConversation,CheckPhoneChatPayload} from './checkphone-config';
const KEY='rabbit_phone_play_v1';registerKvMigration(KEY);
export type PlayThread={id:string;visitId:string;owner:string;peerId?:string;peer:string;isUser:boolean;base:CheckPhoneChatBubble[];messages:CheckPhoneChatBubble[];committed:boolean;removed?:boolean;chatIds:{session:string;id:string}[];peerQuestion?:{messageId:string;text:string};passwordBefore?:import("./checkphone-access").AccessState;passwordAfterRevision?:number;settleDecision?:{replyToPeer?:string;tellUser?:string;changePassword?:boolean;forwardToUser?:boolean;newPassword?:string};ownerSent?:boolean;peerReplied?:boolean;forwarded?:boolean;ownerKnowledge?:string;peerKnowledge?:string};
function rows():PlayThread[]{try{return JSON.parse(kvGet(KEY)||'[]');}catch{return [];}}
function save(row:PlayThread){kvSet(KEY,JSON.stringify([...rows().filter(x=>x.id!==row.id),row]));window.dispatchEvent(new Event('checkphone-communications-updated'));}
export function phonePeer(owner:string,name:string){const group=loadCharacterWorldGroups().find(g=>g.memberIds.includes(owner));return loadCharacters().find(c=>c.id!==owner&&c.name.trim()===name.trim()&&group?.relations.some(r=>(r.fromCharacterId===owner&&r.toCharacterId===c.id)||(r.toCharacterId===owner&&r.fromCharacterId===c.id)));}
export function draftThread(owner:string,conversation:CheckPhoneChatConversation):PlayThread{
 const visit=currentPhoneVisit();if(!visit||visit.owner!==owner)throw Error('请先解锁手机');
 const existing=rows().find(t=>t.visitId===visit.id&&t.id.endsWith(':'+conversation.id));if(existing)return existing;
 const peer=phonePeer(owner,conversation.name),isUser=isUserCommunicationName(owner,conversation.name)||conversation.id.startsWith('real_conv_');
 if(!peer&&!isUser&&loadCharacters().some(c=>c.name.trim()===conversation.name.trim()))throw Error('只能联系已建立关系线的角色');
 const row:PlayThread={id:visit.id+':'+conversation.id,visitId:visit.id,owner,peerId:peer?.id,peer:conversation.name,isUser,base:conversation.messages,messages:[],committed:false,chatIds:[]};save(row);return row;
}
/** Include an immediately delivered rich message in the same thread as phone chat drafts. */
export function registerDeliveredPhoneMessage(visit: PhoneVisit, message: ChatMessage) {
 const id = visit.id + ':real_conv_' + message.sessionId;
 const row: PlayThread = getPlayThread(id) ?? {
  id, visitId: visit.id, owner: visit.owner, peer: '用户', isUser: true,
  base: [], messages: [], committed: false, chatIds: [],
 };
 if (row.committed || row.removed || row.chatIds.some(item => item.id === message.id)) return;
 row.messages.push({id: message.id, text: message.content, timeLabel: message.createdAt, direction: 'outgoing'});
 row.chatIds.push({session: message.sessionId, id: message.id});
 save(row);
}
export function addPlayMessage(thread:PlayThread,text:string,direction:'incoming'|'outgoing'){const row=rows().find(t=>t.id===thread.id);if(!row||row.committed||row.removed)throw Error('本次聊天已结束');if(!text.trim())return row;row.messages.push({id:'play:'+phoneOperationId(),text:text.trim(),direction,timeLabel:new Date().toISOString()});save(row);return row;}
export function editPlayMessage(id:string,messageId:string,text?:string){const row=rows().find(t=>t.id===id);if(!row||row.committed)return;row.messages=text===undefined?row.messages.filter(m=>m.id!==messageId):row.messages.map(m=>m.id===messageId?{...m,text}:m);save(row);}
export function setPeerQuestion(id:string,messageId:string,text:string){const row=rows().find(t=>t.id===id);if(row&&!row.committed){row.peerQuestion={messageId,text};save(row);}}
export function hasPlayChats(owner:string){return rows().some(t=>!t.removed&&t.committed&&(t.owner===owner||t.peerId===owner)&&t.messages.length);}
export function getPlayThread(id:string){return rows().find(t=>t.id===id);}
export function playThreads(visitId:string){return rows().filter(t=>t.visitId===visitId&&!t.removed);}
export function projectPlayChats(owner:string,payload:CheckPhoneChatPayload):CheckPhoneChatPayload{
 const allIds=new Set(rows().flatMap(r=>r.messages.map(m=>m.id)));let conversations=payload.conversations.map(c=>({...c,messages:c.messages.filter(m=>!allIds.has(m.id))}));const active=currentPhoneVisit();
 for(const row of rows().filter(t=>!t.removed&&((t.committed&&(t.owner===owner||t.peerId===owner))||(!t.committed&&t.owner===owner&&t.visitId===active?.id)))){
  if(!row.messages.length||(row.isUser&&row.committed))continue;
  const mirrored=row.owner!==owner;const name=mirrored?loadCharacters().find(c=>c.id===row.owner)?.name||'角色':row.peer;
  const index=conversations.findIndex(c=>c.name===name||(row.isUser&&!mirrored&&c.id.startsWith('real_conv_')));
  const messages=row.messages.map(m=>({...m,direction:mirrored?(m.direction==='incoming'?'outgoing':'incoming') as 'incoming'|'outgoing':m.direction}));
  const old=index>=0?conversations[index]:{id:'playthread:'+row.id,name,preview:'',timeLabel:'',tagLabel:'聊天',messages:[]};
  const known=new Set(old.messages.map(m=>m.id));const next={...old,messages:[...old.messages,...messages.filter(m=>!known.has(m.id))],preview:messages.at(-1)?.text||'',timeLabel:messages.at(-1)?.timeLabel||''};
  if(index>=0)conversations[index]=next;else conversations.push(next);
 }
 return {...payload,conversations};
}
export function commitPlayVisit(visit:PhoneVisit){for(const row of playThreads(visit.id)){if(row.committed)continue;row.committed=true;
 if(row.messages.length&&row.isUser){const session=createOrGetSession(row.owner);for(const m of row.messages){if(row.chatIds.some(entry=>entry.id===m.id))continue;const saved=pushChatMessage({sessionId:session.id,role:m.direction==='outgoing'?'assistant':'user',content:m.text});row.chatIds.push({session:session.id,id:saved.id});}}
 if(row.peerId&&row.peerQuestion&&row.messages.some(m=>m.id===row.peerQuestion?.messageId)){const session=createOrGetSession(row.peerId);const msg=pushChatMessage({sessionId:session.id,role:'assistant',content:row.peerQuestion.text});row.chatIds.push({session:session.id,id:msg.id});}
 save(row);
}}
export function updatePlayKnowledge(id:string,ownerKnowledge:string,peerKnowledge?:string){const row=rows().find(t=>t.id===id);if(row){row.ownerKnowledge=ownerKnowledge;row.peerKnowledge=peerKnowledge;save(row);}}
export function phonePlayMemory(owner:string){return rows().filter(t=>t.committed&&!t.removed&&t.messages.length&&(t.peerId||t.isUser)&&(t.owner===owner||t.peerId===owner)).map(t=>({id:t.id,appId:'chat' as const,timestamp:phoneVisits().find(v=>v.id===t.visitId)?.endedAt||new Date().toISOString(),content:t.owner===owner?(t.ownerKnowledge||`你发现手机中出现以下聊天记录，尚不确定实际操作者：${JSON.stringify(t.messages)}`):(t.peerKnowledge||`你与${loadCharacters().find(c=>c.id===t.owner)?.name||'该账号'}的实际通信：${JSON.stringify(t.messages.map(m=>({...m,direction:m.direction==='outgoing'?'incoming':'outgoing'})))}。系统没有额外透露操作者；可以按语气怀疑，也可根据对话中实际收到的解释与证据更新判断。`)}));}
export function undoPhoneVisit(id:string,all:boolean){undoBrowserShares(id);for(const row of playThreads(id)){for(const group of new Set(row.chatIds.map(m=>m.session)))deleteChatMessagesByIds(group,row.chatIds.filter(m=>m.session===group).map(m=>m.id));if(row.passwordBefore&&phoneAccess(row.owner).revision===row.passwordAfterRevision)savePhoneAccess(row.owner,row.passwordBefore);row.removed=true;save(row);}const visit=phoneVisits().find(v=>v.id===id);if(visit){for(const m of visit.reportIds||[])deleteChatMessagesByIds(m.session,[m.id]);if(all)for(const m of visit.noticeIds||[])deleteChatMessagesByIds(m.session,[m.id]);savePhoneVisit({...visit,chatUndone:true,...(all?{undone:true}:{})});}void import("./phone-reconcile").then(m=>m.pruneReconciliations());}
export function visitMemory(owner:string){return phoneVisits().filter(v=>v.owner===owner&&v.endedAt&&!v.undone&&(v.mode==='guess'||v.mode==='known')).map(v=>({id:v.id,appId:'chat' as const,timestamp:v.endedAt!,content:v.accessFailure? v.attempts.join("；") : `user ${v.mode==='guess'?'猜对密码':'通过你告知的正确密码'}进入了你的手机。${v.attempts.join('；')}。偷偷查看过${(v.sampledApps||v.apps.slice(0,3)).join('、')||'手机'}等应用。只知这些应用，不代表知道每条查看内容。`}));}
export function appendCommittedPlayMessage(id:string,text:string,direction:'incoming'|'outgoing'){const row=rows().find(t=>t.id===id);if(!row||row.removed)return;const m:CheckPhoneChatBubble={id:'play:'+phoneOperationId(),text,direction,timeLabel:new Date().toISOString()};row.messages.push(m);if(row.isUser){const session=createOrGetSession(row.owner);const msg=pushChatMessage({sessionId:session.id,role:direction==='outgoing'?'assistant':'user',content:text});row.chatIds.push({session:session.id,id:msg.id});}save(row);}
export function recordPlayUserMessage(id:string,text:string){const row=rows().find(t=>t.id===id);if(!row||row.removed)return;const session=createOrGetSession(row.owner),m=pushChatMessage({sessionId:session.id,role:'assistant',content:text});row.chatIds.push({session:session.id,id:m.id});save(row);}
export function rememberVisitPassword(id:string,before:import('./checkphone-access').AccessState,afterRevision:number){const row=rows().find(t=>t.id===id);if(row){Object.assign(row,{passwordBefore:before,passwordAfterRevision:afterRevision});save(row);}}
export function recordPlayForward(id:string){const row=rows().find(t=>t.id===id);if(!row||row.removed)return;const owner=loadCharacters().find(c=>c.id===row.owner),session=createOrGetSession(row.owner);const record:import('./chat-forward').ForwardedChatRecord={version:1,title:`与${row.peer}的聊天记录`,sourceName:owner?.name||'角色',capturedAt:new Date().toISOString(),entries:row.messages.map(m=>({name:m.direction==='outgoing'?owner?.name||'角色':row.peer,message:{id:m.id,role:m.direction==='outgoing'?'assistant':'user',content:m.text,createdAt:m.timeLabel}}))};const msg=pushChatMessage({sessionId:session.id,role:'assistant',content:`[聊天记录] ${record.title}`,mediaType:'chat_record',mediaData:{forwardRecord:record}});row.chatIds.push({session:session.id,id:msg.id});save(row);}

export function patchPlayThread(id:string,patch:Partial<PlayThread>){const row=rows().find(t=>t.id===id);if(row&&!row.removed)save({...row,...patch});}
