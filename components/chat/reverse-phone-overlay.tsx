"use client";
import {reconciliations,removeReconciliation,pruneReconciliations,recoverReconciliations} from '@/lib/phone-reconcile';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {activeReverse,subscribeReverse,reverseVisit,reverseVisits,saveReverse,type ReverseVisit} from '@/lib/reverse-phone-state';
import {finishReversePhone,retryReverseFinish,deleteReverseVisit,recoverReversePhone,REVERSE_THOUGHT,grabReversePhone,returnReversePhone} from '@/lib/reverse-phone-runtime';
import {loadCharacters} from '@/lib/character-storage';
import {secretInspections,removeSecretInspectionByAnchor} from '@/lib/secret-phone-inspection';
import {INSPECTION_UPDATED} from '@/lib/phone-inspection-settings';
import {kvGet,kvSet,registerKvMigration} from '@/lib/kv-db';
import {registerBack} from '@/lib/back-navigation';
import {ForwardAvatar} from './forwarded-chat-record';
const POSITION_KEY='rabbit_reverse_thought_position_v1';registerKvMigration(POSITION_KEY);
export function useReverseVisit(){const[v,set]=useState<ReverseVisit|null>(activeReverse);useEffect(()=>subscribeReverse(()=>set(activeReverse())),[]);return v;}
export function ReversePhoneStatus({island=true}:{island?:boolean}){const visit=useReverseVisit(),[open,setOpen]=useState(false),[error,setError]=useState('');useEffect(()=>{setOpen(false);setError('');},[visit?.id]);if(!visit)return null;const c=loadCharacters().find(c=>c.id===visit.owner);const title=`${c?.name||'TA'}正在查看你的手机`;const stop=()=>{setOpen(false);void finishReversePhone(visit.id,true).catch(e=>setError(String(e)));};return <div data-reverse-control="true" className={island?'reverse-status-island':'reverse-status-text'}>
 <button type="button" aria-label={title} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{island&&<ForwardAvatar image={c?.avatar} name={c?.name||'TA'}/>}<span>{title}</span></button>{island&&<button type="button" className="reverse-status-close" aria-label="结束查阅" onClick={()=>setOpen(true)}><X size={13}/></button>}
 {open&&<section className="reverse-status-expanded" role="dialog" aria-label="是否提前结束查阅"><div><strong>{title}</strong><button aria-label="结束查阅" onClick={stop}><X size={16}/></button></div><p>是否提前结束查阅？</p><footer><button onClick={()=>setOpen(false)}>继续查看</button><button onClick={stop}>结束查阅</button></footer></section>}{error&&<p role="alert">{error}</p>}</div>;}
