const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict'),Module=require('module');
const root=process.cwd(),cache=new Map();let memories=[],native=[],saved=[],counter=0,watermark='2026-10-01T00:00:00Z',calls=[],vector=null;
const config={autoSummarizeEnabled:true,summarizationEventInterval:4,longTermTokenBudget:50,shortTermAllowedSources:{},vectorRecallEnabled:true,maxLongTermEntries:100};
const kv={registerKvMigration(){},registerDynamicPrefix(){},kvKeysWithPrefix:p=>[...cache.keys()].filter(k=>k.startsWith(p)),kvGet:k=>cache.get(k)||null,kvSet:(k,v)=>cache.set(k,v),kvRemove:k=>cache.delete(k)};
const mocks={
 'kv-db':kv,
 'character-storage':{loadCharacters:()=>[{id:'a',name:'A'},{id:'b',name:'B'}]},
 'llm-prompt-assembler':{formatChatTimestamp:t=>t},
 'memory-storage':{loadMemoryConfig:()=>config,loadMemoryEntries:async()=>memories,loadMemoryEntriesByType:async(id,type)=>memories.filter(m=>m.type===type),saveMemoryEntry:async e=>saved.push(e),deleteMemoryEntries:async()=>{},getEventCounter:()=>4,resetEventCounter:()=>counter++,getLastSummarizedTimestamp:()=>watermark,setLastSummarizedTimestamp:(id,v)=>watermark=v,incrementCoreMemoryCounter(){}},
 'settings-storage':{resolveAuxiliaryApiConfig:key=>key==='memorySummaryApiConfigId'?{id:'summary'}:{provider:'test',defaultModel:'embed-test'},resolveUserIdentity:()=>({id:'u'})},
 'memory-embedding':{resolveEmbeddingModel:()=> 'embed-test',generateEmbedding:async()=>vector,cosineSimilarity:(a,b)=>b[0]},
 'api-helpers':{simpleLLMCall:async(a,p)=>{calls.push(p[0].content);return {content:'事实总结 '+calls.length}}},
 'short-term-assembler':{loadNativeTimeline:()=>native,filterTimelineByAllowedSources:e=>e,formatTimelineForSummarization:e=>e.length?{eventsText:e.map(x=>x.content).join('\n'),earliest:e[0].timestamp,latest:e.at(-1).timestamp}:null},
 'core-memory-builder':{maybeRunCoreMemoryPipeline:async()=>{}},
 'token-counter':{estimateTokens:text=>text.length},
};
const orig=Module._load;Module._load=function(req,parent,...rest){const key=path.basename(req).replace(/\.tsx?$/,'');if(parent?.filename.startsWith(root+'/lib/')&&mocks[key])return mocks[key];return orig.call(this,req,parent,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
global.window={dispatchEvent(){}};
const meta=require('../lib/memory-event-meta.ts'),classification=require('../lib/memory-classification.ts'),inject=require('../lib/memory-injector.ts'),service=require('../lib/memory-service.ts'),summary=require('../lib/memory-summarizer.ts'),wvs=require('../lib/weverse-storage.ts'),wvsmem=require('../lib/weverse-memory.ts'),interview=require('../lib/interview-magazine-memory.ts');
const m=(id,content,metadata={})=>({id,characterId:'a',type:'long_term',content,createdAt:'2026-10-15T00:00:00Z',updatedAt:'2026-10-15T00:00:00Z',metadata,importance:.8,sourceApp:'chat'});
(async()=>{
 assert(meta.validMemoryDate('2026-08'));assert(meta.validMemoryDate('2024-02-29'));assert(!meta.validMemoryDate('2026-02-29'));assert(!meta.validMemoryDate('2026-13'));
 assert(classification.isSharedMemoryEvent({sourceApp:'chat',sourceDetail:'group'}));assert(!classification.isSharedMemoryEvent({sourceApp:'ytb'}));assert(classification.isSharedMemoryEvent({sourceApp:'ytb',shared:true}));
 const mixed=m('mixed','节目事实\n其他经历',{summarySegments:[{sourceKeys:['interview:gone'],content:'节目事实'},{sourceKeys:[],content:'其他经历'}]});
 meta.revokeMemorySources(['interview:gone']);assert.equal(meta.projectMemoryEntry(mixed).content,'其他经历');assert.equal(meta.projectMemoryEntry({...mixed,metadata:{summarySegments:[{sourceKeys:['interview:gone'],content:'节目事实'}]}}),null);
 assert(inject.formatLongTermMemories([m('date','拍摄',{occurredFrom:'2026-08-08',occurredTo:'2026-08-10'})]).includes('2026-08-08 — 2026-08-10'));
 // Selected old events bypass the summary watermark, accept fewer than four, and do not mutate until review/save.
 native=[{id:'old',sourceApp:'worldline',timestamp:'2026-08-08T12:00:00Z',content:'八月拍摄'}];
 let result=await summary.runSummarizationPipeline('a','A',{selectedEntries:native,draftOnly:true});assert(result.draft);assert.equal(saved.length,0);assert.equal(counter,0);assert.equal(watermark,'2026-10-01T00:00:00Z');assert.equal(result.draft.metadata.occurredFrom,'2026-08-08');
 // Automatic summary keeps different months / revocable sources in separate paragraphs.
 native=[...native,{id:'ep',sourceApp:'interview_magazine',timestamp:'2026-08-09T12:00:00Z',content:'节目采访',sourceKeys:['interview:ep']},{id:'now',sourceApp:'chat',timestamp:'2026-10-15T12:00:00Z',content:'十月聊天'},{id:'now2',sourceApp:'chat',timestamp:'2026-10-15T12:01:00Z',content:'十月聊天2'}];
 result=await summary.runSummarizationPipeline('a','A',{force:true});assert(result.success);assert.equal(saved.at(-1).metadata.summarySegments.length,3);assert.equal(saved.at(-1).metadata.summarizedEvents,4);
 // Missing vectors remain searchable even when some other memories have vectors.
 memories=[{...m('unrelated','xxxxxxxx'),embedding:[1,0]},m('old','八月拍摄',{occurredFrom:'2026-08-08'})];vector=[1,0];config.longTermTokenBudget=35;
 let got=await service.retrieveMemoriesForPrompt('a','本轮用户问题：八月拍摄\n近期背景：其他聊天',config);assert(got.some(e=>e.id==='old'));
 // One oversized candidate cannot prevent smaller relevant candidates from being read.
 memories=[m('large','八月拍摄'.repeat(100)),m('small','拍摄')];vector=null;config.longTermTokenBudget=20;got=await service.retrieveMemoriesForPrompt('a','八月拍摄',config);assert.deepEqual(got.map(e=>e.id),['small']);
 // WVS delete removes source projections and revokes derived paragraphs, never money or unrelated memories.
 const live={id:'live_1',communityId:'c',status:'ended',startedAt:1000,endedAt:9000,hostCharacterIds:['a','b'],participantPresence:[{characterId:'a',joinedAt:1000},{characterId:'b',joinedAt:1000}],segments:[],comments:[]};kv.kvSet('ai_phone_weverse_state_v1',JSON.stringify({lives:[live],communities:[],posts:[],notices:[],schedules:[]}));
 assert.equal(wvsmem.loadWeverseProjectionEntries('a')[0].shared,true);wvs.deleteWeverseLive(live.id);assert.equal(wvsmem.loadWeverseProjectionEntries('a').length,0);assert(meta.revokedMemoryKeys().has('wvs:live_1'));
 interview.recordInterviewMagazineProjectionEvent({issueId:'ep',issueNumber:1,title:'标题',theme:'主题',characterIds:['a','b'],characterNames:['A','B'],userName:'用户',summary:'共同节目'});assert(interview.loadInterviewMagazineProjectionEntries('a')[0].shared);interview.deleteInterviewMagazineProjectionEventForIssue('ep');assert.equal(interview.loadInterviewMagazineProjectionEntries('a').length,0);assert(meta.revokedMemoryKeys().has('interview:ep'));
 console.log('PASS: 日期校验/注入、共享互斥、选旧记录提炼预览不改水位线、跨月分段、来源精确撤回、缺向量回退、超长条目跳过、WVS/在场删除联动');
})().catch(e=>{console.error(e);process.exitCode=1});
