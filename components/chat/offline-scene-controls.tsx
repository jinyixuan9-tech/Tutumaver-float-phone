"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Folder, ChevronRight, X } from "lucide-react";
import type { ChatSession } from "@/lib/chat-storage";
import { ensureChatOfflineScene, loadChatOfflineSceneState, loadChatOfflineTurns, updateChatOfflineScene, deleteChatOfflineArchive, OFFLINE_SCENE_UPDATED, type ChatOfflineArchive } from "@/lib/chat-offline-storage";
import { saveChatOfflineScene, summarizeChatOfflineScene, editChatOfflineArchive, offlineStoryLabel, validateOfflineStoryTime, type OfflineSceneDraft } from "@/lib/chat-offline-scene-memory";
import { loadCharacters } from "@/lib/character-storage";
import { offlineSpeakerMap } from "@/lib/offline-speakers";
import { parseOfflineDialogue } from "@/lib/offline-dialogue";
import { OfflineDialogueText } from "./offline-dialogue-text";
export const OFFLINE_SCENE_ACTION = "chat-offline-scene-action";
export function requestOfflineSceneAction(element: HTMLElement, action: "archive" | "history" | "clock") {
    element.closest(".chat-room-wrapper")?.dispatchEvent(new CustomEvent(OFFLINE_SCENE_ACTION, { detail: action }));
}
function localTime(value: string) {
    const d = new Date(value); if (!Number.isFinite(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
export function OfflineSceneClock({ sessionId, disabled }: { sessionId: string; disabled?: boolean }) {
    const [paused, setPaused] = useState(false);
    useEffect(() => { const sync = () => setPaused(loadChatOfflineSceneState(sessionId)?.active?.status === "paused"); sync(); window.addEventListener(OFFLINE_SCENE_UPDATED, sync); return () => window.removeEventListener(OFFLINE_SCENE_UPDATED, sync); }, [sessionId]);
    return <button type="button" aria-label={paused ? "本场已暂停，查看时间与状态" : "本场时间与状态"} title={paused ? "暂停 · 待续写" : "本场时间与状态"} data-paused={paused} disabled={disabled} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); requestOfflineSceneAction(e.currentTarget, "clock"); }}><Clock size={15} /></button>;
}
export function OfflineSceneControls({ session, turnCount, generating, getContainer, onArchived, onBusyChange, userName = "我", characterName = "角色" }: {
    session: ChatSession; turnCount: number; generating: boolean; getContainer: () => HTMLElement | null;
    onArchived: () => void; onBusyChange: (busy: boolean) => void; userName?: string; characterName?: string;
}) {
    const [view, setView] = useState<"confirm" | "summary" | "archives" | "clock" | "edit" | null>(null);
    const [draft, setDraft] = useState<OfflineSceneDraft | null>(null);
    const [summary, setSummary] = useState(""); const [title, setTitle] = useState("");
    const [start, setStart] = useState(""); const [end, setEnd] = useState("");
    const [participants, setParticipants] = useState<string[]>([]);
    const roster = loadCharacters().filter(c=>session.participantIds?.includes(c.id));
    const speakers = offlineSpeakerMap(session);
    const [status, setStatus] = useState<"active" | "paused">("active");
    const [busy, setBusy] = useState(false); const [error, setError] = useState("");
    const [archives, setArchives] = useState<ChatOfflineArchive[]>([]);
    const [selected, setSelected] = useState<ChatOfflineArchive | null>(null);
    const request = useRef<AbortController | null>(null); const locked = useRef(false); const saving = useRef(false); const alive = useRef(true);
    const latest = useRef({ generating, turnCount, getContainer }); latest.current = { generating, turnCount, getContainer };
    function refresh() { setArchives(loadChatOfflineSceneState(session.id)?.archives || []); }
    useEffect(() => {
        alive.current = true; ensureChatOfflineScene(session.id, session.contactId); refresh();
        const root = getContainer();
        const open = (event: Event) => {
            if (locked.current || latest.current.generating) return;
            const action = (event as CustomEvent<string>).detail;
            const scene = ensureChatOfflineScene(session.id, session.contactId);
            setError(""); setSelected(null); setStart(localTime(scene.storyStartedAt || scene.startedAt)); setEnd(scene.storyEndedAt ? localTime(scene.storyEndedAt) : ""); setStatus(scene.status || "active");
            if (action === "history") { refresh(); setView("archives"); return; }
            if (action === "clock") { setView("clock"); return; }
            if (!latest.current.turnCount) { setError("本场还没有内容。"); setView("confirm"); return; }
            if (latest.current.getContainer()?.querySelector<HTMLTextAreaElement>(".chat-input-textarea")?.value.trim()) { setError("请先发送或清空输入框里的文字。"); setView("confirm"); return; }
            setView("confirm");
        };
        root?.addEventListener(OFFLINE_SCENE_ACTION, open);
        return () => { alive.current = false; request.current?.abort(); root?.removeEventListener(OFFLINE_SCENE_ACTION, open); onBusyChange(false); };
    // The listener uses live refs so an input rerender cannot cancel a summary request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.id, session.contactId, onBusyChange]);
    function close() {
        if (saving.current) return;
        request.current?.abort(); request.current = null; locked.current = false; setBusy(false); setView(null); setError(""); setSelected(null); onBusyChange(false);
    }
    async function generate() {
        if (locked.current) return;
        try { validateOfflineStoryTime(start, end); } catch(e) { setError((e as Error).message); return; }
        locked.current = true; setBusy(true); setError(""); const controller = new AbortController(); request.current = controller;
        try {
            const result = await summarizeChatOfflineScene(session, controller.signal, start, end);
            if (!alive.current || controller.signal.aborted || request.current !== controller) return;
            setDraft(result); setSummary(result.summary);
        } catch(e) { if (alive.current && !controller.signal.aborted && request.current === controller) setError(e instanceof Error ? e.message : "总结失败，原文已保留。"); }
        finally { if (request.current === controller) { locked.current = false; if (alive.current) setBusy(false); } }
    }
    function beginSummary() {
        if (generating || !turnCount || locked.current) return;
        if (getContainer()?.querySelector<HTMLTextAreaElement>(".chat-input-textarea")?.value.trim()) { setError("请先发送或清空输入框里的文字。"); return; }
        const scene = ensureChatOfflineScene(session.id, session.contactId);
        setDraft({ scene, fingerprint: JSON.stringify(loadChatOfflineTurns(session.id)), summary: "" });
        const spoken = new Set(loadChatOfflineTurns(session.id).flatMap(t=>parseOfflineDialogue(t.assistantContent).filter(p=>p.kind==='dialogue').map(p=>p.kind==='dialogue'?speakers[p.speaker]:'')).filter(Boolean));
        setParticipants(roster.filter(c=>spoken.has(c.id)).map(c=>c.id));
        setTitle(scene.title || ""); setSummary(""); setError(""); setView("summary"); onBusyChange(true);
    }
    async function save() {
        if (locked.current || (!draft && view !== "edit")) return;
        saving.current = true; locked.current = true; setBusy(true); setError("");
        try {
            if (view === "edit" && selected) {
                await editChatOfflineArchive(session, selected, title, summary, start, end || undefined, participants);
                const updated = loadChatOfflineSceneState(session.id)?.archives.find(a => a.id === selected.id);
                setSelected(updated || null); refresh(); setView("archives"); onBusyChange(false);
            } else if (draft) {
                await saveChatOfflineScene(session, draft, title, summary, start, end || undefined, participants);
                if (!alive.current) return;
                setView(null); onBusyChange(false); onArchived();
            }
        } catch(e) { if (alive.current) setError(e instanceof Error ? e.message : "保存失败，原文已保留。"); }
        finally { saving.current = false; locked.current = false; if (alive.current) setBusy(false); }
    }
    function saveClock() {
        try {
            validateOfflineStoryTime(start, end);
            updateChatOfflineScene(session.id, { storyStartedAt: start, storyEndedAt: end || undefined, status }); close();
        } catch(e) { setError((e as Error).message); }
    }
    function editArchive() {
        if (!selected) return;
        setParticipants(selected.participantIds || []); setTitle(selected.title); setSummary(selected.summary); setStart(localTime(selected.storyStartedAt || selected.startedAt)); setEnd(selected.storyEndedAt ? localTime(selected.storyEndedAt) : ""); setView("edit"); onBusyChange(true);
    }
    if (!view) return null;
    const compact = view !== "archives";
    const timeFields = <div className="offline-time-fields"><label>开始时间<input type="datetime-local" aria-label="故事开始时间" required value={start} disabled={busy} onChange={e => setStart(e.target.value)} /></label><label>结束时间（可选）<input type="datetime-local" aria-label="故事结束时间" value={end} disabled={busy} onChange={e => setEnd(e.target.value)} /></label></div>;
    const dialog = <div className={`chat-offline-scenes-dialog ${compact ? "offline-centered" : ""}`} role="dialog" aria-modal="true" aria-label={view === "confirm" ? "结束本次线下" : view === "clock" ? "本场时间与状态" : view === "archives" ? "往期归档" : "归档详情"} onPointerDown={e => e.stopPropagation()}>
        <section className="chat-offline-scenes-sheet">
            <header><strong>{view === "confirm" ? "结束本次线下？" : view === "clock" ? "本场时间与状态" : view === "archives" ? selected?.title || "往期归档" : "归档详情"}</strong><button type="button" disabled={saving.current} aria-label={selected && view === "archives" ? "返回列表" : "关闭"} onClick={selected && view === "archives" ? () => setSelected(null) : close}>{selected && view === "archives" ? "返回" : <X size={18} />}</button></header>
            {view === "confirm" ? <><p>结束后整理整场总结，审阅保存后进入短期记忆并归档。</p>{error ? <p role="alert" className="chat-offline-scenes-error">{error}</p> : null}<footer><button onClick={close}>取消</button><button disabled={!turnCount || !!error} onClick={beginSummary}>结束</button></footer></> : view === "clock" ? <>{timeFields}<div className="offline-state-choices"><button aria-pressed={status === "active"} onClick={() => setStatus("active")}>进行中</button><button aria-pressed={status === "paused"} onClick={() => setStatus("paused")}>暂停 · 待续写</button></div><p>暂停保留本场进度，不将角色锁定在现场。故事时间可手动调整。</p>{error ? <p role="alert" className="chat-offline-scenes-error">{error}</p> : null}<footer><button onClick={close}>取消</button><button onClick={saveClock}>保存</button></footer></> : view === "summary" || view === "edit" ? <>
                <label>标题<input aria-label="归档标题" value={title} disabled={busy} placeholder="给这次见面起个名字" onChange={e => setTitle(e.target.value)} /></label>
                {timeFields}{session.isGroup ? <fieldset className="offline-participants"><legend>本场实际参与者（请核对，只有勾选者接收场次总结）</legend>{roster.map(c=><label key={c.id}><input type="checkbox" checked={participants.includes(c.id)} disabled={busy} onChange={e=>setParticipants(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset> : null}<label>线下总结<textarea aria-label="整场摘要" value={summary} disabled={busy} onChange={e => setSummary(e.target.value)} placeholder={busy ? "正在整理整场经历…" : "直接手写本场总结，也可以点击“生成总结”"} /></label>
                {error ? <p role="alert" className="chat-offline-scenes-error">{error}</p> : null}<footer>{view === "summary" ? <button disabled={busy} onClick={() => void generate()}>{summary.trim() ? "重新生成总结" : "生成总结"}</button> : <button disabled={busy} onClick={() => { setView("archives"); onBusyChange(false); }}>取消</button>}<button disabled={busy || !summary.trim() || !title.trim() || !start} onClick={() => void save()}>{busy ? "处理中…" : "保存"}</button></footer>
            </> : selected ? <>
                <p>{offlineStoryLabel(selected.storyStartedAt || selected.startedAt, selected.storyEndedAt)}</p><div className="offline-archive-summary"><h3>线下总结</h3><div className="chat-offline-archive-text">{selected.summary}</div><button type="button" onClick={editArchive}>{selected.memoryTarget === "short_term" ? "编辑归档与短期总结" : "编辑归档与长期记忆"}</button></div><button type="button" className="offline-archive-delete" onClick={() => {
                    if (!window.confirm("删除这份归档及其原文？对应短期总结会移除，已经提炼的长期记忆会保留。")) return;
                    try { deleteChatOfflineArchive(session.id, selected.id); setSelected(null); setError(""); refresh(); }
                    catch(e) { setError(e instanceof Error ? e.message : "删除失败，请重试。"); }
                }}>删除归档</button>{error ? <p role="alert" className="chat-offline-scenes-error">{error}</p> : null}<h3>原文</h3>
                {selected.turns.map(turn => <article className="chat-offline-archive-turn" key={turn.id}>{turn.userContent ? <><small>{userName}</small><OfflineDialogueText text={turn.userContent} role="user" characterId={session.contactId} speakers={speakers} defaultExpanded={session.collapseBilingualTranslation === false} /></> : null}<small>{characterName}</small><OfflineDialogueText text={turn.assistantContent} role="assistant" characterId={session.contactId} speakers={speakers} defaultExpanded={session.collapseBilingualTranslation === false} /></article>)}
            </> : <>{archives.length ? <div className="offline-archive-list">{[...archives].sort((a,b) => (b.storyStartedAt || b.startedAt).localeCompare(a.storyStartedAt || a.startedAt)).map(a => <button type="button" className="chat-offline-archive-row" key={a.id} onClick={() => setSelected(a)}><Folder size={20} /><span><strong>{a.title}</strong><small>{offlineStoryLabel(a.storyStartedAt || a.startedAt, a.storyEndedAt)}</small></span><ChevronRight size={16} /></button>)}</div> : <p>还没有归档的见面。</p>}</>}
        </section>
    </div>;
    return getContainer() ? createPortal(dialog, getContainer()!) : dialog;
}
