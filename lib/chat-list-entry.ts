import {kvGet,kvSet,registerKvMigration} from './kv-db';
const KEY='rabbit_removed_chat_entries_v1';registerKvMigration(KEY);
export function removedChatEntries():string[]{try{return JSON.parse(kvGet(KEY)||'[]')}catch{return []}}
function save(ids:string[]){kvSet(KEY,JSON.stringify(ids));if(typeof window!=='undefined')window.dispatchEvent(new Event('chat-list-entries-updated'))}
/** Only the list entry changes. Messages, offline turns and contacts are untouched. */
export function removeChatListEntry(id:string){save([...new Set([...removedChatEntries(),id])])}
export function restoreChatListEntry(id:string){const ids=removedChatEntries();if(ids.includes(id))save(ids.filter(x=>x!==id))}
