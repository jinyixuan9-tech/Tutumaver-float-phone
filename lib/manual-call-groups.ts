import {kvGet,kvSet,registerKvMigration} from "./kv-db";
const KEY="ai_phone_manual_call_groups_v1";registerKvMigration(KEY);
export type ManualCallGroup={id:string;sessionId:string;messageIds:string[];callType:"voice"|"video";duration:string};
export function loadManualCallGroups():ManualCallGroup[]{try{const rows=JSON.parse(kvGet(KEY)||"[]");return Array.isArray(rows)?rows.filter(r=>r&&typeof r.id==="string"&&typeof r.sessionId==="string"&&Array.isArray(r.messageIds)):[];}catch{return [];}}
export function saveManualCallGroup(row:ManualCallGroup){const ids=new Set(row.messageIds);if(!ids.size)throw Error("请先选择消息");const old=loadManualCallGroups();if(old.some(g=>g.sessionId===row.sessionId&&g.messageIds.some(id=>ids.has(id))))throw Error("所选消息已在手动通话记录中，请先取消原整理");kvSet(KEY,JSON.stringify([...old,{...row,messageIds:[...ids]}]));}
export function removeManualCallGroup(id:string){kvSet(KEY,JSON.stringify(loadManualCallGroups().filter(g=>g.id!==id)));}
