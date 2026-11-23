import {resolveChatCharacterDisplayName} from './chat-profile-storage';
/** Deferred, source-linked bilateral conversations. No model receives another actor's private thoughts. */
import {kvGet,kvSet,registerKvMigration} from './kv-db';
import {phoneVisits} from './checkphone-access';
import {playThreads,getPlayThread} from './checkphone-play';
import {reverseVisits} from './reverse-phone-state';
import {loadCharacters} from './character-storage';
import {loadCharacterWorldGroups} from './character-world-storage';
import {loadChatMessages} from './chat-storage';
import type {CheckPhoneChatPayload} from './checkphone-config';
const KEY='rabbit_phone_reconcile_v1';registerKvMigration(KEY);
type Line={id:string;speaker:string;text:string;time:string};
export type Reconciliation={id:string;source:string;sourceContent:string;actor:string;peer:string;session:string;anchor:string;state:'running'|'done'|'error';error?:string;removed?:boolean;lines:Line[];forwards:string[];createdAt:string};
export function reconciliations():Reconciliation[]{try{return JSON.parse(kvGet(KEY)||'[]');}catch{return [];}}
function save(row:Reconciliation){const latest=reconciliations().find(r=>r.id===row.id);if(latest?.removed&&!row.removed)return;kvSet(KEY,JSON.stringify([...reconciliations().filter(r=>r.id!==row.id),row]));if(typeof window!=='undefined')window.dispatchEvent(new Event('phone-reconcile-updated'));}
function peers(actor:string){return loadCharacterWorldGroups().flatMap(g=>g.relations.flatMap(r=>r.fromCharacterId===actor?[r.toCharacterId]:r.toCharacterId===actor?[r.fromCharacterId]:[])).filter((id,i,a)=>id!==actor&&a.indexOf(id)===i);}
export function reconciliationSources(actor:string){
 const sources:{id:string;content:string;peer?:string}[]=[];
 for(const visit of phoneVisits().filter(v=>v.endedAt&&!v.undone))for(const t of playThreads(visit.id)){
  if(!t.committed||!t.messages.length||t.isUser||![t.owner,t.peerId].includes(actor))continue;
  const own=t.owner===actor; sources.push({id:'phone:'+t.id,peer:own?(t.peerId||'npc:'+t.id):t.owner,content:own?`你发现本人的账号有以下实际消息；操作者是否已知只按你的记忆判断：${JSON.stringify(t.messages)}`:`你与${name(t.owner)}账号的实际对话：${JSON.stringify(t.messages.map(m=>({...m,direction:m.direction==='incoming'?'outgoing':'incoming'})))}。实际操作者未被系统告知。`});
 }
 for(const v of reverseVisits().filter(v=>v.endedAt&&!v.removed)){
  const mine=v.owner===actor;
  const sent=v.sent.flatMap(g=>loadChatMessages(g.sessionId).filter(m=>g.messageIds.includes(m.id)));
  if(mine&&sent.length)sources.push({id:'reverse:'+v.id,content:`你受邀请查看user的手机，实际代发记录：${JSON.stringify(sent.map(m=>({role:m.role,text:m.content,session:m.sessionId})))}`});
  if(!mine){const ownMessages=v.sent.flatMap(g=>{const actual=loadChatMessages(g.sessionId);return actual.filter(m=>g.messageIds.includes(m.id));});
   // Session ownership, rather than hidden visit owner, determines what a recipient may know.
   const own=ownMessages.filter(m=>m.sessionId===sessionFor(actor));if(own.length)sources.push({id:'reverse:'+v.id,content:`你与user账号实际收到和发出的消息：${JSON.stringify(own.map(m=>({role:m.role,text:m.content})))}。没有系统透露操作者。`});
  }
 }
 return sources;
}
function sessionFor(actor:string){return requireSessions().find(s=>!s.isGroup&&s.contactId===actor)?.id;}
import {loadChatSessions as requireSessions} from './chat-storage';
function sourceAlive(r:Reconciliation){return reconciliationSources(r.actor).some(s=>s.id===r.source&&s.content===r.sourceContent);}
function name(id:string){if(id.startsWith('npc:'))return getPlayThread(id.slice(4))?.peer||'联系人';const char=loadCharacters().find(c=>c.id===id);return char?resolveChatCharacterDisplayName(char):'角色';}
export function reconciliationKnowledge(actor:string){const sources=reconciliationSources(actor);if(!sources.length)return '';const eligible=[...peers(actor),...sources.map(s=>s.peer).filter((id):id is string=>!!id?.startsWith('npc:'))].map(id=>({id,name:name(id)}));if(!eligible.length)return '';return `【可选私下对账】仅当本轮聊天自然谈到以下真实事件，且你按人设确实想私下联系某位认识的人时，才在回复末尾添加 <phone-reconcile peer="角色ID" source="来源ID"/>。不必触发，也不能因看见本说明就触发。你尚未实际联系，不得在正文虚构已经解释、和解或转发过。怀疑不等于已确认身份。可联系：${JSON.stringify(eligible)}。你实际知情的来源：${JSON.stringify(sources)}。同一来源同一双方完成过的对账不重复。`;}
export function removeReconciliation(id:string){const r=reconciliations().find(x=>x.id===id);if(!r||r.removed)return;save({...r,removed:true});void import('./chat-storage').then(({deleteChatMessagesByIds})=>deleteChatMessagesByIds(r.session,[r.anchor,...r.forwards]));}
export function pruneReconciliations(){for(const r of reconciliations())if(!r.removed&&!sourceAlive(r))removeReconciliation(r.id);}
export function reconciliationMemory(actor:string){return reconciliations().filter(r=>!r.removed&&r.lines.length&&[r.actor,r.peer].includes(actor)&&sourceAlive(r)).map(r=>({id:'reconcile:'+r.id,appId:'chat' as const,timestamp:r.createdAt,content:`你与${name(actor===r.actor?r.peer:r.actor)}实际私下对账，双方都只知道以下实际发出的内容，猜测仍是猜测：${r.lines.map(l=>`${name(l.speaker)}：${l.text}`).join('\n')}`}));}
export function projectReconciliations(owner:string,payload:CheckPhoneChatPayload){const allIds=new Set(reconciliations().flatMap(r=>r.lines.map(l=>l.id)));let conversations=payload.conversations.map(c=>({...c,messages:c.messages.filter(m=>!allIds.has(m.id))}));for(const r of reconciliations().filter(r=>!r.removed&&[r.actor,r.peer].includes(owner)&&sourceAlive(r))){const peer=owner===r.actor?r.peer:r.actor;const peerName=name(peer);const index=conversations.findIndex(c=>c.name===peerName);const old=index<0?{id:'reconcile:'+r.id,name:peerName,preview:'',timeLabel:'',tagLabel:'聊天',messages:[]}:conversations[index];const known=new Set(old.messages.map(m=>m.id));const added=r.lines.filter(l=>!known.has(l.id)).map(l=>({id:l.id,text:l.text,direction:(l.speaker===owner?'outgoing':'incoming') as 'outgoing'|'incoming',timeLabel:l.time}));const next={...old,messages:[...old.messages,...added],preview:added.at(-1)?.text||old.preview};if(index<0)conversations.push(next);else conversations[index]=next;}return{...payload,conversations};}
export function requestReconciliation(actor:string,peer:string,source:string){void runReconciliation(actor,peer,source).catch(console.error);}
async function runReconciliation(actor:string,peer:string,source:string){
 const original=reconciliationSources(actor).find(s=>s.id===source);if(!original||!(peers(actor).includes(peer)||(peer.startsWith('npc:')&&original.peer===peer))||reconciliations().some(r=>!r.removed&&r.source===source&&[r.actor,r.peer].includes(actor)&&[r.actor,r.peer].includes(peer)))return;
 const {createOrGetSession,pushChatMessage}=await import('./chat-storage');const {requestPhonePlay}=await import('./checkphone-engine');
 const id=globalThis.crypto?.randomUUID?.()||`reconcile_${Date.now()}_${Math.random()}`,session=createOrGetSession(actor);
 const anchor=pushChatMessage({sessionId:session.id,role:'system',mediaType:'app_card',content:`${name(actor)}正在和${name(peer)}对账`,mediaData:{appName:'phone_reconcile',label:id}});
 let row:Reconciliation={id,source,sourceContent:original.content,actor,peer,session:session.id,anchor:anchor.id,state:'running',lines:[],forwards:[],createdAt:new Date().toISOString()};save(row);
 const valid=()=>!reconciliations().find(r=>r.id===id)?.removed&&reconciliationSources(actor).some(s=>s.id===source&&s.content===original.content);
 try{
  for(let i=0;i<3;i++){
   const speaker=i%2?peer:actor;const own=reconciliationSources(speaker).find(s=>s.id===source)?.content||'你没有亲历来源事件，只知道下方实际收到的私聊。';
   const npc=peer.startsWith('npc:')?getPlayThread(peer.slice(4)):undefined;
   const npcContext=speaker.startsWith('npc:')?`本轮仅扮演联系人${name(speaker)}，不要扮演手机主人；NPC只知道这段实际对话：${JSON.stringify(npc?.base)}。忽略与该NPC无关的主人私密记忆。`:'';
   const raw=await requestPhonePlay(speaker.startsWith('npc:')?actor:speaker,`${npcContext}现在由你本人私下联系${name(speaker===actor?peer:actor)}。你本人已知的来源：${own}。此前双方实际发出的私聊：${JSON.stringify(row.lines.map(l=>({speaker:name(l.speaker),text:l.text})))}。按人设自然解释、询问、否认、顺着说或结束。未收到的私密信息不能提前知道；猜测不能自动变事实。只输出JSON {"text":"本次实际要发出的消息，可空串结束","forwardToUser":false}。最后一个字段仅表示你想把这段实际记录转发给user。`);
   if(!valid()){removeReconciliation(id);return;}let result:{text?:string;forwardToUser?:boolean};try{result=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw Error('对账回复格式错误');}if(typeof result.text!=='string')throw Error('对账正文缺失');if(!result.text.trim())break;
   row={...row,lines:[...row.lines,{id:`reconcile:${id}:${i}`,speaker,text:result.text.trim(),time:new Date().toISOString()}]};save(row);
   if(result.forwardToUser&&speaker===actor){const record:import('./chat-forward').ForwardedChatRecord={version:1,title:'聊天记录',sourceName:name(actor),capturedAt:new Date().toISOString(),entries:row.lines.map(l=>({name:name(l.speaker),message:{id:l.id,role:'assistant',content:l.text,createdAt:l.time}}))};const msg=pushChatMessage({sessionId:session.id,role:'assistant',mediaType:'chat_record',content:'[聊天记录]',mediaData:{forwardRecord:record}});row={...row,forwards:[...row.forwards,msg.id]};save(row);}
  }
  if(valid())save({...row,state:'done'});
 }catch(e){if(valid())save({...row,state:'error',error:e instanceof Error?e.message:String(e)});else removeReconciliation(id);}
}

export function recoverReconciliations(){pruneReconciliations();for(const row of reconciliations())if(!row.removed&&row.state==='running')save({...row,state:'error',error:'上次对账被中断'});}
