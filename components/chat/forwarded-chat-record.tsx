"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, MessagesSquare, X } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-storage";
import {splitBilingualText} from "@/lib/bilingual-text";
import {loadChatSessions} from "@/lib/chat-storage";
import {loadChatNightMode} from "@/lib/chat-appearance";
import {useAppBack} from "@/lib/back-navigation";
import { forwardedMessageText, type ForwardedChatEntry } from "@/lib/chat-forward";
import { getChatImageFromIndexedDB } from "@/lib/chat-asset-storage";
import { isMediaStoreRef, loadMediaObjectUrl } from "@/lib/media-cache-storage";

function useAsset(ref?: string | null) {
  const [url, setUrl] = useState("");
  useEffect(()=>{
    let active=true, objectUrl=""; setUrl("");
    if (!ref) return;
    void (async()=>{
      if (isMediaStoreRef(ref)) { const resolved=await loadMediaObjectUrl(ref); if(resolved) { objectUrl=resolved; if(active)setUrl(resolved);else URL.revokeObjectURL(resolved); } }
      else if (/^(https?:|data:|blob:|\/)/i.test(ref)) {if(active)setUrl(ref);}
      else {const resolved=await getChatImageFromIndexedDB(ref);if(active&&resolved)setUrl(resolved);}
    })().catch(()=>undefined);
    return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[ref]);
  return url;
}
export function ForwardAvatar({ image, name }: {image?:string|null;name:string}) {
  const url=useAsset(image);
  return <span className="chat-forward-avatar">{url?<img src={url} alt=""/>:name.slice(0,1)}</span>;
}
function SnapshotEntry({entry,defaultExpanded}:{entry:ForwardedChatEntry;defaultExpanded:boolean}) {
  const [expanded,setExpanded]=useState(defaultExpanded);const pair=splitBilingualText(entry.message.content);
  const message=entry.message;
  const source=message.mediaType==="sticker" ? message.mediaData?.stickerUrl||message.mediaUrl : message.mediaUrl;
  const url=useAsset(source);
  const kind=message.mediaType==="media_file"?message.mediaData?.fileType:message.mediaType;
  const media=kind==="image"||kind==="sticker" ? url&&<img className="chat-forward-image" src={url} alt={message.mediaData?.label||"图片"}/> : kind==="audio" ? url&&<audio controls src={url} preload="none"/> : kind==="video" ? url&&<video controls src={url} preload="none"/> : null;
  return <article className="chat-forward-entry">
    <ForwardAvatar image={entry.avatar} name={entry.name}/>
    <div><header><strong>{entry.name}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time></header>
      {media}<div className="chat-forward-text" onClick={()=>pair&&setExpanded(x=>!x)} role={pair?"button":undefined} tabIndex={pair?0:undefined} onKeyDown={e=>{if(pair&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setExpanded(x=>!x);}}}>{pair?<><p>{pair.original}</p>{expanded&&<p className="chat-forward-translation">{pair.translated}</p>}</>:<p>{forwardedMessageText(message)}</p>}</div>
    </div>
  </article>;
}
export function ForwardedChatBubble({msg}:{msg:ChatMessage}) {
  const record=msg.mediaData?.forwardRecord;
  const [open,setOpen]=useState(false);
  const [dark,setDark]=useState(loadChatNightMode);
  useAppBack(()=>setOpen(false),()=>open,60);
  const button=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);button.current?.focus();}};
    document.addEventListener("keydown",key);return ()=>document.removeEventListener("keydown",key);
  },[open]);
  if(!record)return <div className="chat-forward-card">聊天记录暂不可用</div>;
  return <>
    <button ref={button} type="button" className="chat-forward-card" onClick={event=>{event.stopPropagation();setDark(event.currentTarget.closest(".chat-app")?.getAttribute("data-chat-theme")==="dark");setOpen(true);}} aria-label={`查看${record.title}，共${record.entries.length}条`}>
      <strong><MessagesSquare size={17}/>{record.title}</strong>
      <div className="chat-forward-preview">{record.entries.slice(0,3).map((entry,index)=><p key={index}>{entry.name}：{forwardedMessageText(entry.message).replace(/\s+/g," ")}</p>)}</div>
      <footer><span>聊天记录 · {record.entries.length} 条</span><ChevronRight size={15}/></footer>
    </button>
    {open&&createPortal(<div className="chat-forward-mask" data-theme={dark?"dark":"light"} onClick={event=>{event.stopPropagation();if(event.target===event.currentTarget){setOpen(false);button.current?.focus();}}}>
      <section className="chat-forward-dialog" role="dialog" aria-modal="true" aria-label={record.title}>
        <header className="chat-forward-heading"><div><strong>{record.title}</strong><small>聊天记录 · {record.entries.length} 条</small></div><button autoFocus type="button" onClick={()=>{setOpen(false);button.current?.focus();}} aria-label="关闭聊天记录"><X size={22}/></button></header>
        <div className="chat-forward-scroll">{record.entries.map((entry,index)=><SnapshotEntry key={`${entry.message.id}:${index}`} entry={entry} defaultExpanded={loadChatSessions().find(s=>s.id===msg.sessionId)?.collapseBilingualTranslation===false}/>)}</div>
      </section>
    </div>,document.body)}
  </>;
}
