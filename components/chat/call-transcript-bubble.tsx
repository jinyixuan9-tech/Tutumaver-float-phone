"use client";

import { useEffect, useState } from "react";
import { Square, Volume2, Star } from "lucide-react";
import { displayCallSpeech } from "@/lib/call-transcript";
import { splitBilingualText } from "@/lib/bilingual-text";

export function CallTranscriptBubble({ text, onPlay, playing = false, disabled = false, role, onFavorite }: {
    text: string;
    onFavorite?:()=>void;
    role?: "user" | "assistant";
    onPlay: () => void;
    playing?: boolean;
    disabled?: boolean;
}) {
    const [expanded, setExpanded] = useState(true);
    useEffect(() => setExpanded(true), [text]);
    const display = displayCallSpeech(text);
    const bilingual = role === "user" ? null : splitBilingualText(display);
    const showTranslation = Boolean(bilingual && expanded);

    return <div className="call-speech-row" data-role={role} data-translation={showTranslation ? "expanded" : "collapsed"}>
        <button type="button" className="call-speech-audio" onClick={onPlay} disabled={disabled}
            aria-label={playing ? "停止这段语音" : "播放这段话的原文"} title={playing ? "停止播放" : "播放原文"}>
            {playing ? <Square size={10} fill="currentColor" /> : <Volume2 size={13} />}
        </button>
        <div className="call-speech-bubble">
            <div className="call-speech-original">{bilingual?.original || display}
                {bilingual && <button type="button" className="call-speech-translate" onClick={() => setExpanded(value => !value)}
                    aria-label={expanded ? "收起中文翻译" : "展开中文翻译"} aria-expanded={expanded}>译</button>}
            </div>
            {bilingual && expanded && <div className="call-speech-translation">{bilingual.translated}</div>}
        </div>
        {onFavorite && <button type="button" className="call-speech-audio" aria-label="收藏这句语音" onClick={onFavorite}><Star size={13}/></button>}
    </div>;
}
