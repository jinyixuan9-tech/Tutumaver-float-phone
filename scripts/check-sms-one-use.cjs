const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),Module=require('module');
const memory=new Map();const original=Module._load;
Module._load=function(req,parent,...rest){if(req==='./kv-db'&&parent?.filename.endsWith('sms-storage.ts'))return{registerKvMigration(){},kvGet:k=>memory.get(k),kvSet:(k,v)=>memory.set(k,v)};return original.call(this,req,parent,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const sms=require('../lib/sms-storage.ts');const state=sms.loadSms();state.realNumber='+82 10 1111 2222';
const old=sms.createVirtualIdentity(state,'JP');const thread=sms.ensureSmsThread(state,'a',old.id);thread.awareness='confirmed';sms.addSmsMessage(state,thread,'outgoing','旧会话');sms.saveSms(state);
const baseline=JSON.stringify(sms.loadSms());let s=sms.loadSms();let n=sms.createVirtualIdentity(s,'KR');let t=sms.ensureSmsThread(s,'a',n.id);sms.saveSms(s);
assert.notEqual(t.id,thread.id);assert.notEqual(t.number,thread.number);assert.equal(t.awareness,'unknown');assert.equal(sms.ensureSmsThread(s,'a',n.id).id,t.id);
s=sms.loadSms();assert.equal(s.threads.find(x=>x.id===thread.id).awareness,'confirmed');assert.equal(s.messages[0].original,'旧会话');assert.equal(s.identities.find(x=>x.id===old.id).number,old.number);
for(const region of sms.SMS_REGIONS){const id=sms.createVirtualIdentity(s,region.code);assert(id.number.startsWith(region.prefix));assert.equal(id.region,region.code)}
assert.equal(new Set(s.identities.map(x=>x.number)).size,s.identities.length);assert(baseline.includes('旧会话'));
console.log('PASS: 一次性号跨会话隔离、同会话复用、旧号码/记录/识别状态保留、全部地区与号码去重');
const before=Module._load;Module._load=function(req,parent,...rest){if(parent?.filename.endsWith('communication-policy.ts')){if(req==='./kv-db')return{registerKvMigration(){},kvGet:k=>memory.get(k),kvSet:(k,v)=>memory.set(k,v)};if(req==='./chat-busy-hold')return{getActiveCalendarBusy:()=>null};if(req==='./chat-storage')return{loadChatMessages:()=>[],loadChatSessions:()=>[]};if(req==='./phone-storage')return{loadPhoneState:()=>({calls:[]})};}return before.call(this,req,parent,...rest)};
const policy=require('../lib/communication-policy.ts');assert(policy.communicationContactEnabled('sms','a'));assert(policy.communicationContactEnabled('phone','a'));
const config=policy.loadCommunicationPolicy();config.sms.excludedCharacterIds=['a'];config.sms.proactiveCharacterIds=['a'];policy.saveCommunicationPolicy(config);assert.equal(policy.communicationContactEnabled('sms','a'),false);assert.equal(policy.communicationContactEnabled('phone','a'),true);assert.equal(sms.loadSms().messages[0].original,'旧会话');console.log('PASS: 旧版默认联系人范围保留、短信/电话独立引入、移出不删会话');
