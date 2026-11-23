"use client";
import { useState, useEffect, type CSSProperties } from "react";
import type { CharacterWorldRelation } from "@/lib/character-world-storage";
import { RELATION_STYLES, type RelationKind } from "@/lib/relation-policy";
import { pairSuggestionsDisabled, setPairSuggestionsDisabled, RELATION_SUGGESTIONS_UPDATED } from "@/lib/relationship-suggestions";
export type RelationEdit = Pick<CharacterWorldRelation, "label" | "bidirectional" | "locked" | "kind">;
function RelationForm({ fromName, toName, initial, onSave, onCancel }: { fromName: string; toName: string; initial?: RelationEdit; onSave: (value: RelationEdit) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(initial?.label || "");
  const [kind, setKind] = useState<RelationKind | undefined>(initial ? initial.kind : "ordinary");
  const [bidirectional, setBidirectional] = useState(initial ? initial.bidirectional === true : true);
  const [locked, setLocked] = useState(initial?.locked === true);
  const style = RELATION_STYLES[kind || "ordinary"];
  const css = { "--relation-color": style.color, "--relation-bg": style.background, "--relation-text": style.text } as CSSProperties;
  const save = () => { if (label.trim()) onSave({ label: label.trim(), kind, bidirectional, locked: kind === "family" || locked }); };
  return <div className="wt-modal" onClick={onCancel}><div className="wt-paper wt-colored-relation" style={css} onClick={e => e.stopPropagation()}>
    <div className="wt-paper-tape" aria-hidden/><div className="wt-paper-kicker">{initial ? "EDIT RELATION" : "RELATIONSHIP"}</div>
    <div className="wt-relation-row"><strong>{fromName}</strong><span className="wt-relation-dash">{bidirectional ? "↔" : "→"}</span><strong>{toName}</strong></div>
    <label className="wt-relation-field">关系方向<select className="wt-paper-input" aria-label="关系方向" value={kind || ""} onChange={e => { const next = e.target.value as RelationKind; setKind(next); setLocked(next === "enemy" || next === "family"); }}>
      {!kind && <option value="">原有关系 · 尚未选方向</option>}{Object.entries(RELATION_STYLES).map(([id, item]) => <option value={id} key={id}>{item.name}</option>)}
    </select></label>
    <p className="wt-paper-hint wt-relation-direction">{kind ? style.hint : "保留原有描述 选择方向后才使用对应的发展规则"}</p>
    <label className="wt-relation-field">当前关系<input className="wt-paper-input" aria-label="当前关系" value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }} placeholder="例如：认识多年的朋友 / 已确认恋人 / 表姐"/></label>
    <div className="wt-paper-hint wt-relation-options"><label><input type="checkbox" checked={bidirectional} onChange={e => setBidirectional(e.target.checked)}/>双向共用</label><label><input type="checkbox" checked={kind === "family" || locked} disabled={kind === "family"} onChange={e => setLocked(e.target.checked)}/>固定关系</label></div>
    <p className="wt-paper-hint">{kind === "family" ? "亲疏可变化 亲属身份保持" : locked ? "保持当前关系性质与阶段 仍可自然关心、争执和熟悉" : "允许符合双方状态的缓慢发展 不自动修改关系或线色"}</p>
    <div className="wt-paper-actions"><button className="wt-btn" onClick={onCancel}>取消</button><span className="wt-paper-spacer"/><button className="wt-btn wt-btn-primary" disabled={!label.trim()} onClick={save}>{initial ? "保存" : "牵线"}</button></div>
  </div></div>;
}
export function RelationLinkDialog({ fromName, toName, onConfirm, onCancel }: { fromName: string; toName: string; onConfirm: (label: string, options: Omit<RelationEdit, "label">) => void; onCancel: () => void }) {
  return <RelationForm fromName={fromName} toName={toName} onSave={({ label, ...options }) => onConfirm(label, options)} onCancel={onCancel}/>;
}
export function RelationPairSheet({ relations, nameById, onDelete, onEdit, onClose }: { relations: CharacterWorldRelation[]; nameById: Map<string, string>; onDelete: (id: string) => void; onEdit: (id: string, patch: RelationEdit) => void; onClose: () => void }) {
  const [editing, setEditing] = useState<CharacterWorldRelation | null>(null);
  const pair = relations[0];
  const [muted,setMuted] = useState(false);
  useEffect(()=>{const update=()=>setMuted(pair ? pairSuggestionsDisabled(pair.fromCharacterId,pair.toCharacterId) : false);update();window.addEventListener(RELATION_SUGGESTIONS_UPDATED,update);return ()=>window.removeEventListener(RELATION_SUGGESTIONS_UPDATED,update);},[pair?.fromCharacterId,pair?.toCharacterId]);
  if (editing) return <RelationForm fromName={nameById.get(editing.fromCharacterId) || "?"} toName={nameById.get(editing.toCharacterId) || "?"} initial={editing} onSave={value => { onEdit(editing.id, value); setEditing(null); }} onCancel={() => setEditing(null)}/>;
  return <div className="wt-modal" onClick={onClose}><div className="wt-paper" onClick={e => e.stopPropagation()}><div className="wt-paper-tape" aria-hidden/><div className="wt-paper-kicker">RELATIONS</div>
    {!relations.length ? <p className="wt-paper-hint">这两人之间已经没有关系线了</p> : <ul className="wt-relation-list">{relations.map(relation => { const style = RELATION_STYLES[relation.kind || "ordinary"]; return <li key={relation.id} className="wt-relation-item"><span className="wt-relation-text" style={{ color: style.text, borderLeft: `2px solid ${style.color}`, paddingLeft: 8 }}>{nameById.get(relation.fromCharacterId) || "?"}{relation.bidirectional ? " ↔ " : " → "}{nameById.get(relation.toCharacterId) || "?"}<br/>{relation.label}{relation.locked || relation.kind === "family" ? " · 固定" : ""}</span><button className="wt-btn wt-btn-small" onClick={() => setEditing(relation)}>修改</button><button className="wt-btn wt-btn-danger wt-btn-small" onClick={() => onDelete(relation.id)}>剪断</button></li>; })}</ul>}
    {pair && <label className="wt-paper-hint wt-relation-options"><input type="checkbox" checked={!muted} onChange={e=>{setPairSuggestionsDisabled(pair.fromCharacterId,pair.toCharacterId,!e.target.checked);setMuted(!e.target.checked);}}/>允许缓慢关系变化的提醒</label>}
    <div className="wt-paper-actions"><span className="wt-paper-spacer"/><button className="wt-btn wt-btn-primary" onClick={onClose}>完成</button></div>
  </div></div>;
}
