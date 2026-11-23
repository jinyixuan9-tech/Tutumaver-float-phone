import type { ChatMessage } from "./chat-storage";
export type ActiveGroupCall = {
    id: string;
    type: "voice" | "video";
    participantIds: string[];
};
export type CallDirective = {
    kind: "join";
} | {
    kind: "leave";
} | {
    kind: "text";
    text: string;
};
export type CallOutputPart = {
    kind: "speech";
    text: string;
} | CallDirective;
/** Explicit markers are executable only inside the current call, never inferred from dialogue. */
export function parseCallOutput(text: string): CallOutputPart[] {
    const pattern = /\[通话加入\]|\[通话退出\]|\[群消息[:：]([^\]\n]+)\]/g;
    const parts: CallOutputPart[] = [];
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
        const before = text.slice(offset, match.index).trim();
        if (before)
            parts.push({ kind: "speech", text: before });
        parts.push(match[1] !== undefined ? { kind: "text", text: match[1].trim() }
            : { kind: match[0] === "[通话加入]" ? "join" : "leave" });
        offset = match.index! + match[0].length;
    }
    const rest = text.slice(offset).trim();
    if (rest)
        parts.push({ kind: "speech", text: rest });
    return parts;
}
export const SINGLE_CALL_ACTIONS = "角色可以自然结束本次通话：说完告别台词后，在单独一行输出 [通话退出]。只有确实要挂断时才使用，不要向用户解释标记。";
export function canHearCallMessage(message: ChatMessage, characterId: string): boolean {
    const audience = message.mediaData?.callAudienceIds;
    return !audience || audience.includes(characterId);
}
/** Shared group history never includes private call speech. Each actor gets only their own heard lines. */
export function buildCallKnowledge(history: ChatMessage[], members: {
    id: string;
    name: string;
}[], userName: string): string {
    const privateLines = history.filter(message => message.mediaData?.callAudienceIds);
    if (!privateLines.length)
        return "";
    const views = members.map(member => {
        const heard = privateLines.filter(message => canHearCallMessage(message, member.id)).slice(-60);
        return `${member.name} 实际听到的通话内容：\n${heard.length ? heard.map(message => `${message.role === "user" ? userName : message.senderName || "角色"}：${message.content}`).join("\n") : "未听到任何通话台词"}`;
    });
    return ["【通话知情范围】下面分区仅属于标注的角色，禁止把另一角色听过的内容当成自己的知识。",
        "普通群消息全员可读；通话台词不等于群消息。后加入的人不知道加入前的话，退出后不知道缺席期间的话，重新加入保留自己原先听过的内容。通话摘要和重听入口也不能让未参加者自动知情。",
        ...views].join("\n\n");
}
export function groupCallInstruction(call: ActiveGroupCall, members: {
    id: string;
    name: string;
}[]): string {
    const present = members.filter(member => call.participantIds.includes(member.id)).map(member => member.name);
    const absent = members.filter(member => !call.participantIds.includes(member.id)).map(member => member.name);
    return [
        `当前群${call.type === "video" ? "视频" : "语音"}通话正在进行。已加入：${present.join("、") || "无"}；未加入：${absent.join("、") || "无"}。`,
        "只有已加入的人可以直接说通话台词；无需每个人每轮都发言。未加入的人只能发普通群消息，或先加入再说话。禁止冒用用户、替用户挂断或邀请不存在的成员。",
        "沿用 [角色本名]: 标明每段的发送人。需要加入，在自己的段落输出 [通话加入]；需要退出，在告别台词后输出 [通话退出]；需要往文字群聊发送消息，用独立一行 [群消息:原文 | 中文翻译]。可以不发生这些动作，不要每轮机械加入退出或刷群消息。",
        "新加入的角色只能回应加入后听见的话，不能回应本次输出中加入前其他人的通话内容；退出后不能继续发表通话台词。不要把格式标记写进台词或翻译。",
    ].join("\n");
}
