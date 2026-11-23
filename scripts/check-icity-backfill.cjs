const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.join(__dirname,'..'),cache={};
function load(file,stubs={}){const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(name=>{if(name in stubs)return stubs[name];throw Error('Unexpected dependency '+name)},m,m.exports);return m.exports;}
const policy=load('lib/icity-history-policy.ts');
let seed=7;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
let sawNoPrivate=false,sawPrivate=false,compositions=new Set();
for(let n=1;n<=10;n++)for(let trial=0;trial<100;trial++)for(const friend of [false,true]){
 const scopes=policy.planCityHistoryScopes(n,friend,random);assert.equal(scopes.length,n);assert(scopes.includes('world'));
 if(n>1)assert(scopes.filter(v=>v!=='private').length>=2);if(friend&&n>1)assert(scopes.includes('friends'));if(!friend)assert(!scopes.includes('friends'));
 if(n>=5){sawNoPrivate ||= !scopes.includes('private');sawPrivate ||= scopes.includes('private');compositions.add(['world','friends','private'].map(v=>scopes.filter(s=>s===v).length).join(','));}
}
assert(sawNoPrivate&&sawPrivate&&compositions.size>5);
const cutoff=new Date(2026,10,10).getTime(),early=new Date(2026,10,8).toISOString(),late=new Date(2026,10,11).toISOString();
const mem={id:'m',characterId:'a',sourceApp:'chat',type:'core',content:'核心背景',importance:1,createdAt:early,updatedAt:early};
assert.equal(policy.cityHistoricalMemory(mem,cutoff).backgroundOnly,true);
assert.equal(policy.cityHistoricalMemory({...mem,updatedAt:late},cutoff),null);
assert.equal(policy.cityHistoricalMemory({...mem,metadata:{occurredTo:'2026-11'}},cutoff),null);
assert(policy.cityHistoricalMemory({...mem,metadata:{occurredTo:'2026-10'}},cutoff));
assert.equal(policy.cityHistoricalMemory({...mem,metadata:{occurredTo:'2026-11-11'}},cutoff),null);
assert(policy.cityHistoricalMemory({...mem,createdAt:late,updatedAt:late,metadata:{timeSpan:'2026-11-01 ~ 2026-11-09'}},cutoff));
assert.equal(policy.cityHistoricalMemory({...mem,createdAt:late,updatedAt:late,metadata:{timeSpan:'2026-11-01 ~ 2026-11-11'}},cutoff),null);
const segmented=policy.cityHistoricalMemory({...mem,createdAt:late,updatedAt:late,metadata:{summarySegments:[{content:'已发生',occurredFrom:'2026-11-09',occurredTo:'2026-11-09'},{content:'未来',occurredFrom:'2026-11-11',occurredTo:'2026-11-11'},{content:'无日期'}]}},cutoff);
assert.equal(segmented.text,'已发生');
assert.equal(policy.cityHistoricalMemory({...mem,metadata:{summarySegments:[{content:'跨未来',occurredFrom:'2026-11-09',occurredTo:'2026-11-11'}]}},cutoff),null);
assert.deepEqual(policy.cityHistoricalTimeline([{id:'past',timestamp:early},{id:'future',timestamp:late},{id:'not-known',timestamp:early,knownByCharacterIds:['b']},{id:'unfinished',timestamp:early,occurredTo:late}], 'a',cutoff).map(e=>e.id),['past']);
console.log('PASS quota variation, visible minimums, actual friendship, no-private batches, memory segments and future/knowledge boundaries');

