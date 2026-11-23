import {cityEntries,loadCity,saveCity,type CityEntry} from './icity-store';
import {createOrGetSession,pushChatMessage} from './chat-storage';
import {requestReverseJson,reverseLineText,type ReverseLine} from './reverse-phone-prompt';
import {activeReverse} from './reverse-phone-state';
export async function attemptCityPeek(entryId:string){
 const s=loadCity(),e=cityEntries(s).find(e=>e.id===entryId);if(!e||e.author==='user'||e.visibility!=='private')return false;
 s.peek=s.peek||{};const prior=s.peek[e.id];if(prior?.opened)return true;if(prior&&Date.now()-prior.at<24*3600000)throw Error('这篇日记今天已经试过了，先别再碰它。');
 const found=Math.random()<.25;s.peek[e.id]={at:Date.now(),opened:!found,found};saveCity(s);
 if(found){
  const session=createOrGetSession(e.author);
  if(session){pushChatMessage({sessionId:session.id,role:'system',content:`user尝试偷看你的iCity私密日记「${e.title||'未命名日记'}」（${e.createdAt}，ID:${e.id}），被你发现，偷看失败；user没有读到正文。你知道自己的日记内容，但可以决定交代多少、拒绝或不告诉。不要自动公布全文。`});
   window.dispatchEvent(new CustomEvent('chat-messages-updated',{detail:{sessionId:session.id}}));
   const r=await requestReverseJson(e.author,`刚发现user试图偷看你这篇私密日记但失败：${JSON.stringify({title:e.title,text:e.text})}。根据人设和已有关系自然回应，可交代可不告诉；不强制质问。只返回JSON {"messages":[{"original":"独立台词，可空","translation":"译文"}]}。`,undefined,[],'icity') as {messages?:ReverseLine[]};
   for(const line of r.messages||[])if(line.original.trim())pushChatMessage({sessionId:session.id,role:'assistant',content:reverseLineText(line)});window.dispatchEvent(new CustomEvent('chat-messages-updated',{detail:{sessionId:session.id}}));
  }
 }return !found;
}
export type CityAccessPrompt={entryId:string;attempt:number;owner:string};
export const CITY_ACCESS='icity-access-prompt',CITY_ANSWER='icity-access-answer';
let access:CityAccessPrompt|null=null;
export function cityAccessPrompt(){return access;}
export function answerCityAccess(allow:boolean){if(access)window.dispatchEvent(new CustomEvent(CITY_ANSWER,{detail:{...access,allow}}));}
function askAccess(prompt:CityAccessPrompt,signal:AbortSignal):Promise<boolean>{return new Promise((resolve,reject)=>{
 if(signal.aborted)return reject(new DOMException('已停止','AbortError'));
 let timer:ReturnType<typeof setTimeout>;const clean=()=>{window.removeEventListener(CITY_ANSWER,onAnswer);signal.removeEventListener('abort',abort);clearTimeout(timer);access=null;window.dispatchEvent(new Event(CITY_ACCESS));};
 const onAnswer=(event:Event)=>{const d=(event as CustomEvent).detail;if(d.entryId!==prompt.entryId||d.attempt!==prompt.attempt)return;clean();resolve(d.allow===true);};
 const abort=()=>{clean();reject(new DOMException('已停止','AbortError'));};window.addEventListener(CITY_ANSWER,onAnswer);signal.addEventListener('abort',abort,{once:true});access=prompt;timer=setTimeout(()=>{clean();resolve(false);},120000);window.dispatchEvent(new Event(CITY_ACCESS));
 });}
export async function unlockCityForReverse(e:CityEntry,signal:AbortSignal){
 const visit=activeReverse();if(!visit)return false;
 for(let attempt=1;attempt<=3;attempt++){
  window.dispatchEvent(new CustomEvent('icity-reverse-state',{detail:{entryId:e.id,state:'trying'}}));
  if(await askAccess({entryId:e.id,attempt,owner:visit.owner},signal)){window.dispatchEvent(new CustomEvent('icity-reverse-state',{detail:{entryId:e.id,state:'opened'}}));return true;}
  if(signal.aborted)return false;
  const decision=await requestReverseJson(visit.owner,`你正在查看user手机，在iCity尝试打开一篇私密日记。只看到了隐藏封面，未读到正文。user已经拒绝${attempt}次。按人设决定是否继续尝试，可以放弃。返回JSON {"continue":true或false,"speech":[{"original":"向user说的话，可空","translation":"译文"}]}。禁止假装已经读到内容。`,signal) as {continue?:boolean;speech?:ReverseLine[]};
  if(signal.aborted)return false;
  for(const line of decision.speech||[])if(line.original.trim())pushChatMessage({sessionId:visit.sessionId,role:'assistant',content:reverseLineText(line)});
  window.dispatchEvent(new CustomEvent('chat-messages-updated',{detail:{sessionId:visit.sessionId}}));
  if(!decision.continue)break;
  if(attempt>=2&&Math.random()<.3){window.dispatchEvent(new CustomEvent('icity-reverse-state',{detail:{entryId:e.id,state:'cracked'}}));return true;}
 }window.dispatchEvent(new CustomEvent('icity-reverse-state',{detail:{entryId:e.id,state:'closed'}}));return false;
}
