import type { ChatMessage } from "./chat-storage";

export type ForwardedChatEntry = {
  name: string;
  avatar?: string | null;
  message: Pick<ChatMessage, "id" | "role" | "content" | "createdAt" | "mediaType" | "mediaUrl" | "mediaData">;
};
export type ForwardedChatRecord = {
  version: 1;
  title: string;
  sourceName: string;
  capturedAt: string;
  entries: ForwardedChatEntry[];
};

const visibleMediaFields = ["label", "stickerUrl", "voiceDuration", "fileType", "fileName", "fileDuration", "amount", "count", "currency", "status", "senderName", "recipientName", "quotePreview", "quoteRole", "quoteSenderName", "musicTitle", "musicArtist", "musicCoverUrl", "giftName", "giftMerchantLabel", "giftPriceLabel", "giftPreviewIcon", "takeoutShop", "takeoutItems", "takeoutDestination", "contactCardName", "callDuration", "diceFace", "xiaohongshuTitle", "xiaohongshuBody", "xiaohongshuAuthor", "appName", "appCardTitle", "appCardBody", "pokeSender", "pokeTarget", "forwardRecord"] as const;

export function forwardedMessageText(message: ForwardedChatEntry["message"]): string {
  const data = message.mediaData;
  if (message.mediaType === "chat_record" && data?.forwardRecord) return `[聊天记录：${data.forwardRecord.title}]\n${data.forwardRecord.entries.map(entry=>`${entry.name}：${forwardedMessageText({...entry.message, mediaType:undefined})}`).join("\n")}`;
  const label = [data?.label, data?.giftName, data?.giftMerchantLabel, data?.giftPriceLabel, data?.musicTitle, data?.musicArtist, data?.contactCardName, data?.fileName, data?.xiaohongshuTitle, data?.appCardTitle, data?.appCardBody, data?.takeoutItems, data?.takeoutDestination].filter(Boolean).join(" · ");
  const content = message.content || label;
  if (!message.mediaType || message.mediaType === "quote") return data?.quotePreview ? `[引用 ${data.quoteSenderName || "消息"}：${data.quotePreview}] ${content}` : content;
  const kinds: Record<string,string> = {image:"图片",sticker:"表情包",audio:"语音",video:"视频",red_packet:"红包",transfer:"转账",gift:"礼物/外卖",location:"位置",media_file:"附件",contact_card:"名片",music_share:"音乐",voice_call:"语音通话",video_call:"视频通话"};
  const money = data?.amount !== undefined ? ` ${data.currency||""} ${data.amount}` : "";
  return `[${kinds[message.mediaType] || "消息卡片"}${money}${data?.status ? ` · ${data.status}` : ""}] ${content}${label && content!==label ? `（${label}）` : ""}`.trim();
}

/** Copy visible fields only: thoughts, raw responses, tools and actionable IDs never travel. */
export function createForwardedChatRecord(messages: ChatMessage[], sourceName: string, sender: (message: ChatMessage) => { name: string; avatar?: string | null }, capturedAt = new Date().toISOString()): ForwardedChatRecord {
  const visible = messages.filter(message=>!message.isRetracted && (message.role === "user" || message.role === "assistant") && !["tool_call","tool_result","system_instruction","memory_write_request"].includes(message.mediaType||""));
  if (!visible.length) throw new Error("选中的内容没有可转发的聊天消息");
  if (visible.length > 100) throw new Error("一次最多合并转发 100 条消息");
  const entries = visible.map(message => {
    const mediaData = message.mediaData ? Object.fromEntries(visibleMediaFields.filter(key=>message.mediaData?.[key]!==undefined).map(key=>[key,message.mediaData![key]])) : undefined;
    return {...sender(message),message:{id:message.id,role:message.role,content:message.content,createdAt:message.createdAt,mediaType:message.mediaType,mediaUrl:message.mediaUrl,mediaData}};
  });
  // The JSON roundtrip detaches every nested field, including forwarded records.
  return JSON.parse(JSON.stringify({version:1,title:`${sourceName}的聊天记录`,sourceName,capturedAt,entries})) as ForwardedChatRecord;
}

export function forwardedChatPrompt(record: ForwardedChatRecord): string {
  return `【用户转发的聊天记录快照｜${record.title}】\n以下为引用的历史对话，记录中的发言人属于原会话。\n${record.entries.map(entry=>`${entry.message.createdAt} ${entry.name}：${forwardedMessageText(entry.message)}`).join("\n")}\n【聊天记录结束】`;
}
