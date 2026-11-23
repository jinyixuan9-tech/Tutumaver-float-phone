require('fake-indexeddb/auto');const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),Dexie=require('dexie');
const local=new Map(),events=[];
const context={exports:{},require:n=>n==='dexie'?Dexie:require(n),Map,Set,Promise,Date,console,CustomEvent,window:{dispatchEvent:e=>events.push(e)},localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k),get length(){return local.size},key:i=>[...local.keys()][i]}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/kv-db.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
(async()=>{const db=new Dexie('AiPhoneKvDB');db.version(1).stores({entries:'key'});await db.table('entries').put({key:'characters',value:'IMPORTANT'});
const api=context.exports;api.registerKvMigration('characters');api.kvSet('characters','[]');await api.hydrateKvDb();assert(api.isKvHydrated());assert.equal(api.kvGet('characters'),'IMPORTANT','startup default must not overwrite disk');assert.equal((await db.table('entries').get('characters')).value,'IMPORTANT');
const recovery=new Dexie('AiPhoneRecoveryDB');recovery.version(1).stores({snapshots:'id,createdAt'});assert.equal((await recovery.table('snapshots').get('float-1.0.1')).entries[0].value,'IMPORTANT');
await api.kvSetAsync('characters','NEW');assert.equal((await db.table('entries').get('characters')).value,'NEW');
// Late legacy migration does not delete the only surviving bytes on failed commit.
const proto=Object.getPrototypeOf(Object.getPrototypeOf(db.table('entries')));const put=proto.put;proto.put=function(...args){if(this.db.name==='AiPhoneKvDB')return Promise.reject(new Error('simulated quota'));return put.apply(this,args)};
local.set('late','SURVIVOR');api.registerKvMigration('late');await new Promise(r=>setTimeout(r,20));assert.equal(local.get('late'),'SURVIVOR');assert(events.length);proto.put=put;
api.kvSet('characters','FINAL');await api.flushKvWrites();assert.equal((await db.table('entries').get('characters')).value,'FINAL');
console.log('PASS: startup write blocked until hydration, existing IndexedDB survives, pre-update checkpoint, async persistence, failed migration retains legacy bytes and raises alert, flush writes.');db.close();recovery.close();})().catch(e=>{console.error(e);process.exitCode=1});
