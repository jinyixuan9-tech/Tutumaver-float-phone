'use client';
import {useRef,useState} from 'react';
import {RotateCcw} from 'lucide-react';
import {saveOfflineMusicIcon,type OfflineMusicTheme} from '@/lib/offline-music-icon';
import {saveChatImageToIndexedDB} from '@/lib/chat-asset-storage';

export function OfflineMusicIconSetting(){
 const input=useRef<HTMLInputElement>(null);
 const theme=useRef<OfflineMusicTheme>('day');
 const [error,setError]=useState('');
 const restore=()=>{saveOfflineMusicIcon(undefined,'day');saveOfflineMusicIcon(undefined,'night');setError('');};
 return <div className="menu-item offline-icon-setting" style={{alignItems:'center',gap:8}}>
  <div className="menu-label-group min-w-0"><span className="menu-label">音乐悬浮窗图标</span>{error&&<span role="alert" className="menu-desc">{error}</span>}</div>
  <div className="menu-right offline-icon-actions" style={{display:'flex',alignItems:'center',gap:6,flexShrink:0,flexWrap:'nowrap'}}>
   {(['day','night'] as const).map(t=><button key={t} type="button" style={{fontSize:'calc(12.6px * var(--app-text-scale, 1))',whiteSpace:'nowrap'}} onClick={()=>{theme.current=t;input.current?.click();}}>替换{t==='day'?'日间':'夜间'}</button>)}
   <button type="button" title="恢复日夜默认音乐图标" aria-label="恢复日夜默认音乐图标" onClick={restore} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',padding:4,minWidth:26,minHeight:26}}><RotateCcw size={15}/></button>
  </div>
  <input hidden ref={input} type="file" accept="image/*" onChange={async e=>{const file=e.target.files?.[0],selected=theme.current;e.target.value='';if(!file)return;try{if(file.size>5*1024*1024)throw Error('请选择 5MB 内的图片');saveOfflineMusicIcon('asset://'+await saveChatImageToIndexedDB(file),selected);setError('');}catch(err){setError(err instanceof Error?err.message:'保存失败');}}}/>
 </div>;
}
