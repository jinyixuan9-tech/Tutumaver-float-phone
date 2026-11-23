const ts=require(process.cwd()+'/node_modules/typescript');
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('node:assert/strict');
const root=process.cwd(),cache=new Map();let plans=[],schedules=[];
const kv={registerKvMigration(){},registerDynamicPrefix(){},kvGet:k=>cache.get(k)??null,kvSet:(k,v)=>cache.set(k,v),kvRemove:k=>cache.delete(k)};
const mocks={
 'kv-db':kv,
 'character-world-storage':{loadCharacterWorldGroups:()=>[]},
 'settings-storage':{resolveUserIdentity:()=>({id:'test-user',name:'测试用户'}),loadUserIdentities:()=>[{id:'test-user'}],loadBindingConfig:()=>({globalDefaults:{userIdentityId:'test-user'}})},
 'character-storage':{loadCharacters:()=>[{id:'alice',name:'Alice',timeZone:'Asia/Seoul'}]},
 'calendar-storage':{loadOwnerCalendarPlans:()=>plans},
 'weverse-storage':{loadWeverseState:()=>({schedules})},
};
const original=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){if(request.startsWith('@/'))request=path.join(root,request.slice(2));return original.call(this,request,parent,...rest);};
const originalLoad=Module._load;
Module._load=function(request,parent,...rest){const name=path.basename(request).replace(/\.tsx?$/,'');if(parent?.filename.startsWith(root+'/lib/')&&mocks[name])return mocks[name];return originalLoad.call(this,request,parent,...rest);};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
global.CustomEvent=class extends Event{constructor(name,init){super(name);this.detail=init?.detail;}};
global.window={dispatchEvent(){}};
const store=require(root+'/lib/ytb-storage.ts'),runtime=require(root+'/lib/ytb-runtime.ts'),wallet=require(root+'/lib/wallet-storage.ts'),memory=require(root+'/lib/ytb-memory.ts');
let state=store.emptyYtbState();const user=store.makeYtbChannel('test-user','user','主播'),char=store.makeYtbChannel('alice','character','Alice');user.subscribers=1000;state.channels=[user,char];
let w=wallet.loadWalletState(undefined,'test-user');wallet.saveWalletState({...w,primaryCurrency:'KRW'},undefined,'test-user');
const now=Date.now();state.streams=[{id:'s1',channelId:user.id,title:'真实直播',theme:'',cover:'',startedAt:now-60000,status:'live',viewers:30,totalViewers:80,peakViewers:50,newSubscribers:2,lines:[{id:'l1',kind:'speech',original:'已播出的内容',translated:'',at:now-1000},{id:'l2',kind:'speech',original:'未来缓存不能保存',translated:'',at:now+10000}],comments:[{id:'t1',name:'fan',original:'好看',translated:'',at:now-500,tip:{amount:10,currency:'USD'}},{id:'t2',name:'future',original:'还未出现',translated:'',at:now+10000,tip:{amount:100,currency:'USD'}}],calls:[],watchedBy:[char.id],visits:{[char.id]:{enteredAt:now-2000,identities:{[user.id]:true}}},leftBy:[]}];
assert.equal(memory.projectYtbMemory(state,'alice','test-user').length,0,'直播时不回传');
state=runtime.finishYtbStream(state,'s1',now);assert.equal(state.earnings.length,1,'只结算已显示打赏');assert.equal(state.streams[0].lines.length,1);assert.equal(state.earnings[0].currency,'KRW');assert.equal(state.earnings[0].amount,wallet.exchangeWalletAmount(10,'USD','KRW'));
assert.equal(runtime.finishYtbStream(state,'s1',now),state,'重复结束幂等');assert.equal(memory.projectYtbMemory(state,'alice','test-user').length,0,'下播未保存不回传');
state=store.saveYtbRecording(state,'s1',now);assert.equal(store.saveYtbRecording(state,'s1',now),state,'重复保存幂等');assert.equal(memory.projectYtbMemory(state,'alice','test-user').length,0,'未生成摘要不回传原始日志');const source=memory.ytbMemorySources(state,'alice','test-user')[0];state.streams[0].memorySummaries={[char.id]:{fingerprint:source.fingerprint,content:'观看直播并记住已播出的内容。',at:now}};assert.equal(memory.projectYtbMemory(state,'alice','test-user').length,1,'保存并生成摘要后回传');
store.saveYtbState(state);const first=runtime.withdrawYtbIncome(undefined,'test-user');assert.equal(first.count,1);assert.equal(runtime.withdrawYtbIncome(undefined,'test-user').count,0,'提现不能重复');
let latest=store.loadYtbState();const earning=latest.earnings[0];latest.threads=[{id:'t',userChannelId:user.id,peerChannelId:char.id,messages:[{id:'m',senderId:char.id,name:char.name,avatar:'',original:'分享回放的回复',translated:'',at:now,replayId:'s1'}]}];latest=store.deleteYtbRecording(latest,'s1');assert.equal(latest.threads[0].messages.length,0,'回放分享回复一并撤回');assert.equal(store.deleteYtbRecording(latest,'s1'),latest,'重复删除幂等');store.saveYtbState(latest);assert.equal(memory.projectYtbMemory(latest,'alice','test-user').length,0,'删除录播撤回记忆');assert.equal(store.loadYtbState().earnings[0].id,earning.id,'删除录播保留收益');assert.equal(wallet.loadWalletState(undefined,'test-user').transactions.filter(t=>t.relatedMessageId==='youtube:'+earning.id).length,1);
const date=new Date('2026-10-14T03:30:00Z').getTime();plans=[{items:[{date:'2026-10-14',startTime:'12:00',endTime:'13:00',busyLevel:3,title:'午间拍摄'}]}];assert.equal(runtime.ytbAvailability(char,date).free,false,'使用角色时区日历');plans=[];schedules=[{memberCharacterIds:['alice'],startsAt:date-1000,endsAt:date+1000,title:'WVS行程'}];assert.equal(runtime.ytbAvailability(char,date).free,false,'同时参考WVS日程');schedules=[];assert.equal(runtime.ytbAvailability(char,date).free,true);
const npc=store.makeYtbChannel('npc','npc','网友');assert.equal(runtime.settledEarning(latest,npc,{id:'x',channelId:npc.id,kind:'tip',originalAmount:1,originalCurrency:'USD',at:now}),null,'NPC不接收益');
let spectators={...latest,channels:[user,char],streams:[{id:'watch',channelId:user.id,status:'live',watchedBy:[char.id],leftBy:[],visits:{[char.id]:{enteredAt:date-1000,identities:{}}},calls:[{channelId:char.id,status:'connected'}]}]};schedules=[{memberCharacterIds:['alice'],startsAt:date-100,endsAt:date+1000,title:'忙碌'}];const left=runtime.expireYtbStreams(spectators,date);assert.equal(left.streams[0].visits[char.id].leftAt,date);assert(left.streams[0].leftBy.includes(char.id));assert.equal(left.streams[0].calls[0].status,'ended');schedules=[];
console.log('PASS: 保存前后记忆、删除撤回、未来缓存过滤、跨币种结算、重复结束/提现、角色时区日历、WVS日程、NPC收益隔离。');
