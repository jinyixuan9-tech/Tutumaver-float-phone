import {kvGet,kvSet,registerDynamicPrefix} from './kv-db';
const PREFIX='ai_phone_model_list:';
registerDynamicPrefix(PREFIX);
export function readModelList(id:string):string[]{try{const v=JSON.parse(kvGet(PREFIX+id)||'[]');return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];}catch{return [];}}
export function saveModelList(id:string,models:string[]){kvSet(PREFIX+id,JSON.stringify([...new Set(models.filter((m):m is string=>typeof m==='string'&&!!m.trim()).map(m=>m.trim()))].sort()));if(typeof window!=='undefined')window.dispatchEvent(new Event('model-list-updated'));}
