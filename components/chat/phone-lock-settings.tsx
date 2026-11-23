'use client';
import { useState, useEffect } from 'react';
import { LockKeyhole, ChevronRight } from 'lucide-react';
import { Toggle } from '@/components/ui/form';
import { hashPhonePin, loadPhoneLock, savePhoneLock } from '@/lib/phone-lock';
import { getChatImageFromIndexedDB, saveChatImageToIndexedDB } from '@/lib/chat-asset-storage';
function LockWallpaperThumb({imageRef}:{imageRef:string}){const [url,setUrl]=useState('');useEffect(()=>{let alive=true;setUrl('');if(imageRef)void getChatImageFromIndexedDB(imageRef).then(value=>{if(alive)setUrl(value||'');});return()=>{alive=false;};},[imageRef]);return <span className="lock-wallpaper-thumb">{url?<img src={url} alt="锁屏壁纸预览"/>:<LockKeyhole size={18}/>}</span>;}
export function PhoneLockSettings() { const [c, setC] = useState(loadPhoneLock), [open, setOpen] = useState(false), [pin, setPin] = useState(''), [confirm, setConfirm] = useState(''), [notice, setNotice] = useState(''); return <><div className="menu-group"><button type="button" className="menu-item w-full" onClick={() => setOpen(true)}><LockKeyhole size={20} className="text-[var(--c-icon)]"/><div className="menu-label-group"><span className="menu-label">手机锁屏</span><span className="menu-desc">启用锁屏、设置密码与壁纸</span></div><span className="menu-right"><ChevronRight size={16}/></span></button></div>{open && <div className="modal-overlay" onClick={() => setOpen(false)}><div className="modal-dialog lock-settings-dialog" onClick={e => e.stopPropagation()}><div className="lock-settings-head"><strong>手机锁屏</strong><button onClick={() => setOpen(false)} aria-label="关闭">×</button></div><div className="lock-settings-body"><label>启用锁屏<Toggle checked={c.enabled} onChange={v => { const n = { ...c, enabled: v }; setC(n); savePhoneLock(n); }}/></label><input className="ui-input" type="password" inputMode="numeric" placeholder="新密码（4–8位数字）" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}/><input className="ui-input" type="password" inputMode="numeric" placeholder="再次输入密码" value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}/><button className="ui-btn ui-btn-primary" onClick={async () => { if (!/^\d{4,8}$/.test(pin) || pin !== confirm) {
    setNotice('请输入相同的4–8位数字密码');
    return;
} const n = { ...c, pinHash: await hashPhonePin(pin), pinLength: pin.length }; savePhoneLock(n); setC(n); setPin(''); setConfirm(''); setNotice('密码已保存，下次启动生效'); }}>保存密码</button><button className="ui-btn ui-btn-ghost" onClick={() => { const n = { ...c, pinHash: '' }; savePhoneLock(n); setC(n); setNotice('已清除密码'); }}>清除密码</button><label className="lock-wallpaper-picker"><LockWallpaperThumb imageRef={c.wallpaper}/><span>{c.wallpaper ? '更换锁屏壁纸' : '上传锁屏壁纸'}</span><ChevronRight size={16}/><input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f)
    return; try {
    const id = await saveChatImageToIndexedDB(f);
    const n = { ...c, wallpaper: id };
    savePhoneLock(n);
    setC(n);
    setNotice('壁纸已保存');
}
catch {
    setNotice('壁纸保存失败');
} }}/></label>{c.wallpaper && <button className="ui-btn ui-btn-ghost" onClick={() => { const n = { ...c, wallpaper: '' }; savePhoneLock(n); setC(n); }}>恢复默认壁纸</button>}<p className="ts-12 opacity-65">“取消”退一位；“紧急情况”可直接进入。锁屏不加密本机数据。</p><p role="status">{notice}</p></div></div></div>}</>; }
