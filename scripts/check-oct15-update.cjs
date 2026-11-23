const ts=require('typescript'),fs=require('fs'),path=require('path'),Module=require('module'),assert=require('node:assert/strict');
const root=process.cwd(),cache=new Map();let active=null,completion='answer',smsOutput={send:true,channel:'sms',messages:[{original:'忙完了，刚看到你发的两条。',translated:''}]},llmCalls=0;
let sms={realNumber:'123',characterNumbers:{a:'456'},threads:[],messages:[],lastAutoAt:{},contactAttempts:{},proactive:'off'};let calls=[],sessions=[],chats=[],events=[];
global.window={dispatchEvent:e=>{events.push(e);},addEventListener(){},removeEventListener(){}};global.document={visibilityState:'visible'};global.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail}};
const mocks={
 'kv-db':{registerKvMigration(){},kvGet:k=>cache.get(k)||null,kvSet:(k,v)=>cache.set(k,v)},
 'chat-busy-hold':{getActiveCalendarBusy:()=>active,chooseBusyResumeAt:a=>a.endsAt+300000},
 'chat-storage':{loadChatSessions:()=>sessions,loadChatMessages:()=>chats},
 'sms-storage':{loadSms:()=>structuredClone(sms),saveSms:s=>{sms=structuredClone(s)},phoneFromPersona:()=>'',smsId:()=>Math.random().toString(),ensureSmsThread:(s,id)=>{let t=s.threads.find(t=>t.characterId===id);if(!t){t={id:id+':real',characterId:id,identityId:'real',number:'123',characterNumber:'456'};s.threads.push(t)}return t},addSmsMessage:(s,t,d,o,tr)=>s.messages.push({id:Math.random().toString(),threadId:t.id,direction:d,original:o,translated:tr,delivered:true,createdAt:Date.now()})},
 'phone-storage':{loadPhoneState:()=>({calls}),getCharacterPhoneNumber:()=> '456',phoneId:()=> 'line'},
 'character-storage':{loadCharacters:()=>[{id:'a',name:'A',persona:'谨慎，知道用户曾说明今天工作忙。'}]},
 'chat-engine':{generateChatCompletion:async()=>{llmCalls++;return completion},flattenCompletionResult:v=>v,sendLLMRequest:async()=>{llmCalls++;return JSON.stringify(smsOutput)}},
 'settings-storage':{loadBindingConfig:()=>({}),resolveBinding:()=>({}),loadApiConfigs:()=>[{id:'api'}],loadPresets:()=>[],loadRegexes:()=>[],loadWorldBooks:()=>[],resolveUserIdentity:()=>({id:'u',name:'ii'})},
 'memory-storage':{loadMemoryConfig:()=>({})},'memory-service':{retrieveMemoriesForPrompt:async()=>[]},'character-time':{buildCharacterTimeContext:()=>''},'llm-prompt-assembler':{assemblePromptPayload:()=>[]},'sms-continuity':{chatStatus:()=>({blocked:false,recent:[],requests:[]})},'push-client':{isWithinPushQuietHours:()=>false},
 'rich-message-parser':{parseAIResponse:()=>({parts:[]})},'call-transcript':{splitCallTranscript:()=>[],VOICE_CALL_FORMAT:''},
 'ytb-storage':{loadYtbState:()=>ytb},'ytb-memory':{ytbFingerprint:s=>`${s.length}:${s}`},
};
const orig=Module._load;Module._load=function(req,parent,...rest){const name=path.basename(req).replace(/\.tsx?$/,'');if(parent?.filename.startsWith(root+'/lib/')&&mocks[name])return mocks[name];return orig.call(this,req,parent,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const policy=require('../lib/communication-policy.ts'),phone=require('../lib/phone-engine.ts'),engine=require('../lib/sms-engine.ts'),planner=require('../lib/contact-planner.ts'),bg=require('../lib/sms-background.ts'),bridge=require('../lib/ytb-checkphone-bridge.ts');
let ytb={channels:[{id:'character:a',ownerId:'a',ownerType:'character',name:'频道A',handle:'@a',description:'简介',avatar:'a.jpg'},{id:'user:u',ownerType:'user',name:'小Q'}],streams:[]};
(async()=>{
 let p=policy.loadCommunicationPolicy();assert(!p.sms.busyEnabled&&!p.phone.busyEnabled);assert.deepEqual(p.phone.proactiveCharacterIds,[]);
 p.phone.busyEnabled=true;p.phone.busyCharacterIds=['a'];p.sms.busyEnabled=true;p.sms.busyCharacterIds=['a'];policy.saveCommunicationPolicy(p);
 active={level:4,item:{id:'busy',title:'拍摄'},endsAt:Date.now()+3600000};let before=llmCalls;assert.equal(await phone.decidePhoneAnswer('a'),'missed');assert.equal(llmCalls,before,'无法看手机时不调用接听模型');
 active=null;completion='unparseable';assert.equal(await phone.decidePhoneAnswer('a'),'missed');completion='answer';assert.equal(await phone.decidePhoneAnswer('a'),'answer');
 const t={id:'a:real',characterId:'a',identityId:'real',number:'123',characterNumber:'456'};sms.threads=[t];sms.messages=[{id:'m1',threadId:t.id,direction:'outgoing',original:'你在忙吗',delivered:true,createdAt:1},{id:'m2',threadId:t.id,direction:'outgoing',original:'忙完回我就行',delivered:true,createdAt:2}];
 active={level:3,item:{id:'busy',title:'训练'},endsAt:Date.now()+3600000};before=llmCalls;let reply=await engine.generateSmsReply(t,sms,'summon');assert(reply.deferred);assert.equal(llmCalls,before);assert.equal(policy.loadContactRuntime().pending[0].messageId,'m2');
 active=null;let runtime=policy.loadContactRuntime();runtime.pending[0].dueAt=0;policy.saveContactRuntime(runtime);await bg.maybeGenerateSmsBackgroundMessage();assert.equal(sms.messages.filter(m=>m.direction==='incoming').length,1);assert.equal(policy.loadContactRuntime().pending.length,0,'忙完队列被消费');
 assert(policy.acquireContact('a'));assert(!policy.acquireContact('a'));policy.releaseContact('a');assert(policy.acquireContact('a'));policy.releaseContact('a');
 p=policy.loadCommunicationPolicy();p.phone.callbackCharacterIds=['a'];policy.saveCommunicationPolicy(p);calls=[{id:'call1',characterId:'a',direction:'outgoing',status:'missed',endedAt:Date.now()+1000,startedAt:Date.now()}];completion=JSON.stringify({channel:'phone',reason:'看到连续未接，担心确实有事，回拨确认',nextCheckMinutes:20});let plan=await planner.planContact('a');assert.equal(plan.channel,'phone');await bg.deliverPlannedContact('a',plan);assert.equal(events.filter(e=>e.type==='phone-request-incoming').length,1);plan=await planner.planContact('a');assert.equal(plan.channel,'wait','同一个未接不反复回拨');
 // Empty opened SMS thread cannot trigger a background generation.
 p.phone.callbackCharacterIds=[];p.sms.proactiveCharacterIds=['a'];policy.saveCommunicationPolicy(p);sms.messages=[];calls=[];cache.delete('ai_phone_communication_runtime_v1');before=llmCalls;await bg.maybeGenerateSmsBackgroundMessage();assert.equal(llmCalls,before);
 // Live bridge samples only the witnessed part and keeps the true duration; deletion is reflected immediately.
 const live={id:'stream',channelId:'user:u',title:'做饭',titleTranslated:'',cover:'cover.jpg',startedAt:1000,endedAt:121000,status:'ended',saved:true,totalViewers:20,visits:{'character:a':{enteredAt:61000,leftAt:121000,identities:{}}},lines:[{id:'old',kind:'speech',original:'不能知道的前半段',at:2000},{id:'new',kind:'speech',original:'锅烧糊了',at:80000}],comments:[],calls:[]};ytb.streams=[live];let rows=bridge.recentYtbLiveRecords('a');assert.equal(rows.length,1);assert.equal(rows[0].row.durationLabel,'2:00');assert.equal(rows[0].row.progressLabel,'1:00 / 2:00');assert(!rows[0].brief.includes('前半段'));assert(rows[0].brief.includes('锅烧糊了'));
 let projected=bridge.projectCheckPhoneYoutube('a',null);assert.equal(projected.profile.name,'频道A');assert.equal(projected.watchHistory.length,1);const feel=bridge.parseLiveFeelings('#直播感想\n##视频1\n[直播ID]stream\n[指纹]abc\n[当时状态]刚忙完\n[感受]被逗笑了');assert.equal(feel.stream.feeling,'被逗笑了');
 projected=bridge.projectCheckPhoneYoutube('a',{...projected,liveFeelings:{stream:{fingerprint:rows[0].fingerprint,stateNote:'刚忙完',feeling:'被逗笑了'}}});assert.equal(projected.watchHistory[0].feeling,'被逗笑了');ytb.streams=[];projected=bridge.projectCheckPhoneYoutube('a',projected);assert.equal(projected.watchHistory.length,0,'原直播删除后不残留快照');
 assert(fs.readFileSync('components/phone-theme-app.tsx','utf8').includes('Object.keys(ICONS)'));
 assert(fs.existsSync('public/youtube/wordmark.png'));assert(fs.readFileSync('components/ytb/ytb-app.tsx','utf8').includes('onClick={onClose}><img src="/youtube/wordmark.png"'));
 console.log('PASS: 默认权限、不可见忙时拦截、接听失败、短信合并恢复、跨渠道互斥、回拨去重、空会话不触发、直播真实时长/半场范围/感想/删除、资料投影、图标和回桌面。');
})().catch(e=>{console.error(e);process.exitCode=1});
