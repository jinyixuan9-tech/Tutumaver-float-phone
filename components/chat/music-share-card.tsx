'use client';
import {useEffect,useRef,useState} from 'react';
import {type ChatMessage,loadChatMessages,syncSharedMusicPosition} from '@/lib/chat-storage';
import {bindMusicCard} from '@/lib/music-card-data';
import {getMusicControlBridge} from '@/lib/music-control-bridge';
import {useMusicPlayerOptional} from '@/lib/music-context';
import type {MusicTrack} from '@/lib/music-storage';

export function MusicShareCard({msg}:{msg:ChatMessage}) {
 const player=useMusicPlayerOptional();
 const [track,setTrack]=useState<MusicTrack|null>(null),[error,setError]=useState('');
 const [draft,setDraft]=useState<number|null>(null);
 const frozen=useRef(msg.mediaData?.musicLastPosition||0),lastDuration=useRef(msg.mediaData?.musicDuration||0);
 const operation=useRef(0),wasActive=useRef(false);
 useEffect(()=>{let alive=true;void bindMusicCard(msg).then(t=>{if(alive)setTrack(t);});return()=>{alive=false;operation.current++;};},[msg.id]);
 const id=track?.id||msg.mediaData?.musicTrackId;
 const active=!!id&&player?.currentTrack?.id===id;
 if(active){frozen.current=player.currentTime;lastDuration.current=player.duration||track?.duration||lastDuration.current;}
 else if(wasActive.current){
  const saved=loadChatMessages(msg.sessionId).find(m=>m.id===msg.id)?.mediaData;
  frozen.current=saved?.musicLastPosition??frozen.current;
  lastDuration.current=saved?.musicDuration||lastDuration.current;
 }
 wasActive.current=!!active;
 const playing=!!active&&!!player?.isPlaying;
 const duration=active?(player.duration||track?.duration||lastDuration.current):(lastDuration.current||track?.duration||0);
 const position=draft??frozen.current;
 const time=(n:number)=>`${Math.floor(Math.max(0,n)/60)}:${String(Math.floor(Math.max(0,n)%60)).padStart(2,'0')}`;
 const ensure=async()=>track||await bindMusicCard(msg);
 const play=async()=>{
  const token=++operation.current;setError('');
  const t=await ensure(),bridge=getMusicControlBridge();if(token!==operation.current)return;
  if(!t||!bridge){setError('暂时无法播放这首歌');return;}
  const state=bridge.getState();
  if(state.currentTrack?.id===t.id){bridge.setSingleTrackPlayback();if(state.isPlaying)bridge.pause();else{if(state.duration>0&&state.currentTime>=state.duration)bridge.seek(0);bridge.resume();}return;}
  const saved=loadChatMessages(msg.sessionId).find(m=>m.id===msg.id)?.mediaData?.musicLastPosition??frozen.current;
  const result=await bridge.playTrack(t,{single:true,startAt:saved});
  if(token!==operation.current)return;
  if(result.ok&&bridge.getState().currentTrack?.id===t.id)bridge.seek(saved);
  else setError(result.message||'暂时无法播放这首歌');
 };
 const seek=async(target:number)=>{
  const token=++operation.current,t=await ensure(),bridge=getMusicControlBridge();
  if(token!==operation.current)return;
  if(!t||!bridge){setDraft(null);setError('暂时无法调整歌曲进度');return;}
  if(bridge.getState().currentTrack?.id!==t.id){syncSharedMusicPosition(t.id,target,duration);frozen.current=target;setDraft(null);return;}
  if(token===operation.current&&bridge.getState().currentTrack?.id===t.id){bridge.seek(target);frozen.current=target;}
  setDraft(null);
 };
 return <div className="chat-music-share-card" data-music-bound={id?'true':'false'} data-playing={playing?'true':'false'}>
  <div className="chat-music-share-body">
   <div className="chat-music-share-vinyl" aria-hidden="true"/>
   <button className="chat-music-share-cover" type="button" onClick={e=>{e.stopPropagation();void play();}} aria-label={`${playing?'暂停':'播放'}${track?.title||msg.mediaData?.musicTitle||'歌曲'}`}>
    {(track?.coverUrl||msg.mediaData?.musicCoverUrl)&&<img src={track?.coverUrl||msg.mediaData?.musicCoverUrl} alt="专辑封面"/>}
   </button>
   <div className="chat-music-share-info"><span className="chat-music-share-title">{track?.title||msg.mediaData?.musicTitle||'未知歌曲'}</span><span className="chat-music-share-artist">{track?.artist||msg.mediaData?.musicArtist||''}</span></div>
   <input className="chat-music-card-seek" type="range" min="0" max={duration||1} step="0.1" value={Math.min(position,duration||1)} disabled={!id||!duration} aria-label="歌曲播放进度" onClick={e=>e.stopPropagation()} onChange={e=>setDraft(Number(e.target.value))} onPointerUp={e=>{e.stopPropagation();void seek(Number(e.currentTarget.value));}} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key))void seek(Number(e.currentTarget.value));}} onPointerCancel={()=>setDraft(null)}/>
  </div>
  <div className="chat-music-share-footer"><span>{time(position)}</span><span>{time(duration||0)}</span></div>
  {error&&<small className="chat-music-card-error" role="status">{error}</small>}
 </div>;
}
