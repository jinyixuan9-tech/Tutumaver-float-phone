import { resolveUserIdentity } from "./settings-storage";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadCharacters, saveCharacters } from "./character-storage";
import { loadCharacterWorldGroups } from "./character-world-storage";
import { loadChatContacts, hydrateChatStorage } from "./chat-storage";
import { loadBindingConfig, resolveBinding, loadApiConfigs } from "./settings-storage";
import { addFriendRequest, loadFriendRequests, dispatchFriendRequestUpdated } from "./friend-request-storage";
const KEY = "ai_phone_contact_recommendations_v1";
registerKvMigration(KEY);
type Recommendation = {id:string;fromId:string;targetId:string;context:string;relationship:"stranger"|"known";dueAt?:number;message?:string;done?:boolean;retryAt?:number;ignoredCount?:number};
function read(): Recommendation[] { try { return JSON.parse(kvGet(KEY)||"[]"); } catch { return []; } }
function write(items:Recommendation[]) { kvSet(KEY,JSON.stringify(items)); }
export function eligibleRecommendationTargets(fromId:string) {
 const contacts = new Set(loadChatContacts().map(c=>c.characterId));
 const related = new Set(loadCharacterWorldGroups().flatMap(g=>g.relations.flatMap(r=>r.fromCharacterId===fromId?[r.toCharacterId]:r.toCharacterId===fromId?[r.fromCharacterId]:[])));
 return loadCharacters().filter(c=>c.id!==fromId && !contacts.has(c.id) && !c.tags?.includes("配角") && related.has(c.id));
}
export function recommendationPrompt(fromId:string):string {
 const targets=eligibleRecommendationTargets(fromId);
 return `推荐联系人只能使用已创建的角色，禁止生成新人物或NPC。可推荐且尚未成为用户好友的关系角色：${targets.map(c=>c.name).join("、")||"无"}。\n给用户推荐对方名片：[名片:角色准确名字:陌生人] 或 [名片:角色准确名字:认识]，仅这两种初始关系。\n用户要求把自己推荐给上述角色，且你实际同意完成介绍时，输出后台指令 [推荐用户:角色准确名字:陌生人] 或 [推荐用户:角色准确名字:认识]。这不产生聊天名片，目标将根据自己的人设和介绍语境决定何时发送好友申请；不要保证立即来加。不要在只是讨论、否定、假设推荐时输出指令。`;
}
export function enqueueRecommendation(fromId:string,targetName:string,relationship:"stranger"|"known",context:string,id:string) {
 const target=eligibleRecommendationTargets(fromId).find(c=>c.name===targetName.trim());
 if(!target)return;
 const items=read(); if(items.some(i=>i.id===id||(!i.done&&i.targetId===target.id)))return;
 const introduction = context.split("\n").filter(line => (line.includes(target.name) && /推荐|介绍|认识|联系|名片|加.*好友/.test(line)) || line.includes("推荐用户")).slice(-4).join("\n");
 items.push({id,fromId,targetId:target.id,context:introduction || "介绍人同意把用户介绍给目标角色，未提供其他私人资料。",relationship});write(items);
 void processContactRecommendations();
}
let busy=false;
export async function processContactRecommendations() {
 if(busy||typeof window==="undefined")return;busy=true;
 try {
  await hydrateChatStorage();
  for(const item of read().filter(i=>!i.done)) {
   if(item.retryAt && item.retryAt>Date.now())continue;
   const target=eligibleRecommendationTargets(item.fromId).find(c=>c.id===item.targetId);
   if(!target){write(read().map(i=>i.id===item.id?{...i,done:true}:i));continue;}
   if(item.dueAt===undefined){
    try {
     const binding=resolveBinding(loadBindingConfig(),target.id,"chat");const apis=loadApiConfigs();const api=apis.find(a=>a.id===binding.apiConfigId)||apis[0];if(!api)continue;
     const {sendLLMRequest}=await import("./chat-engine");
     const from=loadCharacters().find(c=>c.id===item.fromId);
     const raw=await sendLLMRequest(api,null,[{role:"system",content:`你为${target.name}安排一条新好友申请。角色人设：${target.persona}。介绍人：${from?.name}。与用户初始关系：${item.relationship==="known"?"此前认识":"此前陌生"}。当前时间：${new Date().toISOString()}。根据角色的作息、性格和介绍语境决定何时来加，可以立即、晚些时候、今晚、明天。只输出JSON {"delayMinutes":整数0到2880,"message":"角色本人写的简短好友申请"}。陌生人只能知道介绍语境提供的信息，不得自行知道用户隐私。`},{role:"user",content:item.context.slice(-2400)}],[],{characterName:target.name},{skipOutputRegex:true,appId:"chat"});
     const plan=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,""));
     if(!Number.isFinite(plan.delayMinutes)||typeof plan.message!=="string"||!plan.message.trim())throw new Error("invalid recommendation plan");
     item.dueAt=Date.now()+Math.max(0,Math.min(2880,plan.delayMinutes))*60000;item.message=plan.message.trim().slice(0,500);
     write(read().map(i=>i.id===item.id?{...i,...item}:i));
    }catch {write(read().map(i=>i.id===item.id?{...i,retryAt:Date.now()+60000}:i));continue;}
   }
   if(item.dueAt!==undefined && item.dueAt<=Date.now() && item.message){
    // Revalidate after the network request; manual additions must cancel the pending event.
    if(!eligibleRecommendationTargets(item.fromId).some(c=>c.id===item.targetId))continue;
    if(!loadFriendRequests().some(r=>r.characterId===item.targetId && r.status==="pending")){
     const identity = resolveUserIdentity(item.targetId,"chat");
     if(identity) saveCharacters(loadCharacters().map(c=>c.id===item.targetId?{...c,userKnowledgeLevels:{...c.userKnowledgeLevels,[identity.id]:item.relationship}}:c));
     addFriendRequest(item.targetId,item.message,(item.ignoredCount ?? 0) + 1,{source:"recommendation",recommendationId:item.id});dispatchFriendRequestUpdated();
    }
    write(read().map(i=>i.id===item.id?{...i,done:true}:i));
   }
  }
 }finally{busy=false;}
}
export function startContactRecommendationScheduler() {
 void processContactRecommendations();
 const tick=()=>void processContactRecommendations();const timer=window.setInterval(tick,15000);
 window.addEventListener("focus",tick);document.addEventListener("visibilitychange",tick);
 return ()=>{clearInterval(timer);window.removeEventListener("focus",tick);document.removeEventListener("visibilitychange",tick);};
}

