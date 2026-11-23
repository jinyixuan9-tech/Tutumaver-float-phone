"use client";
import { useState } from "react";
import { introductionCandidates } from "@/lib/contact-introduction";
import { resolveChatCharacterDisplayName } from "@/lib/chat-profile-storage";
export function RecommendContactModal({receiverId,onSend,onClose}: {receiverId:string;onSend:(id:string,note:string)=>void;onClose:()=>void}) {
  const candidates = introductionCandidates(receiverId);
  const [selected,setSelected] = useState("");
  const [note,setNote] = useState("");
  return <div className="modal-overlay" onClick={onClose}><div className="modal-dialog" onClick={e=>e.stopPropagation()}>
    <div className="ts-16 font-semibold text-center text-[var(--c-text)]">推荐好友名片</div>
    <div className="overflow-y-auto max-h-[40vh] w-full flex flex-col gap-2">
      {candidates.map(c=><button key={c.id} className="ui-btn ui-btn-ghost ui-btn-bordered-ghost flex items-center gap-3" style={selected===c.id?{borderColor:"var(--c-icon-active)"}:undefined} onClick={()=>setSelected(c.id)} aria-pressed={selected===c.id}>
        {c.avatar&&<img src={c.avatar} alt="" className="w-9 h-9 rounded-lg object-cover"/>}<span>{resolveChatCharacterDisplayName(c)}</span>
      </button>)}
      {!candidates.length&&<p className="ts-13 text-[var(--c-icon)]">没有可推荐的好友。同世界里对方已经认识的人不再显示。</p>}
    </div>
    <label className="w-full ts-13 text-[var(--c-text)]">两人的关系（可选）<input className="ui-input w-full mt-2" maxLength={200} value={note} onChange={e=>setNote(e.target.value)} placeholder="例如：我的朋友，介绍你们认识"/></label>
    <div className="flex gap-3 w-full"><button className="ui-btn ui-btn-ghost ui-btn-bordered-ghost flex-1" onClick={onClose}>取消</button><button className="ui-btn ui-btn-success flex-1" disabled={!selected} onClick={()=>onSend(selected,note)}>发送</button></div>
  </div></div>;
}
