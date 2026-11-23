const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const assert=require('node:assert/strict');
(async()=>{
 const db=new Map(),messages=[],updated=[];
 const permission={secret:true,proactive:false,nextAt:1,dailyLimit:1,minDays:2,maxDays:8,cooldownHours:8,allowedApps:{chat:false,moments:false,shopping:false,icity:false,reading:false,browser:true}};
 const stubs={
  './icity-store':{loadCity:()=>({}),cityEntries:()=>[]},
  './kv-db':{kvGet:k=>db.get(k)||null,kvSet:(k,v)=>db.set(k,v),registerKvMigration:()=>{}},
  './phone-inspection-settings':{inspectionPermissions:()=>({char1:permission}),inspectionPermission:()=>permission,nextInspectionAt:()=>1000000000000,saveInspectionPermission:()=>{},INSPECTION_UPDATED:'inspection-update',inspectionAppAllowed:(_,app)=>app==='browser'},
  './chat-storage':{loadChatSessions:()=>[],loadChatContacts:()=>[],loadChatMessages:()=>[],getChatMessagePreview:()=>'',createOrGetSession:()=>({id:'session-char1'}),pushChatMessage:m=>{const row={...m,id:'anchor-1'};messages.push(row);return row},updateChatMessage:(id,patch)=>updated.push({id,patch})},
  './reverse-phone-state':{hiddenChats:()=>[],activeReverse:()=>null,liveReverseStep:step=>step.label+':'+step.content},
  './moments-storage':{loadMomentPosts:()=>[],loadAllMomentComments:()=>[]},
  './shopping-storage':{loadShoppingState:()=>({})},
  './browser-collection':{loadBrowserCollection:()=>({history:['saved-search'],items:[{id:'v1',title:'saved item'}],favorites:[],opened:[]})},
  './reading-storage':{loadBooks:()=>[],hydrateReadingStorage:async()=>{},loadProgress:async()=>{},loadChapters:async()=>[]},
 };
 const source=fs.readFileSync('lib/secret-phone-inspection.ts','utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in stubs,'unexpected import '+n);return stubs[n]},window:{dispatchEvent:()=>{}},Event:class{constructor(type){this.type=type}},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}},Date,Math,JSON,Map,Set,Error,console});
 await exports.tickSecretInspections(10000000000);
 const rows=exports.secretInspections();
 assert.equal(rows.length,1);
 assert.equal(messages.length,1);
 assert.equal(messages[0].mediaType,'app_card');
 assert.equal(messages[0].role,'system');
 assert.equal(rows[0].anchorId,messages[0].id);
 assert.ok(rows[0].endedAt>0);
 assert.ok(rows[0].steps.some(step=>step.app==='browser'));
 assert.equal(updated.length,1);
 assert.equal(exports.secretInspectionProjectionEntries('char1').length,1);
 exports.removeSecretInspectionByAnchor(messages[0].id);
 assert.equal(exports.secretInspectionProjectionEntries('char1').length,0);
 assert.equal(exports.secretInspectionMemory('char1').length,0);
 assert.equal(exports.secretInspections()[0].removed,true);
 assert.equal(exports.secretInspectionProjectionEntries('someone-else').length,0);
 const timeline=fs.readFileSync('lib/checkphone-storage.ts','utf8');
 const shared=fs.readFileSync('lib/short-term-assembler.ts','utf8');
 assert.ok(timeline.includes('...secretInspectionProjectionEntries(characterId)'));
 assert.ok(shared.includes('msg.mediaData?.appName === "reverse_phone"'));
 const overlay=fs.readFileSync('components/chat/reverse-phone-overlay.tsx','utf8');
 assert.ok(overlay.includes('removeSecretInspectionByAnchor(secret.anchorId)'));
 console.log('PASS: secret inspection card, start/end, short-term projection and Chat deletion revocation');
})().catch(e=>{console.error(e);process.exitCode=1});
