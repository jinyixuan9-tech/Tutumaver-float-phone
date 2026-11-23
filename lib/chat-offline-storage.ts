import {restoreChatListEntry} from './chat-list-entry';
import { loadChatSessions } from "./chat-storage";
import { formatChatTimestamp } from "./llm-prompt-assembler";
import { kvGet, kvRemove, kvSet, registerDynamicPrefix } from "./kv-db";

const CHAT_OFFLINE_TURNS_PREFIX = "ai_phone_chat_offline_turns:";
registerDynamicPrefix(CHAT_OFFLINE_TURNS_PREFIX);
const CHAT_OFFLINE_SCENES_PREFIX = "ai_phone_chat_offline_scenes:";
registerDynamicPrefix(CHAT_OFFLINE_SCENES_PREFIX);

export type ChatOfflineScene = {
    id: string; sessionId: string; characterId: string; title: string; startedAt: string;
    storyStartedAt?: string; storyEndedAt?: string; status?: "active" | "paused"; pausedAt?: string;
};
export type ChatOfflineArchive = ChatOfflineScene & {
    participantIds?: string[]; endedAt: string; archivedAt?: string; summary: string; memoryId?: string; memoryTarget?: "short_term" | "long_term"; turns: ChatOfflineTurn[];
};
export type ChatOfflineSceneState = { version: 1; active?: ChatOfflineScene; archives: ChatOfflineArchive[] };

export function loadChatOfflineSceneState(sessionId: string): ChatOfflineSceneState | null {
    try {
        const raw = kvGet(CHAT_OFFLINE_SCENES_PREFIX + sessionId);
        if (!raw) return null;
        const value = JSON.parse(raw) as ChatOfflineSceneState;
        if (value.version !== 1 || !Array.isArray(value.archives)) return null;
        return value;
    } catch { return null; }
}

function saveSceneState(sessionId: string, state: ChatOfflineSceneState): void {
    kvSet(CHAT_OFFLINE_SCENES_PREFIX + sessionId, JSON.stringify(state));
}

export function ensureChatOfflineScene(sessionId: string, characterId: string): ChatOfflineScene {
    const state = loadChatOfflineSceneState(sessionId) || { version: 1 as const, archives: [] };
    // Recover a partially completed archive write without replaying its turns as a new meeting.
    const archivedIds = new Set(state.archives.flatMap(archive => archive.turns.map(turn => turn.id)));
    const stored = loadChatOfflineTurns(sessionId);
    const pending = stored.filter(turn => !archivedIds.has(turn.id));
    if (pending.length !== stored.length) saveChatOfflineTurns(sessionId, pending);
    if (state.active) return state.active;
    const active: ChatOfflineScene = { id: createTurnId().replace("offline_", "offline_scene_"), sessionId, characterId,
        title: "", status: "active", startedAt: pending[0]?.createdAt || new Date().toISOString() };
    saveSceneState(sessionId, { ...state, active });
    return active;
}

export const OFFLINE_SCENE_UPDATED = "chat-offline-scene-updated";
export function updateChatOfflineScene(sessionId: string, patch: Partial<Pick<ChatOfflineScene, "storyStartedAt" | "storyEndedAt" | "status" | "title">>): void {
    const state = loadChatOfflineSceneState(sessionId);
    if (!state?.active) return;
    const active = { ...state.active, ...patch };
    if (patch.status === "paused") active.pausedAt = new Date().toISOString();
    else if (patch.status === "active") delete active.pausedAt;
    saveSceneState(sessionId, { ...state, active });
    if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_SCENE_UPDATED));
}
export function updateChatOfflineArchive(sessionId: string, archive: ChatOfflineArchive): void {
    const state = loadChatOfflineSceneState(sessionId);
    if (!state) throw new Error("归档不存在。");
    saveSceneState(sessionId, { ...state, archives: state.archives.map(item => item.id === archive.id ? archive : item) });
    notifyOfflineMemorySources();
}

/** Delete this archive only; confirmed long-term memory and the active scene are independent. */
export function deleteChatOfflineArchive(sessionId: string, archiveId: string): void {
    const state = loadChatOfflineSceneState(sessionId);
    if (!state) return;
    saveSceneState(sessionId, { ...state, archives: state.archives.filter(item => item.id !== archiveId) });
    notifyOfflineMemorySources();
    if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_SCENE_UPDATED));
}

export function assertChatOfflineSceneUnchanged(sessionId: string, sceneId: string, expectedTurns: string): ChatOfflineScene {
    const active = loadChatOfflineSceneState(sessionId)?.active;
    if (!active || active.id !== sceneId || JSON.stringify(loadChatOfflineTurns(sessionId)) !== expectedTurns)
        throw new Error("本次线下记录已变化，请重新生成摘要，原文仍然保留。");
    return active;
}

