"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, LockKeyhole, Plus, Check, Globe2, Pencil, Trash2, X } from "lucide-react";
import { CHARACTERS_UPDATED_EVENT, loadCharacters } from "@/lib/character-storage";
import { worldlineEnabledForApp, loadWorldlineState, saveWorldlineState, type Worldline, type WorldlineEvent, type WorldlineState, type WorldlineAccess, type WorldlineArchiveEntry } from "@/lib/worldline-storage";
import { proposeWorldlineEvent, proposeWorldlineProgress } from "@/lib/worldline-engine";
import { ICONS } from "@/lib/desktop-config";
import { loadInstalledCustomApps } from "@/lib/custom-app-storage";
import "@/styles/worldline.css";
import {worldlineLocalTime,worldlineTimeError,worldlineTimeLabel} from "@/lib/worldline-event-time";

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today = () => worldlineLocalTime();
const dateLabel = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(d); };

type Draft = { title: string; detail: string; occurredAt: string; endsAt?: string; visibility: "private" | "public"; category: string; people: WorldlineEvent["people"]; locked: boolean };
const blankEvent = (): Draft => ({ title: "", detail: "", occurredAt: today(), visibility: "private", category: "", people: {}, locked: false });

export function WorldlineApp({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<WorldlineState>(loadWorldlineState);
  const [tab, setTab] = useState<"overview" | "events" | "people">("overview");
  const [editingWorld, setEditingWorld] = useState(false);
  const [progressEdit, setProgressEdit] = useState<{id:string;text:string}|null>(null);
  const [progressDraft, setProgressDraft] = useState("");
  const [archiveDraft, setArchiveDraft] = useState<{ categoryId: string | null; entryId: string | null; name: string; title: string; content: string } | null>(null);
  const [collapsedArchives, setCollapsedArchives] = useState<Record<string, boolean>>({});
  const [aiDirection, setAiDirection] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiProposed, setAiProposed] = useState(false);
  const [worldName, setWorldName] = useState("");
  const [worldNote, setWorldNote] = useState("");
  const [aiMode, setAiMode] = useState<"event" | "progress">("event");
  const [memoryNotice, setMemoryNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [previewCharacterId, setPreviewCharacterId] = useState<string | null>(null);
  const [characters, setCharacters] = useState(loadCharacters);
  useEffect(() => {
    const refresh = () => setCharacters(loadCharacters());
    window.addEventListener(CHARACTERS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CHARACTERS_UPDATED_EVENT, refresh);
  }, []);
  const world = state.worlds.find(w => w.id === state.activeId) ?? state.worlds[0];
  const linkedCount = world?.characterIds.filter(id => characters.some(c => c.id === id)).length ?? 0;
  const apps = [...Object.values(ICONS).filter(item => !["worldline", "appmarket", "resource_hub", "settings", "photos", "music", "reading", "game", "mapmode", "group_chat", "moments", "theme", "resources", "characters", "qa"].includes(item.id)).map(item => ({ id: item.id, name: item.label })), ...loadInstalledCustomApps().map(app => ({ id: `custom_app:${app.id}`, name: app.name }))];
  const save = (next: WorldlineState) => { setState(next); saveWorldlineState(next); };
  const back = () => {
    if (confirmDelete) { setConfirmDelete(null); return; }
    if (draft) { setDraft(null); return; }
    if (archiveDraft) { setArchiveDraft(null); return; }
    if (aiOpen) { setAiOpen(false); return; }
    if (editingWorld) { setEditingWorld(false); return; }
    onClose();
  };
  const patchWorld = (patch: Partial<Worldline>) => {
    if (!world) return;
    save({ ...state, worlds: state.worlds.map(w => w.id === world.id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w) });
  };
  const deleteProgress = (id: string) => {
    if (!world || !window.confirm("删除这条进度？删除最新一条后，上一条将恢复为最新进度。")) return;
    const progressHistory = world.progressHistory.filter(item => item.id !== id);
    patchWorld({ progressHistory, currentState: progressHistory.at(-1)?.text || "" });
  };
  const saveWorldDetails = () => {
    if (!world || !worldName.trim()) return;
    patchWorld({ name: worldName.trim(), note: worldNote.trim(), characterIds: world.characterIds.filter(id => characters.some(c => c.id === id)) });
    setEditingWorld(false);
  };
  const openWorldDetails = () => { setWorldName(world?.name || ""); setWorldNote(world?.note || ""); setEditingWorld(true); };
  const createWorld = () => {
    if (!worldName.trim()) return;
    const now = new Date().toISOString();
    const next: Worldline = { id: uid(), name: worldName.trim(), note: worldNote.trim(), background: "", currentState: "", archive: [], progressHistory: [], characterIds: [], events: [], createdAt: now, updatedAt: now };
    save({ worlds: [...state.worlds, next], activeId: next.id }); setEditingWorld(false);
  };
  const saveEvent = () => {
    if (!world || !draft?.title.trim() || !draft.occurredAt) return;
    if(worldlineTimeError(draft.occurredAt,draft.endsAt))return;
    const now = new Date().toISOString();
    const old = world.events.find(event => event.id === editingId);
    const event: WorldlineEvent = { ...draft, id: old?.id ?? uid(), title: draft.title.trim(), detail: draft.detail.trim(), category: draft.category.trim(), occurredAt: new Date(draft.occurredAt).toISOString(), endsAt:draft.endsAt?new Date(draft.endsAt).toISOString():undefined, createdAt: old?.createdAt ?? now, updatedAt: now };
    patchWorld({ events: [...world.events.filter(item => item.id !== event.id), event] });
    if (old) setMemoryNotice("事件已修改。如果曾提炼成长期记忆，请到记忆库手动核对旧摘要。");
    setDraft(null); setEditingId(null); setAiProposed(false); setExpandedId(event.id); setTab("events");
  };
  const orderedEvents = [...(world?.events ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const openEvent = (event?: WorldlineEvent) => { setEditingId(event?.id ?? null); setDraft(event ? { title: event.title, detail: event.detail, occurredAt: worldlineLocalTime(event.occurredAt), endsAt:event.endsAt?worldlineLocalTime(event.endsAt):undefined, visibility: event.visibility, category: event.category, people: Object.fromEntries(Object.entries(event.people || {}).map(([id, info]) => [id, { ...info, access: info.access === "public" ? "heard" as const : info.access }])), locked: event.locked } : blankEvent()); };
  const saveProgress = () => {
    if (!world || !progressDraft.trim()) return;
    const text = progressDraft.trim();
    patchWorld({ currentState: text, progressHistory: [...(world.progressHistory || []), { id: uid(), text, recordedAt: new Date().toISOString() }] });
    setProgressDraft("");
  };
  const saveArchive = () => {
    if (!world || !archiveDraft?.name.trim() || !archiveDraft.title.trim() || !archiveDraft.content.trim()) return;
    const now = new Date().toISOString();
    const categoryId = archiveDraft.categoryId || uid();
    const entry: WorldlineArchiveEntry = { id: archiveDraft.entryId || uid(), title: archiveDraft.title.trim(), content: archiveDraft.content.trim(), updatedAt: now };
    const existing = (world.archive || []).find(c => c.id === categoryId);
    const updated = existing
      ? (world.archive || []).map(c => c.id === categoryId ? { ...c, name: archiveDraft.name.trim(), entries: [...c.entries.filter(e => e.id !== entry.id), entry] } : c)
      : [...(world.archive || []), { id: categoryId, name: archiveDraft.name.trim(), entries: [entry] }];
    patchWorld({ archive: updated }); setArchiveDraft(null);
  };
  const generate = async () => {
    if (!world || aiBusy) return;
    setAiBusy(true); setAiError("");
    try {
      if (aiMode === "progress") { setProgressDraft(await proposeWorldlineProgress(world, aiDirection)); setAiOpen(false); setTab("overview"); return; }
      if (!aiDirection.trim()) throw new Error("请先写推进方向。");
      const result = await proposeWorldlineEvent(world, aiDirection);
      setEditingId(null);
      setDraft({ ...result, occurredAt: worldlineLocalTime(result.occurredAt), endsAt:result.endsAt?worldlineLocalTime(result.endsAt):undefined, visibility: "private", locked: false });
      setAiProposed(true); setAiOpen(false);
    } catch (e) { setAiError(e instanceof Error ? e.message : "生成失败，请重试。"); }
    finally { setAiBusy(false); }
  };
  return <div className="wl-app">
    <header className="wl-top"><button aria-label="返回" onClick={back}><ArrowLeft size={21}/></button><span>世界线</span><span className="wl-top-placeholder"/></header>
    <main className="wl-scroll">
      <div className="wl-title"><small>WORLDLINE</small><h1>{world?.name || "为故事建立一条世界线"}</h1><p>{world ? `${world.events.length} 个事件 · ${linkedCount} 位角色` : "事实、进度和每个人知道的部分，放在同一个地方。"}</p></div>
      {world && <div className="wl-switch"><button onClick={openWorldDetails}><span className="wl-switch-icon"><Globe2 size={19}/></span><span className="wl-switch-copy">当前世界<strong>{world.name}</strong></span><ChevronRight size={17}/></button></div>}
      {!world ? <div className="wl-empty"><div className="wl-empty-mark">◎</div><h2>从一个世界开始</h2><p>先命名你的世界。之后可以整理背景、事件和角色知情范围。</p><button className="wl-primary" onClick={openWorldDetails}>创建世界</button></div> : <>
        <nav className="wl-tabs"><button className={tab === "overview" ? "selected" : ""} onClick={() => setTab("overview")}>总览</button><button className={tab === "events" ? "selected" : ""} onClick={() => setTab("events")}>事件</button><button className={tab === "people" ? "selected" : ""} onClick={() => setTab("people")}>角色</button></nav>
        {tab === "overview" && <div className="wl-content">
          <div className="wl-section-head"><span>世界档案</span><button onClick={() => setArchiveDraft({ categoryId: null, entryId: null, name: "", title: "", content: "" })}><Plus size={16}/> 添加分类与条目</button></div>
          {(world.archive || []).length ? (world.archive || []).map(group => <div className="wl-archive" key={group.id}>
            <div className="wl-archive-head"><button className="wl-archive-toggle" aria-expanded={!collapsedArchives[`${world.id}:${group.id}`]} onClick={() => setCollapsedArchives(previous => { const key = `${world.id}:${group.id}`; return { ...previous, [key]: !previous[key] }; })}><strong>{group.name}</strong></button><button aria-label={`向${group.name}添加条目`} onClick={() => setArchiveDraft({ categoryId: group.id, entryId: null, name: group.name, title: "", content: "" })}><Plus size={15}/></button></div>
            {!collapsedArchives[`${world.id}:${group.id}`] && group.entries.map(entry => <button className="wl-archive-entry" key={entry.id} onClick={() => setArchiveDraft({ categoryId: group.id, entryId: entry.id, name: group.name, title: entry.title, content: entry.content })}><strong>{entry.title}</strong><span>{entry.content}</span><ChevronRight size={15}/></button>)}
          </div>) : <div className="wl-hint">按你自己的方式添加分类和条目。已保存的设定会作为 AI 推进时的事实依据。</div>}
          <div className="wl-section-head"><span>当前进度</span><span>每次保存都会留下记录</span></div>
          <button className="wl-ai-entry" onClick={() => { setAiMode("progress"); setAiError(""); setAiOpen(true); }}>让 AI 推进当前进度 <ChevronRight size={16}/></button>
          <div className="wl-text-card"><span>新进度</span><textarea placeholder="写下新的进度……" value={progressDraft} onChange={e => setProgressDraft(e.target.value)}/><button className="wl-progress-save" disabled={!progressDraft.trim()} onClick={saveProgress}>保存新进度</button></div>
          <div className="wl-progress-history">{[...(world.progressHistory || [])].reverse().map(item => <div key={item.id} style={{padding:12}}><div style={{display:"flex",gap:8,alignItems:"center"}}><details style={{flex:1,minWidth:0}}><summary style={{cursor:"pointer"}}><time>{dateLabel(item.recordedAt)}</time> · {item.text.slice(0,42)}{item.text.length>42?"…":""}</summary><p style={{whiteSpace:"pre-wrap"}}>{item.text}</p></details><button aria-label="编辑这条进度" onClick={()=>setProgressEdit({id:item.id,text:item.text})}><Pencil size={16}/></button><button aria-label="删除这条进度" onClick={()=>deleteProgress(item.id)}><Trash2 size={16}/></button></div></div>)}</div>
          {progressEdit&&<div className="modal-overlay" onClick={()=>setProgressEdit(null)}><div className="modal-dialog" onClick={e=>e.stopPropagation()} style={{padding:20,width:"min(90%,480px)"}}><h3>编辑进度</h3><textarea style={{width:"100%",minHeight:180}} value={progressEdit.text} onChange={e=>setProgressEdit({...progressEdit,text:e.target.value})}/><button onClick={()=>setProgressEdit(null)}>取消</button><button disabled={!progressEdit.text.trim()} onClick={()=>{const progressHistory=world.progressHistory.map(p=>p.id===progressEdit.id?{...p,text:progressEdit.text.trim()}:p);patchWorld({progressHistory,currentState:progressHistory.at(-1)?.text||""});setProgressEdit(null);}}>保存修改</button></div></div>}
          <div className="wl-section-head"><span>最近发生</span><button onClick={() => setTab("events")}>全部事件 <ChevronRight size={14}/></button></div>
          {orderedEvents.slice(0,3).map(event => <button className="wl-event-row" key={event.id} onClick={() => { setTab("events"); setExpandedId(event.id); }}><span className="wl-event-dot"/><span><strong>{event.title}</strong><small>{worldlineTimeLabel(event)} · {event.visibility === "public" ? "已公开" : "未公开"}</small></span><ChevronRight size={16}/></button>)}
          {!orderedEvents.length && <div className="wl-hint">还没有事件。记录一件已发生的事，才能进入角色的事件时间线。</div>}
        </div>}
        {tab === "events" && <div className="wl-content"><div className="wl-section-head"><span>事件时间线</span><button onClick={() => openEvent()}><Plus size={16}/> 新事件</button></div><button className="wl-ai-entry" onClick={() => { setAiMode("event"); setAiError(""); setAiOpen(true); }}>让 AI 推进一件事 <ChevronRight size={16}/></button>{orderedEvents.length === 0 && <div className="wl-empty wl-empty-small"><div className="wl-empty-mark">◌</div><h2>故事还没开始记录</h2><p>事件只存一次，再决定哪些角色亲历或得知。</p><button className="wl-primary" onClick={() => openEvent()}>添加事件</button></div>}{orderedEvents.map(event => <div className="wl-event" key={event.id}><button className="wl-event-main" onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}><div className="wl-date">{worldlineTimeLabel(event)}</div><strong>{event.title}</strong><span>{event.visibility === "public" ? "公开事件" : "私人事件"}{event.category && ` · ${event.category}`}{event.locked && " · 已锁定"}</span></button>{expandedId === event.id && <div className="wl-event-detail"><p>{event.detail || "没有补充细节"}</p><div className="wl-pills">{Object.entries(event.people || {}).map(([id, knowledge]) => <span key={id}>{characters.find(c => c.id === id)?.name || "已移除角色"} · {knowledge.access === "witnessed" ? "亲历" : "后来得知"}</span>)}</div><div className="wl-actions"><button onClick={() => openEvent(event)}><Pencil size={15}/> 编辑</button><button onClick={() => setConfirmDelete(event.id)}><Trash2 size={15}/> 删除</button></div></div>}</div>)}</div>}
        {tab === "people" && <div className="wl-content"><div className="wl-section-head"><span>关联角色</span><span>{linkedCount} / {characters.length}</span></div><div className="wl-people-list">{characters.map(char => { const selected = world.characterIds.includes(char.id); return <button key={char.id} onClick={() => patchWorld({ characterIds: selected ? world.characterIds.filter(id => id !== char.id) : [...world.characterIds, char.id] })}><span className="wl-avatar">{char.avatar ? <img src={char.avatar} alt=""/> : char.name.slice(0, 1)}</span><span>{char.name}</span><span className={`wl-checkbox ${selected ? "checked" : ""}`}>{selected && <Check size={13}/>}</span></button>; })}</div><p className="wl-footnote">关联只用于管理名单，不会让角色自动知道整个世界。请在每件事件里设置知情范围。</p><div className="wl-section-head"><span>注入预览</span></div><select className="wl-select" value={previewCharacterId || ""} onChange={e => setPreviewCharacterId(e.target.value || null)}><option value="">选择角色</option>{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{previewCharacterId && <div className="wl-preview">{orderedEvents.filter(e => e.visibility === "public" || (e.people?.[previewCharacterId] && e.people[previewCharacterId].access !== "public")).length ? orderedEvents.filter(e => e.visibility === "public" || (e.people?.[previewCharacterId] && e.people[previewCharacterId].access !== "public")).map(e => <div key={e.id}><strong>{e.title}</strong><p>{e.detail}{e.people?.[previewCharacterId]?.perspective ? `；个人视角：${e.people[previewCharacterId].perspective}` : ""}</p></div>) : <p>目前没有这个角色获知的事件。</p>}</div>}</div>}
      </>}
    </main>
    {editingWorld && <div className="wl-overlay" onClick={() => setEditingWorld(false)}><div className="wl-sheet" onClick={e => e.stopPropagation()}><div className="wl-sheet-head"><button onClick={() => setEditingWorld(false)}>取消</button><strong>当前世界</strong><button onClick={world ? saveWorldDetails : createWorld} disabled={!worldName.trim()}>保存</button></div><label>世界名称<input autoFocus placeholder="例如：首尔 · 2026" value={worldName} onChange={e => setWorldName(e.target.value)}/></label><label className="wl-setting-note">本地备注（AI 不读取）<textarea placeholder="只给自己看的备忘" value={worldNote} onChange={e => setWorldNote(e.target.value)}/></label>{world && <><h3>世界线绑定的 APP</h3><p className="wl-footnote">关闭后该 APP 的生成不会读取这条世界线。</p><div className="wl-bindings">{apps.map(app => <label key={app.id}><span>{app.name}</span><input type="checkbox" checked={worldlineEnabledForApp(world, app.id)} onChange={e => patchWorld({ appBindings: { ...world.appBindings, [app.id]: e.target.checked } })}/></label>)}</div></>}</div></div>}
    {archiveDraft && <div className="wl-editor"><header className="wl-top"><button onClick={() => setArchiveDraft(null)}><X size={21}/></button><span>{archiveDraft.entryId ? "编辑条目" : "档案条目"}</span><button className="wl-save" onClick={saveArchive} disabled={!archiveDraft.name.trim() || !archiveDraft.title.trim() || !archiveDraft.content.trim()}>保存</button></header><div className="wl-editor-scroll"><div className="wl-form-group"><label>分类名称<input placeholder="例如：节目设定" value={archiveDraft.name} onChange={e => setArchiveDraft({ ...archiveDraft, name: e.target.value })}/></label><label>条目标题<input placeholder="例如：播出规则" value={archiveDraft.title} onChange={e => setArchiveDraft({ ...archiveDraft, title: e.target.value })}/></label><label>内容<textarea placeholder="一条只写一个设定，方便以后单独编辑。" value={archiveDraft.content} onChange={e => setArchiveDraft({ ...archiveDraft, content: e.target.value })}/></label></div>{archiveDraft.entryId && <button className="wl-danger" onClick={() => { if (!world) return; patchWorld({ archive: world.archive.map(c => c.id === archiveDraft.categoryId ? { ...c, entries: c.entries.filter(e => e.id !== archiveDraft.entryId) } : c).filter(c => c.entries.length) }); setArchiveDraft(null); }}>删除这条档案</button>}</div></div>}
    {aiOpen && <div className="wl-overlay" onClick={() => setAiOpen(false)}><div className="wl-sheet" onClick={e => e.stopPropagation()}><div className="wl-sheet-head"><button onClick={() => setAiOpen(false)}>取消</button><strong>{aiMode === "progress" ? "推进当前进度" : "推进一件事"}</strong><span/></div><p className="wl-footnote">{aiMode === "progress" ? "只参考世界档案、广播历史、已公开事件与公开日程；生成后会填入进度输入框，由你审核保存。" : "生成一条待审核事件；不会覆盖已锁定事实，也不会自动写进角色记忆。"}</p><label>给 AI 的方向<textarea className="wl-ai-direction" placeholder="例如：从 EP.1 播出后的一周推进，角色各自知道的事情不能越界……" value={aiDirection} onChange={e => setAiDirection(e.target.value)}/></label>{aiError && <p className="wl-ai-error">{aiError}</p>}<button className="wl-primary wl-ai-generate" disabled={(aiMode === "event" && !aiDirection.trim()) || aiBusy} onClick={generate}>{aiBusy ? "生成中…" : "生成草稿"}</button></div></div>}
    {draft && <div className="wl-editor"><header className="wl-top"><button onClick={() => { setDraft(null); setAiProposed(false); }}><X size={21}/></button><span>{editingId ? "编辑事件" : aiProposed ? "审核 AI 草稿" : "新事件"}</span><button className="wl-save" onClick={saveEvent} disabled={!draft.title.trim()||!!worldlineTimeError(draft.occurredAt,draft.endsAt)}>完成</button></header><div className="wl-editor-scroll">{aiProposed && <p className="wl-ai-note">AI 只生成草稿。请检查事实、时间和每位角色知道的内容；点击完成后才会保存。</p>}<div className="wl-form-group"><label>标题<input placeholder="发生了什么？" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label><div className="wl-time-editor"><span className="wl-time-caption">事件时间</span><div className="wl-segment wl-time-mode"><button className={draft.endsAt===undefined?"active":""} onClick={()=>setDraft({...draft,endsAt:undefined})}>具体时刻</button><button className={draft.endsAt!==undefined?"active":""} onClick={()=>setDraft({...draft,endsAt:draft.endsAt??worldlineLocalTime(new Date((Date.parse(draft.occurredAt)||Date.now())+3600000).toISOString())})}>时间段</button></div><span className="wl-time-caption">{draft.endsAt===undefined?"发生时间":"开始时间"}</span><div className="wl-time-row"><label>日期<input aria-label="事件开始日期" type="date" value={draft.occurredAt.slice(0,10)} onChange={e=>setDraft({...draft,occurredAt:`${e.target.value}T${draft.occurredAt.slice(11)||"00:00"}`})}/></label><label>时间<input aria-label="事件开始时间" type="time" step="60" value={draft.occurredAt.slice(11)} onChange={e=>setDraft({...draft,occurredAt:`${draft.occurredAt.slice(0,10)}T${e.target.value}`})}/></label></div>{draft.endsAt!==undefined&&<><span className="wl-time-caption">结束时间</span><div className="wl-time-row"><label>日期<input aria-label="事件结束日期" type="date" value={draft.endsAt.slice(0,10)} onChange={e=>setDraft({...draft,endsAt:`${e.target.value}T${draft.endsAt?.slice(11)||"00:00"}`})}/></label><label>时间<input aria-label="事件结束时间" type="time" step="60" value={draft.endsAt.slice(11)} onChange={e=>setDraft({...draft,endsAt:`${draft.endsAt?.slice(0,10)}T${e.target.value}`})}/></label></div></>}{worldlineTimeError(draft.occurredAt,draft.endsAt)&&<p className="wl-time-error" role="alert">{worldlineTimeError(draft.occurredAt,draft.endsAt)}</p>}</div><label>经过<textarea placeholder="只写确认发生的事实；人物各自的理解写在下面。" value={draft.detail} onChange={e => setDraft({ ...draft, detail: e.target.value })}/></label><label>分类<input placeholder="可选，如演出、恋综、日常" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}/></label></div><div className="wl-section-head"><span>公开程度</span></div><div className="wl-segment"><button className={draft.visibility === "private" ? "active" : ""} onClick={() => setDraft({ ...draft, visibility: "private" })}>未公开</button><button className={draft.visibility === "public" ? "active" : ""} onClick={() => setDraft({ ...draft, visibility: "public" })}>已公开</button></div><p className="wl-footnote">已公开事件会进入所有角色可见的公共事实，也可供已绑定的公开平台参考；不会自动发帖。</p><div className="wl-section-head"><span>角色知情</span><span>{Object.keys(draft.people).length} 人</span></div><p className="wl-footnote">未公开事件仅勾选角色可知：单人进入短期，多人进入共享；已公开事件所有角色都知道。勾选角色可追加其亲历细节和个人想法。</p>{characters.map(char => { const info = draft.people[char.id]; return <div className="wl-knowledge" key={char.id}><button onClick={() => { const people = { ...draft.people }; if (info) delete people[char.id]; else people[char.id] = { access: "witnessed", perspective: "" }; setDraft({ ...draft, people }); }}><span className="wl-avatar">{char.avatar ? <img src={char.avatar} alt=""/> : char.name.slice(0, 1)}</span><strong>{char.name}</strong><span className={`wl-checkbox ${info ? "checked" : ""}`}>{info && <Check size={13}/>}</span></button>{info && <div className="wl-knowledge-extra"><select value={info.access} onChange={e => setDraft({ ...draft, people: { ...draft.people, [char.id]: { ...info, access: e.target.value as WorldlineAccess } } })}><option value="witnessed">亲历</option><option value="heard">后来得知</option></select><textarea placeholder="这个角色的个人想法或额外细节（与事件经过一起读取）" value={info.perspective} onChange={e => setDraft({ ...draft, people: { ...draft.people, [char.id]: { ...info, perspective: e.target.value } } })}/></div>}</div>; })}<button className="wl-lock" onClick={() => setDraft({ ...draft, locked: !draft.locked })}><LockKeyhole size={17}/> 标记为已锁定事实 <span className={`wl-checkbox ${draft.locked ? "checked" : ""}`}>{draft.locked && <Check size={13}/>}</span></button></div></div>}
    {memoryNotice && <div className="wl-memory-notice" role="status">{memoryNotice}<button onClick={() => setMemoryNotice("")}>知道了</button></div>}
    {confirmDelete && <div className="wl-overlay"><div className="wl-confirm"><h3>删除这件事？</h3><p>这件事会从世界线和角色短期事件中移除。已生成的长期记忆摘要不会自动撤回。</p><button onClick={() => { patchWorld({ events: world!.events.filter(e => e.id !== confirmDelete) }); setConfirmDelete(null); setExpandedId(null); setMemoryNotice("事件已删除。如果曾提炼成长期记忆，请到记忆库手动核对旧摘要。"); }}>删除事件</button><button onClick={() => setConfirmDelete(null)}>取消</button></div></div>}
  </div>;
}
