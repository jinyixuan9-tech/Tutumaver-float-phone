"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { parsePhotoTags } from "@/lib/photo-stack-utils";

export function PhotoTagEditor({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  return <div className="photos-tag-editor">
    <div className="photos-tag-heading"><span>检索标签</span><button type="button" onClick={() => { setDraft(tags.join("、")); setEditing(true); }}>{editing ? "还原" : "编辑"}</button></div>
    {editing ? <>
      <textarea aria-label="编辑检索标签" value={draft} onChange={event => setDraft(event.target.value)} placeholder="用顿号、逗号或换行分隔标签" />
      <div className="photos-tag-actions"><button type="button" onClick={() => setEditing(false)}>取消</button><button type="button" onClick={() => { onSave(parsePhotoTags(draft)); setEditing(false); }}>保存标签</button></div>
    </> : <div className="photos-tag-list">{tags.length ? tags.map((tag, index) => <span key={`${tag}-${index}`}>{tag}<button type="button" aria-label={`删除标签 ${tag}`} onClick={() => onSave(tags.filter((_, i) => i !== index))}><X size={12} /></button></span>) : <span className="photos-tags-empty">暂无标签，点编辑添加</span>}</div>}
  </div>;
}
