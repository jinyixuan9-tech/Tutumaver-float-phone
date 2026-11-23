import { splitBilingualText, normalizeBilingualTextInput } from './bilingual-text';
export type OfflineTextSegment = { kind: 'text'; text: string } | { kind: 'dialogue'; speaker: string; original: string; translated: string };
export const OFFLINE_USER_SPEAKER = 'user';
/** Only explicit spoken words become audio. Quotes, recollections and narration stay text. */
export function parseOfflineDialogue(input: string): OfflineTextSegment[] {
    const text = normalizeBilingualTextInput(input);
    const expression = /<speech\s+speaker\s*=\s*["']([^"'<>]+)["']\s*>([\s\S]*?)<\/speech\s*>/gi;
    const parts: OfflineTextSegment[] = []; let cursor = 0; let match: RegExpExecArray | null;
    while ((match = expression.exec(text))) {
        if (match.index > cursor) parts.push({ kind: 'text', text: text.slice(cursor, match.index) });
        const pair = splitBilingualText(match[2].replace(/｜/g, '|'));
        const original = pair?.original || match[2];
        if (original.trim()) parts.push({ kind: 'dialogue', speaker: match[1].trim(), original: original.trim(), translated: pair?.translated.trim() || '' });
        cursor = expression.lastIndex;
    }
    if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) });
    return parts;
}
export function offlineTextCount(text: string): number {
    return Array.from(parseOfflineDialogue(text).map(part => part.kind === 'text' ? part.text : part.original).join('').replace(/\s/g, '')).length;
}
export function offlineSpeechInstruction(speakers: {id: string; name: string}[], bilingual = true): string {
    return [
        '【线下实际台词协议：覆盖旧的引号/语音条写法】',
        '仅当角色此刻实际说出口时使用 <speech speaker="角色ID">原文' + (bilingual ? '|对应中文译文' : '') + '</speech>，台词前后空行，与旁白分段。不在台词外加引号。',
        'speaker 只能用以下真实角色ID：' + JSON.stringify(speakers),
        bilingual ? '非中文台词用原文|简体中文译文；中文台词只写中文，无需译文。' : '只写角色原文台词，无需译文。',
        '引号仅用于普通引用、复述、回忆等文本，不自动成为台词；旁白、心理、未说出口的内容绝不能包进 speech。实际开口复述才使用 speech。',
        '不要把用户的输入复刻为新台词；不能替用户说话、行动、选择或写心理。原有 <speech speaker="user"> 是用户实际输入，仅作上下文。',
        '不要输出语音条标签、音频URL或额外语音指令。群聊仍是一个 content 内的连续群像正文，speech 不表示拆分气泡。',
    ].join('\n');
}
