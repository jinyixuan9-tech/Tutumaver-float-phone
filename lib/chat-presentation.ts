/** Display-only helpers shared by native Chat, CSS hooks and screenshots. */
export function isSingleEmoji(text: string): boolean {
    const value = text.trim();
    if (!value) return false;
    return /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?)*)$/u.test(value);
}
export function voiceBubbleWidth(seconds: number): number {
    return Math.min(220, 96 + Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 2);
}
export function cssGeneratedText(value: string, attribute: (name: string) => string | null): string {
    if (!value || value === 'none' || value === 'normal') return '';
    const chunks: string[] = [];
    const tokens = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|attr\(\s*([\w-]+)\s*\)/g;
    for (const match of value.matchAll(tokens)) chunks.push(match[3] ? attribute(match[3]) || '' : (match[1] ?? match[2] ?? '').replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_m, hex, char) => hex ? String.fromCodePoint(parseInt(hex, 16)) : char));
    return chunks.join('');
}