function notifyOfflineMemorySources() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("memory-sources-updated"));
}

export function archiveChatOfflineScene(archive: ChatOfflineArchive, expectedTurns: string): void {
    const state = loadChatOfflineSceneState(archive.sessionId);
    // Deterministic archive/memory IDs make save retries idempotent.
    if (state?.archives.some(item => item.id === archive.id)) return;
    assertChatOfflineSceneUnchanged(archive.sessionId, archive.id, expectedTurns);
    saveSceneState(archive.sessionId, { version: 1, archives: [...(state?.archives || []), archive] });
    const archivedIds = new Set(archive.turns.map(turn => turn.id));
    saveChatOfflineTurns(archive.sessionId, loadChatOfflineTurns(archive.sessionId).filter(turn => !archivedIds.has(turn.id)));
    notifyOfflineMemorySources();
}


export type ChatOfflineImage = { id?: string; prompt: string; ref?: string; usage: "decoration" | "scene" | "interactive"; recognition?:"direct"|"manual"; description?:string; futureOnly?:boolean; targetRole?:"user"|"assistant" };

export type ChatOfflineTurn = {
    userImage?: ChatOfflineImage;
    assistantImage?: ChatOfflineImage;
    id: string;
    sessionId: string;
    userContent: string;
    assistantContent: string;
    summary: string;
    summaryTag: string;
    rawText?: string;
    reasoningText?: string; // 模型思维链（reasoning/CoT）内容
    thinkingText?: string; // 预设格式 <thinking> 标签解析出的思维链（展示优先于 reasoningText）
    thinkingTag?: string; // 实际用于提取思维链的标签名（preset.thinking_tag 或默认 thinking）
    createdAt: string;
};

export type ChatOfflineProjectionEntry = {
    id: string;
    sessionId: string;
    groupSessionId?: string;
    timestamp: string;
    recordedAt?: string;
    occurredTo?: string;
    content: string;
};

export type ParsedOfflineResponse = {
    rawText: string;
    content: string;
    summary: string;
    summaryTag: string;
    thinking?: string; // 预设格式 <thinking> 标签内容（与模型 API 原生 reasoning 无关）
    thinkingTag?: string; // 实际用于提取思维链的标签名
};

function storageKey(sessionId: string): string {
    return `${CHAT_OFFLINE_TURNS_PREFIX}${sessionId}`;
}

function createTurnId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeOfflineImage(value: unknown): ChatOfflineImage | undefined {
    if (!value || typeof value !== "object") return undefined;
    const item = value as Partial<ChatOfflineImage>;
    if (typeof item.prompt !== "string" || item.prompt.length > 16000) return undefined;
    return {recognition:item.recognition==="manual"?"manual":"direct",description:typeof item.description==="string"?item.description.slice(0,16000):undefined,futureOnly:item.futureOnly===true,targetRole:item.targetRole==="assistant"?"assistant":"user",id:typeof item.id === "string"?item.id:undefined, prompt:item.prompt, ref:typeof item.ref === "string"?item.ref:undefined, usage: item.usage === "scene" || item.usage === "interactive" ? item.usage : "decoration"};
}

function normalizeTurn(value: unknown): ChatOfflineTurn | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Partial<ChatOfflineTurn>;
    if (typeof item.id !== "string" || typeof item.sessionId !== "string") return null;
    if (typeof item.userContent !== "string" || typeof item.assistantContent !== "string") return null;
    if (typeof item.createdAt !== "string") return null;
    return {
        id: item.id,
        sessionId: item.sessionId,
        userContent: item.userContent,
        assistantContent: item.assistantContent,
        summary: typeof item.summary === "string" ? item.summary : "",
        summaryTag: typeof item.summaryTag === "string" && item.summaryTag.trim() ? item.summaryTag.trim() : "summary",
        rawText: typeof item.rawText === "string" ? item.rawText : undefined,
        reasoningText: typeof item.reasoningText === "string" ? item.reasoningText : undefined,
        thinkingText: typeof item.thinkingText === "string" ? item.thinkingText : undefined,
        thinkingTag: typeof item.thinkingTag === "string" ? item.thinkingTag : undefined,
        userImage: normalizeOfflineImage(item.userImage),
        assistantImage: normalizeOfflineImage(item.assistantImage),
        createdAt: item.createdAt,
    };
}

export function loadChatOfflineTurns(sessionId: string): ChatOfflineTurn[] {
    try {
        const raw = kvGet(storageKey(sessionId));
        const parsed = raw ? JSON.parse(raw) as unknown : [];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(normalizeTurn)
            .filter((turn): turn is ChatOfflineTurn => Boolean(turn))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
        return [];
    }
}

