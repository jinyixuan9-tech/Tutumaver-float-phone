"use client";
import {Star,X,Pencil} from 'lucide-react';
import type {CalendarScheduleItem} from '@/lib/calendar-types';
export function CalendarPointDetails({items,onClose,onEdit}:{items:CalendarScheduleItem[];onClose:()=>void;onEdit:(item:CalendarScheduleItem)=>void}){
 return <div className="modal-overlay calendar-edit-modal-overlay" onClick={onClose}><section className="calendar-edit-modal" role="dialog" aria-modal="true" aria-label="定时事项详情" onClick={e=>e.stopPropagation()}>
 <header className="modal-header"><span className="modal-header-title">定时事项{items.length>1?` · ${items.length}项`:''}</span><button type="button" className="modal-header-btn" aria-label="关闭" onClick={onClose}><X size={19}/></button></header>
 <div className="modal-body hide-scrollbar calendar-point-details">{items.map(item=><article key={item.id}><h3><Star size={18} fill="currentColor"/>{item.title}</h3><p>{item.date}　{item.startTime}</p><p>{item.visibility==='public'?'公开':'私人'} · 不占用时间</p>{item.contentDescription&&<div className="calendar-point-description">{item.contentDescription}</div>}<button type="button" className="ui-btn ui-btn-outline" onClick={()=>onEdit(item)}><Pencil size={15}/> 编辑／删除</button></article>)}</div>
 </section></div>;
}