let state,requests=[],failAt=0,fail=false,counter=0;
const chars=[{id:'a',name:'A',persona:'人物核心',personality:'安静'},{id:'b',name:'B'}];
const now=new Date(),yesterday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1),before=new Date(yesterday);before.setDate(before.getDate()-1);
const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const pastAt=new Date(yesterday.getTime()+12*3600000).toISOString(),priorAt=new Date(before.getTime()+12*3600000).toISOString(),futureAt=new Date(now.getTime()+3*86400000).toISOString();
function reset(friends=true){state={enrolled:['a','b'],accounts:chars.map(c=>({...c,kind:'character'})),entries:[],books:[],friends:friends?[['user','a']]:[]};requests=[];counter=0;fail=false;failAt=0;}
const storage={loadCity:()=>structuredClone(state),saveCity:n=>state=structuredClone(n),cityEntries:n=>n.entries,personalBook:id=>'personal:'+id,cityId:()=>String(++counter),canReadCity:()=>true,areCityFriends:(s,u,a)=>s.friends.some(pair=>pair.includes(u)&&pair.includes(a))};
const baseMemory={...mem,createdAt:priorAt,updatedAt:priorAt};
const history=load('lib/icity-history.ts',{
 './icity-store':storage,'./character-storage':{loadCharacters:()=>chars},'./calendar-storage':{loadOwnerCalendarPlans:()=>[{items:[{date:day(yesterday),title:'当天安排'},{date:day(before),title:'此前安排'},{date:day(new Date(futureAt)),title:'未来安排'}]}]},
 './worldline-storage':{activeWorldline:()=>null,worldlineEventsForCharacter:()=>[]},'./character-world-storage':{getCharacterWorldGroup:()=>({description:'背景'})},
 './settings-storage':{loadWorldBooks:()=>[],loadApiConfigs:()=>[],loadBindingConfig:()=>({}),resolveBinding:()=>({})},
 './short-term-assembler':{loadNativeTimeline:()=>[{id:'same',timestamp:pastAt,sourceApp:'chat',content:'当天聊天'},{id:'shared',timestamp:pastAt,sourceApp:'chat',shared:true,content:'共享经历'},{id:'prior',timestamp:priorAt,sourceApp:'phone',content:'此前通话'},{id:'future',timestamp:futureAt,sourceApp:'chat',content:'未来秘密'}],filterTimelineByAllowedSources:e=>e},
 './memory-storage':{loadMemoryConfig:()=>({}),loadMemoryEntries:async()=>[{...baseMemory,type:'core',content:'核心记忆'},{...baseMemory,type:'long_term',content:'长期记忆'},{...baseMemory,createdAt:futureAt,updatedAt:futureAt,content:'未来秘密'}]},
 './icity-history-policy':policy,'./icity-engine':{askCity:async(prompt,context,author)=>{requests.push({prompt,context,author});if(fail||requests.length===failAt)return{posts:[]};return{posts:[{text:'日记-'+requests.length,title:'当天',visibility:'private'}]};}},
 './bilingual-edit':{isForeignOriginal:()=>false},'./content-translation':{translateContentTexts:async t=>t},'./icity-runtime':{reactCityWorldLikes:async()=>{}}
});
(async()=>{
 reset();const r=await history.generateCityHistoryBatch('mixed',['a']);assert(r.total>=6&&r.total<=10);assert(r.world>=1&&r.friends>=1);assert.equal(r.entryIds.length,r.total);assert.equal(r.world+r.friends+r.private,r.total);assert(state.books.some(b=>b.id==='personal:a'));
 for(const q of requests){const ctx=q.context,limit=Date.parse(ctx.cutoff);assert(q.prompt.includes('本篇可见范围已预先确定'));assert(q.prompt.includes('核心人设'));assert(q.prompt.includes('不硬编'));assert(!JSON.stringify(ctx).includes('未来秘密'));assert(ctx.dayCalendar.every(i=>i.date===ctx.targetDate));for(const e of [...ctx.dayContext,...ctx.recentContext,...ctx.sharedContext])assert(Date.parse(e.date)<limit);}
 assert(requests.some(q=>q.context.dayContext.some(e=>e.text==='当天聊天')));assert(requests.some(q=>q.context.sharedContext.some(e=>e.text==='共享经历')));assert(requests.some(q=>q.context.coreMemories.length&&q.context.longTermMemories.length));
 reset(false);const nonfriend=await history.generateCityHistoryBatch('mixed',['b']);assert.equal(nonfriend.friends,0);assert(nonfriend.world>=2);
 reset();const privateCount=await history.generateCityHistory('private',['a']);assert(privateCount>=1&&privateCount<=3);assert(state.entries.every(e=>e.visibility==='private'));
 reset();const friendCount=await history.generateCityHistory('friends',['a']);assert.equal(state.entries.filter(e=>e.visibility==='friends').length,friendCount);
 reset();failAt=3;await assert.rejects(()=>history.generateCityHistoryBatch('mixed',['a']));assert.equal(state.entries.length,0);
 const oldBefore=state.entries.length;fail=true;await assert.rejects(()=>history.generateCityHistoryBatch('mixed',['a']));assert.equal(state.entries.length,oldBefore);
 console.log('PASS real backfill: per-day references, shared/long/core data, nonfriend visibility, missing-book repair, explicit private/friends modes and atomic failure');
})().catch(e=>{console.error(e);process.exitCode=1});
