const ts=require('typescript'),fs=require('fs'),path=require('path'),Module=require('module'),assert=require('node:assert/strict');
const root=process.cwd();let items=[{id:'night',date:'2026-10-14',startTime:'23:00',endTime:'02:00',busyLevel:4,title:'跨夜拍摄',location:''}];
const mocks={'kv-db':{registerDynamicPrefix(){},kvGet(){return null},kvSet(){},kvRemove(){}},'character-storage':{loadCharacters:()=>[{id:'a',timeZone:'Asia/Seoul'}]},'calendar-storage':{loadOwnerCalendarPlans:()=>[{items}]}};
const orig=Module._load;Module._load=function(req,parent,...rest){const name=path.basename(req).replace(/\.ts$/,'');if(parent?.filename.startsWith(root+'/lib/')&&mocks[name])return mocks[name];return orig.call(this,req,parent,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {getActiveCalendarBusy}=require('../lib/chat-busy-hold.ts');
// 16:00 UTC on Oct 14 is 01:00 on Oct 15 in Seoul.
let active=getActiveCalendarBusy('a',new Date('2026-10-14T16:00:00Z'));assert.equal(active.level,4);assert.equal(active.endsAt,Date.parse('2026-10-14T17:00:00Z'));
assert.equal(getActiveCalendarBusy('a',new Date('2026-10-14T17:00:00Z')),null);
items.push({id:'mild',date:'2026-10-15',startTime:'00:30',endTime:'01:30',busyLevel:2,title:'普通日程',location:''});active=getActiveCalendarBusy('a',new Date('2026-10-14T16:00:00Z'));assert.equal(active.level,4,'重叠日程取最忙等级');
console.log('PASS: 角色时区、前一天跨夜日程、结束边界、重叠日程优先级。');