export function saveChatOfflineTurns(sessionId: string, turns: ChatOfflineTurn[]): void {
    const normalized = turns
        .map(normalizeTurn)
        .filter((turn): turn is ChatOfflineTurn => Boolean(turn))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    kvSet(storageKey(sessionId), JSON.stringify(normalized));
}

export function clearChatOfflineTurns(sessionId: string): void {
    kvRemove(storageKey(sessionId));
    kvRemove(CHAT_OFFLINE_SCENES_PREFIX + sessionId);
}

export function appendChatOfflineTurn(input: {
    sessionId: string;
    userContent: string;
    assistantContent: string;
    summary: string;
    summaryTag: string;
    rawText?: string;
    reasoningText?: string;
    thinkingText?: string;
    thinkingTag?: string;
    userImage?: ChatOfflineImage;
    assistantImage?: ChatOfflineImage;
}): ChatOfflineTurn {
    const turn: ChatOfflineTurn = {
        id: createTurnId(),
        sessionId: input.sessionId,
        userContent: input.userContent,
        assistantContent: input.assistantContent,
        summary: input.summary,
        summaryTag: input.summaryTag.trim() || "summary",
        rawText: input.rawText,
        reasoningText: input.reasoningText,
        thinkingText: input.thinkingText,
        thinkingTag: input.thinkingTag,
        userImage: input.userImage,
        assistantImage: input.assistantImage,
        createdAt: new Date().toISOString(),
    };
    saveChatOfflineTurns(input.sessionId, [...loadChatOfflineTurns(input.sessionId), turn]);
    if(input.userContent.trim()) restoreChatListEntry(input.sessionId);
    return turn;
}

export function updateChatOfflineTurn(
    sessionId: string,
    turnId: string,
    patch: Partial<Pick<ChatOfflineTurn, "userContent" | "assistantContent" | "summary" | "summaryTag" | "rawText" | "reasoningText" | "thinkingText" | "thinkingTag" | "userImage" | "assistantImage">>,
): ChatOfflineTurn | null {
    let updated: ChatOfflineTurn | null = null;
    const turns = loadChatOfflineTurns(sessionId).map((turn) => {
        if (turn.id !== turnId) return turn;
        updated = {
            ...turn,
            ...patch,
            summaryTag: patch.summaryTag?.trim() || turn.summaryTag || "summary",
        };
        return updated;
    });
    if (updated) saveChatOfflineTurns(sessionId, turns);
    return updated;
}

export function deleteChatOfflineTurn(sessionId: string, turnId: string): ChatOfflineTurn[] {
    const next = loadChatOfflineTurns(sessionId).filter((turn) => turn.id !== turnId);
    saveChatOfflineTurns(sessionId, next);
    return next;
}

export function deleteChatOfflineTurnsFrom(sessionId: string, turnId: string): ChatOfflineTurn[] {
    const turns = loadChatOfflineTurns(sessionId);
    const idx = turns.findIndex((turn) => turn.id === turnId);
    if (idx < 0) return turns;
    const next = turns.slice(0, idx);
    saveChatOfflineTurns(sessionId, next);
    return next;
}

