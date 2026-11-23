'use client';
import {useRef,useState} from 'react';
import type {ChatMessage} from '@/lib/chat-storage';
import {SnapshotDialog} from './shared-app-card';
import {WEV_OPEN_CHAT_LIVE} from '@/lib/weverse-live-collaboration';
export function WeverseReplayCard({message}:{message:ChatMessage}) {
 const snapshot=message.mediaData?.weverseReplaySnapshot,button=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
 if(!snapshot)return null;
 return <><article className="ii-wvs-card"><div className="ii-wvs-cover">{snapshot.coverUrl?<img src={snapshot.coverUrl} alt="回放封面"/>:<span className="ii-wvs-cover-empty">WVS</span>}<span className="ii-wvs-cover-tag">REPLAY</span></div><h3>{snapshot.hostName} 的直播间</h3><p>直播回放</p><div className="ii-wvs-actions"><button ref={button} onClick={e=>{e.stopPropagation();setOpen(true);}}>查看回放</button></div></article>{open&&<SnapshotDialog anchor={button.current} appId="weverse" name="WVS" onClose={()=>setOpen(false)} onNavigate={()=>{setOpen(false);window.dispatchEvent(new CustomEvent(WEV_OPEN_CHAT_LIVE,{detail:snapshot.liveId}));}}><h3>{snapshot.title}</h3><p>{snapshot.summary}</p>{snapshot.segments?.map((segment,i)=><article className="ii-snapshot-comment" key={i}><p>{segment.original}</p>{segment.translated&&segment.translated!==segment.original&&<p className="ii-snapshot-translation">{segment.translated}</p>}</article>)}</SnapshotDialog>}</>;
}
