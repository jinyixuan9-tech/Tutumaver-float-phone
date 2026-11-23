'use client';
import {useEffect,useRef,useState} from 'react';
import {getChatImageFromIndexedDB,saveChatImageToIndexedDB} from '@/lib/chat-asset-storage';
import {DEFAULT_TEXT_IMAGE_MASK,loadTextImageMask,saveTextImageMask,TEXT_IMAGE_MASK_UPDATED} from '@/lib/text-image-mask';

/** Shared with Chat, Moments, Lysn, X, iCity and any other TextImage instances. */
export function TextImageMaskSetting(){
 const input=useRef<HTMLInputElement>(null);
 const [reference,setReference]=useState(loadTextImageMask);
 const [preview,setPreview]=useState(DEFAULT_TEXT_IMAGE_MASK);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState('');
 useEffect(()=>{const refresh=()=>setReference(loadTextImageMask());window.addEventListener(TEXT_IMAGE_MASK_UPDATED,refresh);return()=>window.removeEventListener(TEXT_IMAGE_MASK_UPDATED,refresh);},[]);
 useEffect(()=>{let active=true;if(reference.startsWith('asset://')){setPreview(DEFAULT_TEXT_IMAGE_MASK);void getChatImageFromIndexedDB(reference.slice(8)).then(src=>{if(active)setPreview(src||DEFAULT_TEXT_IMAGE_MASK);}).catch(()=>{if(active)setPreview(DEFAULT_TEXT_IMAGE_MASK);});}else setPreview(reference);return()=>{active=false;};},[reference]);
 async function upload(file?:File){
   if(!file)return;
   if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){setNotice('请选择 PNG、JPG、WebP 或 GIF 图片。');return;}
   if(file.size>8*1024*1024){setNotice('图片不能超过 8MB。');return;}
   setSaving(true);setNotice('');
   try{
     const id=await saveChatImageToIndexedDB(file);
     await saveTextImageMask('asset://'+id);
     setReference('asset://'+id);
     setNotice('已替换小手机内的文字图遮罩。');
   }catch(e){setNotice(e instanceof Error?'上传失败：'+e.message:'图片上传失败，请重试。');}
   finally{setSaving(false);}
 }
 async function reset(){
   setSaving(true);setNotice('');
   try{await saveTextImageMask();setReference(DEFAULT_TEXT_IMAGE_MASK);setNotice('已恢复默认文字图遮罩。');}
   catch(e){setNotice(e instanceof Error?'恢复失败：'+e.message:'恢复失败，请重试。');}
   finally{setSaving(false);}
 }
 return <section className="settings-option-group text-image-mask-setting">
   <div className="ai-media-row text-image-mask-heading"><span>自定义文字图遮罩<small className="menu-desc settings-row-description">所有应用统一使用，已生成的真实图片不受影响</small></span></div>
   <div className="text-image-mask-preview"><img src={preview} alt="当前文字图遮罩预览"/><span>当前遮罩预览</span></div>
   <div className="text-image-mask-buttons">
     <button className="ui-btn ui-btn-outline" type="button" disabled={saving} onClick={()=>input.current?.click()}>{saving?'保存中…':'上传图片'}</button>
     <button className="ui-btn ui-btn-outline" type="button" disabled={saving||reference===DEFAULT_TEXT_IMAGE_MASK} onClick={()=>void reset()}>恢复默认</button>
   </div>
   <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label="上传文字图遮罩" onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';void upload(file);}}/>
   {notice&&<p className="menu-desc ai-media-note" role="status">{notice}</p>}
 </section>;
}
