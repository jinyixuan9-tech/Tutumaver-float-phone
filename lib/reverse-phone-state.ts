import {loadCity,cityEntries} from './icity-store';
import {loadChatMessages,loadChatSessions as loadChatSessionsForCleanup} from './chat-storage';
import {loadMomentPosts} from './moments-storage';
import {kvGet,kvSet,registerKvMigration} from './kv-db';
export const REVERSE_EVENT='rabbit-reverse-phone-updated';
const KEY='rabbit_reverse_phone_v1',HIDDEN='rabbit_hidden_chats_v1';registerKvMigration(KEY);registerKvMigration(HIDDEN);
export type ReverseAction={type:'open_contacts'|'open_app'|'open_chat'|'scroll'|'search_hidden'|'open_book'|'send'|'finish'|'open_video'|'open_diary';target?:string;text?:string;thought?:string;translation?:string};
export type ReverseStep={id:string;app:string;label:string;content:string;messageIds?:string[];postIds?:string[];thought?:string;translation?:string};
export type ReverseVisit={id:string;owner:string;sessionId:string;anchorId:string;startedAt:string;endedAt?:string;stopped?:boolean;removed?:boolean;steps:ReverseStep[];sent:{sessionId:string;messageIds:string[]}[];seenHidden:string[];summary?:string;error?:string;paused?:boolean;typingSessionId?:string;phase?:'chat'|'external';origin?:'invited'|'requested';hiddenChecked?:string[];finishError?:string;finishReplyDone?:boolean;messageWindows?:Record<string,string[]>;momentWindow?:string[];cityUnlocked?:string[];cityTried?:string[];pendingReply?:{sessionId:string;messageId:string}};
let current:ReverseVisit|null=null;
const listeners=new Set<()=>void>();
function emit(){for(const fn of listeners)fn();if(typeof window!=='undefined')window.dispatchEvent(new Event(REVERSE_EVENT));}
function rows():ReverseVisit[]{try{return JSON.parse(kvGet(KEY)||'[]');}catch{return [];}}
export function reverseVisits(){return rows();}
export function reverseVisit(id:string){return rows().find(v=>v.id===id);}
export function activeReverse(){return current;}
export function isReverseActive(){return !!current&&!current.endedAt&&!current.removed;}
export function subscribeReverse(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function saveReverse(v:ReverseVisit){const latest=rows().find(x=>x.id===v.id);if(latest?.removed&&!v.removed)return;kvSet(KEY,JSON.stringify([...rows().filter(x=>x.id!==v.id),v]));if(current?.id===v.id)current=v;emit();}
export function beginReverse(v:ReverseVisit){if(isReverseActive())throw Error('已有角色正在查看手机');current=v;saveReverse(v);}
export function endReverse(id:string,stopped:boolean){const v=reverseVisit(id);if(!v||v.endedAt||v.removed)return null;const ended={...v,endedAt:new Date().toISOString(),stopped};saveReverse(ended);current=null;emit();return ended;}
export function markReverseRemoved(id:string){const v=reverseVisit(id);if(v){saveReverse({...v,removed:true});if(current?.id===id){current=null;emit();}}}
export function setReverseControl(patch:Partial<Pick<ReverseVisit,'paused'|'typingSessionId'|'phase'|'error'>>){if(current)saveReverse({...current,...patch});}
export function hiddenChats():string[]{try{return JSON.parse(kvGet(HIDDEN)||'[]');}catch{return [];}}
export function toggleHiddenChat(id:string){const old=hiddenChats();kvSet(HIDDEN,JSON.stringify(old.includes(id)?old.filter(x=>x!==id):[...old,id]));emit();}
export function reverseCanSeeChat(id:string){return !isReverseActive()||!hiddenChats().includes(id)||!!current?.seenHidden.includes(id);}
export function reverseMemory(owner:string){return rows().filter(v=>v.owner===owner&&v.endedAt&&!v.removed).map(v=>({id:'reverse:'+v.id,appId:'chat' as const,timestamp:v.endedAt!,content:`${v.origin==='requested'?'你提出查看手机，user同意后':'受user邀请，'}你查看了user的手机。${v.steps.map(liveReverseStep).filter(Boolean).join('\n')}。${v.stopped?'user提前结束查看':'你主动结束查看'}。`}));}
let pageIntent:Record<string,unknown>|null=null;
export function reversePageIntent(){return pageIntent;}
export function setReversePageIntent(value:Record<string,unknown>|null){pageIntent=value;if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('rabbit-reverse-page',{detail:value}));}

export function liveReverseStep(step:ReverseStep):string {
 if(step.app==='icity'){try{const data=JSON.parse(step.content);const city=loadCity(),ids=new Set(cityEntries(city).filter(e=>e.author==='user'&&city.books.find(b=>b.id===e.book)?.kind==='personal').map(e=>e.id));const rows=Array.isArray(data)?data.filter(e=>ids.has(e.id)||e.kind==='exchange'&&city.books.some(b=>b.id===e.bookId&&b.kind==='exchange'&&b.members.includes('user'))):ids.has(data.id)?[data]:[];return rows.length?step.label+'：'+JSON.stringify(rows):'';}catch{return '';}}

 if(step.messageIds){const alive=new Set(loadChatMessagesFromStep(step));try{const data=JSON.parse(step.content);if(Array.isArray(data)){const rows=data.filter(m=>alive.has(m.id));return rows.length?step.label+'：'+JSON.stringify(rows):'';}}catch{}if(!step.messageIds.some(id=>alive.has(id)))return '';}
 if(step.postIds||step.app==='moments'){const alive=new Set(loadMomentPosts().map(p=>p.id));try{const data=JSON.parse(step.content);const posts=data.posts?.filter((p:{id:string})=>alive.has(p.id))||[];return posts.length?step.label+'：'+JSON.stringify({...data,posts,comments:data.comments?.filter((c:{postId:string})=>posts.some((p:{id:string})=>p.id===c.postId))}):'';}catch{return '';}}
 return step.label+'：'+step.content;
}
function loadChatMessagesFromStep(step:ReverseStep){const ids=new Set(step.messageIds);return loadChatSessionsForCleanup().flatMap(s=>loadChatMessages(s.id)).filter(m=>ids.has(m.id)&&!m.isRetracted).map(m=>m.id);}

/** A manual send takes over an interrupted recipient request; returning must not issue it twice. */
export function noteReverseUserMessage(message:{id:string;sessionId:string;content:string}){const v=activeReverse();if(!v?.paused)return;saveReverse({...v,pendingReply:v.pendingReply?.sessionId===message.sessionId?undefined:v.pendingReply,steps:[...v.steps,{id:'user-'+message.id,app:'chat',label:'user接管时发出了消息',content:JSON.stringify([{id:message.id,role:'user',text:message.content}]),messageIds:[message.id]}]});}
