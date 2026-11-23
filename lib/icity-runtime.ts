import {loadCity,saveCity,cityEntries,cityNotice,personalBook,canReadCity,tickCityLikes,cityWorldBrowseEntries,rememberCityBrowse,cityKnownIdentity,type CityEntry} from './icity-store';
import {loadCharacters} from './character-storage';
import {generateDiaryEntryForCharacter} from './diary-entry-engine';
import {createDiaryEntry,loadDiaryEntries} from './diary-entry-storage';
const jobs=new Map<string,{controller:AbortController;book:string}>();
export const CITY_JOBS='icity-jobs-updated';
function emit(){if(typeof window!=='undefined')window.dispatchEvent(new Event(CITY_JOBS));}
export function cityJobs(){return [...jobs].map(([author,j])=>({author,book:j.book}));}
export function stopCityWriting(author:string){const job=jobs.get(author);if(!job)return;job.controller.abort();const s=loadCity(),b=s.books.find(b=>b.id===job.book);const a=s.accounts.find(a=>a.id===author);if(b?.kind==='personal'&&a?.autoDiary){const interval=a.autoDiary.hours*3600000,last=a.autoDiary.lastAt||Date.now();a.autoDiary.retryAt=last+Math.max(1,Math.floor((Date.now()-last)/interval)+1)*interval;}if(b?.kind==='exchange'&&b.replyTimer)b.replyTimer={...b.replyTimer,dueAt:undefined,paused:true};saveCity(s);emit();}
export async function writeCityDiary(author:string,bookId=personalBook(author),trigger:'manual'|'timer'='manual'){
 if(jobs.has(author))throw Error('这个角色正在写日记');
 const controller=new AbortController();jobs.set(author,{controller,book:bookId});emit();
 try{
  const s=loadCity(),book=s.books.find(b=>b.id===bookId),c=loadCharacters().find(c=>c.id===author);
  if(!c||!s.enrolled?.includes(author)||!book?.members.includes(author)||book.kind==='joint')throw Error('该日记本当前不可写');
  // Keep the original persona/core/long/short-term assembly; diary history is scoped to this book.
  const history=loadDiaryEntries().filter(e=>e.characterId===author&&(s.meta[e.id]?.book||personalBook(author))===bookId);
  const shared=cityEntries(s).filter(e=>e.book===bookId&&canReadCity(s,e,author)&&!history.some(h=>h.id===e.id)).map(e=>({id:e.id,characterId:e.author,characterName:s.accounts.find(a=>a.id===e.author)?.name||'对方',title:e.title,dateLabel:e.createdAt,mood:'',weather:'',tags:[],body:e.text,blocks:[{type:'paragraph' as const,text:e.text}],trigger:'manual' as const,createdAt:e.createdAt,updatedAt:e.createdAt}));
  const instructions=book.kind==='exchange'?`这是你与user的1v1交换日记「${book.name}」。读本册历史和user回信，考量双方是友情、爱情还是亲情，写想告诉对方的内容。不必逐句回答或交代所有秘密；按性格决定交流、回避，或把藏事留给私人日记。不写成评论区，保持自己的节奏。`:'结合写日记时的心情和状态，自主决定发布的可见范围。JSON额外输出visibility:"world"或"friends"或"private"。世界可被普通网友及其他角色偶然读到；你的好友日记仅user和手动添加的iCity好友可读；现实认识不代表知道彼此账号；私密仅自己。公开或好友日记使用网名身份，不泄露自己或他人的真实姓名、名人身份、可识别的隐私。';
  const diaryStyle='本轮按iCity规则写自然日记，覆盖旧预设的固定私人日记、统一长度和花式区块要求。世界与好友日记是适合公开的随笔、生活记录或心绪；私密日记通常更长、更私人，可写心结、隐秘愿望、真正开心或伤心的事，仍按性格，不必每次痛苦、恋爱或围绕user。正文使用paragraph区块。可以无图，或在JSON photos字段给最多三条简短画面描述字符串，不接相册、不自动生图。';
  const draft=await generateDiaryEntryForCharacter(author,[...history,...shared],trigger,{signal:controller.signal,instruction:instructions+diaryStyle});
  if(controller.signal.aborted)throw new DOMException('已打断','AbortError');
  const next=loadCity(),live=next.books.find(b=>b.id===bookId);
  if(!next.enrolled?.includes(author)||!live?.members.includes(author))throw Error('角色已移出，未保存本次生成');
  const created=createDiaryEntry({characterId:author,characterName:c.name,...draft,trigger});
  next.meta[created.id]={book:bookId,visibility:book.kind==='personal'?(draft.visibility||'private'):'private',selected:[],photos:((draft as typeof draft & {photos?:string[]}).photos||[]).slice(0,3).map(t=>'text://'+encodeURIComponent(t))};
  const a=next.accounts.find(a=>a.id===author);
  if(book.kind==='personal'&&a){a.autoDiary={...(a.autoDiary||{enabled:false,hours:24}),lastAt:Date.now(),retryAt:undefined,paused:false};}
  if(live.kind==='exchange'&&live.replyTimer)live.replyTimer={...live.replyTimer,dueAt:undefined,paused:false,retryAt:undefined};
  if(live.kind==='exchange')cityNotice(next,'user',`${next.accounts.find(a=>a.id===author)?.name}写来了新的交换日记`,{entry:created.id,book:bookId});
  saveCity(next);return created;
 }finally{jobs.delete(author);emit();}
}
let checking=false;
export async function tickCityWriting(){
 if(checking||typeof window==='undefined')return;checking=true;
 try{tickCityLikes();const s=loadCity(),now=Date.now();const tasks:{author:string;book:string}[]=[];
 for(const a of s.accounts)if(a.kind==='character'&&s.enrolled?.includes(a.id)&&a.autoDiary?.enabled&&!a.autoDiary.paused&&!jobs.has(a.id)&&now>=(a.autoDiary.retryAt||0)&&now>=(a.autoDiary.lastAt||now)+a.autoDiary.hours*3600000)tasks.push({author:a.id,book:personalBook(a.id)});
 for(const b of s.books)if(b.kind==='exchange'&&b.replyTimer?.enabled&&!b.replyTimer.paused&&b.replyTimer.dueAt&&b.replyTimer.dueAt<=now&&now>=(b.replyTimer.retryAt||0)){const author=b.members.find(x=>x!=='user');if(author&&!jobs.has(author))tasks.push({author,book:b.id});}
 for(const task of tasks){try{await writeCityDiary(task.author,task.book,'timer');}catch(e){if(e instanceof DOMException&&e.name==='AbortError')continue;const next=loadCity(),a=next.accounts.find(a=>a.id===task.author),b=next.books.find(b=>b.id===task.book);if(b?.kind==='personal'&&a?.autoDiary)a.autoDiary.retryAt=Date.now()+15*60000;else if(b?.replyTimer)b.replyTimer.retryAt=Date.now()+15*60000;saveCity(next);console.warn('[iCity] diary generation failed',e);}}
 }finally{checking=false;}
}
export async function reactCityWorldLikes(ids:string[]){
 const {sendLLMRequest}=await import('./chat-engine');const {loadApiConfigs,loadBindingConfig,resolveBinding}=await import('./settings-storage');
 const s=loadCity();
 for(const a of s.accounts.filter(a=>a.kind==='character'&&s.enrolled?.includes(a.id))){try{const c=loadCharacters().find(c=>c.id===a.id),slot=resolveBinding(loadBindingConfig(),a.id,'diary'),api=loadApiConfigs().find(c=>c.id===slot.apiConfigId);if(!api)continue;
 const current=loadCity();if(!current.enrolled?.includes(a.id))continue;
 const browsed=cityWorldBrowseEntries(current,ids,a.id),offered=new Set(browsed.map(e=>e.id));
 const posts=browsed.map(e=>({id:e.id,text:e.text,title:e.title,author:current.accounts.find(account=>account.id===e.author)?.handle,knownIdentity:cityKnownIdentity(current,e.author,a.id)}));if(!posts.length)continue;rememberCityBrowse(current,a.id,browsed);
 const raw=await sendLLMRequest(api,null,[{role:'system',content:'按你的性格和兴趣浏览本批实际可见的日记；提供knownIdentity才表示你知道该账号身份。可以喜欢零篇或多篇，只返回JSON {"likes":["日记id"]}。只可选择本批实际提供的id。不评论，不泄露真名，不根据连线关系推断网名背后的真实身份。不把此浏览自动写入聊天记忆。'},{role:'user',content:JSON.stringify({persona:c?.persona,personality:c?.personality,posts})}],[],{characterName:'iCity浏览'},{appId:'diary',skipOutputRegex:true});const r=JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));
 const next=loadCity();if(!next.enrolled?.includes(a.id))continue;
 for(const id of Array.isArray(r.likes)?r.likes:[]){const e=cityEntries(next).find(e=>e.id===id&&offered.has(e.id)&&e.visibility!=='private'&&e.author!==a.id&&next.books.find(b=>b.id===e.book)?.kind==='personal'&&canReadCity(next,e,a.id));if(e&&!(next.likes[id]||[]).includes(a.id)){next.likes[id]=[...(next.likes[id]||[]),a.id];cityNotice(next,'user',`${a.name}喜欢了这篇日记`,{entry:id});}}saveCity(next);
 }catch(e){console.warn('[iCity] world browsing skipped',e);}}
}
