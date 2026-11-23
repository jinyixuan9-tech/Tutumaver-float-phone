'use client';
import {useState} from 'react';
import {loadCharacters} from '@/lib/character-storage';
import {resolveChatCharacterDisplayName} from '@/lib/chat-profile-storage';
import {GroupShareTargets} from '@/components/chat/group-share-targets';
import {AppDialog} from '@/components/social/app-dialog';
export function ChatSharePicker({title,onSelect,onClose}:{title:string;onSelect:(target:string)=>void;onClose:()=>void}){const [query,setQuery]=useState('');return <AppDialog title={title} onClose={onClose}><input className="ui-input" aria-label="搜索分享对象" placeholder="搜索角色" value={query} onChange={e=>setQuery(e.target.value)}/><div className="browser-share-targets">{loadCharacters().filter(c=>resolveChatCharacterDisplayName(c).toLowerCase().includes(query.toLowerCase())).map(c=><button type="button" key={c.id} onClick={()=>onSelect(c.id)}>{resolveChatCharacterDisplayName(c)}</button>)}</div><GroupShareTargets onSelect={onSelect}/></AppDialog>;}
