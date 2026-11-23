'use client';
import {useEffect,useMemo,useRef} from 'react';
import {SkipBack,SkipForward,Play,Pause,RotateCcw,Music2} from 'lucide-react';
import {useMusicPlayerOptional} from '@/lib/music-context';
import {parseVinylLyrics,activeVinylLyric} from '@/lib/vinyl-lyrics';
import './vinyl-lyrics-widget.css';
export function VinylLyricsWidget(){
 const player=useMusicPlayerOptional(),track=player?.currentTrack,playing=player?.isPlaying===true;
 const lines=useMemo(()=>parseVinylLyrics(track?.lyrics||''),[track?.lyrics]);const active=activeVinylLyric(lines,player?.currentTime||0);
 const viewport=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null);
 useEffect(()=>{const view=viewport.current,content=list.current;if(!view||!content)return;const align=()=>{const row=content.children[Math.max(0,active)] as HTMLElement|undefined;if(!row)return;view.scrollTo({top:Math.max(0,row.offsetTop-view.clientHeight/2+row.clientHeight/2),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})};align();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(align);observer.observe(view);observer.observe(content);return()=>observer.disconnect()},[active,track?.id,lines]);
 const open=()=>window.dispatchEvent(new CustomEvent('open-app',{detail:{appId:'music'}}));
 const plain=track?.lyrics?.replace(/\[[^\]]*\]/g,'').trim();
 return <section className="vlw" aria-label="黑胶歌词音乐组件" data-playing={playing}>
 {track?.coverUrl&&<img className="vlw-backdrop" src={track.coverUrl} alt="" aria-hidden="true"/>}<div className="vlw-shade"/>
 <div className="vlw-left"><button className="vlw-song" onPointerDown={e=>e.stopPropagation()} onClick={open} title={track?`${track.title} · ${track.artist}`:'打开音乐APP'}><span>{track?.title||'尚未播放'}</span><span>{track?.artist||'打开音乐，选择一首歌'}</span></button>
 <div className="vlw-lyrics" ref={viewport} aria-label="滚动歌词"><div className="vlw-lines" ref={list}>{lines.length?lines.map((line,i)=><div className="vlw-line" data-active={i===active} key={`${line.time}-${i}`}>{line.text}</div>):<div className="vlw-empty">{track?(plain||'暂无歌词'):'让音乐陪你一会儿'}</div>}</div></div>
 <div className="vlw-controls" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}><button aria-label="上一首" disabled={!track||!player} onClick={()=>player?.prev()}><SkipBack/></button><button aria-label={playing?'暂停':'播放'} onClick={()=>track?player?.togglePlay():open()}>{playing?<Pause/>:<Play/>}</button><button aria-label="下一首" disabled={!track||!player} onClick={()=>player?.next()}><SkipForward/></button><button aria-label="从头重播" disabled={!track||!player} onClick={()=>{player?.seek(0);player?.resume()}}><RotateCcw/></button></div></div>
 <button className="vlw-turntable" onPointerDown={e=>e.stopPropagation()} onClick={open} aria-label="打开音乐APP"><span className="vlw-disc"><span className="vlw-label">{track?.coverUrl?<img src={track.coverUrl} alt="专辑封面"/>:<Music2 aria-hidden="true"/>}</span></span><svg className="vlw-arm" viewBox="0 0 28 100" aria-hidden="true"><circle cx="19" cy="9" r="6"/><path d="M19 12v54L6 85" fill="none" stroke="currentColor" strokeWidth="4"/><path d="m3 80 9 6-5 9-9-6z"/></svg></button>
 </section>
}
