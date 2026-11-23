// 离线推送·回端合并：App 打开/回前台时拉取服务端生成的原始输出，
// 用客户端同一条解析管线（输出正则 → parseAndSaveResponse）落进聊天记录。

import { parseAndSaveResponse, scheduleFollowUp } from "./follow-up-service";
import { applyOutputRegex } from "./llm-prompt-assembler";
import type { RegexConfig } from "./settings-types";
import { stripHallucinatedTimestamps } from "./llm-provider-adapter";
import { MacroEngine } from "./macro-engine";
import { getActiveAppTags } from "./content-tag-utils";
import { loadChatMessages, loadChatSessions } from "./chat-storage";
import { hasAccountPushSubscription } from "./push-client";
import { isPersonalPushCloudActive, personalPushFetch } from "./personal-push-cloud";
import { removeTimedWakeSchedule } from "./timed-wake-storage";

type OutboxEntry = {
    id: string;
    session_id: string | null;
    trigger_key: string | null;
    raw_text: string;
    meta: {
        sessionId?: string;
        followUpIndex?: number;
        prevCount?: number;
        regexes?: RegexConfig[];
        characterName?: string;
        userName?: string;
        appId?: string;
        appTags?: string[];
        followUpCount?: number;
        armAt?: string;
        /** 云端触发快捷动作失败的摘要；成功时不带这个字段 */
        shortcutDeliveryError?: string;
    } | null;
    created_at: string;
};

let consuming = false;
let lastConsumeAt = 0;
let consumerInstalled = false;
let consumeRequestTimer: number | null = null;
const OUTBOX_BATCH_SIZE = 20;
const MAX_OUTBOX_BATCHES_PER_PASS = 10;
const OUTBOX_FOREGROUND_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function getTimedWakeIdFromTriggerKey(triggerKey: string | null): string | null {
    if (!triggerKey?.startsWith("timedwake:")) return null;
    const id = triggerKey.slice("timedwake:".length);
    return id.trim() || null;
}

function clearTimedWakeIfHandled(triggerKey: string | null): void {
    const timedWakeId = getTimedWakeIdFromTriggerKey(triggerKey);
    if (timedWakeId) removeTimedWakeSchedule(timedWakeId);
}

