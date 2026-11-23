"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { downloadPhotoUrl, parsePhotoUrls } from "@/lib/photo-url-import";

type Row = { url: string; file?: File; error?: string };
export function PhotoUrlSheet({ onClose, onReady }: { onClose: () => void; onReady: (files: File[], urls: string[]) => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const rowsRef = useRef<Row[]>([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const download = async (retry = false) => {
    if (running) return;
    let next: Row[];
    try { next = retry ? rowsRef.current.map(row => ({ ...row, error: undefined })) : parsePhotoUrls(text).map(url => ({ url })); }
    catch (err) { setError(err instanceof Error ? err.message : "链接格式不正确。"); return; }
    setError(""); setRunning(true); setProgress(0);
    const controller = new AbortController(); controllerRef.current = controller;
    rowsRef.current = next; setRows([...next]);
    try {
      for (let index = 0; index < next.length; index++) {
        if (controller.signal.aborted) break;
        if (!next[index].file) {
          try { next[index] = { url: next[index].url, file: await downloadPhotoUrl(next[index].url, controller.signal) }; }
          catch (err) { if (controller.signal.aborted) break; next[index] = { url: next[index].url, error: err instanceof Error ? err.message : "下载失败。" }; }
        }
        rowsRef.current = next; setRows([...next]); setProgress(index + 1);
      }
    } finally { setRunning(false); }
  };
  const ready = rows.filter((row): row is Row & { file: File } => Boolean(row.file));
  return <div className="photos-sheet-backdrop">
    <section className="photos-sheet photos-organize-sheet" role="dialog" aria-modal="true" aria-label="链接导入">
      <header className="photos-sheet-header"><button type="button" onClick={() => { controllerRef.current?.abort(); onClose(); }} aria-label="关闭"><X size={19} /></button><div><strong>链接导入</strong><span>图片直链 · 每行一条 · 最多 100 条</span></div><button type="button" disabled={running || !ready.length} onClick={() => onReady(ready.map(row => row.file), ready.map(row => row.url))}>添加 {ready.length || ""}</button></header>
      <div className="photos-sheet-scroll">
        <label className="photos-edit-row"><span>图片 URL</span><textarea className="photos-url-input" value={text} disabled={running} onChange={event => setText(event.target.value)} placeholder={"https://example.com/photo-1.jpg\nhttps://example.com/photo-2.jpg"} /></label>
        <p className="photos-note">先下载预览，再关联角色并点“完成”，会使用相册识图 API 批量识别。图片会保存到手机中；需要登录的链接、帖子页面和禁止下载的图片可能无法导入。</p>
        {error ? <p className="photos-vision-error" role="alert">{error}</p> : null}
        <div className="photos-organize-actions">
          <button type="button" disabled={running || !text.trim()} onClick={() => void download()}>{running ? <><Loader2 size={14} className="photos-spin" /> {progress}/{rows.length}</> : "下载图片"}</button>
          {!running && rows.some(row => !row.file) ? <button type="button" onClick={() => void download(true)}>重试未成功项</button> : null}
          {running ? <button type="button" onClick={() => controllerRef.current?.abort()}>停止下载</button> : null}
        </div>
        {rows.length ? <p className="photos-note">成功 {ready.length} 张 · 未成功 {rows.filter(row => row.error).length} 张{!running && progress < rows.length ? " · 可重试剩余链接" : ""}</p> : null}
        {rows.map((row, index) => <div key={row.url} className="photos-url-result"><span>{index + 1}. {row.url}</span><small className={row.error ? "photos-error-text" : ""}>{row.file ? "已下载" : row.error || "等待下载"}</small></div>)}
      </div>
    </section>
  </div>;
}
