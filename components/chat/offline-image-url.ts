'use client';
import {useEffect,useState} from 'react';
import {getChatImageFromIndexedDB} from '@/lib/chat-asset-storage';
export function useOfflineImageUrl(ref?:string){const [url,setUrl]=useState('');useEffect(()=>{let live=true;setUrl('');if(ref?.startsWith('asset://'))void getChatImageFromIndexedDB(ref.slice(8)).then(v=>{if(live)setUrl(v||'');});else setUrl(ref||'');return()=>{live=false;};},[ref]);return url;}
