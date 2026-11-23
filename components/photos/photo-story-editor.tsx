"use client";
import { useState } from "react";

export function PhotoStoryEditor({ label, note, hint, onSave }: { label: string; note?: string; hint: string; onSave: (note: string | undefined) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  return <section className="photos-story-editor">
    <div className="photos-tag-heading"><strong>{label}<small>可选</small></strong><button type="button" onClick={() => { setDraft(note || ""); setEditing(true); }}>{editing ? "还原" : note ? "编辑" : "添加"}</button></div>
    <p className="photos-note">{hint}</p>
    {editing ? <>
      <textarea aria-label={label} value={draft} onChange={event => setDraft(event.target.value)} placeholder="例如：xx 拍的，上次一起去海边时拍的。很喜欢这张，可以拿去卖萌，但发出去不要说是谁拍的。" />
      <div className="photos-tag-actions"><button type="button" onClick={() => setDraft("")}>清空</button><button type="button" onClick={() => setEditing(false)}>取消</button><button type="button" onClick={() => { onSave(draft.trim() || undefined); setEditing(false); }}>保存备注</button></div>
    </> : <p className={`photos-story-content${note ? "" : " photos-story-empty"}`}>{note || "还没有故事，留空也可以正常使用"}</p>}
  </section>;
}
