import type { ChatMessage } from "./chat-storage";
import { loadChatMessages, loadChatSessions } from "./chat-storage";
import { loadCharacterWorldGroups, updateCharacterWorldRelation, CHARACTER_WORLDS_UPDATED_EVENT, type CharacterWorldRelation } from "./character-world-storage";
import { loadCharacters } from "./character-storage";
import { loadUserIdentities, resolveUserIdentity } from "./settings-storage";
import { normalizeRelationKind, userIdentityFromNode, userRelationNode, type RelationKind } from "./relation-policy";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
const KEY = "ai_phone_relationship_suggestions_v1";
export const RELATION_SUGGESTIONS_UPDATED = "relationship-suggestions-updated";
registerKvMigration(KEY);
const DAY = 86400000;
// These are anti-spam floors, never relationship scores or proof of affection.
export const RELATION_REVIEW_POLICY = { interactionSpan: 7 * DAY, observationGap: 3 * DAY, cooldown: 7 * DAY, minimumMessages: 12, minimumDates: 3 };
export type RelationshipSuggestion = {
 relationId: string; groupId: string; kind: RelationKind; label: string; reason: string; evidence: string[];
 fromId: string; toId: string; originalLabel: string; originalKind?: RelationKind; originalBidirectional: boolean; createdAt: number;
 sessionId: string; identityId?: string; evidenceIds: string[];
};
type Review = { sessionId?: string; fingerprint?: string; last?: number; lastMessage?: string; evidenceIds?: string[]; observations?: number; signature?: string; pending?: RelationshipSuggestion };
type State = { reviews: Record<string, Review>; pairs: Record<string, { disabled?: boolean; cooldownUntil?: number }> };
function loadState(): State {
 try { const s = JSON.parse(kvGet(KEY) || "{}"); return {reviews: s.reviews || {},pairs: s.pairs || {}}; } catch { return {reviews:{},pairs:{}}; }
}
function saveState(state: State): void {
 kvSet(KEY, JSON.stringify(state));
 if(typeof window !== "undefined") window.dispatchEvent(new CustomEvent(RELATION_SUGGESTIONS_UPDATED));
}
function pairKey(from: string, to: string): string { return JSON.stringify([from,to].sort()); }
function fingerprint(r: CharacterWorldRelation): string { return JSON.stringify([r.fromCharacterId,r.toCharacterId,r.kind,r.label,r.locked===true,r.bidirectional===true]); }
function calendarDate(message: ChatMessage): string { return message.createdAt.slice(0,10); }
function speaker(message: ChatMessage): string { return message.role === "user" ? userRelationNode(message.mediaData?.userIdentityId || "") : message.senderCharacterId || ""; }
function pairHasFixedBoundary(relation: CharacterWorldRelation): boolean {
 const key=pairKey(relation.fromCharacterId,relation.toCharacterId);
 return loadCharacterWorldGroups().some(g=>g.relations.some(r=>pairKey(r.fromCharacterId,r.toCharacterId)===key && (r.locked || r.kind === "family")));
}
function eligibleHistory(relation: CharacterWorldRelation, history: ChatMessage[]): ChatMessage[] {
 const actors=[relation.fromCharacterId,relation.toCharacterId];
 return history.filter(m=>!m.mediaType && !m.mediaData?.callEvent && m.content.trim() && Number.isFinite(Date.parse(m.createdAt))
  && (!m.mediaData?.callAudienceIds || actors.filter(id=>!userIdentityFromNode(id)).every(id=>m.mediaData?.callAudienceIds?.includes(id)))
  && actors.includes(speaker(m)));
}
function eligible(relation: CharacterWorldRelation, history: ChatMessage[], now: number, state: State): boolean {
 if(pairHasFixedBoundary(relation) || !relation.kind) return false;
 const pair=state.pairs[pairKey(relation.fromCharacterId,relation.toCharacterId)];
 if(pair?.disabled || (pair?.cooldownUntil || 0)>now) return false;
 const review=state.reviews[relation.id];
 if(review?.fingerprint===fingerprint(relation) && review.pending) return false;
 const messages=eligibleHistory(relation,history), dates=messages.map(m=>Date.parse(m.createdAt));
 return messages.length>=RELATION_REVIEW_POLICY.minimumMessages && new Set(messages.map(calendarDate)).size>=RELATION_REVIEW_POLICY.minimumDates
  && new Set(messages.map(speaker)).size===2 && Math.max(...dates)-Math.min(...dates)>=RELATION_REVIEW_POLICY.interactionSpan
  && (!relation.createdAt || now-Date.parse(relation.createdAt)>=RELATION_REVIEW_POLICY.interactionSpan);
}
function scopeRelations(characterIds: string[], identityId?: string) {
 return loadCharacterWorldGroups().flatMap(group=>group.relations.filter(r=>[r.fromCharacterId,r.toCharacterId].some(id=>characterIds.includes(id))
  && [r.fromCharacterId,r.toCharacterId].every(id=>userIdentityFromNode(id)?userIdentityFromNode(id)===identityId:characterIds.includes(id))).map(relation=>({group,relation})));
}
function sessionHistory(sessionId: string): ChatMessage[] {
 const session=loadChatSessions().find(s=>s.id===sessionId);
 return loadChatMessages(sessionId).map(m=>m.role === "assistant" && !session?.isGroup ? {...m,senderCharacterId:m.senderCharacterId || session?.contactId} : m);
}
export function relationshipSuggestionInstruction(characterIds: string[], identityId: string | undefined, history: ChatMessage[]): string {
 const now=Date.now(), state=loadState();
 const roster=scopeRelations(characterIds,identityId).filter(({relation:r})=>eligible(r,history,now,state)
  && (!state.reviews[r.id]?.last || state.reviews[r.id]?.fingerprint!==fingerprint(r) || now-state.reviews[r.id].last!>=RELATION_REVIEW_POLICY.observationGap));
 if(!roster.length) return "";
 const names=new Map(loadCharacters().map(c=>[c.id,c.name]));
 for(const i of loadUserIdentities()) names.set(userRelationNode(i.id),i.name);
 return `【可选关系观察】只在持续互动显示双方实际状态确实变化时才观察，不以次数/时长为升级依据，不每轮提议，不迎合恋爱方向。白蓝红只是允许路径，关系也可以不发展或退回。不把单方幻想、关心、配合当作双方同意。只观察以下关系：\n${roster.map(({relation:r})=>`${r.id}：${names.get(r.fromCharacterId)} 与 ${names.get(r.toCharacterId)} 当前 ${r.label} / ${r.kind}`).join("\n")}\n充分的新证据出现时，在本角色回复末尾最多输出一个隐藏块：[关系建议]{"relationId":"上面的ID","kind":"ordinary/friend/romance/enemy之一","label":"建议的当前关系","reason":"双方实际状态为何变化","evidence":["历史中逐字一致的原文1","原文2","原文3"]}[/关系建议]。证据须来自不同日期、包含双方回应，并包含这次观察前新出现的双方互动。没有就完全省略。普通关系不直接跳到恋爱。不要向角色宣告关系已变化，不公开本块。`;
}
export function observeRelationshipSuggestion(raw: string, actorId: string, sessionId: string): void {
 let data: Record<string,unknown>; try { data=JSON.parse(raw); } catch { return; }
 const kind=normalizeRelationKind(data.kind);
 if(!kind || kind==="family" || typeof data.relationId!=="string" || typeof data.label!=="string" || typeof data.reason!=="string") return;
 const session=loadChatSessions().find(s=>s.id===sessionId); if(!session) return;
 const identity=resolveUserIdentity(session.isGroup?undefined:session.contactId,session.isGroup?"group_chat":"chat");
 const ids=session.isGroup?session.participantIds || []:[session.contactId];
 const found=scopeRelations(ids,identity?.id).find(({relation:r})=>r.id===data.relationId && [r.fromCharacterId,r.toCharacterId].includes(actorId));
 if(!found) return;
 const history=sessionHistory(sessionId), now=Date.now(), state=loadState();
 if(!eligible(found.relation,history,now,state)) return;
 const evidence=Array.isArray(data.evidence)?data.evidence.filter((v):v is string=>typeof v==="string" && v.trim().length>=4 && v.length<=300).map(v=>v.trim()).slice(0,6):[];
 const messages=eligibleHistory(found.relation,history);
 const matches=evidence.map(q=>messages.find(m=>m.content.includes(q))).filter((m):m is ChatMessage=>Boolean(m));
 if(new Set(matches.map(m=>m.id)).size<3 || new Set(matches.map(calendarDate)).size<3 || new Set(matches.map(speaker)).size!==2) return;
 const label=data.label.trim().slice(0,100), reason=data.reason.trim().slice(0,500);
 if(!label || !reason || (kind===found.relation.kind && label===found.relation.label) || (found.relation.kind==="ordinary" && kind==="romance")) return;
 const old=state.reviews[found.relation.id];
 const prior=old?.fingerprint===fingerprint(found.relation)?old:{};
 const lastMessage=messages.at(-1)?.id;
 if(prior.lastMessage===lastMessage || (prior.last && now-prior.last<RELATION_REVIEW_POLICY.observationGap)) return;
 // A second observation must contain new actual evidence from BOTH actors, not a replay of old quotes.
 if(prior.last) {
  const newMatches=matches.filter(m=>!(prior.evidenceIds || []).includes(m.id) && Date.parse(m.createdAt)>prior.last!);
  if(new Set(newMatches.map(speaker)).size!==2) return;
 }
 const signature=`${kind}:${label}`, observations=prior.signature===signature?(prior.observations || 0)+1:1;
 const next: Review={sessionId,fingerprint:fingerprint(found.relation),signature,last:now,lastMessage,evidenceIds:matches.map(m=>m.id),observations};
 if(observations>=2) next.pending={relationId:found.relation.id,groupId:found.group.id,kind,label,reason,evidence,
  fromId:found.relation.fromCharacterId,toId:found.relation.toCharacterId,originalLabel:found.relation.label,originalKind:found.relation.kind,
  originalBidirectional:found.relation.bidirectional===true,createdAt:now,sessionId,identityId:identity?.id,evidenceIds:matches.map(m=>m.id)};
 state.reviews[found.relation.id]=next;
 saveState(state);
}
export function pendingRelationshipSuggestions(): RelationshipSuggestion[] {
 const state=loadState(), groups=loadCharacterWorldGroups();
 return Object.values(state.reviews).flatMap(review=>{
  const p=review.pending; if(!p) return [];
  const relation=groups.find(g=>g.id===p.groupId)?.relations.find(r=>r.id===p.relationId);
  if(!relation || pairHasFixedBoundary(relation) || review.fingerprint!==fingerprint(relation)
   || state.pairs[pairKey(p.fromId,p.toId)]?.disabled) return [];
  const session=loadChatSessions().find(s=>s.id===p.sessionId); if(!session) return [];
  const identity=resolveUserIdentity(session.isGroup?undefined:session.contactId,session.isGroup?"group_chat":"chat");
  if([p.fromId,p.toId].some(id=>userIdentityFromNode(id) && userIdentityFromNode(id)!==identity?.id)) return [];
  const messages=eligibleHistory(relation,sessionHistory(p.sessionId));
  if(!p.evidenceIds.every(id=>messages.some(m=>m.id===id))) return [];
  return [p];
 }).sort((a,b)=>a.createdAt-b.createdAt);
}
export function respondToRelationshipSuggestion(suggestion: RelationshipSuggestion, action: "accept" | "hold" | "disable"): boolean {
 const current=pendingRelationshipSuggestions().find(p=>p.relationId===suggestion.relationId && p.createdAt===suggestion.createdAt);
 if(!current) return false;
 if(action==="accept") updateCharacterWorldRelation(current.groupId,current.relationId,{label:current.label,kind:current.kind,locked:false,bidirectional:current.originalBidirectional});
 const state=loadState(), key=pairKey(current.fromId,current.toId);
 state.pairs[key]={disabled:action==="disable",cooldownUntil:Date.now()+RELATION_REVIEW_POLICY.cooldown};
 for(const id of Object.keys(state.reviews)) {
  const p=state.reviews[id].pending;
  if(id===current.relationId || (p && pairKey(p.fromId,p.toId)===key)) delete state.reviews[id];
 }
 saveState(state); return true;
}
export function pairSuggestionsDisabled(fromId: string,toId: string): boolean { return loadState().pairs[pairKey(fromId,toId)]?.disabled===true; }
export function setPairSuggestionsDisabled(fromId: string,toId: string,disabled: boolean): void {
 const state=loadState(),key=pairKey(fromId,toId);
 state.pairs[key]={...state.pairs[key],disabled};
 if(disabled) for(const [id,review] of Object.entries(state.reviews)) if(review.pending && pairKey(review.pending.fromId,review.pending.toId)===key) delete state.reviews[id];
 saveState(state);
}
/** Clear stale observations/pending items after manual edits or deletion, preserving pair preferences. */
export function reconcileRelationshipReviews(): void {
 const state=loadState(), relations=loadCharacterWorldGroups().flatMap(g=>g.relations);
 let changed=false;
 for(const [id,review] of Object.entries(state.reviews)) {
  const relation=relations.find(r=>r.id===id);
  if(!relation || pairHasFixedBoundary(relation) || fingerprint(relation)!==review.fingerprint || (review.sessionId && review.evidenceIds?.some(id=>!sessionHistory(review.sessionId!).some(m=>m.id===id)))) { delete state.reviews[id]; changed=true; }
 }
 if(changed) saveState(state);
}
export { CHARACTER_WORLDS_UPDATED_EVENT };
