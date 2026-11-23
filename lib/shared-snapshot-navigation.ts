import {useEffect,useRef} from 'react';
import type {IconId} from './desktop-config';
export type SnapshotTarget={appId:IconId;id:string;parentId?:string};
const KEY='chat-snapshot-navigation-v1';
const EVENT='chat-snapshot-navigation';
/** Queue before opening so a newly mounted app cannot miss its target. */
export function navigateToSnapshotSource(target:SnapshotTarget){
 sessionStorage.setItem(KEY,JSON.stringify(target));
 window.dispatchEvent(new CustomEvent('open-app',{detail:{appId:target.appId}}));
 window.setTimeout(()=>window.dispatchEvent(new Event(EVENT)),0);
}
export function useSnapshotNavigation(appId:IconId,onOpen:(target:SnapshotTarget)=>void,enabled=true){
 const callback=useRef(onOpen);callback.current=onOpen;
 useEffect(()=>{if(!enabled)return;const consume=()=>{let target:SnapshotTarget;try{target=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return;}if(!target||target.appId!==appId)return;sessionStorage.removeItem(KEY);callback.current(target);};consume();window.addEventListener(EVENT,consume);return()=>window.removeEventListener(EVENT,consume);},[appId,enabled]);
}
