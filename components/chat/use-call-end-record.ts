"use client";
import { useEffect, useRef } from "react";
import { loadChatMessages, pushChatMessage } from "@/lib/chat-storage";

/** Finish only an open call. Deferred cleanup tolerates React StrictMode's effect replay. */
export function finishOpenCall(sessionId: string, type: "voice" | "video", duration: string): boolean {
  const label = type === "voice" ? "语音通话" : "视频通话";
  const messages = loadChatMessages(sessionId);
  let start = -1;
  for (let i=messages.length-1;i>=0;i--) {
    if (/^\[[^\]\n]*发起了(?:语音|视频)通话\]$/.test(messages[i].content)) { start=i; break; }
  }
  if (start<0 || !messages[start].content.includes(label)) return false;
  const ended = messages.slice(start+1).some(m=>
    new RegExp(`^\\[[^\\]\\n]*(?:(?:挂断了|拒绝了|取消了)${label}|${label}已结束)\\]`).test(m.content)
    || m.mediaData?.callEvent === "end");
  if (ended) return false;
  pushChatMessage({sessionId,role:"system",content:`[${label}已结束]`,mediaData:{callDuration:duration}});
  return true;
}

export function useCallEndRecord(sessionId: string, type: "voice" | "video", seconds: number) {
  const latest = useRef(seconds);
  latest.current=seconds;
  const cleanup = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(()=>{
    if(cleanup.current)clearTimeout(cleanup.current);
    const finish=()=>{
      const value=latest.current;
      return finishOpenCall(sessionId,type,`${Math.floor(value/60).toString().padStart(2,"0")}:${(value%60).toString().padStart(2,"0")}`);
    };
    window.addEventListener("pagehide",finish);
    return ()=>{
      window.removeEventListener("pagehide",finish);
      cleanup.current=setTimeout(finish,0);
    };
  },[sessionId,type]);
}
