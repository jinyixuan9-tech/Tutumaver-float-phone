import {kvGet,kvSet,registerKvMigration} from './kv-db';
const KEY='ai_phone_call_first_speaker_v1';registerKvMigration(KEY);
export type CallFirstSpeaker='user'|'character'|'random';
export function loadCallFirstSpeaker(id:string):CallFirstSpeaker{try{const v=JSON.parse(kvGet(KEY)||'{}')[id];return ['user','character','random'].includes(v)?v:'user';}catch{return 'user';}}
export function saveCallFirstSpeaker(id:string,v:CallFirstSpeaker){let values:Record<string,string>={};try{values=JSON.parse(kvGet(KEY)||'{}');}catch{}values[id]=v;kvSet(KEY,JSON.stringify(values));}
export function characterSpeaksFirst(id:string){const v=loadCallFirstSpeaker(id);return v==='character'||v==='random'&&Math.random()<.5;}
