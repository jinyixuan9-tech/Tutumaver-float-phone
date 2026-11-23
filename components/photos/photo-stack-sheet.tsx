"use client";

import { useState } from "react";
import { Check, Images, X } from "lucide-react";
import type { PhotoRecord } from "@/lib/photo-library-types";

export function PhotoStackSheet({ photos, selectedIds, imageMap, onChoose, onClose }: {
  photos: PhotoRecord[];
  selectedIds: string[];
  imageMap: Record<string, string>;
  onChoose: (coverId?: string) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const selected = new Set(selectedIds);
  const covers = photos.filter(photo => !selected.has(photo.id) && (!photo.stackId || !photos.some(other => other.id === photo.stackId)));
  return <div className="photos-sheet-backdrop">
    <section className="photos-sheet photos-stack-sheet" role="dialog" aria-modal="true" aria-label="选择套图封面">
      <header className="photos-sheet-header">
        <button type="button" onClick={onClose} aria-label="关闭"><X size={19} /></button>
        <div><strong>加入套图</strong><span>看图选一组 · 已选 {selectedIds.length} 张</span></div>
        <button type="button" className="photos-sheet-done" disabled={!choice} onClick={() => choice && onChoose(choice)}>加入</button>
      </header>
      <div className="photos-sheet-scroll">
        {selectedIds.length > 1 ? <button type="button" className="photos-stack-create" onClick={() => onChoose()}><Images size={20} /><span>用已选照片组成新套图<small>无需起名字，以第一张为封面</small></span></button> : null}
        <p className="photos-note">点选封面即可。选择单张照片会和它组成一套，移动封面时，整套照片一起移动。</p>
        <div className="photos-stack-picker">{covers.map(photo => {
          const count = photos.filter(item => item.stackId === photo.id).length + 1;
          return <button type="button" key={photo.id} aria-label={`选择${photo.displayName || "照片"}作为套图封面`} aria-pressed={choice === photo.id} className={choice === photo.id ? "is-selected" : ""} onClick={() => setChoice(photo.id)}>
            {imageMap[photo.assetId] ? <img src={imageMap[photo.assetId]} alt="" /> : <Images size={28} />}
            <span className="photos-stack-count"><Images size={12} />{count} 张{photo.seriesId ? ` · ${photo.seriesId}` : ""}</span>
            {choice === photo.id ? <i><Check size={15} /></i> : null}
          </button>;
        })}</div>
        {!covers.length ? <p className="photos-note">还没有其他照片可选。可先导入照片，再组成套图。</p> : null}
      </div>
    </section>
  </div>;
}
