'use client';
import {OnceMedia} from '@/components/once-media';

import { useEffect, useState, useRef } from 'react';
import { prepareLivePhoto, type LivePhoto } from '@/lib/chat-live-photo';
import { getChatImageFromIndexedDB } from '@/lib/chat-asset-storage';
import type { ChatMessage } from '@/lib/chat-storage';
import { createPortal } from 'react-dom';
export function LivePhotoInput({ onClose, onSend }: {
    onClose: () => void;
    onSend: (live: LivePhoto) => void;
}) { const [mute, setMute] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''); const alive = useRef(true); useEffect(() => () => { alive.current = false; }, []); return <div className="modal-overlay" onClick={() => { if (!busy)
    onClose(); }}><div className="modal-dialog" onClick={e => e.stopPropagation()}><strong>发送实况</strong><p className="ts-12 opacity-65">选择8秒以内的视频或含内嵌视频的原始 JPG 动态照片，按时间顺序提取整段画面。原视频保存在本机；声音需要所选API支持音频输入。</p><label className="flex gap-2"><input type="checkbox" checked={mute} onChange={e => setMute(e.target.checked)} disabled={busy}/>静音实况</label><label className="ui-btn ui-btn-primary">{busy ? '正在处理视频…' : '选择视频或动态照片'}<input hidden type="file" accept="video/*,image/jpeg,.jpg,.jpeg" disabled={busy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f)
    return; setBusy(true); setNotice(''); try {
    const live = await prepareLivePhoto(f, mute);
    if (alive.current) {
        if (!mute && !live.audio)
            setNotice('未提取到声音，将发送静音实况');
        onSend(live);
    }
}
catch (err) {
    if (alive.current)
        setNotice(err instanceof Error ? err.message : '处理失败');
}
finally {
    if (alive.current)
        setBusy(false);
} }}/></label><p role="status">{notice}</p><button disabled={busy} className="ui-btn ui-btn-ghost" onClick={onClose}>取消</button></div></div>; }
export function LivePhotoBubble({ msg }: {
    msg: ChatMessage;
}) { const [url, setUrl] = useState(''), [open, setOpen] = useState(false), [playing, setPlaying] = useState(false), [error, setError] = useState(''); const video = useRef<HTMLVideoElement>(null); useEffect(() => { let active = true; const id = msg.mediaData?.liveVideoId; if (id)
    void getChatImageFromIndexedDB(id).then(u => { if (active) {
        setUrl(u || '');
        if (!u)
            setError('本机视频文件不存在');
    } }); return () => { active = false; }; }, [msg.mediaData?.liveVideoId]); const cover = msg.mediaData?.liveCover; return <><div className="chat-live-photo-card"><OnceMedia naturalRatio media={msg.mediaData?.socialMedia || {kind:'live',assetId:msg.mediaData?.liveVideoId||'',cover:cover||'',sheet:msg.mediaUrl||'',duration:msg.mediaData?.liveDuration||0,muted:msg.mediaData?.liveMuted}} mediaKey={msg.id} onPreview={()=>setOpen(true)}/></div>{open && createPortal(<div role="dialog" aria-modal="true" aria-label="实况预览" className="modal-overlay" style={{ zIndex: 10010, background: '#000e' }} onClick={() => { setOpen(false); setPlaying(false); }}><div style={{ width: '100%', maxWidth: 600, padding: 20, color: '#fff', textAlign: 'center' }} onClick={e => e.stopPropagation()}><button onClick={() => { setOpen(false); setPlaying(false); }} style={{ float: 'right', padding: 12 }}>关闭</button>{url ? <video ref={video} src={url} poster={cover} playsInline controls preload="metadata" muted={msg.mediaData?.liveMuted === true} style={{ width: '100%', maxHeight: '65dvh' }} onEnded={() => setPlaying(false)} onError={() => setError('浏览器无法播放这个视频')}/> : <p>{error || '读取视频中…'}</p>}<button className="ui-btn" onClick={() => { if (!video.current)
    return; if (playing) {
    video.current.pause();
    setPlaying(false);
}
else {
    void video.current.play().then(() => setPlaying(true)).catch(() => setError('播放失败，请使用视频控件重试'));
} }}>{playing ? '暂停实况' : '◉ 播放实况'}</button>{error && <p role="status">{error}</p>}</div></div>, document.body)}</>; }
