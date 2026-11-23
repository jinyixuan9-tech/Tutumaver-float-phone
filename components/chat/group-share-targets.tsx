"use client";
import { chatShareGroups, GROUP_SHARE_PREFIX } from '@/lib/chat-share-targets';
import type { ChatSession } from '@/lib/chat-storage';
export function GroupShareTargets({ onSelect, allow, selected, actionLabel }: { onSelect: (target:string)=>void; allow?:(group:ChatSession)=>boolean; selected?:string[]; actionLabel?: string }) {
    const groups=chatShareGroups().filter(g=>!allow || allow(g));
    if (!groups.length) return null;
    return <div className="chat-share-group-targets"><div className="chat-share-group-heading">群聊</div>{groups.map(g=>{
        const id=GROUP_SHARE_PREFIX+g.id;
        return <button type="button" key={id} aria-pressed={selected ? selected.includes(id) : undefined} onClick={()=>onSelect(id)}>
            <span className="chat-share-group-avatar">{g.groupAvatar ? <img src={g.groupAvatar} alt=""/> : '群'}</span>
            <span>{g.groupName || '群聊'}</span>{actionLabel ? <span className="chat-share-group-action">{actionLabel}</span> : <small>{(g.participantIds?.length || 0)+1}人</small>}
        </button>;
    })}</div>;
}
