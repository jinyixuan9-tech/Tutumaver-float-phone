"use client";

// 聊天室全屏特效（微信同款）：消息文本包含触发词时播放全屏动画。
// 两类配置，均为全局、所有会话共用，在聊天设置面板中管理：
// - 表情雨规则：触发词 + 自定义表情，用户可增删；
// - 内置全屏特效：礼花/烟花/爱心/炸弹/骰子，固定条目、可开关；只能通过
//   单独发送特效图标触发（表情面板「特效」栏点击直发）。

import { kvGet, kvSet } from "./kv-db";

export type ChatScreenEffectType = "emoji_rain" | "confetti" | "fireworks" | "hearts" | "bomb" | "dice";
export type BuiltinScreenEffectType = Exclude<ChatScreenEffectType, "emoji_rain">;

export type ChatScreenEffectRule = {
    id: string;
    /** 触发词：消息包含即触发；支持逗号/顿号/空格分隔多个 */
    keyword: string;
    /** 表情雨使用的表情（支持多个，如 "🎂🎉"） */
    emojis: string;
    enabled: boolean;
};

export type BuiltinScreenEffectSetting = {
    enabled: boolean;
};

export type ChatScreenEffectMatch = {
    effect: ChatScreenEffectType;
    emojis: string;
};

const RAIN_RULES_KEY = "chat-screen-effect-rules";
const BUILTIN_SETTINGS_KEY = "chat-screen-effect-builtins";
const TOTAL_EFFECTS_KEY = "chat-screen-effects-master-enabled-v1";
export function screenEffectsEnabled(): boolean { try { return kvGet(TOTAL_EFFECTS_KEY) === "true"; } catch { return false; } }
export function setScreenEffectsEnabled(value: boolean): void { kvSet(TOTAL_EFFECTS_KEY, String(value)); notifyRulesUpdated(); }
const MAX_RULES = 50;
const MAX_KEYWORD_LENGTH = 60;
const MAX_EMOJIS_LENGTH = 16;

export const CHAT_SCREEN_EFFECT_RULES_EVENT = "chat-screen-effect-rules-updated";

// 表情雨预置规则（可改可删）。顺序即优先级：更具体的触发词放前面。
const DEFAULT_RAIN_RULES: ChatScreenEffectRule[] = [
    { id: "preset_birthday", keyword: "生日快乐", emojis: "🎂🎉", enabled: true },
    { id: "preset_fortune", keyword: "恭喜发财", emojis: "🧧", enabled: true },
    { id: "preset_kiss", keyword: "么么哒", emojis: "💋", enabled: true },
    { id: "preset_miss", keyword: "想你了", emojis: "🌟", enabled: true },
    { id: "preset_night", keyword: "晚安", emojis: "🌙✨", enabled: true },
];

// 内置全屏特效：图标就是唯一触发方式——单独发一条只含该图标的消息（表情面板
// 「特效」栏点击即发这种消息），夹在文字里不触发
export const BUILTIN_SCREEN_EFFECTS: {
    type: BuiltinScreenEffectType;
    name: string;
    icon: string;
}[] = [
    { type: "fireworks", name: "全屏烟花", icon: "🎆" },
    { type: "hearts", name: "全屏爱心", icon: "💗" },
    { type: "confetti", name: "全屏礼花", icon: "🎊" },
    { type: "bomb", name: "全屏炸弹", icon: "💣" },
    { type: "dice", name: "掷骰子", icon: "🎲" },
];

function notifyRulesUpdated(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(CHAT_SCREEN_EFFECT_RULES_EVENT));
    }
}

function normalizeRainRule(raw: unknown): ChatScreenEffectRule | null {
    if (!raw || typeof raw !== "object") return null;
    const rule = raw as Record<string, unknown>;
    // 兼容首版数据：带 effect 字段的礼花规则并入内置礼花，不再作为表情雨规则保留
    if (rule.effect && rule.effect !== "emoji_rain") return null;
    const keyword = typeof rule.keyword === "string" ? rule.keyword.trim().slice(0, MAX_KEYWORD_LENGTH) : "";
    if (!keyword) return null;
    return {
        id: typeof rule.id === "string" && rule.id ? rule.id : `fx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        keyword,
        emojis: typeof rule.emojis === "string" ? rule.emojis.trim().slice(0, MAX_EMOJIS_LENGTH) : "",
        enabled: rule.enabled !== false,
    };
}

export function loadChatScreenEffectRules(): ChatScreenEffectRule[] {
    try {
        const raw = kvGet(RAIN_RULES_KEY);
        if (!raw) return DEFAULT_RAIN_RULES.map(rule => ({ ...rule }));
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return DEFAULT_RAIN_RULES.map(rule => ({ ...rule }));
        return parsed.map(normalizeRainRule).filter((rule): rule is ChatScreenEffectRule => rule !== null).slice(0, MAX_RULES);
    } catch {
        return DEFAULT_RAIN_RULES.map(rule => ({ ...rule }));
    }
}

export function saveChatScreenEffectRules(rules: ChatScreenEffectRule[]): void {
    kvSet(RAIN_RULES_KEY, JSON.stringify(rules.slice(0, MAX_RULES)));
    notifyRulesUpdated();
}

export function resetChatScreenEffectRules(): ChatScreenEffectRule[] {
    const rules = DEFAULT_RAIN_RULES.map(rule => ({ ...rule }));
    saveChatScreenEffectRules(rules);
    return rules;
}

export function createChatScreenEffectRule(): ChatScreenEffectRule {
    return {
        id: `fx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        keyword: "",
        emojis: "🎉",
        enabled: true,
    };
}

