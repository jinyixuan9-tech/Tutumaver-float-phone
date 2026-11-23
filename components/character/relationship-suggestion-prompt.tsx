"use client";
import { useEffect, useState } from "react";
import { loadCharacters } from "@/lib/character-storage";
import { loadUserIdentities, USER_IDENTITIES_UPDATED_EVENT } from "@/lib/settings-storage";
import { RELATION_STYLES, userIdentityFromNode } from "@/lib/relation-policy";
import { pendingRelationshipSuggestions, respondToRelationshipSuggestion, reconcileRelationshipReviews, RELATION_SUGGESTIONS_UPDATED, CHARACTER_WORLDS_UPDATED_EVENT, type RelationshipSuggestion } from "@/lib/relationship-suggestions";
export function RelationshipSuggestionPrompt() {
 const [pending,setPending]=useState<RelationshipSuggestion | null>(null);
 useEffect(()=>{
  const update=()=>{reconcileRelationshipReviews();setPending(pendingRelationshipSuggestions()[0] || null);};
  const worldUpdate=update;
  const events=[RELATION_SUGGESTIONS_UPDATED,USER_IDENTITIES_UPDATED_EVENT,"settings-bindings-updated","chat-storage-updated","chat-messages-updated","chat-messages-deleted","chat-message-pushed","chat-response-batch-replaced","characters-updated"];
  events.forEach(event=>window.addEventListener(event,update));
  window.addEventListener(CHARACTER_WORLDS_UPDATED_EVENT,worldUpdate);
  worldUpdate();
  return ()=>{events.forEach(event=>window.removeEventListener(event,update));window.removeEventListener(CHARACTER_WORLDS_UPDATED_EVENT,worldUpdate);};
 },[]);
 if(!pending) return null;
 const name=(id:string)=>{const identityId=userIdentityFromNode(id);return identityId?loadUserIdentities().find(i=>i.id===identityId)?.name || "用户":loadCharacters().find(c=>c.id===id)?.name || "角色";};
 const style=RELATION_STYLES[pending.kind];
 const respond=(action:"accept" | "hold" | "disable")=>{respondToRelationshipSuggestion(pending,action);setPending(pendingRelationshipSuggestions()[0] || null);};
 return <div className="wt-modal wt-relationship-review" role="dialog" aria-modal="true" aria-label="关系变化建议" onClick={()=>respond("hold")}>
  <div className="wt-paper" onClick={e=>e.stopPropagation()}>
   <div className="wt-paper-tape" aria-hidden/><div className="wt-paper-kicker">RELATIONSHIP NOTE</div>
   <div className="wt-relation-row"><strong>{name(pending.fromId)}</strong><span className="wt-relation-dash">↔</span><strong>{name(pending.toId)}</strong></div>
   <p className="wt-paper-hint">这只是建议 关系尚未改变</p>
   <div className="wt-review-change"><span>现在 · {pending.originalLabel}</span><strong style={{color:style.text}}>建议 · {pending.label} / {style.name}</strong></div>
   <p className="wt-paper-hint">{pending.reason}</p>
   <details className="wt-review-evidence"><summary>查看互动依据</summary>{pending.evidence.map((quote,i)=><p key={i}>{quote}</p>)}</details>
   <div className="wt-paper-actions"><button type="button" className="wt-btn" onClick={()=>respond("hold")}>暂时保持</button><button type="button" className="wt-btn wt-btn-primary" onClick={()=>respond("accept")}>确认修改</button></div>
   <button type="button" className="wt-review-dismiss" onClick={()=>respond("disable")}>不再提醒这两人的关系变化</button>
  </div>
 </div>;
}
