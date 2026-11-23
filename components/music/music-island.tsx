"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useMusicPlayerOptional } from "@/lib/music-context";
import { getMusicControlBridge } from "@/lib/music-control-bridge";
import { useListenSessions } from "@/lib/together-listening";

function clock(seconds: number): string {
    const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
const SEEK_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];

export default function MusicIsland({ onOpen }: { onOpen: () => void }) {
    const player = useMusicPlayerOptional();
    const together = useListenSessions().some(s => !s.endedAt);
    const [expanded, setExpanded] = useState(false);
    const [volumeOpen, setVolumeOpen] = useState(false);
    const [draft, setDraft] = useState<number | null>(null);
    const draftRef = useRef<number | null>(null);
    const gestureTrack = useRef<string | null>(null);
    const root = useRef<HTMLDivElement>(null);
    const track = player?.currentTrack;
    const activeTrack = useRef(track?.id);
    activeTrack.current = track?.id;

    const cancelSeek = () => { draftRef.current = null; gestureTrack.current = null; setDraft(null); };
    useEffect(() => {
        cancelSeek();
        setVolumeOpen(false);
        if (!track) setExpanded(false);
    }, [track?.id]);
    useEffect(() => {
        if (!expanded) { cancelSeek(); setVolumeOpen(false); return; }
        const outside = (event: PointerEvent) => {
            if (root.current && !root.current.contains(event.target as Node)) setExpanded(false);
        };
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("keydown", escape);
        return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape); };
    }, [expanded]);

    if (!player || !track) return <span className="status-island" aria-label="灵动岛" />;
    const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration
        : Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0;
    const position = Math.max(0, Math.min(duration || 0, draft ?? (Number.isFinite(player.currentTime) ? player.currentTime : 0)));
    const percent = duration > 0 ? position / duration * 100 : 0;
    const remaining = Math.max(0, duration - position);
    const commitSeek = () => {
        const value = draftRef.current;
        const targetTrack = gestureTrack.current;
        const bridge = getMusicControlBridge();
        // The player may have changed tracks before this React view has rerendered.
        const actualTrack = bridge ? bridge.getState().currentTrack?.id : activeTrack.current;
        if (value != null && duration > 0 && targetTrack === activeTrack.current && targetTrack === actualTrack) {
            player.seek(Math.max(0, Math.min(value, duration)));
        }
        cancelSeek();
    };
    const wave = <span className={`music-island-eq${player.isPlaying ? "" : " paused"}`} aria-hidden="true"><i/><i/><i/><i/><i/></span>;

    return <div ref={root} className={`status-island music-island music-island-player${expanded ? " music-island-expanded" : ""}`}>
        {!expanded ? <button className="music-island-compact" onClick={() => setExpanded(true)} aria-label="展开音乐播放控制" aria-expanded={false}>
            {track.coverUrl ? <img src={track.coverUrl} alt="" /> : <span className="music-island-art-empty">♫</span>}
            <span className="music-island-compact-name">{together ? "一起听 · " : ""}{track.title}</span>
            {wave}
        </button> : <section className="music-island-detail" aria-label="音乐播放控制">
            <div className="music-island-head">
                <button className="music-island-art" onClick={onOpen} aria-label="打开音乐播放器">{track.coverUrl ? <img src={track.coverUrl} alt="专辑封面" /> : "♫"}</button>
                <button className="music-island-title" onClick={onOpen}><strong>{track.title}</strong><small>{together ? "一起听 · " : ""}{track.artist || "未知歌手"}</small></button>
                <button className="music-island-collapse" onClick={() => setExpanded(false)} aria-label="收起音乐播放控制" aria-expanded={true}>{wave}</button>
            </div>
            <div className="music-island-timeline">
                <span className="music-island-time">{clock(position)}</span>
                <input className="music-island-seek" type="range" min="0" max={duration || 1} step="0.1" value={position}
                    disabled={!duration} aria-label="音乐播放进度" aria-valuetext={duration ? `${clock(position)}，共 ${clock(duration)}` : "正在读取歌曲时长"}
                    style={{ "--island-progress": `${percent}%` } as CSSProperties}
                    onPointerDown={event => { gestureTrack.current = track.id; try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} event.stopPropagation(); }}
                    onChange={event => {
                        if (!duration) return;
                        if (!gestureTrack.current) gestureTrack.current = track.id;
                        const value = Number(event.currentTarget.value);
                        if (!Number.isFinite(value)) return;
                        draftRef.current = Math.max(0, Math.min(value, duration));
                        setDraft(draftRef.current);
                    }}
                    onPointerUp={event => { event.stopPropagation(); commitSeek(); }} onPointerCancel={cancelSeek}
                    onKeyDown={event => { if (SEEK_KEYS.includes(event.key)) gestureTrack.current = track.id; }}
                    onKeyUp={event => { if (SEEK_KEYS.includes(event.key)) commitSeek(); }} onBlur={commitSeek}
                    onClick={event => event.stopPropagation()}
                />
                <span className="music-island-time music-island-remaining">{duration ? `-${clock(remaining)}` : "--:--"}</span>
            </div>
            <div className="music-island-actions">
                <span aria-hidden="true" />
                <button className="music-island-prev" onClick={() => player.prev()} aria-label="上一首"><svg viewBox="0 0 36 36" fill="currentColor" aria-hidden="true"><path d="M18 5 3 18l15 13V5Zm15 0L18 18l15 13V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></button>
                <button className="music-island-play" onClick={() => player.togglePlay()} aria-label={player.isPlaying ? "暂停" : "播放"}>
                    {player.isPlaying ? <svg viewBox="0 0 36 36" fill="currentColor" aria-hidden="true"><rect x="7" y="4" width="8" height="28" rx="2"/><rect x="21" y="4" width="8" height="28" rx="2"/></svg>
                        : <svg viewBox="0 0 36 36" fill="currentColor" aria-hidden="true"><path d="M9 4v28l23-14L9 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5"/></svg>}
                </button>
                <button className="music-island-next" onClick={() => player.next()} aria-label="下一首"><svg viewBox="0 0 36 36" fill="currentColor" aria-hidden="true"><path d="M18 5 3 18l15 13V5Zm15 0L18 18l15 13V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg></button>
                <button className="music-island-volume-button" onClick={() => setVolumeOpen(value => !value)} aria-label="调节音乐音量" aria-expanded={volumeOpen}>{player.volume === 0 ? <VolumeX/> : <Volume2/>}</button>
            </div>
            {volumeOpen && <div className="music-island-volume"><input type="range" min="0" max="1" step="0.01" value={player.volume} aria-label="音乐音量" onChange={event => player.setVolume(Number(event.currentTarget.value))}/></div>}
        </section>}
    </div>;
}
