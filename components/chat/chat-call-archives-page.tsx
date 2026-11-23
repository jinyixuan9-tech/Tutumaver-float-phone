"use client";
import { useState } from "react";
import { Archive, Check, ChevronRight, Pencil, Phone, Trash2, Video, X } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Toggle } from "@/components/ui/form";
import { deleteCallArchive, isAutoCallArchive, loadCallArchives, renameCallArchive, setAutoCallArchive, type CallArchive } from "@/lib/chat-call-archives";

export function ChatCallArchivesPage({ sessionId, onClose }: {sessionId: string; onClose: () => void}) {
  const [automatic, setAutomatic] = useState(() => isAutoCallArchive(sessionId));
  const [entries, setEntries] = useState(() => loadCallArchives(sessionId));
  const [tab, setTab] = useState<"voice" | "video">("voice");
  const [selected, setSelected] = useState<CallArchive | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const refresh = () => setEntries(loadCallArchives(sessionId));
  const dateFormat = (timestamp: number) => new Date(timestamp).toLocaleString("zh-CN", { year:"numeric", month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" });
  return <div className="absolute inset-0 z-[110] bg-[var(--c-page-body-bg)]">
    <PageShell title="通话记录" onBack={onClose}>
      <div className="page-menu chat-info-menu">
        <div className="menu-group">
          <div className="menu-item">
            <div className="menu-label-group min-w-0"><span className="menu-label">自动归档</span><span className="menu-desc">通话结束后保存文字，不保存声音或视频</span></div>
            <div className="menu-right shrink-0"><Toggle checked={automatic} onChange={value => {setAutomatic(value); setAutoCallArchive(sessionId,value);}} /></div>
          </div>
        </div>
        <div className="mx-4 mt-4 mb-2 grid grid-cols-2 gap-2 text-[length:var(--font-size-sm,14px)]">
          {(["voice","video"] as const).map(kind=><button key={kind} type="button" className={`ui-btn min-w-0 ${tab===kind?"ui-btn-primary":""}`} onClick={()=>setTab(kind)}>{kind==="voice"?"语音通话":"视频通话"} ({entries.filter(a=>a.kind===kind).length})</button>)}
        </div>
        <div className="menu-group">
          {entries.filter(a=>a.kind===tab).map(entry=><button type="button" key={entry.id} className="menu-item min-w-0" onClick={()=>{setSelected(entry);setEditing(false);}}>
            <span className="shrink-0">{entry.kind==="video"?<Video size={18}/>:<Phone size={18}/>}</span>
            <div className="menu-label-group min-w-0 flex-1"><span className="menu-label block truncate">{entry.title}</span><span className="menu-desc block truncate">{dateFormat(entry.date)} · {entry.duration||"未知时长"}</span></div>
            <div className="menu-right shrink-0"><ChevronRight size={16}/></div>
          </button>)}
          {entries.every(a=>a.kind!==tab)&&<p className="px-4 py-5 text-center menu-desc">暂无归档</p>}
        </div>
      </div>
      {selected&&<div className="modal-overlay settings-prompt-overlay voice-feature-overlay" onClick={()=>setSelected(null)}>
        <section className="modal-dialog settings-prompt-dialog voice-feature-dialog flex flex-col min-w-0" role="dialog" aria-modal="true" aria-label="通话归档内容" onClick={e=>e.stopPropagation()} style={{maxHeight:"min(80dvh,620px)",width:"min(calc(100% - 32px),440px)",overflow:"hidden"}}>
          <header className="settings-dialog-heading flex items-center gap-2 min-w-0">
            {editing?<input className="ui-input min-w-0 flex-1" value={title} maxLength={100} onChange={e=>setTitle(e.target.value)} aria-label="归档标题"/>:<h3 className="min-w-0 flex-1 truncate">{selected.title}</h3>}
            {editing?<button type="button" aria-label="保存标题" onClick={()=>{renameCallArchive(selected.id,title);refresh();setSelected({...selected,title:title.trim()||selected.title});setEditing(false);}}><Check size={19}/></button>:<button type="button" aria-label="修改标题" onClick={()=>{setTitle(selected.title);setEditing(true);}}><Pencil size={18}/></button>}
            <button type="button" aria-label="删除归档" onClick={()=>{if(window.confirm("删除这份归档？原通话不会删除。")){deleteCallArchive(selected.id);refresh();setSelected(null);}}}><Trash2 size={18}/></button>
            <button type="button" aria-label="关闭" onClick={()=>setSelected(null)}><X size={19}/></button>
          </header>
          <p className="menu-desc">{dateFormat(selected.date)} · {selected.duration||"未知时长"}</p>
          <div className="min-h-0 flex-1 overflow-y-auto py-3 space-y-3 text-[length:var(--chat-message-font-size,inherit)]">
            {selected.lines.map(line=><div key={line.id} className="whitespace-pre-wrap break-words">
              <span className="font-semibold">{line.speaker}：</span>
              <span className={line.action?"menu-desc italic":""}>{line.text}</span>
            </div>)}
          </div>
        </section>
      </div>}
    </PageShell>
  </div>;
}
