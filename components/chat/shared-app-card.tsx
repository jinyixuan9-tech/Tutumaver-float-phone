'use client';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {type ChatMessage} from '@/lib/chat-storage';
import {loadChatNightMode} from '@/lib/chat-appearance';
import {sharedApp,SHARED_APPS,novelSnapshot,type SharedApp} from '@/lib/shared-snapshot';
import {IconGlyph} from '@/components/icon-glyph';
import type {IconId} from '@/lib/desktop-config';
import {getChatImageFromIndexedDB} from '@/lib/chat-asset-storage';
import {loadMediaObjectUrl} from '@/lib/media-cache-storage';
import {navigateToSnapshotSource,type SnapshotTarget} from '@/lib/shared-snapshot-navigation';
import {BrowserVideoSnapshotContent} from '@/components/browser/browser-video-snapshot';
import {useAppBack} from '@/lib/back-navigation';

const SNAPSHOT_ICONS:Partial<Record<IconId,string>>={"twitter": "https://imgbed.heliar.top/i/FdWtGlkMqDorCth6_X%EF%BC%88%E5%89%8D%E8%BA%AB%E4%B8%BATwitter%EF%BC%89-iOS-1024x1024.png", "novel": "https://imgbed.heliar.top/i/W1r11rQlF5hy09UI_Narrative_%20Novel%20Writing%20App-iOS-1024x1024.png", "diary": "https://imgbed.heliar.top/i/GE53Gc86ZPAuPrW3_iCity%20%C2%B7%20%E6%88%91%E7%9A%84%E6%97%A5%E8%AE%B0-iOS-1024x1024.png", "xiaohongshu": "https://imgbed.heliar.top/i/OxJ7C-G7HzRkb28J_rednote-iOS-1024x1024.png", "question_box": "https://imgbed.heliar.top/i/eiv7Mh1kLgOegDpX_%E8%BD%BB%E5%8C%BF%E6%8F%90%E9%97%AE%E7%AE%B1-iOS-1024x1024.png", "theqoo": "https://imgbed.heliar.top/i/TfzNYS17fDAApkni_file_0000000015608230b7f8b03128a7d594.png"};
function AppIcon({appId}:{appId:IconId}) {const url=SNAPSHOT_ICONS[appId];return url?<img src={url} alt=""/>:<IconGlyph id={appId}/>;}
export function SnapshotImage({reference,description}:{reference?:string;description?:string}) {
 const [url,setUrl]=useState('');
 useEffect(()=>{let alive=true;setUrl('');if(!reference)return;const read=async()=>{if(/^(https?:|data:|blob:|\/)/.test(reference))return reference;if(reference.startsWith('asset://'))return getChatImageFromIndexedDB(reference.slice(8));return await getChatImageFromIndexedDB(reference).catch(()=>null)||await loadMediaObjectUrl(reference).catch(()=>null);};void read().then(value=>{if(alive)setUrl(value||'');});return()=>{alive=false;};},[reference]);
 if(reference?.startsWith('text://'))return <p className="ii-snapshot-text-image">{decodeURIComponent(reference.slice(7))}</p>;
 return <>{url&&<img className="ii-snapshot-photo" src={url} alt={description||'快照配图'}/ >}{description&&<p className="ii-snapshot-description">{description}</p>}</>;
}
function Text({original,translated}:{original?:string;translated?:string}){return <><p>{original}</p>{translated&&translated!==original&&<div className="ii-snapshot-translation"><small>译文</small><p>{translated}</p></div>}</>;}
function SnapshotContent({message,app}:{message:ChatMessage;app:SharedApp}) {
 const d=message.mediaData;
 if(app==='browser'&&d?.browserVideoSnapshot)return <BrowserVideoSnapshotContent snapshot={d.browserVideoSnapshot}/>;
 if(app==='x'&&d?.twitterPostSnapshot){const p=d.twitterPostSnapshot;return <><div className="ii-snapshot-author"><strong>{p.name}</strong><small>@{p.handle} · {new Date(p.createdAt).toLocaleString()}</small></div><Text original={p.original} translated={p.translated}/>{(p.imageRefs?.length?p.imageRefs:[p.imageRef]).map((ref,i)=><SnapshotImage key={i} reference={ref} description={i===0?p.imageDescription:undefined}/>)}{!!p.comments?.length&&<h4>评论 {p.comments.length}</h4>}{p.comments?.map(c=><article className="ii-snapshot-comment" key={c.id}><strong>{c.name} · @{c.handle}</strong><Text original={c.original} translated={c.translated}/></article>)}</>;}
 if(app==='theqoo'&&d?.theqooSnapshot){const p=d.theqooSnapshot;return <><div className="ii-snapshot-post-title"><Text original={p.titleOriginal} translated={p.titleTranslated}/></div><Text original={p.bodyOriginal} translated={p.bodyTranslated}/>{p.imageRef&&<SnapshotImage reference={p.imageRef}/ >}{p.images?.map(image=><div key={image.id}>{image.kind==='text'?<Text original={image.originalText} translated={image.translatedText}/>:<SnapshotImage reference={image.mediaRef}/>}</div>)}{!!p.comments.length&&<h4>评论 {Math.min(10,p.comments.length)}</h4>}{p.comments.slice(0,10).map((c,i)=><article className="ii-snapshot-comment" key={c.id}><strong>匿名用户 {i+1}</strong><Text original={c.original} translated={c.translated}/></article>)}</>;}
 if(app==='icity'&&d?.cityDiarySnapshot){const p=d.cityDiarySnapshot;return <><small>@{p.handle}</small>{p.title&&<h3>{p.title}</h3>}<Text original={p.text} translated={p.translation}/>{p.photos?.map((ref,i)=><SnapshotImage reference={ref} description={p.photoDescriptions?.[i]} key={i}/>)}</>;}
 if(app==='question'&&d?.questionBoxSnapshot){const p=d.questionBoxSnapshot;return <><small>匿名提问</small><h3>{p.question}</h3>{p.answer&&<><h4>{p.answer.name}的回答</h4><Text original={p.answer.original} translated={p.answer.translated}/></>}</>;}
 if(app==='novel'){const p=novelSnapshot(message);return p?<><h3>{p.title}</h3><small>{p.author}</small><h4>{p.chapter}</h4><Text original={p.text} translated={p.zh}/>{p.note&&<p>用户附言：{p.note}</p>}{p.comments?.map(c=><article className="ii-snapshot-comment" key={c.id}><strong>{c.author}</strong><Text original={c.text} translated={c.zh}/></article>)}</>:<p>这条旧分享没有保存章节正文。</p>;}
 return <><div className="ii-snapshot-author"><strong>{d?.xiaohongshuAuthor}</strong></div><h3>{d?.xiaohongshuTitle}</h3><p>{d?.xiaohongshuBody}</p><SnapshotImage reference={d?.xiaohongshuImageAssetId} description={d?.xiaohongshuDescription}/><small>{d?.xiaohongshuTags?.map(t=>'#'+t).join(' ')}</small>{d?.xiaohongshuComments?.slice(0,5).map(c=><article className="ii-snapshot-comment" key={c.id}><strong>{c.authorName}</strong>{c.replyTo&&<small>回复 {c.replyTo}</small>}<p>{c.text}</p></article>)}</>;
}
export function SnapshotDialog({anchor,appId,name,onClose,onNavigate,children,navigationLabel,hideNavigation=false,iconReference}:{anchor:HTMLElement|null;appId:IconId;name:string;onClose:()=>void;onNavigate:()=>void;children:ReactNode;navigationLabel?:string;hideNavigation?:boolean;iconReference?:string}) {
 const modal=useRef<HTMLElement>(null),[bounds,setBounds]=useState<CSSProperties>({inset:12}),[dark,setDark]=useState(loadChatNightMode);
 const parent=anchor?.closest('.chat-room-wrapper') as HTMLElement|null;
 const target=parent||anchor?.closest('.phone-screen') as HTMLElement|null;
 const host=target||document.body;
 useLayoutEffect(()=>{
  function measure(){
   const outer=host.getBoundingClientRect(),head=parent?.querySelector('[data-ui="header"]')?.getBoundingClientRect(),input=parent?.querySelector('[data-ui="input"]')?.getBoundingClientRect();
   setBounds({position:target?'absolute':'fixed',top:Math.max(12,(head?.bottom||outer.top)-outer.top+8),bottom:Math.max(12,outer.bottom-(input?.top||outer.bottom)+8),left:12,right:12});
   setDark(parent?.closest('.chat-app')?.getAttribute('data-chat-theme')==='dark'||loadChatNightMode());
  }
  measure();const observer=new ResizeObserver(measure);observer.observe(host);for(const selector of ['[data-ui="header"]','[data-ui="input"]']){const element=parent?.querySelector(selector);if(element)observer.observe(element);}window.addEventListener('resize',measure);modal.current?.querySelector<HTMLButtonElement>('button')?.focus();
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);anchor?.focus();};
 },[host,parent,target,anchor]);
 useAppBack(onClose,()=>true,65);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();if(event.key==='Tab'){const focusable=Array.from(modal.current?.querySelectorAll<HTMLElement>('button,[tabindex="0"]')||[]);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[onClose]);
 return createPortal(<div className="ii-snapshot-mask" style={bounds} data-theme={dark?'dark':'light'} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose();}}><section className="ii-snapshot-modal" ref={modal} role="dialog" aria-modal="true" aria-label={`${name} Shared Snapshot`}><header className="ii-snapshot-heading"><span className="ii-snapshot-app-icon">{iconReference?<img src={iconReference} alt=""/>:<AppIcon appId={appId}/>}</span><div><strong>{name}</strong><small>分享时保存的快照</small></div><button className="ii-snapshot-close" onClick={onClose} aria-label="关闭快照">×</button></header><div className="ii-snapshot-scroll" tabIndex={0}>{children}</div>{!hideNavigation&&<footer className="ii-snapshot-footer"><button onClick={onNavigate}>{navigationLabel||`前往 ${name}`}</button></footer>}</section></div>,host);
}
export function SharedAppCard({message}:{message:ChatMessage}) {
 const app=sharedApp(message);const [open,setOpen]=useState(false),[notice,setNotice]=useState('');const button=useRef<HTMLButtonElement>(null);
 if(!app)return null;const info=SHARED_APPS[app],d=message.mediaData;
 const source=():SnapshotTarget|null=>{
  if(app==='browser'&&d?.browserVideoSnapshot&&d.browserVideoSnapshot.source==='user')return {appId:'browser',id:d.browserVideoSnapshot.id};
  if(app==='x'&&d?.twitterPostSnapshot)return {appId:'twitter',id:d.twitterPostSnapshot.id};
  if(app==='theqoo'&&d?.theqooSnapshot)return {appId:'theqoo',id:d.theqooSnapshot.id};
  if(app==='icity'&&d?.cityDiarySnapshot?.id)return {appId:'diary',id:d.cityDiarySnapshot.id};
  if(app==='novel'){const p=novelSnapshot(message);if(p)return {appId:'novel',id:p.chapterId,parentId:p.bookId};}
  if(app==='question'&&d?.questionBoxSnapshot)return {appId:'question_box',id:d.questionBoxSnapshot.questionId,parentId:d.questionBoxSnapshot.boxId};
  if(app==='xiaohongshu'&&d?.xiaohongshuNoteId)return {appId:'xiaohongshu',id:d.xiaohongshuNoteId};
  return null;
 };
 const label=app==='browser'?'打开原 App':app==='novel'?'查看原章节':app==='icity'?'查看原日记':app==='question'?'查看原问题':'查看原帖';
 const navigate=()=>{const target=source();if(!target){setNotice('这条旧分享没有保存原内容位置，仍可阅读快照。');return;}setOpen(false);navigateToSnapshotSource(target);};
 return <><button ref={button} className="ii-share-card" data-share-app={app} onClick={e=>{e.stopPropagation();setNotice('');setOpen(true);}}><span className="ii-share-art">{app==='browser'?<img src="/browser-ph-share.webp" alt=""/>:<AppIcon appId={info.appId}/>}</span><span className="ii-share-copy"><strong>Shared from {info.name}</strong><small>Tap to view</small></span></button>{open&&<SnapshotDialog anchor={button.current} appId={info.appId} name={info.name} onClose={()=>setOpen(false)} onNavigate={navigate} navigationLabel={label} hideNavigation={app==='browser'&&d?.browserVideoSnapshot?.source==='role'} iconReference={d?.browserVideoSnapshot?.icon}><SnapshotContent message={message} app={app}/>{notice&&<p role="status">{notice}</p>}</SnapshotDialog>}</>;
}
