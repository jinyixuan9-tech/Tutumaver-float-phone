'use client';
import {useEffect,useRef,useState} from 'react';
import {Volume2,Loader2,Square} from 'lucide-react';
import {resolveVoiceConfig,synthesizeSpeech,playAudioBlobViaMediaElement} from '@/lib/tts-service';
import {splitBilingualText} from '@/lib/bilingual-text';
export function AdventureVoice({characterId,text}:{characterId:string;text:string}){
 const [state,setState]=useState<'idle'|'loading'|'playing'>('idle'),[error,setError]=useState('');const stop=useRef<(()=>void)|null>(null),alive=useRef(true),cache=useRef<Blob|null>(null);
 useEffect(()=>{alive.current=true;cache.current=null;return()=>{alive.current=false;stop.current?.();};},[text,characterId]);
 async function play(){if(state==='playing'){stop.current?.();setState('idle');return;}if(state==='loading')return;try{setError('');setState('loading');const cfg=resolveVoiceConfig(characterId,'adventure');if(!cfg)throw new Error('请先给这个角色配置语音音色');const original=splitBilingualText(text)?.original||text;const blob=cache.current||await synthesizeSpeech(original,cfg);if(!blob)throw new Error('语音未返回音频');if(!alive.current)return;cache.current=blob;const player=playAudioBlobViaMediaElement(blob);stop.current=player.abort;setState('playing');await player.promise;}catch(e){if(alive.current)setError(e instanceof Error?e.message:'播放失败');}finally{if(alive.current)setState('idle');}}
 return <span style={{display:'inline-flex',alignItems:'center',flexShrink:0}}><button type="button" aria-label={state==='playing'?'停止角色语音':'播放角色原文'} disabled={state==='loading'} onClick={e=>{e.stopPropagation();void play();}} style={{background:'none',border:0,color:'inherit',padding:4,display:'inline-flex'}}>{state==='loading'?<Loader2 size={16}/>:state==='playing'?<Square size={16}/>:<Volume2 size={16}/>}</button>{error&&<span role="status" style={{fontSize:'calc(11px * var(--app-text-scale,1))'}}>{error}</span>}</span>;
}