export function ReverseComposerStatus(){const v=useReverseVisit();if(!v)return null;return <div className="reverse-composer-status" data-reverse-control="true"><span>{v.paused?'手机在你手里':v.typingSessionId?'对方正在输入…':'对方正在查看手机…'}</span><button type="button" onClick={v.paused?returnReversePhone:grabReversePhone}>{v.paused?'还给他':'抢回来！'}</button></div>;}
export function ReversePhoneOverlay({islandEnabled=true}:{islandEnabled?:boolean}){
 useEffect(()=>{recoverReversePhone();recoverReconciliations();},[]);const visit=useReverseVisit();
 const [thought,setThought]=useState({thought:'',translation:''}),[pos,setPos]=useState<{x:number;y:number}|null>(()=>{try{return JSON.parse(kvGet(POSITION_KEY)||'null');}catch{return null;}});const thoughtRef=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;left:number;top:number;scale:number}|null>(null);
 useEffect(()=>{setThought({thought:'',translation:''});},[visit?.id]);
 useEffect(()=>{const fn=(e:Event)=>setThought((e as CustomEvent).detail);window.addEventListener(REVERSE_THOUGHT,fn);return()=>window.removeEventListener(REVERSE_THOUGHT,fn);},[]);
 useLayoutEffect(()=>{const el=thoughtRef.current;if(!el)return;const frame=el.parentElement!;const clamp=()=>setPos(old=>({x:Math.max(8,Math.min(old?.x??14,frame.clientWidth-el.offsetWidth-8)),y:Math.max(60,Math.min(old?.y??frame.clientHeight-el.offsetHeight-110,frame.clientHeight-el.offsetHeight-12))}));clamp();const observer=new ResizeObserver(clamp);observer.observe(frame);observer.observe(el);return()=>observer.disconnect();},[!!thought.thought,visit?.id]);
 useEffect(()=>{document.body.dataset.reverseActive=visit?'true':'false';if(!visit)return;const unregister=registerBack(()=>{},()=>true,10000);const block=(e:Event)=>{if(activeReverse()?.paused)return;const target=e.target as Element;if(target.closest('[data-reverse-control]'))return;e.preventDefault();e.stopPropagation();};for(const name of ['pointerdown','click','keydown','wheel'])document.addEventListener(name,block,{capture:true,passive:false});return()=>{unregister();document.body.dataset.reverseActive='false';for(const name of ['pointerdown','click','keydown','wheel'])document.removeEventListener(name,block,true);};},[visit?.id]);
 useEffect(()=>{const deleted=(event:Event)=>{const messages=(event as CustomEvent<{messages:{id:string}[]}>).detail?.messages||[],ids=new Set(messages.map(m=>m.id));for(const r of reconciliations())if(ids.has(r.anchor))removeReconciliation(r.id);for(const secret of secretInspections())if(secret.anchorId&&ids.has(secret.anchorId))removeSecretInspectionByAnchor(secret.anchorId);for(const v of reverseVisits()){
  if(v.removed)continue;if(ids.has(v.anchorId)){deleteReverseVisit(v.id);continue;}
  const linked=v.steps.some(s=>s.messageIds?.some(id=>ids.has(id)))||v.sent.some(s=>s.messageIds.some(id=>ids.has(id)));if(!linked)continue;
  const steps=v.steps.flatMap(s=>{if(!s.messageIds?.some(id=>ids.has(id)))return[s];const remaining=s.messageIds.filter(id=>!ids.has(id));if(!remaining.length)return[];let content=s.content;try{const parsed=JSON.parse(content);if(Array.isArray(parsed))content=JSON.stringify(parsed.filter(m=>!ids.has(m.id)));}catch{}return[{...s,messageIds:remaining,content}];});
  saveReverse({...v,steps,sent:v.sent.map(s=>({...s,messageIds:s.messageIds.filter(id=>!ids.has(id))})).filter(s=>s.messageIds.length),summary:undefined});
 }pruneReconciliations();};window.addEventListener('chat-messages-deleted',deleted);return()=>window.removeEventListener('chat-messages-deleted',deleted);},[]);
 if(!visit)return null;return <div className="reverse-phone-lock">{!islandEnabled&&<ReversePhoneStatus island={false}/>} {thought.thought&&<div ref={thoughtRef} className="reverse-phone-thought" data-reverse-control="true" style={pos?{left:pos.x,top:pos.y}:undefined} onPointerDown={e=>{const el=e.currentTarget,frame=el.parentElement!,bounds=frame.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,left:el.offsetLeft,top:el.offsetTop,scale:bounds.width/frame.clientWidth};el.setPointerCapture(e.pointerId);e.preventDefault();}} onPointerMove={e=>{const d=drag.current,el=e.currentTarget;if(!d)return;const frame=el.parentElement!;setPos({x:Math.max(8,Math.min(d.left+(e.clientX-d.x)/d.scale,frame.clientWidth-el.offsetWidth-8)),y:Math.max(60,Math.min(d.top+(e.clientY-d.y)/d.scale,frame.clientHeight-el.offsetHeight-12))});}} onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(pos)kvSet(POSITION_KEY,JSON.stringify(pos));}} onPointerCancel={()=>{drag.current=null;}}><p>{thought.thought}</p>{thought.translation&&<p className="translation">{thought.translation}</p>}</div>}{visit.error&&<div className="reverse-phone-error" data-reverse-control="true" role="alert">{visit.error}<button onClick={returnReversePhone}>重试</button><button onClick={()=>void finishReversePhone(visit.id,true)}>结束查阅</button></div>}</div>;
}
export function ReversePhoneRecord({id}:{id:string}){
 const [,render]=useState(0),[expanded,setExpanded]=useState(false);
 useEffect(()=>{
  const refresh=()=>render(n=>n+1);
  const unsub=subscribeReverse(refresh);
  window.addEventListener(INSPECTION_UPDATED,refresh);
  return()=>{unsub();window.removeEventListener(INSPECTION_UPDATED,refresh);};
 },[]);
 const secret=id.startsWith('secret-')?secretInspections().find(r=>r.id===id):undefined;
 const visit=secret?undefined:reverseVisit(id);
 if(!secret&&!visit)return <span className="reverse-record">反查记录已删除</span>;
 if(secret?.removed||visit?.removed)return <span className="reverse-record">反查记录已删除</span>;
 const started=secret?secret.at:Date.parse(visit!.startedAt);
 const ended=secret?secret.endedAt:(visit?.endedAt?Date.parse(visit.endedAt):0);
 const steps=secret?.steps||visit?.steps||[];
 const label=secret?'偷偷查看手机':visit?.origin==='requested'?'TA申请查看手机':'你邀请TA查看手机';
 const endedText=secret?'偷偷查看已结束':visit?.stopped?'你提前结束了查看':'TA结束了查看';
 const time=(n:number)=>Number.isFinite(n)&&n>0?new Date(n).toLocaleString():'';
 return <div className="reverse-record">
  <button type="button" onClick={()=>setExpanded(x=>!x)}>{ended?endedText:label+'开始'} · {expanded?'收起':'查看记录'}</button>
  {expanded&&<div>
    <p>{label}开始 · {time(started)}</p>
    {[...new Set(steps.map(step=>step.label))].map((stepLabel,i)=><p key={i}>查看：{stepLabel}</p>)}
    {!steps.length&&<p>尚无实际读取的记录</p>}
    {ended>0&&<p>{endedText} · {time(ended)}</p>}
    {secret?.error&&<p>部分查看未完成：{secret.error}</p>}
    {visit?.finishError&&<p role="alert">查阅已结束，结束回复未生成：{visit.finishError}<button onClick={()=>void retryReverseFinish(visit.id)}>重试结束回复</button></p>}
  </div>}
 </div>;
}

export function ReconciliationRecord({id}:{id:string}){const [,render]=useState(0),[open,setOpen]=useState(false);useEffect(()=>{const fn=()=>render(n=>n+1);window.addEventListener('phone-reconcile-updated',fn);return()=>window.removeEventListener('phone-reconcile-updated',fn);},[]);const row=reconciliations().find(r=>r.id===id);if(!row||row.removed)return <span>对账记录已删除</span>;const chars=loadCharacters();const name=(id:string)=>chars.find(c=>c.id===id)?.name||'角色';return <div className="reverse-record"><button onClick={()=>setOpen(x=>!x)}>{name(row.actor)}{row.state==='running'?'正在和':'和'}{name(row.peer)}对账 · {open?'收起':'查看'}</button>{row.state==='error'&&<p>对账中断，已保留实际发出的部分。</p>}{open&&row.lines.map(l=><p key={l.id}>{name(l.speaker)}：{l.text}</p>)}</div>;}
