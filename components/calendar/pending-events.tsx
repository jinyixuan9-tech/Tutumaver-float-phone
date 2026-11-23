"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, X } from "lucide-react";
import { loadPendingCalendarGroups, removePendingCalendarGroup, saveAdjustedPendingGroup } from "@/lib/calendar-storage";
import { loadCharacters } from "@/lib/character-storage";

/** Compact toolbar entry; the editor is outside the calendar's scrolling layout. */
export function PendingCalendarEvents() {
  const [groups, setGroups] = useState(loadPendingCalendarGroups);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const refresh = () => setGroups(loadPendingCalendarGroups());
  const close = () => { setOpen(false); button.current?.focus(); };
  useEffect(() => {
    window.addEventListener("calendar-updated", refresh);
    window.addEventListener("calendar-pending-updated", refresh);
    return () => { window.removeEventListener("calendar-updated", refresh); window.removeEventListener("calendar-pending-updated", refresh); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const characters = loadCharacters();
  const name = (id: string) => characters.find(character => character.id === id)?.name || id;
  return <>
    {groups.length > 0 && <button ref={button} type="button" className="calendar-icon-btn calendar-pending-trigger" onClick={() => { setNotice(""); setOpen(true); }} aria-label={`待调整行程，${groups.length} 条`} title={`待调整行程 · ${groups.length} 条`}>
      <CalendarClock size={17}/><span className="calendar-pending-count">{groups.length > 99 ? "99+" : groups.length}</span>
    </button>}
    {open && createPortal(<div className="calendar-pending-overlay" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="calendar-pending-dialog" role="dialog" aria-modal="true" aria-label="待调整行程">
        <header><div><strong>待调整行程</strong><small>{groups.length} 条冲突安排，调整后再保存</small></div><button autoFocus type="button" className="calendar-icon-btn" aria-label="关闭待调整行程" onClick={close}><X size={20}/></button></header>
        <div className="calendar-pending-scroll">
          {notice && <p role="status" className="calendar-pending-notice">{notice}</p>}
          {!groups.length && <p>暂无待调整行程</p>}
          {groups.map(group => {
            const item = group.owners[0]?.item;
            if (!item) return null;
            return <article className="calendar-pending-item" key={group.id}>
              <strong>{item.title}</strong><p>{group.owners.map(owner => name(owner.ownerId)).join("、")}</p>
              <small>与已有安排冲突：{group.conflicts.map(conflict => { let text = conflict; for (const character of characters) text = text.replaceAll(character.id, character.name); return text; }).join("；")}</small>
              <div className="calendar-pending-fields">{(["date", "startTime", "endTime"] as const).map(key => <label key={key}>{key === "date" ? "日期" : key === "startTime" ? "开始时间" : "结束时间"}<input aria-label={key === "date" ? "调整日期" : key === "startTime" ? "调整开始时间" : "调整结束时间"} type={key === "date" ? "date" : "time"} value={item[key]} onChange={event => setGroups(rows => rows.map(row => row.id === group.id ? { ...row, owners: row.owners.map(owner => ({ ...owner, item: { ...owner.item, [key]: event.target.value } })) } : row))}/></label>)}</div>
              <div className="calendar-pending-actions"><button type="button" onClick={() => {
                if (!item.date || item.startTime >= item.endTime) { setNotice("请填写有效日期，结束时间须晚于开始时间。"); return; }
                const result = saveAdjustedPendingGroup(group.id, item); refresh();
                setNotice(result.pending ? "调整后仍与已有安排冲突，请继续修改。" : "已保存到日历。");
              }}>检查并保存</button><button type="button" onClick={() => { removePendingCalendarGroup(group.id); refresh(); setNotice("已删除这条待调整安排"); }}>删除</button></div>
            </article>;
          })}
        </div>
      </section>
    </div>, button.current?.closest(".calendar-app-shell") || document.body)}
  </>;
}
