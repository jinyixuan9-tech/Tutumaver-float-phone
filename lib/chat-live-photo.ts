import {unwrapMotionPhoto} from './motion-photo';
import { saveChatImageToIndexedDB } from './chat-asset-storage';
export const LIVE_MAX_SECONDS = 8;
export const LIVE_MAX_BYTES = 30 * 1024 * 1024;
export type LivePhoto = {
    videoId: string;
    duration: number;
    cover: string;
    sheet: string;
    audio?: string;
};
export function validateLiveVideo(duration: number, size: number) { if (!Number.isFinite(duration) || duration <= 0)
    throw Error('无法识别视频时长'); if (duration > LIVE_MAX_SECONDS)
    throw Error('实况最多支持8秒，请先裁剪后再选'); if (size > LIVE_MAX_BYTES)
    throw Error('视频超过30MB，请压缩后再选'); }
export function liveFrameTimes(duration: number) { return Array.from({ length: 8 }, (_, i) => Math.min(duration * .999, Math.max(duration * .001, duration * i / 7))); }
function blobUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob); }); }
async function wav(file: File, duration: number) { let ac: AudioContext | undefined; try {
    ac = new AudioContext();
    const audio = await ac.decodeAudioData(await file.arrayBuffer());
    const samples = Math.ceil(duration * 16000);
    const offline = new OfflineAudioContext(1, samples, 16000);
    const src = offline.createBufferSource();
    src.buffer = audio;
    src.connect(offline.destination);
    src.start();
    const result = await offline.startRendering(), data = result.getChannelData(0), buffer = new ArrayBuffer(44 + data.length * 2), view = new DataView(buffer);
    const str = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    view.setUint32(4, 36 + data.length * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, data.length * 2, true);
    for (let i = 0; i < data.length; i++)
        view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
    return (await blobUrl(new Blob([buffer], { type: 'audio/wav' }))).split(',')[1];
}
catch {
    return undefined;
}
finally {
    void ac?.close();
} }
export async function prepareLivePhoto(file: File, mute: boolean): Promise<LivePhoto> {
    file = await unwrapMotionPhoto(file);
    if (file.size > LIVE_MAX_BYTES)
        throw Error('视频超过30MB，请压缩后再选');
    const url = URL.createObjectURL(file), video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    try {
        await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(Error('视频读取超时')), 10000); video.onloadedmetadata = () => { clearTimeout(timer); resolve(); }; video.onerror = () => { clearTimeout(timer); reject(Error('浏览器无法读取这个视频，请转成MP4')); }; });
        validateLiveVideo(video.duration, file.size);
        const ratio = video.videoHeight / video.videoWidth;
        if (!Number.isFinite(ratio) || ratio <= 0)
            throw Error('无法读取视频画面');
        const w = Math.round(Math.min(400, 400 / ratio)), h = Math.round(w * ratio), canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        const sheet = document.createElement('canvas');
        sheet.width = 800;
        sheet.height = (h + 24) * 4;
        const sc = sheet.getContext('2d')!;
        sc.fillStyle = '#141414';
        sc.fillRect(0, 0, sheet.width, sheet.height);
        let cover = '';
        const times = liveFrameTimes(video.duration);
        for (let i = 0; i < times.length; i++) {
            await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(Error('视频画面读取超时')), 5000); video.onseeked = () => { clearTimeout(timer); resolve(); }; video.onerror = () => { clearTimeout(timer); reject(Error('视频解码失败')); }; video.currentTime = times[i]; });
            ctx.drawImage(video, 0, 0, w, h);
            if (i === 0)
                cover = canvas.toDataURL('image/jpeg', .75);
            const x = (i % 2) * 400, y = Math.floor(i / 2) * (h + 24);
            sc.drawImage(canvas, x, y, w, h);
            sc.fillStyle = '#fff';
            sc.font = '14px sans-serif';
            sc.fillText(`${i + 1} · ${times[i].toFixed(2)}s`, x + 6, y + h + 17);
        }
        const audio = mute ? undefined : await wav(file, video.duration);
        const videoId = await saveChatImageToIndexedDB(file);
        return { videoId, duration: video.duration, cover, sheet: sheet.toDataURL('image/jpeg', .73), audio };
    }
    finally {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
    }
}
