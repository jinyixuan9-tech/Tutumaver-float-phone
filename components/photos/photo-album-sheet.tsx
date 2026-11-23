"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { PhotoAlbum } from "@/lib/photo-library-types";
import { createPhotoAlbum, removePhotoAlbum, renamePhotoAlbum, setPhotoAlbumMembership } from "@/lib/photo-library-storage";

type Props = {
  characterId: string;
  albums: PhotoAlbum[];
  photoIds: string[];
  origin?: PhotoAlbum["origin"];
  onClose: () => void;
  mode?: "create" | "manage";
  onCreated?: (id: string) => void;
};

export function PhotoAlbumSheet({ characterId, albums, photoIds, origin, onClose, mode = "manage", onCreated }: Props) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const ownAlbums = albums.filter(album => album.characterId === characterId && album.origin === origin);
  const submit = () => {
    if (!name.trim()) return;
    if (editingId) renamePhotoAlbum(editingId, name);
    else { const album=createPhotoAlbum(characterId, name, photoIds, origin); if(album && mode === "create") { onCreated?.(album.id); onClose(); return; } }
    setEditingId(null);
    setName("");
  };
  return <div className="photos-sheet-backdrop" onClick={onClose}>
    <section className="photos-sheet photos-organize-sheet" role="dialog" aria-modal="true" aria-label="整理相册" onClick={event=>event.stopPropagation()}>
      <header className="photos-sheet-header">
        <button type="button" onClick={onClose} aria-label="关闭"><X size={19} /></button>
        <div><strong>{mode === "create" ? "新建相册" : photoIds.length ? "加入相册" : "管理相册"}</strong></div>
        {mode !== "create" ? <button type="button" onClick={onClose}>完成</button> : <span aria-hidden="true" style={{width:36}}/>}
      </header>
      <div className="photos-sheet-scroll">
        {(mode === "create" || editingId) && <form className="photos-album-create" onSubmit={event => { event.preventDefault(); submit(); }}>
          <label className="photos-edit-row"><span>{editingId ? "相册重命名" : "新相册名称"}</span><input autoFocus maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="相册名称" /></label>
          <div className="photos-organize-actions"><button type="submit" disabled={!name.trim()}>保存</button>{editingId ? <button type="button" onClick={() => { setEditingId(null); setName(""); }}>取消改名</button> : null}</div>
        </form>}
        {mode !== "create" && ownAlbums.map(album => {
          const selected = photoIds.length > 0 && photoIds.every(id => album.photoIds.includes(id));
          const partial = !selected && photoIds.some(id => album.photoIds.includes(id));
          return <div className="photos-subalbum-row" key={album.id}>
            <button type="button" className="photos-subalbum-name" disabled={!photoIds.length} onClick={() => setPhotoAlbumMembership(album.id, photoIds, !selected)}>
              <span><strong>{album.name}</strong><small>{album.photoIds.length} 张{partial ? " · 部分已加入" : ""}</small></span>
              {photoIds.length ? <i className={selected ? "is-selected" : ""}>{selected ? <Check size={14} /> : null}</i> : null}
            </button>
            <button type="button" className="photos-round-btn" aria-label={`重命名 ${album.name}`} onClick={() => { setEditingId(album.id); setName(album.name); }}><Pencil size={15} /></button>
            <button type="button" className="photos-round-btn photos-danger-btn" aria-label={`删除相册 ${album.name}`} onClick={() => { if (window.confirm(`删除“${album.name}”相册？里面的照片仍保留在全部照片中。`)) { removePhotoAlbum(album.id); if (editingId === album.id) { setEditingId(null); setName(""); } } }}><Trash2 size={15} /></button>
          </div>;
        })}
      </div>
    </section>
  </div>;
}
