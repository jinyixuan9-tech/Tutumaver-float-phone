const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path,stubs){
 const module={exports:{}};
 const transpiled=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',transpiled)(id=>{if(id in stubs)return stubs[id];throw Error('Missing dependency '+id);},module,module.exports);
 return module.exports;
}
const contract='CALENDAR_TEST_CONTRACT';
const {BUILTIN_PRESET_VERSION,createBuiltinPreset,repairBuiltinChatImmersion}=load('lib/builtin-preset.ts',{
 './calendar-generation-prompt':{CALENDAR_SCHEDULE_CONTRACT:contract},
 './checkphone-config':{getCheckPhonePromptTags:()=>[]},
});
assert.equal(BUILTIN_PRESET_VERSION,265,'Do not reset installed user presets');
const fresh=createBuiltinPreset();
const entry=fresh.prompts.find(p=>p.identifier==='chat_immersion_instruction');
assert(entry);
assert(!entry.content.includes(contract),'Chat preset must not carry calendar fields');
assert(entry.content.includes('自然聊天'));
const bad={...fresh,prompts:fresh.prompts.map(p=>p.identifier==='chat_immersion_instruction'?{...p,content:'用户设置的日历方向\n'+contract}:p),someUserField:'preserve'};
const repaired=repairBuiltinChatImmersion(bad);
assert(repaired!==bad);
assert.equal(repaired.someUserField,'preserve');
assert.equal(repaired.prompts.find(p=>p.identifier==='chat_immersion_instruction').content,entry.content);
assert.equal(repaired.prompts.find(p=>p.identifier==='chat_immersion_instruction').enabled,entry.enabled);
const userCustom={...bad,builtIn:false};
assert.equal(repairBuiltinChatImmersion(userCustom),userCustom,'Never modify custom preset');
const alreadyEdited={...fresh,prompts:fresh.prompts.map(p=>p.identifier==='chat_immersion_instruction'?{...p,content:'我自己写的 Chat 指令'}:p)};
assert.equal(repairBuiltinChatImmersion(alreadyEdited),alreadyEdited,'Do not overwrite personalized Chat prompt');
console.log('PASS share 080 separate calendar contract, targeted repair, custom preservation, no version reset');
