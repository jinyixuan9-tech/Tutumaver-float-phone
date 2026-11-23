/* Run from the repository root: node scripts/check-cross-app-memory.cjs.
   Calls production assemblers and provider serialization with isolated native stores.
   No network, model/embedding API, or real user data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(name,mocks={}) {
 const source=ts.transpileModule(fs.readFileSync(path.join(root,'lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 const fallback=new Proxy({}, {get:(_,key)=>key==='__esModule'?false:()=>[]});
 new Function('require','module','exports',source)(id=>mocks[id]||fallback,module,module.exports);
 return module.exports;
}
let assertions=0;function check(label,value){assert(value,label);assertions++;console.log('PASS '+label);}
const chars=[{id:'a',name:'A',persona:'A_PERSONA'},{id:'b',name:'B'},{id:'c',name:'C'}];
const time='2026-11-10T10:00:00.000Z';
const histories={sa:[{id:'ma',sessionId:'sa',role:'assistant',content:'A_GYM_EVENT',createdAt:time,status:'sent'}],sb:[{id:'mb',sessionId:'sb',role:'assistant',content:'B_PRIVATE_EVENT',createdAt:time,status:'sent'}]};
let config={shortTermTokenBudget:10000,longTermTokenBudget:10000,coreMemoryTokenBudget:10000,shortTermAllowedSources:{},vectorRecallEnabled:true};
let calls=[],lysnMessages=[];
const token=load('token-counter');
const blank=()=>'';
const base={
 './character-storage':{loadCharacters:()=>chars},
 './chat-storage':{loadChatSessions:()=>[{id:'sa',contactId:'a'},{id:'sb',contactId:'b'}],loadChatMessages:id=>histories[id]||[],isReadingDiscussMessage:()=>false,isSystemInstructionMessage:()=>false},
 './settings-storage':{resolveUserIdentity:()=>({name:'U'})},
 './memory-storage':{loadMemoryConfig:()=>config},
 './icity-store':{loadCity:()=>({books:[],accounts:[]}),cityEntries:()=>[]},
 './phone-storage':{loadPhoneState:()=>({calls})},
 './lysn-storage':{loadLysn:()=>({messages:lysnMessages})},
 './worldline-storage':{worldlineEventsForCharacter:()=>[],activeWorldline:()=>null},
 './prompt-time':{resolvePromptTimeAware:()=>false,formatPromptEventLabel:t=>`[${t}]`,formatStoredPromptEventContent:t=>t,formatPromptTimestamp:blank},
 './prompt-sanitizer':{stripStateAndInnerForPrompt:t=>t},'./token-counter':token,
};
const recent=load('short-term-assembler',base);
const assembler=load('llm-prompt-assembler',{
 ...base,'./user-knowledge':{filterUserIdentityForCharacter:x=>x},
 './character-relationship':{fixedRelationshipInstruction:blank},'./relationship-suggestions':{relationshipSuggestionInstruction:blank},
 './media-preferences':{mediaPreferencePrompt:blank},
 './macro-engine':{MacroEngine:class{expand(x){return x}},postProcessTrim:x=>x},
 './character-time':{buildCharacterTimeContext:()=>({timeContext:'',year:'2026',month:'11',day:'10'})},
 './prompt-time':{resolvePromptTimeAware:()=>false,getPromptTimestampOptionsForTimeContext:()=>({})},
});
function assemble(prepared,appId='phone',preset=null){return assembler.assemblePromptPayload({character:chars[0],history:prepared.truncatedHistory,preset,worldBooks:[],regexes:[],appId,...prepared});}
const provider=load('llm-provider-adapter',{
 './api-helpers':{determineBaseUrl:()=> 'https://example.invalid',buildChatCompletionsUrl:x=>x+'/chat/completions',buildRequestHeaders:()=>({}),isNativeAnthropicApi:()=>false,isNativeGoogleApi:()=>false,stripHallucinatedTimestamps:x=>x},
 './generation-parameters':{resolveEnabledGenerationParameters:()=>new Set()},
});
const wire=messages=>JSON.stringify(provider.buildProviderRequest({apiKey:'test',provider:'custom',defaultModel:'mock'},null,provider.toLlmRequestMessages(messages)).body);
(async()=>{
 let p=recent.prepareShortTermContext('a','phone',{history:histories.sa});
 check('Phone same raw Chat message appears once in provider request',wire(assemble(p)).split('A_GYM_EVENT').length===2);
 check('Chat preserves its current history',wire(assemble(recent.prepareShortTermContext('a','chat',{history:histories.sa}),'chat')).includes('A_GYM_EVENT'));
 check('Chat-shaped reader without history still receives direct Chat',recent.prepareShortTermContext('a','chat').unifiedRecentItems.some(e=>e.text?.includes('A_GYM_EVENT')));
 const transcript={id:'ephemeral',sessionId:'sa',role:'user',content:'CURRENT_CALL_LINE',createdAt:'2026-11-10T10:01:00.000Z',status:'sent'};
 check('Current Phone transcript survives exact dedup',wire(assemble(recent.prepareShortTermContext('a','phone',{history:[...histories.sa,transcript]}))).includes('CURRENT_CALL_LINE'));
 check('Other character private Chat is excluded',!wire(assemble(p)).includes('B_PRIVATE_EVENT'));
 const group=recent.prepareGroupShortTermContext(['a','b'],[],{excludeGroupSessionId:'g'});
 check('Group retains separate knower IDs',group.unifiedRecentItems.filter(e=>e.kind==='event').every(e=>e.knownByCharacterIds?.length===1));
 check('Group prompt labels personal knowledge scope',group.unifiedRecentItems.some(e=>e.text?.includes('仅A知道')));
 const marker={identifier:'shortTermMemory',marker:true,enabled:true};
 check('Preset on injects short context',wire(assemble(p,'phone',{prompts:[marker]})).includes('A_GYM_EVENT'));
 check('Preset off omits short context',!wire(assemble(p,'phone',{prompts:[{...marker,enabled:false}]})).includes('A_GYM_EVENT'));
 check('Preset missing short marker omits short context',!wire(assemble(p,'phone',{prompts:[]})).includes('A_GYM_EVENT'));
 config.shortTermAllowedSources={chat:false};check('Disabled Chat source is absent',!wire(assemble(recent.prepareShortTermContext('a','sms'))).includes('A_GYM_EVENT'));config.shortTermAllowedSources={};
 check('Historical cutoff rejects later native events',!wire(assemble(recent.prepareShortTermContext('a','sms',{beforeTimestamp:'2026-11-09T00:00:00Z'}))).includes('A_GYM_EVENT'));
 calls=[{id:'call',characterId:'a',direction:'incoming',endedAt:Date.parse(time),status:'missed',transcript:[]}];
 check('Missed Phone outcome is remembered without invented speech',recent.loadNativeTimeline('a').some(e=>e.sourceApp==='phone'&&e.content.includes('未接')&&e.content.includes('没有通话内容')));
 lysnMessages=[{id:'op',characterId:'a',sender:'artist',opener:true,kind:'text',createdAt:Date.parse(time),original:'OPENER_ONLY'},{id:'post',characterId:'a',sender:'artist',kind:'text',createdAt:Date.parse(time),original:'BROADCAST_POST'}];
 check('LYSN opener is excluded, actual broadcast retained',!JSON.stringify(recent.loadNativeTimeline('a')).includes('OPENER_ONLY')&&JSON.stringify(recent.loadNativeTimeline('a')).includes('BROADCAST_POST'));
 const cache=new Map();const kv={registerKvMigration(){},kvGet:k=>cache.get(k)||null,kvSet:(k,v)=>cache.set(k,v)};
 const smsStore=load('sms-storage',{'./kv-db':kv});
 let state=smsStore.loadSms();state.realNumber='111';state.identities=[{id:'alias',number:'222'}];
 const real=smsStore.ensureSmsThread(state,'a','real'),anon=smsStore.ensureSmsThread(state,'a','alias');
 smsStore.addSmsMessage(state,real,'outgoing','REAL_SMS');smsStore.addSmsMessage(state,anon,'outgoing','UNKNOWN_SMS');smsStore.saveSms(state);
 const projection=smsStore.loadSmsProjectionEntries('a');
 check('SMS real identity is recognized',projection.some(e=>e.content.includes('用户：REAL_SMS')));
 check('Unknown SMS keeps number without hidden User label',projection.some(e=>e.content.includes('未确认身份的号码 222：UNKNOWN_SMS')));
 anon.summary='STALE_SUMMARY';smsStore.saveSms(state);state.messages=state.messages.filter(m=>m.original!=='UNKNOWN_SMS');smsStore.saveSms(state);
 check('Deleting SMS invalidates stale thread summary',smsStore.loadSms().threads.find(t=>t.id===anon.id).summary===undefined);
 anon.blockedByCharacter=true;smsStore.saveSms(state);
 check('Character blocking unknown number records an observation',smsStore.loadSmsProjectionEntries('a').some(e=>e.content.includes('屏蔽了短信号码 222')));
 const services=load('memory-service',{'./memory-storage':{loadMemoryEntriesByType:async(_,kind)=>[{id:kind,characterId:'a',content:'OLD_MEMORY',createdAt:'2026-11-09T00:00:00Z',updatedAt:'2026-11-09T00:00:00Z',metadata:{}}]},'./memory-event-meta':{memoryDateLabel:blank,memoryDateValue:blank},'./token-counter':token,'./settings-storage':{resolveAuxiliaryApiConfig:()=>{throw Error('under-budget embedding must not be called');}}});
 check('Long-term under-budget strategy is unchanged',(await services.retrieveMemoriesForPrompt('a','topic',config)).length===1);
 check('Historical long-term excludes later summaries',(await services.retrieveMemoriesForPrompt('a','topic',config,{beforeTimestamp:'2026-11-08T00:00:00Z'})).length===0);
 const meta=load('memory-event-meta',{'./kv-db':kv});meta.revokeMemorySources(['diary:deleted']);
 const mixed={id:'mix',content:'OLD',metadata:{summarySegments:[{sourceKeys:['diary:deleted'],content:'DELETED_DIARY'},{sourceKeys:[],content:'LATER_INDEPENDENT_CHAT'}]}};
 check('Deleting archive preserves later independent Chat segment',meta.projectMemoryEntry(mixed).content==='LATER_INDEPENDENT_CHAT');
 const wvs=load('weverse-live-memory');const start=100000,end=200000;
 const live={id:'live',communityId:'w',hostCharacterIds:['a'],startedAt:start,endedAt:end,status:'ended',title:'GYM',segments:[{id:'s',characterId:'a',kind:'speech',original:'HOST_SPEECH',createdAt:120000}],comments:[]};
 check('WVS ongoing live has no memory',wvs.buildWeverseLiveMemory({...live,status:'live'},'a','W',x=>x).length===0);
 check('WVS User plus one character is personal',wvs.buildWeverseLiveMemory({...live,participantPresence:[{characterId:'a',joinedAt:start},{characterId:'user:u',joinedAt:start}]},'a','W',x=>x).every(e=>!e.shared));
 check('WVS legacy two actual hosts retains second host and shared status',wvs.buildWeverseLiveMemory({...live,hostCharacterIds:['a','b']},'b','W',x=>x).some(e=>e.shared&&e.content.includes('HOST_SPEECH')));
 // New app integration: actual helper + SMS engine + assembler + provider serialization.
 const memoryMock={'./memory-storage':{loadMemoryConfig:()=>config},'./memory-service':{retrieveMemoriesForPrompt:async()=>[{content:'LT_SELECTED'}],retrieveCoreMemoriesForPrompt:async()=>[{content:'CORE_SELECTED'}]},'./memory-injector':{formatLongTermMemories:e=>e.map(x=>x.content).join(''),formatCoreMemories:e=>e.map(x=>x.content).join('')},'./short-term-assembler':recent};
 const helper=load('character-memory-context',memoryMock);let sent;
 const sms=load('sms-engine',{...base,'./character-memory-context':helper,'./llm-prompt-assembler':assembler,
 './character-language':{buildCharacterOutputLanguageInstruction:blank},'./chat-engine':{sendLLMRequest:async(_a,_p,m)=>{sent=m;return '{"send":true,"messages":[{"original":"ok"}]}';}},
 './settings-storage':{loadBindingConfig:()=>({}),resolveBinding:()=>({apiConfigId:'api'}),loadApiConfigs:()=>[{id:'api'}],loadPresets:()=>[{id:"default",builtIn:true,prompts:[marker,{identifier:"memoryCore",marker:true,enabled:true},{identifier:"memoryLongTerm",marker:true,enabled:true}]}],loadWorldBooks:()=>[],loadRegexes:()=>[],resolveUserIdentity:()=>({name:'U'})},
 './character-time':{buildCharacterTimeContext:()=>({timeContext:''})},'./communication-policy':{communicationBusy:()=>null,loadCommunicationPolicy:()=>({phone:{proactiveCharacterIds:[]}}),clearBusySms:blank,CONTACT_MOTIVE_RULES:''},
 './sms-continuity':{chatStatus:()=>({recent:['OLD_FIVE_SNIPPETS'],requests:[]})}});
 await sms.generateSmsReply({...real,characterNumber:'999'}, {...state,messages:[{id:'now',threadId:real.id,direction:'outgoing',delivered:true,original:'SMS_NOW',createdAt:Date.parse(time)}]});
 const smsWire=wire(sent);
 check('SMS final provider body includes own current history and cross-app Chat',smsWire.includes('SMS_NOW')&&smsWire.includes('A_GYM_EVENT'));
 check('SMS final provider body contains full selected long-term and core text',smsWire.includes('LT_SELECTED')&&smsWire.includes('CORE_SELECTED'));
 check('SMS no longer duplicates old five Chat snippets',!smsWire.includes('OLD_FIVE_SNIPPETS'));

 const lysnState={messages:lysnMessages,rooms:{a:{stickerPacks:[]}},settings:{testMode:false},subscribedIds:['a']};
 const lysn=load('lysn-engine',{...base,'./character-memory-context':helper,'./llm-prompt-assembler':assembler,
  './chat-engine':{sendLLMRequest:async(_a,_p,m)=>{sent=m;return '{"publish":false,"messages":[]}';}},
  './settings-storage':{loadBindingConfig:()=>({}),resolveBinding:()=>({apiConfigId:'api'}),loadApiConfigs:()=>[{id:'api'}],loadPresets:()=>[{builtIn:true,prompts:[marker,{identifier:'memoryCore',marker:true,enabled:true},{identifier:'memoryLongTerm',marker:true,enabled:true}]}],loadWorldBooks:()=>[],loadRegexes:()=>[]},
  './lysn-storage':{loadLysn:()=>lysnState},'./lysn-calendar-context':{lysnCalendarContext:()=>({canSend:true,summary:'PLAN_ONLY',level:0})},
  './photo-library-storage':{loadPhotoLibrary:()=>({preferences:{enabledCharacterIds:[]},photos:[]})},
  './character-time':{buildCharacterTimeContext:()=>({timeContext:''})},
 });
 const published=await lysn.generateLysn('a',[lysnMessages[1]],'new');
 check('LYSN keeps voluntary silence',published.length===0);
 check('LYSN final provider request receives own Chat and selected memories',wire(sent).includes('A_GYM_EVENT')&&wire(sent).includes('LT_SELECTED')&&wire(sent).includes('CORE_SELECTED'));
 check('LYSN current broadcast is not duplicated by unified projection',wire(sent).split('BROADCAST_POST').length===2);
 check('LYSN preserves anonymous fan and private disclosure boundary',wire(sent).includes('粉丝全是匿名')&&wire(sent).includes('不是粉丝留言'));
 global.window={dispatchEvent(){}};
 const game=load('game-storage',{'./kv-db':{...kv,kvRemove:k=>cache.delete(k)},'./game-builtins':{GAME_BUILTIN_TEMPLATES:[]}});
 game.recordGameProjectionEvent?.({});
 const gameKey='ai_phone_game_state_v1';cache.set(gameKey,JSON.stringify({gameEvents:[{id:'game',localGameId:'local',remoteTemplateId:'template',templateTitle:'Test',characterId:'a',characterName:'A',playerName:'U',summary:'MULTI_GAME',participantIds:['a','b'],timestamp:time}]}));
 check('Game membership survives native normalization',game.loadGameProjectionEntries('b').some(e=>e.summary==='MULTI_GAME'&&e.participantIds.includes('b')));
 const profile=load('chat-profile-storage',{'./kv-db':kv});
 profile.updateChatCharacterProfile('not-a-contact',{displayName:'NPC_CHAT_NAME'});
 check('Chat nickname can be set without adding a friend',profile.resolveChatCharacterDisplayName({id:'not-a-contact',name:'NPC'})==='NPC_CHAT_NAME');
 profile.updateChatCharacterProfile('not-a-contact',{displayName:''});
 check('Empty Chat nickname falls back to character name',profile.resolveChatCharacterDisplayName({id:'not-a-contact',name:'NPC'})==='NPC');
 config.shortTermTokenBudget=180;
 const oversized={...histories.sa[0],id:'large',role:'user',content:'FIRST_'+'过长内容'.repeat(2000)+'_LAST'};
 const clipped=recent.prepareShortTermContext('a','sms',{history:[oversized]});
 check('Oversized latest SMS remains as explicit excerpt',clipped.truncatedHistory.some(m=>m.content.includes('FIRST_')&&m.content.includes('_LAST')&&m.content.includes('中间内容未进入')));
 check('Budget clipping never mutates saved message',oversized.content.length>8000&&!oversized.content.includes('中间内容未进入'));
 config.shortTermTokenBudget=10000;
 let eventCount=0;
 const notifier=load('native-memory-update',{'./character-storage':{loadCharacters:()=>chars},'./memory-storage':{loadMemoryConfig:()=>({...config,autoSummarizeEnabled:false}),incrementEventCounter:()=>eventCount++}});
 notifier.queueNativeMemoryUpdate(['a','a','user:u'],'sms',2);await Promise.resolve();
 check('Native event counting excludes duplicate IDs and noncharacters',eventCount===2);
 config.shortTermAllowedSources={sms:false};notifier.queueNativeMemoryUpdate(['a'],'sms',2);await Promise.resolve();
 check('Disabled native source does not trigger summary event counting',eventCount===2);config.shortTermAllowedSources={};
 check('Local context debugging data is not serialized to provider',!wire(assemble(p)).includes('memoryContext'));
 const intro=load('contact-introduction' ,{'./character-storage':{loadCharacters:()=>chars},'./chat-storage':{loadChatContacts:()=>[{characterId:'a'},{characterId:'b'},{characterId:'c'}]},'./character-world-storage':{getCharacterWorldGroup:()=>({id:'world',memberIds:['a','b','c'],relations:[{fromCharacterId:'a',toCharacterId:'b'}]})}});
 check('Recommendation excludes existing acquaintances and self',intro.introductionCandidates('a').map(c=>c.id).join(',')==='c');
 if(fs.existsSync(path.join(root,'lib/ytb-memory.ts'))){
  const channels=[{id:'cha',ownerId:'a',ownerType:'character',name:'A'},{id:'chu',ownerId:'u',ownerType:'user',name:'Fan'}];
  const ytb=load('ytb-memory',{'./character-storage':{loadCharacters:()=>chars}});
  const s={channels,streams:[{id:'ytlive',channelId:'cha',title:'Solo',saved:true,status:'ended',startedAt:start,endedAt:end,lines:[{id:'hostline',kind:'speech',original:'SOLO_MONOLOGUE',at:120000}],comments:[],calls:[]}],threads:[],groups:[]};
  check('YTB solo host monologue gets fallback memory even before summary',ytb.projectYtbMemory(s,'a').some(e=>e.content.includes('SOLO_MONOLOGUE')&&!e.shared));
  check('YTB unsaved live stays out of memory',ytb.projectYtbMemory({...s,streams:s.streams.map(l=>({...l,saved:false}))},'a').length===0);
  const dm={...s,streams:[],threads:[{id:'dm',peerChannelId:'cha',userChannelId:'user:u',messages:[{id:'m',senderId:'chu',name:'Fan',original:'UNANSWERED_DM',at:120000}]}]};
  check('YTB unanswered incoming DM is remembered as received',ytb.projectYtbMemory(dm,'a').some(e=>e.content.includes('UNANSWERED_DM')));
 }
 console.log(`Cross-app memory regression: ${assertions} checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1});
