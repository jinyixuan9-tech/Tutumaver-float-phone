import { splitBilingualText } from "./bilingual-text";

export type CallLine = { kind: "speech" | "action"; text: string };

export const VOICE_CALL_FORMAT = [
    "当前是语音通话。只写角色实际说出口的话，不写动作、旁白或画面描述。",
    "【本次通话输出格式】替代预设里‘单段、不分条’的旧通话格式。一次回复可说多句，但每个自然的短句分别输出为一条【台词】原文 | 中文译文，并另起一行。不要把多句与全部译文拼成一个长段。",
    "每条原文与它自己的译文一一对应。一轮可以自然说 2–5 条或更多有必要的短句，简单回应也可以只有一条，不凑条数。严肃讨论可保留必要长句；不要把一句话拆成碎片。",
    "延续历史内容与人设，但不要模仿旧历史的一整段排版。非中文原文附中文翻译，中文原文无需重复翻译。",
].join("\n");

export const VIDEO_CALL_FORMAT = [
    "当前是视频通话。请把动作和说出口的话分开，每段独立输出。",
    "台词以【台词】开头，非中文原文按 原文 | 中文译文 输出。",
    "动作以【动作】开头，只用中文写可见的动作或神态，不附译文；台词里不要混入动作。",
    "按真实通话自然回复，不要求每轮都写动作。不要把这两个标签解释给用户。",
].join("\n");

/** Split tagged call output without mistaking ordinary dialogue for an action. */
export function splitCallTranscript(content: string, allowActions: boolean): CallLine[] {
    const source = content.trim();
    if (!source) return [];
    const marker = /【(台词|语音|动作)】/g;
    const tags = [...source.matchAll(marker)];
    if (!tags.length) {
        const rows = source.split(/\n+/).map(row => row.trim()).filter(Boolean);
        // Split only clearly paired utterances; preserve a raw original/translation paragraph.
        return rows.length > 1 && rows.every(row => !!splitBilingualText(row)) ? rows.map(text => ({ kind: "speech" as const, text })) : [{ kind: "speech", text: source }];
    }
    const lines: CallLine[] = [];
    const leading = source.slice(0, tags[0].index).trim();
    if (leading) lines.push({ kind: "speech", text: leading });
    tags.forEach((tag, index) => {
        const end = index + 1 < tags.length ? tags[index + 1].index : source.length;
        const text = source.slice(tag.index! + tag[0].length, end).trim();
        if (text && (tag[1] !== "动作" || allowActions)) {
            lines.push({ kind: tag[1] === "动作" ? "action" : "speech", text });
        }
    });
    return lines;
}

/** Only the original utterance is sent to speech synthesis. */
export function originalCallSpeech(text: string): string {
    const content = splitCallTranscript(text, false).map(line => line.text).join("\n");
    const bilingual = splitBilingualText(content);
    if (bilingual) return bilingual.original;
    return content.split("\n").map(line => splitBilingualText(line)?.original || line).join("\n");
}

/** A bilingual action belongs in the centered Chinese narration, never in TTS. */
export function displayCallAction(text: string): string {
    return splitBilingualText(text)?.translated || text;
}

/** Hide known speech directions in display only; retain the untouched text for TTS. */
export function displayCallSpeech(text: string): string {
    return text.replace(/\[(?=[^\]\n]{1,80}\])(?:laughs?|chuckles?|sighs?|soft(?:ly)?|warm|gentle|gently|playful|teasing|relaxed|whispers?|whispering|sad|happy|angry|excited|calm|crying|nervous|serious|neutral)(?:[ ,]+(?:laughs?|chuckles?|sighs?|soft(?:ly)?|warm|gentle|gently|playful|teasing|relaxed|whispers?|whispering|sad|happy|angry|excited|calm|crying|nervous|serious|neutral))*\]\s*/gi, "").trim();
}
export function callRetryRange<T extends { id: string }>(messages: T[], id: string): { history: T[]; removed: T[] } | null {
    const index = messages.findIndex(message => message.id === id);
    return index < 0 ? null : { history: messages.slice(0, index), removed: messages.slice(index) };
}
