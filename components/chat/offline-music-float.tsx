'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Search,Pause,Play,X,Check} from 'lucide-react';
import {loadAllTracks,type MusicTrack} from '@/lib/music-storage';
import {isNeteaseConfigured,searchNetease,type NeteaseSearchResult} from '@/lib/music-service';
import {getMusicControlBridge} from '@/lib/music-control-bridge';
import {useMusicPlayerOptional} from '@/lib/music-context';
import {saveOfflineStoryMusic} from '@/lib/offline-music-state';
import {loadOfflineMusicIcon,defaultOfflineMusicIcon} from '@/lib/offline-music-icon';
import {useOfflineImageUrl} from './offline-image-url';
const time=(s:number)=>`${Math.floor(Math.max(0,s)/60)}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;
export function OfflineMusicFloat({sessionId}:{sessionId:string}){
 const [expanded,setExpanded]=useState(false),[searchOpen,setSearchOpen]=useState(false);
 const [host,setHost]=useState<HTMLElement|null>(null),[pos,setPos]=useState({x:12,y:84}),[bounds,setBounds]=useState({w:390,h:700});
 const [local,setLocal]=useState<MusicTrack[]>([]),[results,setResults]=useState<NeteaseSearchResult[]>([]),[search,setSearch]=useState('');
 const [tab,setTab]=useState<'local'|'online'>('local'),[chosen,setChosen]=useState<MusicTrack|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [iconRef,setIconRef]=useState(loadOfflineMusicIcon);
 const [dark,setDark]=useState(false);const icon=useOfflineImageUrl(iconRef);const player=useMusicPlayerOptional();
 useEffect(()=>{const element=document.querySelector<HTMLElement>('.chat-room-wrapper[data-offline-notes="true"]');setHost(element);if(!element)return;
  const measure=()=>{const w=element.clientWidth,h=element.clientHeight;setBounds({w,h});const header=element.querySelector<HTMLElement>('header[data-ui="header"]');const back=header?.querySelector<HTMLElement>('button');const right=header?.querySelector<HTMLElement>('.page-header-right');const rootRect=element.getBoundingClientRect();const rect=header?.getBoundingClientRect();const left=Math.max(10,(back?.getBoundingClientRect().left||rootRect.left+12)-rootRect.left);const edge=right?.getBoundingClientRect().right;setPos({x:left,y:Math.max(70,(rect?.bottom||rootRect.top+76)-rootRect.top+8)});if(edge&&edge>rootRect.left)element.style.setProperty('--offline-music-right',`${Math.max(10,rootRect.right-edge)}px`);};measure();const ro=new ResizeObserver(measure);ro.observe(element);
  const root=element.closest('.chat-app');const syncTheme=()=>setDark(root?.getAttribute('data-chat-theme')==='dark');syncTheme();const mo=new MutationObserver(syncTheme);if(root)mo.observe(root,{attributes:true,attributeFilter:['data-chat-theme']});
  const refresh=()=>{void loadAllTracks().then(setLocal).catch(()=>setError('本地音乐加载失败'));};refresh();window.addEventListener('focus',refresh);
  return()=>{ro.disconnect();mo.disconnect();window.removeEventListener('focus',refresh);};
 },[sessionId]);
 useEffect(()=>{const refresh=()=>setIconRef(loadOfflineMusicIcon(dark?'night':'day'));refresh();window.addEventListener('offline-music-icon-updated',refresh);return()=>window.removeEventListener('offline-music-icon-updated',refresh);},[dark]);
 const searchOnline=async()=>{if(!search.trim())return;setBusy(true);setError('');try{const r=await searchNetease(search.trim(),20);setResults(r);if(!r.length)setError('没有搜索到歌曲');}catch{setError('搜索失败，请重试');}finally{setBusy(false);}};
 const chooseOnline=(r:NeteaseSearchResult)=>setChosen({id:`netease_${r.id}`,title:r.name,artist:r.artists,duration:r.duration/1000,coverUrl:r.coverUrl,liked:false,addedAt:new Date().toISOString()});
 const play=async(mode:'bg'|'story')=>{if(!chosen||busy)return;const bridge=getMusicControlBridge();if(!bridge){setError('播放器尚未就绪');return;}setBusy(true);setError('');try{const result=await bridge.playTrack(chosen,{single:true});if(!result.ok){setError(result.message);return;}saveOfflineStoryMusic(sessionId,mode==='story'?(result.track||chosen):null);setSearchOpen(false);}catch(e){setError(e instanceof Error?e.message:'播放失败');}finally{setBusy(false);}};
 if(!host)return null;
 const track=player?.currentTrack;const left=pos.x, panelTop=pos.y+86;
 const panelHeight=Math.max(80,Math.min(420,bounds.h-panelTop-100));
 return createPortal(<div className="offline-music-v2 offline-music-fixed" data-theme={dark?'dark':'light'}>
 <div className="offline-music-strip" data-open={expanded} aria-hidden={!expanded} inert={!expanded} style={{left,top:pos.y,right:'var(--offline-music-right,12px)'}}>
 <div className="offline-music-info"><strong>{track?.title||'还没有音乐'}</strong><small>{track?.artist||'点击放大镜添加音乐'}</small></div>
 <button type="button" aria-label={player?.isPlaying?'暂停':'播放'} disabled={!track} onClick={()=>{const b=getMusicControlBridge();if(b?.getState().isPlaying)b.pause();else b?.resume();}}>{player?.isPlaying?<Pause size={18}/>:<Play size={18}/>}</button>
 <button type="button" aria-label="展开音乐搜索" aria-expanded={searchOpen} onClick={()=>setSearchOpen(v=>!v)}><Search size={18}/></button>
 <div className="offline-music-progress"><small>{time(player?.currentTime||0)}</small><input aria-label="音乐播放进度" type="range" min={0} max={player?.duration||1} step={1} value={Math.min(player?.currentTime||0,player?.duration||1)} disabled={!player?.duration} onChange={e=>getMusicControlBridge()?.seek(Number(e.target.value))}/><small>{time(player?.duration||0)}</small></div>
 </div>
 <button type="button" className="offline-music-anchor" style={{left:left+6,top:pos.y+12}} aria-label="音乐，点击展开收起" aria-expanded={expanded} onClick={()=>{setExpanded(v=>!v);setSearchOpen(false);}}><img src={icon||defaultOfflineMusicIcon(dark?'night':'day')} alt="音乐" draggable={false}/></button>
 <section role="dialog" aria-label="选择线下音乐" className="offline-music-library" data-open={expanded&&searchOpen} aria-hidden={!expanded||!searchOpen} inert={!expanded||!searchOpen} style={{left,top:panelTop,right:'var(--offline-music-right,12px)',maxHeight:panelHeight}}>
 <div className="offline-music-search"><Search size={16}/><input aria-label="音乐搜索" value={search} placeholder="搜索歌曲或歌手" onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&tab==='online')void searchOnline();}}/>{tab==='online'&&<button type="button" disabled={busy||!search.trim()||!isNeteaseConfigured()} onClick={()=>void searchOnline()}>搜索</button>}<button type="button" aria-label="关闭选歌" onClick={()=>setSearchOpen(false)}><X size={16}/></button></div>
 <div className="offline-music-tabs"><button type="button" aria-pressed={tab==='local'} onClick={()=>setTab('local')}>本地音乐</button><button type="button" aria-pressed={tab==='online'} onClick={()=>setTab('online')}>在线搜索</button></div>
 <div className="offline-music-list">{tab==='local'?(local.filter(t=>`${t.title} ${t.artist}`.toLowerCase().includes(search.toLowerCase())).map(t=><button type="button" key={t.id} aria-pressed={chosen?.id===t.id} onClick={()=>setChosen(t)}><span><strong>{t.title}</strong><small>{t.artist}</small></span>{chosen?.id===t.id&&<Check size={16}/>}</button>)):results.map(t=><button type="button" key={t.id} aria-pressed={chosen?.id===`netease_${t.id}`} onClick={()=>chooseOnline(t)}><span><strong>{t.name}</strong><small>{t.artists}</small></span>{chosen?.id===`netease_${t.id}`&&<Check size={16}/>}</button>)}{tab==='local'&&!local.length&&<p>请先在音乐 APP 上传本地歌曲</p>}{tab==='online'&&<p>{!isNeteaseConfigured()?'请先配置音乐 API':busy?'正在搜索…':results.length?'':'搜索歌曲或歌手'}</p>}</div>
 {error&&<p role="alert">{error}</p>}
 <div className="offline-music-actions"><button type="button" disabled={!chosen||busy} onClick={()=>void play('bg')}>设为背景音</button><button type="button" disabled={!chosen||busy} onClick={()=>void play('story')}>发送给 TA</button></div>
 </section>
 </div>,host);
}