export async function consumeServerOutbox(options?: { silent?: boolean; force?: boolean }): Promise<void> {
    if (typeof window === "undefined") return;
    // 共享回传箱已紧急停用：没有个人 Supabase 时直接结束，不请求 status/outbox。
    if (!isPersonalPushCloudActive()) return;
    if (consuming) return;
    if (options?.force !== true && Date.now() - lastConsumeAt < OUTBOX_FOREGROUND_CHECK_INTERVAL_MS) return;
    // 没有任何设备订阅推送时，服务端不可能产生普通离线回传；避免所有在线用户空轮询。
    if (!(await hasAccountPushSubscription())) return;
    consuming = true;
    lastConsumeAt = Date.now();
    const passStartMs = Date.now();
    try {
        // 共享回传箱已停用，只读取用户自己的 Supabase。
        const sources: Array<"personal" | "shared"> = ["personal"];
        const handledTriggerKeys = new Set<string>();
        for (const source of sources) {
          for (let batch = 0; batch < MAX_OUTBOX_BATCHES_PER_PASS; batch += 1) {
            const response = await (source === "personal"
                ? personalPushFetch("outbox")
                : fetch("/api/push/outbox", { credentials: "include" }))
                .catch(() => null);
            if (!response || !response.ok) break;
            const data = await response.json().catch(() => ({})) as { ok?: boolean; entries?: OutboxEntry[] };
            const entries = data.ok && Array.isArray(data.entries) ? data.entries : [];
            if (entries.length === 0) break;

            const consumedIds: string[] = [];
            for (const entry of entries) {
                try {
                    if (entry.trigger_key && handledTriggerKeys.has(entry.trigger_key)) {
                        consumedIds.push(entry.id);
                        continue;
                    }
                    const meta = entry.meta || {};

                    // Ignore and acknowledge orphaned legacy bridge/screen-chat outbox entries.
                    // Normal Chat offline messages below remain unchanged.
                    if (["bridge", "shortcut_delivery_error"].includes(String((meta as { kind?: string }).kind ?? ""))) {
                        consumedIds.push(entry.id);
                        if (entry.trigger_key) handledTriggerKeys.add(entry.trigger_key);
                        continue;
                    }
                    const sessionId = meta.sessionId || entry.session_id || "";
                    const session = sessionId ? loadChatSessions().find(s => s.id === sessionId) : undefined;
                    if (!session) {
                        console.warn("[PushOutbox] session not found, keep entry pending:", entry.id, sessionId);
                        continue;
                    }

                    const periodCare = (meta as { periodCare?: { characterId?: string; cycleKey?: string } }).periodCare;
                    if (periodCare?.characterId && periodCare.cycleKey) {
                        const { saveMenstrualPeriodCareTrigger } = await import("./menstrual-storage");
                        saveMenstrualPeriodCareTrigger({ characterId: periodCare.characterId, sessionId, cycleKey: periodCare.cycleKey });
                    }

                    const idleMeta = (meta as { idleReconnect?: { ruleId?: string; firedAt?: number } }).idleReconnect;
                    if (idleMeta?.ruleId) {
                        const { markIdleReconnectFired } = await import("./idle-reconnect-storage");
                        markIdleReconnectFired(idleMeta.ruleId, typeof idleMeta.firedAt === "number" ? idleMeta.firedAt : Date.now());
                    }

                    const followUpIndex = typeof meta.followUpIndex === "number" ? meta.followUpIndex : undefined;
                    const existingMessages = loadChatMessages(sessionId);
                    if (followUpIndex && existingMessages.some(m => m.role === "assistant" && m.followUpIndex === followUpIndex)) {
                        clearTimedWakeIfHandled(entry.trigger_key);
                        consumedIds.push(entry.id);
                        if (entry.trigger_key) handledTriggerKeys.add(entry.trigger_key);
                        continue;
                    }

                    const armAtMs = typeof meta.armAt === "string" ? Date.parse(meta.armAt) : NaN;
                    if (Number.isFinite(armAtMs) && existingMessages.some(m => {
                        if (m.role !== "assistant") return false;
                        const createdMs = Date.parse(m.createdAt);
                        return createdMs > armAtMs && createdMs < passStartMs;
                    })) {
                        clearTimedWakeIfHandled(entry.trigger_key);
                        consumedIds.push(entry.id);
                        if (entry.trigger_key) handledTriggerKeys.add(entry.trigger_key);
                        continue;
                    }

                    let text = stripHallucinatedTimestamps(entry.raw_text.trim());
                    const regexes = Array.isArray(meta.regexes) ? meta.regexes : [];
                    if (regexes.length > 0) {
                        const macroEngine = new MacroEngine(meta.characterName ?? "", meta.userName ?? "用户");
                        const activeTags = getActiveAppTags(meta.appId ?? "chat", { appTags: meta.appTags, followUpCount: meta.followUpCount });
                        text = applyOutputRegex(text, regexes, { macroEngine, activeTags });
                    }

                    // 云端执行过的快捷动作标记：在原始位置落一对 tool_call/tool_notice——
                    // 上下文里保留标记原文，UI 显示与小手机内直接调用一致
                    const rawMarker = (meta as { shortcutMarker?: { text?: unknown; insertAt?: unknown; name?: unknown } }).shortcutMarker;
                    const shortcutMarker = rawMarker
                        && typeof rawMarker.text === "string" && rawMarker.text
                        && typeof rawMarker.name === "string" && rawMarker.name
                        ? {
                            text: rawMarker.text,
                            insertAt: typeof rawMarker.insertAt === "number" && Number.isFinite(rawMarker.insertAt)
                                ? rawMarker.insertAt
                                : Number.MAX_SAFE_INTEGER,
                            name: rawMarker.name,
                        }
                        : undefined;
                    const { hasVisible, newCount, stateValues } = await parseAndSaveResponse(
                        text,
                        sessionId,
                        meta.prevCount ?? 0,
                        followUpIndex,
                        existingMessages,
                        { silent: options?.silent !== false, ...(shortcutMarker ? { shortcutMarker } : {}) },
                    );
                    if (hasVisible && newCount < 10) scheduleFollowUp(sessionId, newCount, stateValues);
                    clearTimedWakeIfHandled(entry.trigger_key);
                    consumedIds.push(entry.id);
                    if (entry.trigger_key) handledTriggerKeys.add(entry.trigger_key);
                } catch (err) {
                    console.warn("[PushOutbox] merge failed for entry:", entry.id, err);
                }
            }

            if (consumedIds.length === 0) break;
            const ackInit: RequestInit = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: consumedIds }),
            };
            const ackResponse = await (source === "personal"
                ? personalPushFetch("outbox", ackInit)
                : fetch("/api/push/outbox", { ...ackInit, credentials: "include" }))
                .catch(() => null);
            if (!ackResponse || !ackResponse.ok) break;
            if (entries.length < OUTBOX_BATCH_SIZE) break;
          }
        }
    } finally {
        consuming = false;
    }
}

/** 安装自动消费钩子：启动后拉一次，之后每次回前台再拉。 */
export function installServerOutboxConsumer(): void {
    if (typeof window === "undefined" || consumerInstalled) return;
    consumerInstalled = true;

    // 启动时保留 5 分钟节流；回前台和 SW 明确告知新消息时强制补拉。
    // iOS 会在后台冻结页面，回前台需强制补拉普通 Chat 离线消息。
    const requestConsume = (force = false) => {
        if (consumeRequestTimer !== null) window.clearTimeout(consumeRequestTimer);
        consumeRequestTimer = window.setTimeout(() => {
            consumeRequestTimer = null;
            void consumeServerOutbox({ force });
        }, 150);
    };

    requestConsume(false);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) requestConsume(true);
    });
    navigator.serviceWorker?.addEventListener("message", (event) => {
        if (event.data?.type === "push_outbox_ready") {
            requestConsume(true);
            return;
        }

    });
}
