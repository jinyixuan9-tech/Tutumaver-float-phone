import {inspectionAppAllowed} from './phone-inspection-settings';
import {loadCity,cityEntries} from './icity-store';
import {unlockCityForReverse} from './icity-privacy';
import {activeReverse,beginReverse,endReverse,saveReverse,reverseVisit,reverseVisits,hiddenChats,markReverseRemoved,setReverseControl,liveReverseStep,type ReverseAction,type ReverseVisit} from './reverse-phone-state';
import {readReversePage,reverseOverview,reverseSessionName,type ReversePage} from './reverse-phone-data';
import {requestReverseJson,reverseLineText,type ReverseDecision,type ReverseLine} from './reverse-phone-prompt';
import {loadChatSessions,loadChatMessages,pushChatMessage as storeChatMessage,updateChatMessage} from './chat-storage';
import {loadMomentPosts} from './moments-storage';
import {loadCharacters} from './character-storage';
import {phoneOperationId} from './checkphone-access';
import {reverseWait,revealReverseSelector} from './reverse-phone-motion';
export const REVERSE_NAV='rabbit-reverse-navigation',REVERSE_THOUGHT='rabbit-reverse-thought',REVERSE_TYPE='rabbit-reverse-type';
let lifetime:AbortController|null=null,operation:AbortController|null=null;
function emit(name:string,detail:unknown){window.dispatchEvent(new CustomEvent(name,{detail}));}
function valid(id:string){const v=reverseVisit(id);return !!v&&!v.endedAt&&!v.removed;}
function push(message:Parameters<typeof storeChatMessage>[0]){const saved=storeChatMessage(message);emit('chat-messages-updated',{sessionId:message.sessionId});return saved;}
function showThought(owner:string,line?:ReverseLine){emit(REVERSE_THOUGHT,{owner,thought:line?.original||'',translation:line?.translation||''});}
function navigate(detail:Record<string,unknown>){emit(REVERSE_NAV,detail);}
export function grabReversePhone(){if(!activeReverse())return;setReverseControl({paused:true});operation?.abort();emit('rabbit-reverse-grab',{});}
export function returnReversePhone(){const v=activeReverse();if(!v)return;if(v.typingSessionId)emit(REVERSE_TYPE,{clear:true,sessionId:v.typingSessionId});setReverseControl({paused:false,typingSessionId:undefined,error:undefined});}
function record(id:string,page:ReversePage,viewed:Awaited<ReturnType<typeof readReversePage>>,thought?:ReverseLine){const v=reverseVisit(id);if(!v||!valid(id))return;saveReverse({...v,steps:[...v.steps,{id:phoneOperationId(),app:page.app,label:viewed.label,content:viewed.content,messageIds:viewed.messageIds,postIds:viewed.postIds,thought:thought?.original,translation:thought?.translation}]});}
async function goto(page:ReversePage,signal:AbortSignal){const owner=activeReverse()?.owner;if(owner&&!inspectionAppAllowed(owner,page.app))throw Error('user已关闭该查看范围');navigate({app:page.app==='icity'?'diary':page.app==='moments'?'chat':page.app,view:page.app==='moments'?'feeds':page.view,sessionId:page.target,bookId:page.target,mode:page.mode,browserId:page.target,entryId:page.app==='icity'&&page.view==='diary'?page.target:undefined});const selector=page.app==='chat'?(page.view==='thread'?`#message-${CSS.escape(page.target||'')}`:page.view==='contacts'?'.kkt-contacts-page':'.kkt-session-list'):page.app==='moments'?'[data-moment-post-id]':page.app==='shopping'?'.shopping-app':'.reading-app';
 // Chat thread readiness is checked against its capped message rows below; empty lists are valid screens.
 if(page.app==='chat'||page.app==='moments')await reverseWait(220,signal);else await reverseWait(520,signal);
 if(typeof document!=='undefined'){const expected=page.app==='icity'?'diary':page.app==='moments'?'chat':page.app;let ready=false;for(let n=0;n<60;n++){const root=document.querySelector<HTMLElement>('[data-active-app]');if(root?.dataset.activeApp===expected){if(page.app!=='reading'||page.view!=='book'||root.querySelector('[data-reverse-book-id]')){ready=true;break;}}await reverseWait(70,signal);}if(!ready)throw Error('页面尚未打开，请重试；未读取未显示内容。');await reverseWait(100,signal);}
 void selector;
}
async function reveal(page:ReversePage,viewed:Awaited<ReturnType<typeof readReversePage>>,signal:AbortSignal){if(page.app==='chat'&&page.view==='thread'&&viewed.messageIds?.length){for(const id of [viewed.messageIds.at(-1)!,viewed.messageIds[0]])await revealReverseSelector(`#message-${CSS.escape(id)}`,signal);}else if(page.app==='chat'&&page.view==='list'){const rows=JSON.parse(viewed.content);if(rows.length)await revealReverseSelector(`[data-reverse-session-id="${CSS.escape(rows[0].id)}"]`,signal);}else if(page.app==='icity'&&viewed.itemIds?.length){for(const id of viewed.itemIds)await revealReverseSelector(`[data-city-entry-id="${CSS.escape(id)}"]`,signal);}else if(page.app==='shopping'&&viewed.itemIds?.length){for(const id of viewed.itemIds)await revealReverseSelector(`[data-reverse-shopping-id="${CSS.escape(id)}"]`,signal);}else if(page.app==='chat'&&page.view==='contacts'){const rows=JSON.parse(viewed.content);if(rows.length)await revealReverseSelector(`[data-reverse-contact-id="${CSS.escape(rows[0].id)}"]`,signal);}}
function instruction(page:ReversePage,content:string,overview:unknown,visit:ReverseVisit){return `当前允许范围：${JSON.stringify((overview as {apps:string[]}).apps)}，关闭的范围禁止尝试进入。当前阶段：${visit.phase||'chat'}。先在Chat内部查看消息列表、联系人、会话和朋友圈，自主选择几项，不强制全部看；有明确目的就优先做，没有明确目标时在可用项中随机选择。不认识的人也可以看记录和代发，但不能预先知道关系。联系人只提供身份列表，不提供任何私聊内容。可从消息列表或联系人进入已有会话；隐藏会话只有本次实际发现后才能进入。Chat结束后才去购物/外卖/阅读/iCity，离开后本次不再返回Chat续查（结束查看除外）。\n当前实际页面：${JSON.stringify(page)}，刚显示：${content}。可用概况：${JSON.stringify(overview)}。已实际做过：${JSON.stringify(visit.steps.map(s=>({label:s.label,thought:s.thought})))}。刚刚实际收到的代发回复：${visit.steps.filter(s=>['收到了对方的回复','user接管时发出了消息'].includes(s.label)).map(liveReverseStep).filter(Boolean).slice(-4).join('\n')}。聊天只允许最近50条；scroll用up/down，不得打开查看更多。朋友圈仅本次提供的3～5条或实际更少条，postThoughts按id对应。\n只输出JSON：{"speech":[],"thought":{"original":"可为空的心声","translation":"对应译文或空"},"postThoughts":[{"id":"真实帖子ID","thought":{"original":"针对该帖的心声，可空","translation":"译文"}}],"action":{"type":"open_app|open_contacts|open_chat|scroll|search_hidden|open_book|open_video|open_diary|send|finish","target":"真实可见ID；open_app为chat/moments/shopping/reading/browser/icity；browser的text为site可看第二页，再用open_video和真实条目ID打开详情；iCity用open_diary和屏幕提供的真实日记ID打开，私密正文由程序授权后才能读取；没有记录不虚构看过","text":"send填写以user账号发送的正文，不带翻译；scroll填up/down；shopping填cart/orders/food_cart/food_orders"}}。speech只在有话想对user说时填{original,translation}，不必开场。无新内容可结束。`}
export async function startReversePhone(owner:string,sessionId:string,origin:'invited'|'requested'='invited'){
 if(activeReverse())throw Error('已有角色在查看手机');const initial=await reverseOverview(owner);if(!initial.apps.length)throw Error('尚未允许查看任何范围');
 const id=phoneOperationId(),anchor=push({sessionId,role:'system',mediaType:'app_card',content:origin==='requested'?'你同意TA查看手机':'你邀请TA查看手机',mediaData:{appName:'reverse_phone',appCardTitle:'开始查看你的手机',label:id}});
 beginReverse({id,owner,sessionId,anchorId:anchor.id,startedAt:new Date().toISOString(),steps:[],sent:[],seenHidden:[sessionId],phase:initial.apps.includes('chat')?'chat':'external',messageWindows:{},origin,hiddenChecked:[]});lifetime=new AbortController();
 let momentPlan:ReverseDecision|null=null,momentCursor=0;let wasPaused=false;let page:ReversePage={app:initial.apps[0] as ReversePage['app'],view:initial.apps[0]==='shopping'?'cart':'list',offset:0},moves=0,entry=true;
 try{while(valid(id)&&moves<18){
  if(activeReverse()?.paused){wasPaused=true;await reverseWait(120,lifetime.signal);continue;}
  operation=new AbortController();const op=operation;const abort=()=>op.abort();lifetime.signal.addEventListener('abort',abort,{once:true});
  try{
   if(wasPaused){await goto(page,op.signal);wasPaused=false;}
   const waiting=reverseVisit(id)?.pendingReply;if(waiting)await recipientReply(id,waiting.sessionId,waiting.messageId,op.signal);
   if(entry){const plan=await requestReverseJson(owner,(origin==='requested'?'你刚刚申请查看user手机，user已经同意。':'user刚刚邀请你查看手机。')+`只可从本次允许且有内容的应用${JSON.stringify(initial.apps)}选择；Chat关闭时不能选择消息列表、联系人或朋友圈。根据情绪和目的选择一个允许的应用，可不说话。不要重新阅读入口处刚聊过的内容。只输出JSON：{"speech":[],"action":{"type":"open_app或open_contacts","target":"允许的应用id"}}。speech可为空；有台词时用{original,translation}。`,op.signal) as ReverseDecision;
    if(op.signal.aborted||activeReverse()?.paused)continue;for(const line of plan.speech||[])if(line.original.trim())push({sessionId,role:'assistant',content:reverseLineText(line)});
    const chosen=initial.apps.includes(plan.action?.target||'')?plan.action!.target!:initial.apps[0];page={app:chosen as ReversePage['app'],view:chosen==='chat'&&plan.action?.type==='open_contacts'?'contacts':chosen==='shopping'?'cart':'list',offset:0};if(!['chat','moments'].includes(chosen))setReverseControl({phase:'external'});entry=false;await goto(page,op.signal);
   }
   const viewed=await readReversePage(page);await reveal(page,viewed,op.signal);if(op.signal.aborted)continue;
   if(page.app!=='moments')record(id,page,viewed);
   const images=page.app==='moments'?loadMomentPosts().filter(p=>viewed.postIds?.includes(p.id)).flatMap(p=>(p.photoUrls?.length?p.photoUrls:p.photoUrl?[p.photoUrl]:[]).map(url=>({id:p.id,url}))):page.app==='chat'&&page.view==='thread'?loadChatMessages(page.target!).filter(m=>viewed.messageIds?.includes(m.id)&&m.mediaType==='image'&&m.mediaUrl).map(m=>({id:m.id,url:m.mediaUrl!})):[];
   const raw:ReverseDecision=page.app==='moments'&&momentPlan?momentPlan:await requestReverseJson(owner,instruction(page,viewed.content,await reverseOverview(),reverseVisit(id)!),op.signal,images) as ReverseDecision;if(op.signal.aborted||!valid(id)||activeReverse()?.paused)continue;
   if(!raw.action||typeof raw.action.type!=='string')throw Error('角色操作格式未通过校验');
   if(page.app!=='moments'||!momentPlan){for(const line of raw.speech||[])if(line.original.trim())push({sessionId,role:'assistant',content:reverseLineText(line)});}
   if(page.app==='moments'){
    if(!momentPlan){momentPlan=raw;}const batch=JSON.parse(viewed.content);for(let n=momentCursor;n<batch.posts.length;n++){const post=batch.posts[n];if(!loadMomentPosts().some(p=>p.id===post.id))continue;await revealReverseSelector(`[data-moment-post-id="${CSS.escape(post.id)}"]`,op.signal);const thought=raw.postThoughts?.find(t=>t.id===post.id)?.thought;showThought(owner,thought);record(id,page,{label:'查看了你的朋友圈',content:JSON.stringify({posts:[post],comments:batch.comments.filter((c:{postId:string})=>c.postId===post.id)}),postIds:[post.id]},thought);momentCursor=n+1;await reverseWait(thought?.original?950+Math.min(1600,thought.original.length*25):180,op.signal);}
   }else{showThought(owner,raw.thought);const v=reverseVisit(id)!;if(v.steps.length){const steps=[...v.steps];steps[steps.length-1]={...steps.at(-1)!,thought:raw.thought?.original,translation:raw.thought?.translation};saveReverse({...v,steps});}if(raw.thought?.original)await reverseWait(350,op.signal);}
   if(raw.action.type==='finish'){await finishReversePhone(id,false);return;}
   const previous=page;page=await execute(id,page,raw.action as ReverseAction,op.signal);if(previous.app==='moments'){momentPlan=null;if(page.app!=='moments')momentCursor=0;}moves++;
  }catch(e){if(!valid(id)||lifetime?.signal.aborted)return;if(activeReverse()?.paused)continue;setReverseControl({paused:true,error:e instanceof Error?e.message:String(e)});}
  finally{lifetime?.signal.removeEventListener('abort',abort);if(operation===op)operation=null;}
 }
 if(valid(id))await finishReversePhone(id,false);
 }catch(e){if(valid(id))setReverseControl({paused:true,error:e instanceof Error?e.message:String(e)});}
}
async function execute(id:string,page:ReversePage,a:ReverseAction,signal:AbortSignal):Promise<ReversePage>{
 const v=reverseVisit(id)!;if(!inspectionAppAllowed(v.owner,page.app)||a.type==='open_contacts'&&!inspectionAppAllowed(v.owner,'chat')||a.type==='open_app'&&!inspectionAppAllowed(v.owner,a.target||''))throw Error('user未允许查看该范围');let next=page;
 if(a.type==='open_contacts'){if(v.phase==='external')throw Error('Chat阶段已结束');next={app:'chat',view:'contacts',offset:0};}
 else if(a.type==='open_app'){
  if(a.target==='reading'&&!(await reverseOverview()).bookCount)return page;if(!(await reverseOverview()).apps.includes(a.target||''))throw Error('该应用不可查看');const app=a.target as ReversePage['app'];if(app==='moments'&&v.phase!=='external'&&v.steps.some(s=>s.app==='moments')){const back:ReversePage={app:'chat',view:'list',offset:0};await goto(back,signal);return back;}if(v.phase==='external'&&['chat','moments'].includes(app))throw Error('Chat阶段已结束，可结束本次查看');if(!['chat','moments'].includes(app))setReverseControl({phase:'external'});next={app,view:app==='shopping'?(a.text?.endsWith('orders')?'orders':'cart'):'list',mode:a.text?.startsWith('food_')?'food':'shop',offset:0};
 }else if(a.type==='open_chat'){
  if(v.phase==='external'||page.app!=='chat'||!['list','contacts'].includes(page.view))throw Error('请先回到消息列表或联系人选择会话');const rows=JSON.parse((await readReversePage(page)).content) as {id:string;sessionId?:string}[];const row=rows.find(s=>s.id===a.target||s.sessionId===a.target);const target=page.view==='contacts'?row?.sessionId:row?.id;if(!target)return page;next={app:'chat',view:'thread',target,offset:0};
 }else if(a.type==='scroll'){
  if(page.app==='moments'){const back:ReversePage={app:'chat',view:'list',offset:0};await goto(back,signal);return back;}const delta=a.text==='up'?(page.view==='thread'?1:-1):(page.view==='thread'?-1:1);next={...page,offset:Math.max(0,Math.min(page.view==='thread'?8:12,page.offset+delta))};
 }else if(a.type==='search_hidden'){
  if(v.phase==='external'||page.app!=='chat')return page;const checked=new Set(v.hiddenChecked||[]),hidden=hiddenChats().filter(x=>!checked.has(x));const seen=[...v.seenHidden];for(const target of hidden){checked.add(target);if(Math.random()<.1&&!seen.includes(target))seen.push(target);}saveReverse({...v,seenHidden:seen,hiddenChecked:[...checked]});next={app:'chat',view:'list',offset:0};
 }else if(a.type==='open_book'){const overview=await reverseOverview();if(!overview.bookCount){if(page.app==='reading'){return page;}return page;}if(page.app!=='reading')throw Error('请先打开书架再选择真实书籍');const books=JSON.parse((await readReversePage({app:'reading',view:'list',offset:0})).content) as {id:string}[];if(!books.some(b=>b.id===a.target))return page;next={app:'reading',view:'book',target:a.target,offset:0};}
 else if(a.type==='open_diary'){
  if(page.app!=='icity')return page;
  const listed=JSON.parse((await readReversePage({app:'icity',view:'list',offset:page.offset})).content) as {id:string}[];
  if(!listed.some(e=>e.id===a.target))return page;
  const e=cityEntries(loadCity()).find(e=>e.id===a.target&&e.author==='user');if(!e)return page;
  next={app:'icity',view:'diary',target:e.id,offset:page.offset};await goto(next,signal);
  if(e.visibility==='private'&&!v.cityUnlocked?.includes(e.id)&&!v.cityTried?.includes(e.id)){
   saveReverse({...reverseVisit(id)!,cityTried:[...(reverseVisit(id)?.cityTried||[]),e.id]});
   const opened=await unlockCityForReverse(e,signal);
   if(opened&&valid(id))saveReverse({...reverseVisit(id)!,cityUnlocked:[...(reverseVisit(id)?.cityUnlocked||[]),e.id]});
  }return next;
 }
 else if(a.type==='send'){
  if(page.app!=='chat'||page.view!=='thread'||!page.target||!a.text?.trim())throw Error('请先打开聊天再代发');const session=loadChatSessions().find(s=>s.id===page.target);if(!session||session.isGroup)throw Error('群聊本次仅查看');
  setReverseControl({typingSessionId:session.id});let shown='';for(const c of Array.from(a.text.slice(0,3000))){if(signal.aborted)throw new DOMException('Paused','AbortError');shown+=c;emit(REVERSE_TYPE,{sessionId:session.id,text:shown});await reverseWait(28+Math.random()*45,signal);}await reverseWait(450,signal);if(signal.aborted||activeReverse()?.paused)return page;
  const message=push({sessionId:session.id,role:'user',content:shown});const latest=reverseVisit(id)!;saveReverse({...latest,sent:[...latest.sent,{sessionId:session.id,messageIds:[message.id]}],steps:[...latest.steps,{id:phoneOperationId(),app:'chat',label:`用你的账号给${reverseSessionName(session.id)}发了消息`,content:JSON.stringify([{id:message.id,role:'user',text:shown}]),messageIds:[message.id]}]});emit(REVERSE_TYPE,{sessionId:session.id,text:''});setReverseControl({typingSessionId:undefined});
  // Commit the user message before requesting the recipient's reply; never disclose the operator.
  const saved=reverseVisit(id)!;saveReverse({...saved,pendingReply:{sessionId:session.id,messageId:message.id}});await recipientReply(id,session.id,message.id,signal);return page;
 }else throw Error('无法执行该操作');
 if(a.type!=='scroll'||next.app!==page.app)await goto(next,signal);else if(next.offset!==page.offset&&page.app!=='chat'){navigate({scroll:a.text==='up'?-1:1});await reverseWait(320,signal);}return next;
}
async function recipientReply(id:string,sessionId:string,messageId:string,signal:AbortSignal){
 const session=loadChatSessions().find(s=>s.id===sessionId);if(!session||!valid(id))return;const messages=loadChatMessages(sessionId),index=messages.findIndex(m=>m.id===messageId);
 if(index<0||messages.slice(index+1).some(m=>m.role==='assistant')){const v=reverseVisit(id)!;saveReverse({...v,pendingReply:undefined});return;}
 const reply=await requestReverseJson(session.contactId,'你收到user刚发来的消息。仅根据你自己的人设、已有聊天与关系自然回复；系统不告诉你是谁操作手机。只输出JSON：{"messages":[{"original":"每个独立气泡的台词","translation":"译文或空"}]}。不输出动作描写，不虚构后台私聊。',signal) as {messages?:ReverseLine[]};if(signal.aborted||!valid(id))return;
 for(const line of reply.messages||[]){if(!line.original.trim())continue;const answer=push({sessionId,role:'assistant',content:reverseLineText(line)});const cur=reverseVisit(id)!;saveReverse({...cur,sent:cur.sent.map(s=>s.messageIds.includes(messageId)?{...s,messageIds:[...s.messageIds,answer.id]}:s),steps:[...cur.steps,{id:phoneOperationId(),app:'chat',label:'收到了对方的回复',content:JSON.stringify([{id:answer.id,role:'assistant',text:answer.content}]),messageIds:[answer.id]}]});}const v=reverseVisit(id)!;saveReverse({...v,pendingReply:undefined});
}
export async function finishReversePhone(id:string,stopped:boolean){operation?.abort();lifetime?.abort();operation=null;lifetime=null;const v=endReverse(id,stopped);if(!v)return;showThought(v.owner);if(v.typingSessionId&&!v.paused)emit(REVERSE_TYPE,{clear:true,sessionId:v.typingSessionId});navigate({app:'chat',view:'thread',sessionId:v.sessionId});updateChatMessage(v.anchorId,{content:stopped?'你提前结束了反查':'反查结束',mediaData:{appName:'reverse_phone',appCardTitle:stopped?'你提前结束了反查':'反查结束',label:id}});
 await retryReverseFinish(id);
}
const finishingReplies=new Set<string>();
export async function retryReverseFinish(id:string){if(finishingReplies.has(id))return;const v=reverseVisit(id);if(!v?.endedAt||v.removed||v.finishReplyDone)return;finishingReplies.add(id); try{const response=await requestReverseJson(v.owner,`本次查看手机已${v.stopped?'被user提前结束':'结束'}。实际查阅来源：${v.steps.map(liveReverseStep).filter(Boolean).join('\n')}。根据人设和此刻情绪，可以沉默；想说话才回复。只输出JSON：{"messages":[{"original":"独立聊天气泡的台词，可为空","translation":"译文"}]}。不输出动作、括号旁白，不复述操作清单，不强制质问。`) as {messages?:ReverseLine[]};if(!Array.isArray(response.messages))throw Error("结束回复格式不正确");if(reverseVisit(id)?.removed)return;for(const line of response.messages||[])if(line.original.trim())push({sessionId:v.sessionId,role:'assistant',content:reverseLineText(line)});
 const latest=reverseVisit(id);if(latest)saveReverse({...latest,finishError:undefined,finishReplyDone:true});}catch(e){const latest=reverseVisit(id);if(latest&&!latest.removed)saveReverse({...latest,finishError:e instanceof Error?e.message:String(e)});}finally{finishingReplies.delete(id);}
}

export function deleteReverseVisit(id:string){if(activeReverse()?.id===id){operation?.abort();lifetime?.abort();operation=null;lifetime=null;}markReverseRemoved(id);void import('./phone-reconcile').then(m=>m.pruneReconciliations());}
export function recoverReversePhone(){for(const v of reverseVisits())if(!v.endedAt&&!v.removed&&activeReverse()?.id!==v.id){const end=endReverse(v.id,true);if(end)updateChatMessage(v.anchorId,{content:'反查已中断',mediaData:{appName:'reverse_phone',label:v.id,appCardTitle:'反查已中断'}});}}
