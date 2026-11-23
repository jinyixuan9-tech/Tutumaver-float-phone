import type { Character } from "./character-types";
import type { ChatSession } from "./chat-storage";
export const CHARACTER_LANGUAGES = { persona: "跟随人设", zh: "中文", ko: "한국어", ja: "日本語", en: "English" } as const;
export type CharacterLanguage = keyof typeof CHARACTER_LANGUAGES;
export function normalizeCharacterLanguage(value: unknown): CharacterLanguage | undefined {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(CHARACTER_LANGUAGES, value) ? value as CharacterLanguage : undefined;
}
export function effectiveCommunicationLanguage(character: Character, session?: Pick<ChatSession, "characterOutputLanguage">): CharacterLanguage {
    return normalizeCharacterLanguage(character.communicationLanguage) ?? normalizeCharacterLanguage(session?.characterOutputLanguage) ?? "persona";
}
export const LANGUAGE_EXCHANGE_RULES = "用户明确指定语言优先；否则按对方实际使用的语言、场景和本人熟练度自然交流，稳定后延续，不无故切回默认语言。能力依人设和语言习惯，复杂内容可简化、询问或改用双方能懂的语言。引用、单个外语词、动作与译文不触发切换，不机械混用语言。";
export function buildCharacterOutputLanguageInstruction(character: Character, session?: Pick<ChatSession, "characterOutputLanguage">, includeGeneralRule = true): string {
    const daily = effectiveCommunicationLanguage(character, session);
    const native = normalizeCharacterLanguage(character.nativeLanguage) || "persona";
    return [
        "【角色语言】仅约束说话原文，界面中文译文不算语言切换。",
        `默认日常语言：${daily === "persona" ? "依人设" : CHARACTER_LANGUAGES[daily]}；母语：${native === "persona" ? "依人设" : CHARACTER_LANGUAGES[native]}。`,
        character.chineseProxyInput !== false
            ? "中文代输入开启：用户未注明语言的中文台词，视为用当前交流语言表达；没有当前语境时用默认日常语言。不要因中文输入切回中文，也不要将此视为用户真实外语能力的证明。"
            : "中文代输入关闭：用户台词按实际原文语言理解；听不懂时可以询问，不自动获得该语言能力。",
        includeGeneralRule ? LANGUAGE_EXCHANGE_RULES : "",
        character.languageUsage?.trim() ? `语言能力与习惯：${character.languageUsage.trim()}` : "",
    ].filter(Boolean).join("\n");
}