/** User choices on a recommendation-origin friend request.
 * cancel cancels the invitation and all future follow-up; ignore allows at
 * most one later attempt, without immediately spawning another request. */
export function decideRecommendationRequest(recommendationId:string,decision:"cancel"|"ignore"|"add"){
 const items=read(),index=items.findIndex(i=>i.id===recommendationId);
 if(index<0)return false;
 if(decision==="cancel"){write(items.filter(i=>i.id!==recommendationId));return true;}
 if(decision==="ignore"){
   const event=items[index];const ignored=(event.ignoredCount||0)+1;
   if(ignored>=2){items[index]={...event,done:true,ignoredCount:ignored};}
   else {
     const days=1 + Math.floor(Math.random() * 3);
     items[index]={...event,done:false,ignoredCount:ignored,retryAt:Date.now()+days*86400000,dueAt:undefined,message:undefined};
   }
   write(items);return true;
 }
 items[index]={...items[index],done:true};write(items);return true;
}
export function getRecommendationIntroduction(targetId:string, requestMessage?:string):string {
 const event=read().filter(e=>e.targetId===targetId&&e.done&&e.message&&(!requestMessage||e.message===requestMessage)).at(-1);
 if(!event)return "";
 const from=loadCharacters().find(c=>c.id===event.fromId);
 return `${from?.name||"介绍人"}把用户推荐给你。你们此前${event.relationship==="known"?"认识":"没有私人关系"}。介绍语境：${event.context}。你发送的好友申请：${event.message}`;
}
