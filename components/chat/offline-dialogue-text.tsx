"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { parseOfflineDialogue } from "@/lib/offline-dialogue";
import { resolveUserVoiceConfig, resolveVoiceConfig, synthesizeSpeech, playAudioBlobViaMediaElement } from "@/lib/tts-service";
import { BilingualTextBlock, isStandaloneHtmlPreviewContent } from "./message-bubble";

let stopCurrentOfflineSpeech: (() => void) | null = null;

function Speech({ original, translated, role, characterId, defaultExpanded = false }: { defaultExpanded?: boolean; original: string; translated: string; role: "user" | "assistant"; characterId: string }) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
    const [error, setError] = useState("");
    const audio = useRef<{ abort: () => void } | null>(null);
    const token = useRef(0);
    const cache = useRef<{ key: string; blob: Blob } | null>(null);
    const stop = useRef<(() => void) | null>(null);
    useEffect(() => () => { token.current++; audio.current?.abort(); if (stopCurrentOfflineSpeech === stop.current) stopCurrentOfflineSpeech = null; }, [original, role, characterId]);
    async function play() {
        if (state !== "idle") { token.current++; audio.current?.abort(); setState("idle"); return; }
        const config = role === "user" ? resolveUserVoiceConfig() : resolveVoiceConfig(characterId, "chat");
        if (!config) { setError(role === "user" ? "请先在全局聊天信息中绑定用户音色" : "请先给角色绑定语音配置"); return; }
        stopCurrentOfflineSpeech?.();
        const cancel = () => { token.current++; audio.current?.abort(); audio.current = null; setState("idle"); };
        stop.current = cancel; stopCurrentOfflineSpeech = cancel;
        const current = ++token.current;
        const key = JSON.stringify(config) + original;
        setError(""); setState("loading");
        try {
            const blob = cache.current?.key === key ? cache.current.blob : await synthesizeSpeech(original, config);
            if (current !== token.current) return;
            if (!blob) throw new Error("没有生成音频，请重试");
            cache.current = { key, blob };
            let started = false;
            const player = playAudioBlobViaMediaElement(blob, () => { started = true; if (current === token.current) setState("playing"); });
            audio.current = player;
            await player.promise;
            if (current === token.current && !started) throw new Error("播放未开始，请再次点击播放");
        } catch (e) { if (current === token.current) setError(e instanceof Error ? e.message : "播放失败"); }
        finally { if (current === token.current) { setState("idle"); audio.current = null; if (stopCurrentOfflineSpeech === cancel) stopCurrentOfflineSpeech = null; } }
    }
    return <span className="offline-speech">
        <span className="offline-speech-line">
            <button type="button" className="offline-speech-play" data-playback={state} aria-pressed={state === "playing"} aria-label={state === "idle" ? "播放原文对白" : "停止播放"} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); void play(); }}>{state === "loading" ? <Loader2 size={15} className="animate-spin" /> : <Volume2 size={16} className={state === "playing" ? "offline-speech-playing" : undefined} />}</button>
            <button type="button" className="offline-speech-original" aria-expanded={translated ? expanded : undefined} aria-label={translated ? "展开或收起翻译" : "原文对白"} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); if (translated) setExpanded(!expanded); }}>{original}</button>
        </span>
        {translated && expanded ? <button type="button" className="offline-speech-translation" aria-label="收起翻译" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setExpanded(false); }}>{translated}</button> : null}
        {error ? <span role="alert" className="chat-offline-scenes-error">{error}</span> : null}
    </span>;
}
export function OfflineDialogueText({ text, role, characterId, speakers, defaultExpanded = false }: { text: string; role: "user" | "assistant"; characterId: string; speakers?: Record<string,string>; defaultExpanded?: boolean }) {
    const parts = useMemo(() => parseOfflineDialogue(text), [text]);
    if (!parts.some(part => part.kind === "dialogue") && isStandaloneHtmlPreviewContent(text)) return <BilingualTextBlock text={text} mode="markdown" defaultExpanded={defaultExpanded} htmlFrameVariant="offline" />;
    return <div className="offline-prose">{parts.map((part, index) => {
        if (part.kind === "dialogue") {
            const id = role === 'user' ? (part.speaker === 'user' ? characterId : undefined) : speakers?.[part.speaker];
            return id !== undefined ? <Speech key={`${index}:${part.original}`} {...part} defaultExpanded={defaultExpanded} role={role} characterId={id} /> : <span key={index} className="offline-narration">{part.original}{part.translated ? ` | ${part.translated}` : ''}</span>;
        }
        // Blocks supply their own paragraph spacing. Source newlines at the
        // speech boundary must not become additional empty rendered lines.
        // Preserve intentional line breaks inside each narration block.
        const narration = part.text.replace(/^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/g, "");
        return narration.trim() ? <span key={index} className="offline-narration">{narration}</span> : null;
    })}</div>;
}
