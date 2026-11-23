"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, X } from "lucide-react";
import { theqooPostLanguage, type TheqooPost, type TheqooTranslationMode } from "@/lib/theqoo-storage";
import { isMediaStoreRef, loadMediaObjectUrl } from "@/lib/media-cache-storage";
import { getChatImageFromIndexedDB } from "@/lib/chat-asset-storage";
import styles from "./theqoo-snapshot.module.css";

function SnapshotImage({ assetId }: { assetId: string }) {
  const [url,setUrl]=useState("");
  useEffect(()=>{let alive=true;let result="";(async()=>{result=(isMediaStoreRef(assetId)?await loadMediaObjectUrl(assetId):await getChatImageFromIndexedDB(assetId))||"";if(alive)setUrl(result);})();return ()=>{alive=false;if(result.startsWith("blob:"))URL.revokeObjectURL(result);};},[assetId]);
  return url?<img className={styles.image} src={url} alt="帖子配图"/>:null;
}

export function TheqooSnapshotWindow({ snapshot, onClose }: { snapshot: TheqooPost & {translationMode:TheqooTranslationMode; translationEnabled?:boolean}, onClose:()=>void }) {
  const parent=typeof document!=="undefined" ? document.querySelector(".phone-shell") || document.body : null;
  if(!parent)return null;
  const japanese=theqooPostLanguage(snapshot)==="ja";
  const category=japanese?({"뉴스":"ニュース","정보":"情報","생활":"生活","잡담":"雑談","유머":"ユーモア","뷰티":"美容","영화·방송":"映画・番組","아이돌":"アイドル"} as Record<string,string>)[snapshot.category]||snapshot.category:snapshot.category;
  const chinese=snapshot.translationEnabled===false||snapshot.translationMode==="chinese";
  const anonymous=japanese?"名無し":"무명의 더쿠";
  const content=(original:string,translated:string)=><><div className={styles.original}>{chinese?translated:original}</div>{!chinese&&(snapshot.translationMode==="repost"||snapshot.translationMode==="folded")&&<div className={styles.repost}>{translated}</div>}</>;
  return createPortal(<div className={styles.scrim} onClick={event=>{event.stopPropagation();onClose();}}><section role="dialog" aria-modal="true" aria-label="Theqoo 帖子快照" className={styles.window} onClick={e=>e.stopPropagation()}><header className={styles.header}><b>theqoo</b><button onClick={onClose} aria-label="关闭"><X size={20}/></button></header><div className={styles.scroll}><div className={styles.category}>{category} · {anonymous}</div><h3>{content(snapshot.titleOriginal,snapshot.titleTranslated)}</h3><div className={styles.body}>{content(snapshot.bodyOriginal,snapshot.bodyTranslated)}{[...(snapshot.imageRef?[{id:`legacy_${snapshot.id}`,kind:"generated" as const,mediaRef:snapshot.imageRef}]:[]),...(snapshot.images||[])].map(image=><div key={image.id} className={styles.imageWrap}>{image.kind==="text"?<div className={styles.textImage}>{chinese?image.translatedText||image.originalText:image.originalText}{!chinese&&(snapshot.translationMode==="repost"||snapshot.translationMode==="folded")&&<div className={styles.repost}>{image.translatedText||image.originalText}</div>}</div>:image.mediaRef?<SnapshotImage assetId={image.mediaRef}/>:null}</div>)}</div><div className={styles.commentsHead}>{japanese?"コメント":"댓글"} {snapshot.comments.length}</div>{snapshot.comments.map((comment,i)=><div className={styles.comment} key={comment.id}><strong>{i+1}. {anonymous}</strong>{content(comment.original,comment.translated)}</div>)}</div><footer className={styles.footer}><span>发送时的帖子快照</span><button onClick={()=>{sessionStorage.setItem("theqoo-open-post",snapshot.id);onClose();window.dispatchEvent(new CustomEvent("open-app",{detail:{appId:"theqoo"}}));}}>查看原帖 <ArrowUpRight size={16}/></button></footer></section></div>,parent);
}
