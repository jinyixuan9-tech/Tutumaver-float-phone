import {kvGet,kvSet,registerDynamicPrefix} from "./kv-db";
import type {ChatOfflineTurn} from "./chat-offline-storage";
import type {ChatSession} from "./chat-storage";
import {loadBindingConfig,loadApiConfigs,loadPresets,resolveBinding} from "./settings-storage";
import {sendLLMRequest} from "./chat-engine";
const PREF="ai_phone_offline_image_preference:";
const LONG="ai_phone_offline_image_character:";
const RUN="ai_phone_offline_image_runtime:";
for(const prefix of [PREF,LONG,RUN])registerDynamicPrefix(prefix);
export type OfflineImagePreference={enabled:boolean;scope:"session"|"character";minRounds:number;maxRounds:number};
export function normalizeOfflineRounds(min:unknown,max:unknown):{minRounds:number;maxRounds:number}{const a=Number(min),b=Number(max);const low=Number.isFinite(a)?Math.max(1,Math.min(100,Math.trunc(a))):3;const high=Number.isFinite(b)?Math.max(low,Math.min(100,Math.trunc(b))):Math.max(low,5);return {minRounds:low,maxRounds:high};}
type Run={exchanges:number;threshold:number;next:boolean};
function json<T>(key:string,fallback:T):T{try{const raw=kvGet(key);return raw?JSON.parse(raw) as T:fallback;}catch{return fallback;}}
const threshold=(prefs?:{minRounds:number;maxRounds:number})=>{const {minRounds,maxRounds}=normalizeOfflineRounds(prefs?.minRounds,prefs?.maxRounds);return minRounds+Math.floor(Math.random()*(maxRounds-minRounds+1));};
function readRun(id:string):Run{const v=json<Partial<Run>>(RUN+id,{});return {exchanges:Math.max(0,Math.min(10000,Math.floor(v.exchanges||0))),threshold:v.threshold&&v.threshold>=1&&v.threshold<=100?v.threshold:threshold(),next:v.next===true};}
function saveRun(id:string,v:Run){kvSet(RUN+id,JSON.stringify(v));if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("offline-image-rules-changed",{detail:{sessionId:id}}));}
export function loadOfflineImagePreference(sessionId:string,characterId:string):OfflineImagePreference{
 const own=json<Partial<OfflineImagePreference>>(PREF+sessionId,{});
 const shared=json<Partial<OfflineImagePreference>>(LONG+characterId,{});
 const isLong=own.scope==="character";
 const current=isLong?shared:own;
 return {scope:isLong?"character":"session",enabled:false,...normalizeOfflineRounds(current.minRounds,current.maxRounds)};
}
export function saveOfflineImagePreference(sessionId:string,characterId:string,next:OfflineImagePreference):void{
 const normalized={...next,...normalizeOfflineRounds(next.minRounds,next.maxRounds)};
 kvSet(PREF+sessionId,JSON.stringify(normalized));
 if(next.scope==="character")kvSet(LONG+characterId,JSON.stringify({enabled:next.enabled,minRounds:normalized.minRounds,maxRounds:normalized.maxRounds}));
 const run=readRun(sessionId);saveRun(sessionId,{...run,exchanges:0,threshold:threshold(normalized)});
 if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("offline-image-rules-changed",{detail:{sessionId}}));
}
/** Legacy automatic image settings remain readable, but never activate after this update. */
export function hasNextOfflineImage(_sessionId:string):boolean{return false;}
export function setNextOfflineImage(_sessionId:string,_enabled:boolean):void{}
export function recordOfflineImageAdded(_sessionId:string,_characterId?:string):void{}
export function advanceOfflineImageExchange(_sessionId:string,_characterId:string){return {eligible:false,forced:false};}
function floorContent(turns:ChatOfflineTurn[],start:number,end:number):string{
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>turns.length*2)throw Error("楼层超出当前线下记录范围。");
 const lines:string[]=[];
 for(let i=start;i<=end;i++){const turn=turns[Math.floor((i-1)/2)],content=i%2===1?turn.userContent:turn.assistantContent;if(content?.trim())lines.push(`#${i} ${i%2===1?"用户":"角色"}：${content.trim().slice(0,2200)}`);}
 if(!lines.length)throw Error("选择范围内没有可用于配图的正文。");
 return lines.join("\n").slice(0,10000);
}
export async function suggestOfflineImagePrompt(session:ChatSession,turns:ChatOfflineTurn[],start:number,end:number,auto=false,forced=false):Promise<string>{
 const content=floorContent(turns,start,end);
 const binding=resolveBinding(loadBindingConfig(),session.contactId,"chat");
 const config=loadApiConfigs().find(c=>c.id===binding.apiConfigId);if(!config)throw Error("请先给角色绑定 Chat API。");
 const presets=loadPresets(session.contactId);const preset=(binding.presetId?presets.find(p=>p.id===binding.presetId):undefined)||presets.find(p=>p.builtIn)||null;
 const instructions=auto&&!forced?"如果当前线下片段没有自然、明确值得拍成照片的场景或物品，只输出 SKIP。不要为了配图而硬造事件。":"请从已发生的线下文本中选择最有代表性的一个确实存在的可视场景。";
 const raw=await sendLLMRequest(config,preset,[{role:"system",content:`你只负责为线下叙事生成**一张**写实或符合情境的图像描述，不继续剧情，不编造文本没有的具体人物外貌。${instructions}输出一段不超过450字的中文视觉提示词；不要JSON、标签、解释或多张图片。`},{role:"user",content:`已发生剧情楼层 ${start}–${end}：\n${content}\n请生成一个单张图像提示词。`}],[],undefined,{skipOutputRegex:true,skipWorldline:true,appId:"chat-offline-image",debugSessionId:session.id});
 const clean=raw.replace(/^```[^\n]*\n?|```$/g,"").trim().slice(0,1800);
 if(!clean||/^SKIP\b/i.test(clean))return "";
 return clean;
}
