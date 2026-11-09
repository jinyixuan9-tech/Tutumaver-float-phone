"use client";

import { useEffect, useState } from "react";
import { loadChatMessages, type ChatMessage } from "@/lib/chat-storage";
import { actOnWeverseLiveInvite, WEV_INVITE_UPDATED } from "@/lib/weverse-live-collaboration";
import { loadWeverseState, WEV_UPDATED_EVENT } from "@/lib/weverse-storage";

export function WeverseLiveInviteCard({ message }: { message: ChatMessage }) {
  const invite = loadChatMessages(message.sessionId).find(item => item.id === message.id)?.mediaData?.weverseLiveInvite ?? message.mediaData?.weverseLiveInvite;
  const [, setRevision] = useState(0);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(WEV_UPDATED_EVENT, refresh);
    window.addEventListener(WEV_INVITE_UPDATED, refresh);
    return () => {
      window.removeEventListener(WEV_UPDATED_EVENT, refresh);
      window.removeEventListener(WEV_INVITE_UPDATED, refresh);
    };
  }, []);
  if (!invite) return null;

  const isLive = loadWeverseState().lives.some(item => item.id === invite.liveId && !item.official && item.status === "live" && !item.endedAt);
  const status = isLive ? invite.status : "expired";
  const canAnswer = message.role === "assistant" && status === "pending";
  const label = {
    pending: "等待回应", accepted: "已加入", declined: "已拒绝", expired: "直播已结束", failed: "未收到回复",
  }[status];

  return <div className="chat-xhs-share-card chat-weverse-invite-card">
    <div className="chat-xhs-share-head"><span className="chat-xhs-share-mark">Live</span>Weverse</div>
    <strong>合作直播邀请</strong>
    <span className="chat-weverse-invite-title">{invite.title}</span>
    {canAnswer ? <div className="chat-weverse-invite-actions">
      <button type="button" onClick={() => { actOnWeverseLiveInvite(message, false); }}>拒绝</button>
      <button type="button" onClick={() => { if (!actOnWeverseLiveInvite(message, true)) setFeedback("暂时无法加入"); }}>接受</button>
    </div> : <small>{label}</small>}
    {feedback && canAnswer ? <small role="status">{feedback}</small> : null}
  </div>;
}