export function loadBuiltinScreenEffectSettings(): Record<BuiltinScreenEffectType, BuiltinScreenEffectSetting> {
    let stored: Record<string, unknown> = {};
    try {
        const raw = kvGet(BUILTIN_SETTINGS_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
    } catch {
        stored = {};
    }
    const result = {} as Record<BuiltinScreenEffectType, BuiltinScreenEffectSetting>;
    for (const effect of BUILTIN_SCREEN_EFFECTS) {
        const entry = stored[effect.type];
        const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
        result[effect.type] = { enabled: record?.enabled !== false };
    }
    return result;
}

export function saveBuiltinScreenEffectSettings(settings: Record<BuiltinScreenEffectType, BuiltinScreenEffectSetting>): void {
    kvSet(BUILTIN_SETTINGS_KEY, JSON.stringify(settings));
    notifyRulesUpdated();
}

export function resetBuiltinScreenEffectSettings(): Record<BuiltinScreenEffectType, BuiltinScreenEffectSetting> {
    const result = {} as Record<BuiltinScreenEffectType, BuiltinScreenEffectSetting>;
    for (const effect of BUILTIN_SCREEN_EFFECTS) {
        result[effect.type] = { enabled: true };
    }
    saveBuiltinScreenEffectSettings(result);
    return result;
}

// ── 掷骰子 ──────────────────────────────────────────────
// 点数掷定后作为「骰子气泡」消息进入聊天记录（气泡翻滚后定格点数），
// 内容文本带结果供角色读取，全屏动效播放同一点数。

export function rollChatDiceFace(): number {
    return 1 + Math.floor(Math.random() * 6);
}

export function formatChatDiceResultMessage(face: number): string {
    return `🎲 掷出了 ${face} 点`;
}

/** 整条消息就是骰子图标（表情面板点出的 🎲）→ 直接转成骰子气泡 */
export function isDiceOnlyMessage(text: string): boolean {
    if (!screenEffectsEnabled()) return false;
    if (text.trim() !== "🎲") return false;
    return loadBuiltinScreenEffectSettings().dice.enabled;
}

/** The master switch controls BOTH render and AI prompt injection. */
export function buildScreenEffectPromptHint(): string {
    if (!screenEffectsEnabled()) return "";
    try {
        const selected = BUILTIN_SCREEN_EFFECTS.filter(effect => loadBuiltinScreenEffectSettings()[effect.type].enabled);
        const enabledRules = loadChatScreenEffectRules().filter(rule => rule.enabled && rule.keyword.trim());
        if (!selected.length && !enabledRules.length) return "";
        const names = selected.map(effect => effect.name + "「" + effect.icon + "」").join("、");
        const dice = selected.some(effect => effect.type === "dice");
        return "\n\n### 聊天室全屏特效\n"
            + (selected.length ? "仅以下已启用的特效可用（单独发送图标触发）："+names+"。图标夹在普通文字中不会触发。\n" : "")
            + (enabledRules.length ? "已启用的表情雨触发词：" + enabledRules.map(rule => rule.keyword).join("、") + "。\n" : "")
            + (dice ? "掷骰点数由系统生成并公布，请以实际结果回应，不要编造。\n" : "");
    } catch { return ""; }
}

function keywordHit(text: string, keyword: string): boolean {
    return keyword
        .split(/[,，、\s]+/)
        .some(word => word && text.includes(word));
}

/** 首个命中的启用规则：表情雨按「包含」匹配；内置全屏特效没有触发词，
 *  只认整条消息恰好是特效图标本身（🎆💗🎊💣🎲），夹在句子里不触发 */
export function matchChatScreenEffectRule(text: string): ChatScreenEffectMatch | null {
    if (!screenEffectsEnabled()) return null;
    if (!text) return null;
    for (const rule of loadChatScreenEffectRules()) {
        if (rule.enabled && keywordHit(text, rule.keyword)) {
            return { effect: "emoji_rain", emojis: rule.emojis };
        }
    }
    const trimmed = text.trim();
    const builtins = loadBuiltinScreenEffectSettings();
    for (const effect of BUILTIN_SCREEN_EFFECTS) {
        if (trimmed === effect.icon && builtins[effect.type].enabled) {
            return { effect: effect.type, emojis: "" };
        }
    }
    return null;
}
