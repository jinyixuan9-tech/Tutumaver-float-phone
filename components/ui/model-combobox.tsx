'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,Check} from 'lucide-react';
import {readModelList} from '@/lib/model-list-cache';
/** Draft queries never mutate the configured model; only selection/explicit confirmation commits. */
export function ModelCombobox({apiId,value,onChange,compact=false}:{apiId:string;value:string;onChange:(id:string)=>void;compact?:boolean}){
 const [draft,setDraft]=useState(value),[models,setModels]=useState<string[]>(()=>readModelList(apiId)),[open,setOpen]=useState(false),[all,setAll]=useState(false),[active,setActive]=useState(-1);
 const root=useRef<HTMLDivElement>(null);const id=useId();
 useEffect(()=>{setDraft(value);setOpen(false);setActive(-1);},[apiId,value]);
 useEffect(()=>{const refresh=()=>setModels(readModelList(apiId));refresh();window.addEventListener('model-list-updated',refresh);return()=>window.removeEventListener('model-list-updated',refresh);},[apiId]);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)){setOpen(false);setActive(-1);}};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 const filtered=models.filter(m=>all||m.toLowerCase().includes(draft.trim().toLowerCase()));
 const commit=(v:string)=>{if(!v.trim())return;onChange(v.trim());setDraft(v.trim());setOpen(false);setActive(-1);};
 return <div ref={root} className={'model-combobox'+(compact?' is-compact':'')}>
 <div className="model-combobox-field"><input className="ui-input" role="combobox" aria-label="模型 ID 或搜索关键词" aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={active>=0?`${id}-${active}`:undefined} value={draft} placeholder="输入模型 ID 或关键词" onFocus={()=>{setAll(true);setOpen(true);}} onChange={e=>{setDraft(e.target.value);setAll(false);setOpen(true);setActive(-1);}} onKeyDown={e=>{if(e.key==='Escape'){setDraft(value);setOpen(false);}if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,filtered.length-1));}if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,i-1));}if(e.key==='Enter'){e.preventDefault();if(active>=0&&filtered[active])commit(filtered[active]);else if(models.includes(draft.trim()))commit(draft);}}}/><button type="button" aria-label="展开全部模型" aria-expanded={open} onClick={()=>{setOpen(!(open&&all));setAll(true);setActive(-1);}}><ChevronDown size={16}/></button></div>
 {open&&<div className="model-combobox-options" id={id} role="listbox">{filtered.length?filtered.map((m,i)=><button type="button" role="option" aria-selected={m===value} id={`${id}-${i}`} key={m} className={i===active?'is-active':''} onClick={()=>commit(m)}><span>{m}</span>{m===value&&<Check size={14}/>}</button>):<p>{models.length?'没有匹配项，可确认完整模型 ID':'尚无已拉取的模型，可手动确认完整 ID'}</p>}</div>}
 {draft.trim()!==value&&draft.trim()&&<button type="button" className="model-combobox-confirm" onClick={()=>commit(draft)}>确认使用此模型 ID</button>}
 </div>;
}
