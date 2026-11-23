import {reconciliationKnowledge,requestReconciliation} from './phone-reconcile';
/** Persistent fictional phone access state. No real device credentials are used. */
import {kvGet,kvSet,registerKvMigration} from './kv-db';
export type AccessState={password:string;custom:boolean;disclosed:boolean;failures:number;cooldownUntil:number;revision:number;attempts:string[]};
export type PhoneVisit={id:string;owner:string;mode:'silent'|'guess'|'known'|'decrypt';startedAt:string;endedAt?:string;apps:string[];sampledApps?:string[];attempts:string[];settled?:boolean;settleError?:string;accessFailure?:boolean;reportIds?:{session:string;id:string}[];noticeIds?:{session:string;id:string}[];undone?:boolean;chatUndone?:boolean};
const KEY='rabbit_phone_access_v1',VISITS='rabbit_phone_visits_v1';registerKvMigration(KEY);registerKvMigration(VISITS);
function read<T>(key:string,fallback:T):T{try{return JSON.parse(kvGet(key)||'null')??fallback;}catch{return fallback;}}
export function phoneAccess(owner:string):AccessState{return read<Record<string,AccessState>>(KEY,{})[owner]||{password:'1234',custom:false,disclosed:false,failures:0,cooldownUntil:0,revision:0,attempts:[]};}
export function savePhoneAccess(owner:string,s:AccessState){kvSet(KEY,JSON.stringify({...read<Record<string,AccessState>>(KEY,{}),[owner]:s}));}
export function setPhonePassword(owner:string,password:string){if(!/^\d{4}$/.test(password)||password==='1234')throw Error('新密码须为四位数字且不能是初始密码');const s=phoneAccess(owner);savePhoneAccess(owner,{...s,password,custom:true,disclosed:false,revision:s.revision+1});}
export function phoneVisits():PhoneVisit[]{return read(VISITS,[]);}
export function savePhoneVisit(visit:PhoneVisit){kvSet(VISITS,JSON.stringify([...phoneVisits().filter(v=>v.id!==visit.id),visit]));}
let active:PhoneVisit|null=null;
export function currentPhoneVisit(){return active;}
export function tryPhoneAccess(owner:string,password?:string,decrypt=false,now=Date.now(),random=Math.random):{visit?:PhoneVisit;error?:string;notify?:string}{
 let s=phoneAccess(owner);if(s.cooldownUntil>now)return {error:`请等待 ${Math.ceil((s.cooldownUntil-now)/1000)} 秒后重试`};
 if(s.cooldownUntil){s={...s,cooldownUntil:0,failures:0,attempts:[]};}
 let mode:PhoneVisit['mode']='silent';
 if(decrypt){if(random()<.3){savePhoneAccess(owner,{...s,cooldownUntil:now+600000,failures:0,attempts:[]});return{error:'破译被发现，已拦截。冷却十分钟。',notify:'user 尝试强行破译你的手机，被你发现并拦截。'};}mode='decrypt';}
 else if(password!==s.password){s={...s,failures:s.failures+1,attempts:[...s.attempts,`第${s.failures+1}次猜密码失败`]};recordPhoneGuess(owner,s.attempts);if(s.failures>=3){s.cooldownUntil=now+600000;savePhoneAccess(owner,s);return{error:'连续三次错误，冷却十分钟。',notify:'user 连续三次猜手机密码失败，解锁已冷却十分钟。你可以按人设给提示、告诉密码或拒绝。'};}savePhoneAccess(owner,s);return{error:`密码不正确（${s.failures}/3）`};}
 else if(s.custom){mode=s.disclosed?'known':'guess';s={...s,attempts:[...s.attempts,`第${s.failures+1}次成功，${s.disclosed?'使用告知的正确密码':'猜对密码'}进入`]};}
 const pending=phoneVisits().find(v=>v.owner===owner&&!v.endedAt&&!v.undone);if(pending){active=pending;savePhoneAccess(owner,{...s,failures:0,cooldownUntil:0,attempts:[]});return{visit:pending};}
 const visit:PhoneVisit={id:phoneOperationId(),owner,mode,startedAt:new Date(now).toISOString(),apps:[],attempts:s.attempts};active=visit;const attempt=phoneVisits().find(v=>v.id===`guess:${owner}:${s.revision}`);if(attempt)savePhoneVisit({...attempt,undone:true});savePhoneVisit(visit);savePhoneAccess(owner,{...s,failures:0,cooldownUntil:0,attempts:[]});return{visit};
}
export function markPhoneApp(app:string){if(active&&!active.apps.includes(app)){active.apps.push(app);savePhoneVisit(active);}}
export function finishPhoneAccess(){if(!active)return null;const shuffled=[...active.apps];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];} const v={...active,sampledApps:shuffled.slice(0,Math.min(shuffled.length,1+Math.floor(Math.random()*3))),endedAt:new Date().toISOString()};savePhoneVisit(v);active=null;return v;}
export function phoneKnowledge(owner:string,allowReconcile=true){const s=phoneAccess(owner);return `【你的虚构手机密码】${s.password}。这是你本人的密码，是否告诉user、给提示或拒绝由你按人设决定。若明确告诉完整密码，在回复末尾加 <phone-access action="disclose"/>；若实际改密，在末尾加 <phone-access action="change" password="四位新数字"/>。这两个控制标签不得用于引用或假设。${allowReconcile?reconciliationKnowledge(owner):''}`;}
export function applyPhoneControl(owner:string,text:string,allowReconcile=true){return text.replace(/<phone-reconcile\s+peer="([^"]+)"\s+source="([^"]+)"\s*\/>/g,(_,peer,source)=>{if(allowReconcile)requestReconciliation(owner,peer,source);return '';}).replace(/<phone-access\s+action="(disclose|change)"(?:\s+password="(\d{4})")?\s*\/>/g,(_,action,password)=>{if(action==='change'&&password&&password!=='1234'){if(phoneAccess(owner).password!==password)setPhonePassword(owner,password);}else if(action==='disclose'){const s=phoneAccess(owner);if(text.includes(s.password))savePhoneAccess(owner,{...s,disclosed:true});}return '';});}
/** Stream only public text; hold incomplete control tags across network chunks. */
export function phoneTextStream(emit:(text:string)=>unknown){let pending='';return async(chunk:string)=>{pending+=chunk;let output='';while(pending){const start=pending.indexOf('<');if(start<0){output+=pending;pending='';break;}output+=pending.slice(0,start);pending=pending.slice(start);if(['<phone-access','<phone-reconcile'].some(tag=>tag.startsWith(pending)))break;if(!['<phone-access','<phone-reconcile'].some(tag=>pending.startsWith(tag))){output+='<';pending=pending.slice(1);continue;}const end=pending.indexOf('>');if(end<0)break;pending=pending.slice(end+1);}if(output)await emit(output);};}

export function phoneOperationId(){return globalThis.crypto?.randomUUID?.()||`phone_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;}
export function recordPhoneGuess(owner:string,attempts:string[]){const id='guess:'+owner+':'+phoneAccess(owner).revision;const now=new Date().toISOString();savePhoneVisit({id,owner,mode:'guess',startedAt:now,endedAt:now,apps:[],attempts:[...attempts],accessFailure:true});}
