import { loadCharacters } from "./character-storage";
import { loadChatSessions, loadChatMessages, type ChatMessage, type ChatSession } from "./chat-storage";
import { generateChatCompletion, flattenCompletionResult } from "./chat-engine";
import { parseAIResponse } from "./rich-message-parser";
import { splitCallTranscript, VOICE_CALL_FORMAT } from "./call-transcript";
import { communicationBusy } from "./communication-policy";
import { loadPhoneState } from "./phone-storage";
import { phoneId, type PhoneTranscriptLine } from "./phone-storage";

export type PhoneReplyLine = { id: string; original: string; translated?: string };

function phoneContextSession(characterId: string): ChatSession {
  return loadChatSessions().find(s => !s.isGroup && s.contactId === characterId) ?? {
    id: `phone_context_${characterId}`, contactId: characterId, unreadCount: 0,
    updatedAt: new Date().toISOString(), isPinned: false,
    bilingualTranslationEnabled: true, collapseBilingualTranslation: true,
  };
}

function splitOriginalTranslated(text: string): { original: string; translated?: string } {
  const idx = text.indexOf("|");
  if (idx < 0) return { original: text.trim() };
  const original = text.slice(0, idx).trim();
  const translated = text.slice(idx + 1).trim();
  return { original, translated: translated && translated !== original ? translated : undefined };
}

function callHistory(sessionId: string, transcript: PhoneTranscriptLine[]): ChatMessage[] {
  // Ephemeral messages give the chat model the ongoing call context without writing
  // to Chat storage or firing Chat notification/sound events.
  return transcript.map(line => ({
    id: line.id, sessionId, role: line.role, content: line.role === "assistant"
      ? [line.original, line.translated].filter(Boolean).join(" | ") : line.original,
    status: "sent", createdAt: new Date(line.createdAt).toISOString(),
  }));
}

export async function decidePhoneAnswer(characterId: string): Promise<"answer" | "decline" | "missed" | "busy"> {
  const character = loadCharacters().find(c => c.id === characterId);
  if (!character) return "missed";
  const active=communicationBusy("phone",characterId);
  if(active?.level===4)return "missed";
  const repeated=loadPhoneState().calls.filter(c=>c.characterId===characterId&&c.direction==="outgoing"&&Date.now()-c.endedAt<15*60_000).length;
  const session = phoneContextSession(characterId);
  const history = loadChatMessages(session.id);
  try {
    const result = flattenCompletionResult(await generateChatCompletion(session, history, {
      appId: "phone", appTags: ["chat", "voice"],
      callFormatInstruction: [
        "用户现在通过手机 Phone App 主动打电话给你。请只判断你此刻是否接听，不要写对白。",
        "结合人设、最近聊天、其他应用上下文、时间和当前关系自然决定。不要为了配合用户而固定接听。",
        `日历忙碌等级：${active?.level||1}。${active?`当前安排：${active.item.title}。`:""}最近15分钟已有${repeated}次用户来电。这仅可能表示急事，不强制接听。等级2可短接；等级3通常不接，但可按性格和连续来电判断是否短接。`,
        "只输出 answer / decline / missed / busy 其中一个英文词。",
      ].join("\n"),
    }));
    const token = result.trim().toLowerCase().match(/\b(answer|decline|missed|busy)\b/)?.[1];
    return (token as "answer" | "decline" | "missed" | "busy") || "missed";
  } catch { return "missed"; }
}

export function queuePhoneUserLine(_characterId: string, text: string): PhoneTranscriptLine {
  return { id: phoneId("phone_line"), role: "user", original: text.trim(), createdAt: Date.now() };
}

export async function generatePhoneReply(characterId: string, transcript: PhoneTranscriptLine[]): Promise<{ lines: PhoneReplyLine[]; hangup: boolean }> {
  const session = phoneContextSession(characterId);
  const history = [...loadChatMessages(session.id), ...callHistory(session.id, transcript)];
  const active=communicationBusy("phone",characterId);
  const raw = flattenCompletionResult(await generateChatCompletion(session, history, {
    appId: "phone", appTags: ["chat", "voice"],
    callFormatInstruction: `${VOICE_CALL_FORMAT}\n${active&&active.level>1?`角色当前有安排：${active.item.title}，忙碌等级${active.level}。${active.level>=3?"现在需要结束通话，请按性格简短说明或自然告别，并输出 [PHONE_HANGUP]。":"可以再聊几句或自然告别；不要长篇聊天。"}`:""}\n这是 Phone App 中独立的一通电话。继续回应最近的通话台词，不要把通话当作 Chat 新消息。如果你想主动结束，可以在最后输出 [PHONE_HANGUP]。`,
  }));
  const hangup = raw.includes("[PHONE_HANGUP]") || Boolean(active && active.level>=3);
  const parsed = parseAIResponse(raw.replace(/\[PHONE_HANGUP\]/g, "").trim(), []);
  const textParts = parsed.parts.filter(p => !p.mediaType).flatMap(p => splitCallTranscript(p.content, false));
  const lines: PhoneReplyLine[] = [];
  for (const line of textParts) {
    if (line.kind !== "speech" || !line.text.trim()) continue;
    lines.push({ id: phoneId("phone_line"), ...splitOriginalTranslated(line.text) });
  }
  return { lines, hangup };
}

/** Prepare the caller's actual opening before ringing; never write it into Chat. */
export async function generatePhoneOpening(characterId:string):Promise<PhoneReplyLine>{
 const session=phoneContextSession(characterId);
 const raw=flattenCompletionResult(await generateChatCompletion(session,loadChatMessages(session.id),{
  appId:'phone',appTags:['chat','voice'],callFormatInstruction:`${VOICE_CALL_FORMAT}\n你决定主动拨打这通独立的 Phone 电话。现在准备接通后你要先说的第一句，结合当前人设、关系、联系动机和上下文。只输出一句你自己的自然开场白及对应翻译，不编造用户已经说话，不输出拨号动作、长篇对白或挂断标记。此句将在用户真正接听后才发送。`
 }));
 const parsed=parseAIResponse(raw,[]);for(const part of parsed.parts.filter(p=>!p.mediaType))for(const line of splitCallTranscript(part.content,false))if(line.kind==='speech'&&line.text.trim())return {id:phoneId('phone_opening'),...splitOriginalTranslated(line.text)};
 throw Error('开场白生成失败，请重试');
}
