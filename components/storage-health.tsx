'use client';
import {flushPendingChatMessages} from "@/lib/chat-db";
import {useEffect,useState} from 'react';
import {flushKvWrites} from '@/lib/kv-db';
export function StorageHealth(){const [error,setError]=useState('');useEffect(()=>{const fail=()=>setError('本地保存未完成。请勿清除数据或卸载，先重试保存或导出备份。');window.addEventListener('local-storage-failure',fail);void navigator.storage?.persist?.().catch(()=>false);return()=>window.removeEventListener('local-storage-failure',fail);},[]);return error?<div role="alert" style={{position:'fixed',bottom:20,left:12,right:12,zIndex:30000,background:'#fff3d8',color:'#372900',padding:14,borderRadius:16,fontFamily:'inherit',fontSize:'calc(13px * var(--app-text-scale,1))'}}>{error}<button onClick={()=>void Promise.all([flushKvWrites(),flushPendingChatMessages()]).then(()=>setError('')).catch(()=>setError('仍未保存成功，请先从数据管理导出备份。'))}>重试保存</button></div>:null;}
