"use client";
import {useEffect,useState} from 'react';
import {DraggableMediaWindow} from './ui/draggable-media-window';
import {getWvsBackground,WVS_BACKGROUND} from '@/lib/weverse-background';
import {loadWeverseState,WEV_UPDATED_EVENT} from '@/lib/weverse-storage';
export function LiveBackgroundWindows({onOpen}:{onOpen:(app:'weverse',id:string)=>void}){
 const [wvs,setWvs]=useState(()=>loadWeverseState().lives.find(l=>l.id===getWvsBackground()&&!l.official&&l.status==='live'));
 useEffect(()=>{const sync=()=>setWvs(loadWeverseState().lives.find(l=>l.id===getWvsBackground()&&!l.official&&l.status==='live'));window.addEventListener(WVS_BACKGROUND,sync);window.addEventListener(WEV_UPDATED_EVENT,sync);return()=>{window.removeEventListener(WVS_BACKGROUND,sync);window.removeEventListener(WEV_UPDATED_EVENT,sync);};},[]);
 return <>{wvs&&<DraggableMediaWindow label="返回 WVS 直播" initialTop={330} onOpen={()=>onOpen('weverse',wvs.id)} style={{backgroundImage:`url(${wvs.coverUrl||''})`,backgroundSize:'cover',backgroundPosition:'center'}}><span className="call-mini-window-overlay"/><span className="call-mini-window-name">WVS · LIVE</span></DraggableMediaWindow>}</>;
}
