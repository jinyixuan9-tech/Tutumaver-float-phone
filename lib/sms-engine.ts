import { buildCharacterOutputLanguageInstruction } from "./character-language";
import { loadCharacters } from "./character-storage";
import { sendLLMRequest } from "./chat-engine";
import { assemblePromptPayload, type LLMMessage } from "./llm-prompt-assembler";
import { loadApiConfigs, loadBindingConfig, loadPresets, loadRegexes, loadWorldBooks, resolveBinding, resolveUserIdentity } from "./settings-storage";
import type { ChatMessage } from "./chat-storage";

import { buildCharacterTimeContext } from "./character-time";
import type { RegexConfig, WorldBookConfig } from "./settings-types";
import type { SmsState, SmsThread } from "./sms-storage";
import { prepareCharacterMemory } from "./character-memory-context";
import { chatStatus } from "./sms-continuity";

import { CONTACT_MOTIVE_RULES, communicationBusy, loadCommunicationPolicy, queueBusySms, clearBusySms, loadContactRuntime, saveContactRuntime } from "./communication-policy";
import { chooseBusyResumeAt } from "./chat-busy-hold";

const compact = (text: string, n = 130) => text.replace(/\s+/g, " ").trim().slice(0, n);

export async function generateSmsReply(thread: SmsThread, state: SmsState, mode: "reply" | "proactive" | "summon" | "regenerate" = "reply", single = false, plannedSms = false): Promise<{ deferred?: boolean; messages: { original: string; translated: string }[]; awareness?: SmsThread["awareness"]; suspicion?: string; block?: boolean; summary?: string; channel?: "sms" | "request" | "wait" | "call"; requestMessage?: string; reactions?: { messageId: string; emoji: string }[] }> {
  const character = loadCharacters().find(c => c.id === thread.characterId);
  if (!character) throw new Error("角色已不存在");
  const active=mode!=="regenerate"?communicationBusy("sms",thread.characterId):null;
  const anchor=state.messages.filter(m=>m.threadId===thread.id&&m.direction==="outgoing").at(-1)?.id;
  if(active&&(active.level>=3||active.level===2&&loadContactRuntime().smsBriefEvents[thread.id]===active.item.id)){queueBusySms(thread.id,chooseBusyResumeAt(active),anchor);return {messages:[],channel:"wait",deferred:true};}
  const slot = resolveBinding(loadBindingConfig(), character.id, "sms");
  const api = loadApiConfigs().find(x => x.id === slot.apiConfigId) ?? loadApiConfigs()[0];
  if (!api) throw new Error("请先配置文字 API");
  const presets = loadPresets();
  const preset = presets.find(x => x.id === slot.presetId) ?? presets.find(x => x.builtIn) ?? null;
  const worldBooks = (slot.worldBookIds ?? []).map(id => loadWorldBooks().find(x => x.id === id)).filter(Boolean) as WorldBookConfig[];
  const regexes = (slot.regexIds ?? []).map(id => loadRegexes().find(x => x.id === id)).filter(Boolean) as RegexConfig[];
  const recent = state.messages.filter(m => m.threadId === thread.id && m.delivered);
  const real = thread.identityId === "real";
  const chat = real && mode !== "regenerate" ? chatStatus(character.id) : null;
  const lastText = state.messages.filter(m => m.threadId === thread.id && m.delivered).at(-1)?.original ?? "";
  const beforeTimestamp = mode === "regenerate" && recent.length ? new Date(Math.max(...recent.map(m => m.createdAt))).toISOString() : undefined;
  const cognition = await prepareCharacterMemory(character.id, "sms", lastText || character.name, {
    excludeSmsThreadId: thread.id, beforeTimestamp,
    history: recent.map((m): ChatMessage => ({ id: m.id, sessionId: thread.id,
      role: m.direction === "outgoing" ? "user" : "assistant", status: "sent",
      content: `${m.direction === "outgoing" ? `来信[${m.id}]` : "我"}：${m.original}`, createdAt: new Date(m.createdAt).toISOString() })),
  });
  const prompt = assemblePromptPayload({ ...cognition, character, userIdentity: real ? resolveUserIdentity(character.id,"sms") : null, history: cognition.truncatedHistory, preset, worldBooks, regexes, appId: "sms", appTags: ["sms"], timeContext: buildCharacterTimeContext(character.timeZone) });
  const knowledge = real ? `这是用户已知的真实号码。用户称呼：${resolveUserIdentity(character.id, "chat")?.name ?? "用户"}。${chat ? `Chat 当前${chat.blocked ? "被用户拉黑，Chat 发信会被拒收" : "可以联系"}。好友申请：${chat.requests.join("；") || "无"}。` : "重写仅依据当时记录，不使用今日联系状态。"}` : `这是陌生来信号码 ${thread.number}。系统可能知道实际操作者，但你不知道；不要从系统的人设、用户身份、共享记忆或数据库推断它必然属于用户。你目前的判断：${thread.awareness === "suspected" ? `怀疑是用户，但未确认；依据：${compact(thread.suspicion || "近期措辞", 80)}` : thread.awareness === "confirmed" ? "你已有充分依据确认是用户" : "身份未知"}。只有短信内容与已知的事实可作为身份线索。可以怀疑、要求验证、误判或拒绝回答。`;
  const instruction: LLMMessage = { role: "system", content: [
    "你正在封闭的虚构手机世界里收发普通 SMS，不接触现实电话网络。请按人设自由决定回应、沉默、继续试探或屏蔽这个具体来信号码。",
    knowledge,
    "记忆是你本人知道的事，不是当前号码的身份凭证。陌生号码不能读取或继承用户的私聊关系；不能把你记得的用户秘密向这个号码披露。疑似仍不等于确认。你自己认出号码前，不得利用后台身份关联。",
    buildCharacterOutputLanguageInstruction(character),
    CONTACT_MOTIVE_RULES,
    plannedSms?"本轮跨渠道判断已经选择了短信。只可输出sms或wait，不能再切换电话或好友申请；不想发可等待。":"",
    active&&active.level===2?`角色当前正在${active.item.title}。可以短暂回几句后离开，也可以先不回；是否说明离开由人设和语境决定，禁止统一的自动回复套话。`:"",
    `你的短信号码：${thread.characterNumber || "未填写"}。当前来信号码：${thread.number || "未填写"}。`,
    `本号码角色已知的简要关系摘要：${compact(thread.summary || "暂无", 350)}。本号码的实际短信见短期记忆中的当前会话。`,
    "在 SMS 里说‘给我打电话’指小手机 Phone App 的模拟通话，不是现实电话网络，也不是 Chat 语音通话。已知真实号码的来信号码就是可拨打的号码，不必再从通讯录寻找。用户提出通话时，可以结合关系和当下情境选择 channel=call，也可以自然说明现在不方便；不得以无法拨打现实电话或没有另存通讯录为由拒绝。只有当前号码是用户已知的真实号码、号码非空时，才可选择 channel=call；陌生或虚拟号码不能借系统隐藏的身份信息改拨用户真实号码。选择 call 后不要同时发短信。",
    mode === "proactive" ? (thread.blockedByMe ? "用户已拉黑这条短信，不能再发短信或好友申请；可以在已知真实号码上选择打 Phone 电话，或等待。不要假装发出了被拦截的短信。" : "这是一次可选的主动联系机会。若 Chat 被拉黑，可在短信、重新发 Chat 好友申请、Phone 电话、等待之间选择一个；已有待处理申请时不要重复申请。不要同一轮跨两处同时联系。") : mode === "summon" ? "用户点击了召唤回复。通常请发至少一条 SMS；若决定拨打 Phone 电话，选择 call 即可，不必再发短信。可以依据刚连发的来信回应；如果没有新来信，就按人设、记忆和最近 Chat 自己开启一个话题。" : mode === "regenerate" ? `你正在重写此前${single ? "单条" : "这一轮"}自己的短信回复，仅依据截断到当时的会话上下文，不要选择 call。${single ? "只输出一条短信。" : "可输出一至三条短信。"}` : "仅回应当前来信；可以分成 1 到 3 条短信，或选择 Phone 电话。",
    "只输出 JSON：{\"send\":true/false,\"channel\":\"sms/request/wait/call\",\"requestMessage\":\"申请附言，选择 request 时填写\",\"messages\":[{\"original\":\"角色语言原文\",\"translated\":\"忠实简体中文译文\"}],\"reactions\":[{\"messageId\":\"刚刚收到的来信ID\",\"emoji\":\"单个表情\"}],\"awareness\":\"unknown/suspected/confirmed\",\"suspicion\":\"角色可解释的线索\",\"block\":false,\"summary\":\"仅基于自己已知事实的短信关系摘要，200字以内\"}。reactions 可省略，偶尔只对真实收到的用户短信贴一个合适表情，不要次次贴。identity 的确认必须有真实可见的充分证据；不可仅因发送者实际是用户而确认。不要在短信里写动作或系统事实。",
  ].join("\n") };
  const task = mode === "reply" ? "收到短信后决定是否回应；若用户要求通话，可选择小手机 Phone 来电。" : mode === "proactive" ? thread.blockedByMe ? "短信已被用户拉黑。结合关系和时间，自行决定是否通过小手机 Phone 给用户已知真实号码打电话，或等待。" : "现在是否想通过短信、Chat 好友申请或小手机 Phone 联系用户？" : mode === "regenerate" ? "重写刚才这次短信回复。" : "用户按下召唤键，请考虑现在回复或者主动开启一个话题。";
  const raw = await sendLLMRequest(api, preset, [...prompt, instruction, { role: "user", content: task }], regexes, { characterName: character.name, userName: real ? resolveUserIdentity(character.id, "chat")?.name : "陌生号码" }, { appId: "sms", appTags: ["sms"], skipOutputRegex: true, skipWorldline: mode === "regenerate" });
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("短信回复格式无效，可重试");
  const data = JSON.parse(match[0]) as Record<string, unknown>;
  const channel = ["sms", "request", "wait", "call"].includes(String(data.channel)) ? data.channel as "sms" | "request" | "wait" | "call" : undefined;
  const allowCall=loadCommunicationPolicy().phone.proactiveCharacterIds.includes(character.id)||/打.{0,3}电话|来电|通话/.test(lastText);
  const validCall = !plannedSms && channel === "call" && mode !== "regenerate" && real && !!state.realNumber.trim() && allowCall;
  const messages = validCall || channel === "wait" || channel === "request" || data.send === false ? [] : (Array.isArray(data.messages) ? data.messages : []).slice(0, single ? 1 : 3).map((x: unknown) => { const row = x as Record<string, unknown>; return { original: String(row?.original ?? "").trim().slice(0, 800), translated: String(row?.translated ?? "").trim().slice(0, 800) }; }).filter(x => x.original);
  const validTargets = new Set(recent.filter(m => m.direction === "outgoing").map(m => m.id));
  const reactions = (Array.isArray(data.reactions) ? data.reactions : []).slice(0, 2).map((value: unknown) => value as Record<string, unknown>).filter(row => validTargets.has(String(row?.messageId)) && typeof row?.emoji === "string" && row.emoji.length < 16).map(row => ({ messageId: String(row.messageId), emoji: String(row.emoji) }));
  const awareness = ["unknown", "suspected", "confirmed"].includes(String(data.awareness)) ? data.awareness as SmsThread["awareness"] : undefined;
  if(active?.level===2&&messages.length){const runtime=loadContactRuntime();runtime.smsBriefEvents[thread.id]=active.item.id;saveContactRuntime(runtime);}
  const deferred=Boolean(active&&active.level>1&&!messages.length&&!validCall);
  if(deferred)queueBusySms(thread.id,chooseBusyResumeAt(active!),anchor);else clearBusySms(thread.id,anchor);
  return { deferred, messages, reactions, awareness, suspicion: typeof data.suspicion === "string" ? data.suspicion.slice(0, 120) : undefined, block: data.block === true, summary: typeof data.summary === "string" ? data.summary.slice(0, 400) : undefined, channel: validCall ? "call" : channel === "call" ? "wait" : channel, requestMessage: typeof data.requestMessage === "string" ? data.requestMessage.trim().slice(0, 160) : undefined };
}