function compactProjectionText(text: string, maxLen: number): string {
    const plain = text
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/[#>*_`-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!plain) return "";
    return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
}

export function loadChatOfflineProjectionEntries(
    characterId: string,
    options?: { afterTimestamp?: string; excludeSessionId?: string; summaryWatermark?: boolean },
): ChatOfflineProjectionEntry[] {
    const sessions = loadChatSessions().filter((session) => {
        if (session.isGroup) return session.participantIds?.includes(characterId);
        return session.contactId === characterId;
    });

    const entries: ChatOfflineProjectionEntry[] = [];
    for (const session of sessions) {
        const managed = loadChatOfflineSceneState(session.id);
        if (managed) {
            // Old archives were already committed directly to long-term memory.
            // Only new short-term archives project a scene summary, never raw turns.
            for (const archive of managed.archives) {
                if (archive.memoryTarget !== "short_term") continue;
                if (session.isGroup && !archive.participantIds?.includes(characterId)) continue;
                const start = archive.storyStartedAt || archive.startedAt;
                const timestamp = new Date(start).toISOString();
                const recordedAt = archive.archivedAt || archive.endedAt;
                const filterTime = options?.summaryWatermark ? recordedAt : timestamp;
                if (options?.afterTimestamp && filterTime <= options.afterTimestamp) continue;
                const occurredTo = archive.storyEndedAt ? new Date(archive.storyEndedAt).toISOString() : undefined;
                const label = `${formatChatTimestamp(timestamp)}${occurredTo ? ` — ${formatChatTimestamp(occurredTo)}` : "（结束时间未指定）"}`;
                entries.push({ id: `chat_offline_archive_${archive.id}`, sessionId: session.id,
                    ...(session.isGroup ? {groupSessionId: session.id} : {}),
                    timestamp, recordedAt, occurredTo,
                    content: `【线下归档：${archive.title}｜故事时间：${label}】\n${archive.summary}` });
            }
            continue;
        }
        if (session.id === options?.excludeSessionId) continue;
        for (const turn of loadChatOfflineTurns(session.id)) {
            if (options?.afterTimestamp && turn.createdAt <= options.afterTimestamp) continue;
            const summaryText = compactProjectionText(turn.summary, 500);
            if (!summaryText) continue;
            const ts = formatChatTimestamp(turn.createdAt);
            entries.push({
                id: `chat_offline_projection_${turn.id}`,
                sessionId: session.id,
                ...(session.isGroup ? { groupSessionId: session.id } : {}),
                timestamp: turn.createdAt,
                content: `[事件 ${ts}] ${summaryText}`,
            });
        }
    }

    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function escapeTagName(tag: string): string {
    return tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractXmlField(rawText: string, tags: string[]): string {
    const candidates = tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .filter((tag, index, list) => list.indexOf(tag) === index);
    for (const tag of candidates) {
        const escaped = escapeTagName(tag);
        const match = rawText.match(new RegExp(`<${escaped}>([\\s\\S]*?)</${escaped}>`, "i"));
        const content = match?.[1]?.trim();
        if (content) return content;
    }
    return "";
}

function stripXmlField(rawText: string, tag: string): string {
    if (!tag.trim()) return rawText;
    const escaped = escapeTagName(tag.trim());
    return rawText.replace(new RegExp(`<${escaped}>[\\s\\S]*?</${escaped}>`, "gi"), "").trim();
}

/** 从原始输出中提取指定标签包裹的思维链（仅当预设开启标签解析时调用）。
 *  默认标签 thinking 时兼容 thought / think（DeepSeek R1 系模型输出 <think>）。 */
export function extractThinkingTag(rawText: string, tag?: string): string {
    const effective = (tag || "thinking").trim() || "thinking";
    const tags = effective === "thinking" ? ["thinking", "thought", "think"] : [effective];
    return extractXmlField(rawText.trim(), tags).trim();
}

export function parseOfflineResponse(rawText: string, summaryTag: string): ParsedOfflineResponse {
    const trimmed = rawText.trim();
    const effectiveSummaryTag = summaryTag.trim() || "summary";
    const summary = extractXmlField(trimmed, [effectiveSummaryTag, "summary"]);
    let content = extractXmlField(trimmed, ["content"]);
    if (!content) {
        // 无 <content> 标签时回退到剥掉摘要标签后的全文
        content = stripXmlField(stripXmlField(trimmed, effectiveSummaryTag), "summary");
    }
    return {
        rawText: trimmed,
        content: content.trim(),
        summary: summary.trim(),
        summaryTag: effectiveSummaryTag,
    };
}

// ── 聊天列表用：最后一条线下记录 ─────────────────────────────
// 聊天列表在每次渲染时都会逐会话读取，这里按原始 JSON 串缓存解析结果，
// 避免把整段线下记录反复 parse。
const lastTurnCache = new Map<string, { raw: string; turn: ChatOfflineTurn | null }>();

export function getLastChatOfflineTurn(sessionId: string): ChatOfflineTurn | null {
    let raw = "";
    try {
        raw = kvGet(storageKey(sessionId)) || "";
    } catch {
        return null;
    }
    const cached = lastTurnCache.get(sessionId);
    if (cached && cached.raw === raw) return cached.turn;
    const turns = raw ? loadChatOfflineTurns(sessionId) : [];
    const turn = turns.length ? turns[turns.length - 1] : null;
    lastTurnCache.set(sessionId, { raw, turn });
    return turn;
}

// 线下记录没有普通消息那样的 preview 字段，这里从摘要/正文里压一条出来，
// 并带上「线下」标记，方便在列表里跟线上消息区分。
export function getChatOfflineTurnPreview(turn: ChatOfflineTurn | null): string {
    if (!turn) return "";
    const source = turn.summary.trim() || turn.assistantContent.trim() || turn.userContent.trim();
    const text = compactProjectionText(source, 60);
    return text ? `[线下] ${text}` : "";
}

/** Draft images survive leaving the chat and failed generations. */
export function loadOfflineImageDraft(sessionId:string):ChatOfflineImage|null {try{return normalizeOfflineImage(JSON.parse(kvGet('ai_phone_chat_offline_image_draft:'+sessionId)||'null'))||null;}catch{return null;}}
export function saveOfflineImageDraft(sessionId:string,image:ChatOfflineImage|null){kvSet('ai_phone_chat_offline_image_draft:'+sessionId,JSON.stringify(image));}

registerDynamicPrefix("ai_phone_chat_offline_image_draft:");
