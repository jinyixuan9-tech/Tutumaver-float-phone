const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const kv=new Map();let nextReply,task,fail=false,lastConfig,lastPreset,lastPromptScope;const stubs={'./kv-db':{kvGet:k=>kv.get(k),kvSet:(k,v)=>kv.set(k,v),registerDynamicPrefix(){}},'./chat-engine':{buildChatPromptMessages:async(_session,_history,opts)=>{lastPromptScope=opts;return {config:{id:'role-api'},preset:{id:'role-preset'},llmMessages:[{role:'system',content:'ROLE PERSONA MEMORY'}],regexes:[],character:{name:'Role'}}},sendLLMRequest:async(c,p,m)=>{lastConfig=c;lastPreset=p;task=m;if(fail)throw Error('offline');return JSON.stringify(nextReply())}},'./settings-storage':{loadBindingConfig:()=>({appDefaults:{browser:{apiConfigId:'self-api',presetId:'self-preset',worldBookIds:['self-book']}},characterBindings:[]}),resolveBinding:(_config,_char,app)=>app==='browser'?{apiConfigId:'self-api',presetId:'self-preset',worldBookIds:['self-book']}:{},loadApiConfigs:()=>[{id:'self-api'}],loadPresets:()=>[{id:'self-preset',openai_max_tokens:4096}],loadWorldBooks:()=>[{id:'self-book',entries:[{constant:true,disable:false,content:'ONLY_THE_SELF_BROWSER_WORLD_BOOK'}]}],resolveUserIdentity:()=>({name:'User'})},'./llm-prompt-assembler':{isWorldBookEntryActivated:e=>e.constant},'./chat-storage':{createOrGetSession:()=>({id:'s'}),loadChatMessages:()=>[]},'./character-storage':{}};
function load(name,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(stubs[n])return stubs[n];if(n==='jsonrepair')return require('jsonrepair');throw Error(n)},window:{dispatchEvent(){}},CustomEvent:class{},Date,Math,JSON,Set,Error,Promise,console,...extra});return exports}
const ordinaryEngine=fs.readFileSync('lib/checkphone-engine.ts','utf8');
const ordinaryStart=ordinaryEngine.indexOf('export async function generateCheckPhoneBrowser(');
const ordinaryEnd=ordinaryEngine.indexOf('function slugifyCheckPhoneId(',ordinaryStart);
assert(ordinaryStart>=0&&ordinaryEnd>ordinaryStart);
const ordinaryGenerate=ordinaryEngine.slice(ordinaryStart,ordinaryEnd);
assert(ordinaryGenerate.includes('resolveCheckPhoneConfigs(characterId);'),'ordinary history/bookmarks must inherit Check Phone binding');
assert(!ordinaryGenerate.includes('resolveCheckPhoneConfigs(characterId, "checkphone_browser")'),'ordinary browser must not use specialty site binding');
assert(!ordinaryGenerate.includes('translateContentTexts('),'ordinary browser must not invoke specialty site translator');
assert(ordinaryEngine.includes('const binding = resolveBinding(loadBindingConfig(), characterId, "checkphone");'));
console.log('PASS ordinary Check Phone browser remains on Check Phone binding; specialty-site binding is isolated');

const browser=load('browser-collection');

const sampleJson='{"items":[{"title":"Example"}]}';
assert.equal(browser.parseBrowserResponse(sampleJson).items.length,1);
assert.equal(browser.parseBrowserResponse('\x60\x60\x60json\n'+sampleJson+'\n\x60\x60\x60').items.length,1);
assert.equal(browser.parseBrowserResponse('Result:\n'+sampleJson+'\nEnd.').items.length,1);
assert.equal(browser.parseBrowserResponse('{"items": [1,],}').items.length,1);
for(const [text,meta,code] of [
 ['抱歉，我无法生成这类内容',{},'refusal'],
 ['{"items":[{"title":"unfinished"}', {finishReason:'length'},'truncated'],
 ['',{},'empty'],
 ['{"items":[{"title":"unfinished"}',{},'truncated'],
 ['Not JSON: ???',{},'json'],
 ['nothing',{finishReason:'SAFETY'},'filter']
]){
 assert.throws(()=>browser.parseBrowserResponse(text,meta),e=>e.code===code,code);
}
assert.equal(browser.browserRequestError(new Error('API Error 401: unauthorized')).code,'auth');
assert.equal(browser.browserRequestError(new Error('API Error 429: quota exceeded')).code,'quota');
assert.equal(browser.browserRequestError(new Error('Network Error connecting to AI Provider: failed to fetch')).code,'network');
console.log('PASS browser JSON extraction/repair, refusal, filtering, truncation, empty, malformed and provider error classification');

const video=(id)=>({id,title:id,titleZh:'标题',author:'a',tags:['tag'],pairing:'BL',duration:'10:00',description:'Description',descriptionZh:'简介',comments:Array.from({length:3},()=>({author:'a',text:'Hello',translation:'你好'}))});
(async()=>{
 browser.updateBrowserPreferences('user',{include:['BG'],exclude:['GL'],prompt:'shared one'});browser.updateBrowserPreferences('role',{include:['BL'],exclude:['BG'],prompt:'shared one'});assert.equal(browser.loadBrowserCollection('role').prefs.include[0],'BL');browser.updateBrowserPreferences('user',{include:['BG'],exclude:[],prompt:'shared two'});assert.equal(browser.loadBrowserCollection('role').prefs.prompt,'shared two');assert.equal(browser.loadBrowserCollection('role').prefs.exclude[0],'BG');
 nextReply=()=>{const n=Number(task.at(-1).content.match(/生成(\d+)条/)[1]);return {items:Array.from({length:n},(_,i)=>video('new'+i)),searchHistory:['a','b','c','d','e'],favoriteIds:[],favoriteIndexes:[0]}};
 await browser.generateBrowserVideos('role','IGNORED QUERY');let first=browser.loadBrowserCollection('role');assert(first.items.length>=5&&first.items.length<=8);assert.equal(first.history.length,5);assert.equal(first.favorites.length,1);assert(task[0].content.includes('PERSONA MEMORY'));assert(!task.at(-1).content.includes('IGNORED QUERY'));assert.equal(lastPromptScope.appId,'checkphone_browser');assert.deepEqual(Array.from(lastPromptScope.appTags),['checkphone','checkphone_browser']);
 browser.toggleBrowserFavorite('role',first.items[1]);assert.equal(browser.loadBrowserCollection('role').favorites[0].favoriteSource,'manual');browser.deleteBrowserVideo('role',first.items[0].id,'items');assert(browser.loadBrowserCollection('role').favorites.some(v=>v.id===first.items[0].id));browser.deleteBrowserVideo('role',first.items[0].id,'favorites');assert(!browser.loadBrowserCollection('role').favorites.some(v=>v.id===first.items[0].id));
 const prior=browser.loadBrowserCollection('role'),pick=prior.items[2];nextReply=()=>{const n=Number(task.at(-1).content.match(/生成(\d+)条/)[1]);return {items:Array.from({length:n},(_,i)=>video('next'+i)),searchHistory:['f','g','h','i','j'],favoriteIds:[pick.id]}};await browser.generateBrowserVideos('role','');let second=browser.loadBrowserCollection('role');assert(second.favorites.some(v=>v.id===first.items[1].id));assert(second.favorites.some(v=>v.id===pick.id));assert.equal(second.history[0],'f');assert(!second.items.some(v=>v.id===pick.id));const before=JSON.stringify(second);fail=true;await assert.rejects(browser.generateBrowserVideos('role',''));assert.equal(JSON.stringify(browser.loadBrowserCollection('role')),before);
 browser.updateBrowserPreferences('user',{include:['BG'],exclude:[],prompt:'own site preference'});
 fail=false;nextReply=()=>{const n=Number(task.at(-1).content.match(/生成(\d+)条/)[1]);return {items:Array.from({length:n},(_,i)=>({...video('own'+i),pairing:'BG'}))}};
 await browser.generateBrowserVideos('user','');
 assert.equal(lastConfig.id,'self-api');
 assert.equal(lastPreset.id,'self-preset');
 assert(task.some(message=>message.content.includes('ONLY_THE_SELF_BROWSER_WORLD_BOOK')));
 assert(!task.some(message=>message.content.includes('ROLE PERSONA MEMORY')));
 assert(browser.loadBrowserCollection('user').items.length>=5);
 console.log('PASS isolated self Browser API/preset/world-book and role Browser prompt binding scope');
 const full=Array.from({length:20},(_,i)=>({...video('old'+i),favoriteSource:i===0?'manual':'auto'}));const merged=browser.mergeRoleFavorites(full,[video('fresh')],false,()=>0);assert.equal(merged.length,20);assert(merged.some(v=>v.id==='old0'));assert(!merged.some(v=>v.id==='old1'));const manual=full.map(v=>({...v,favoriteSource:'manual'}));assert(!browser.mergeRoleFavorites(manual,[video('fresh')]).some(v=>v.id==='fresh'));assert(browser.mergeRoleFavorites(manual,[video('fresh')],true).some(v=>v.id==='fresh'));
 console.log('PASS shared prompt, separate pairings, role generation with persona, 5–8 history, prior-batch favorites, manual priority, independent deletes, failed refresh atomicity, 20 cap');
 const document=new EventTarget();document.visibilityState='visible';const battery=new EventTarget();battery.level=.47;battery.charging=false;const received=[];const device=load('device-battery',{document});const stop=device.observeDeviceBattery(x=>received.push(x),{getBattery:async()=>battery});await Promise.resolve();assert.equal(received.at(-1).percent,47);battery.level=.46;battery.dispatchEvent(new Event('levelchange'));assert.equal(received.at(-1).percent,46);battery.charging=true;battery.dispatchEvent(new Event('chargingchange'));assert.equal(received.at(-1).charging,true);document.dispatchEvent(new Event('visibilitychange'));stop();const len=received.length;battery.dispatchEvent(new Event('levelchange'));assert.equal(received.length,len);device.observeDeviceBattery(()=>assert.fail('unsupported must not invent battery'),{})();console.log('PASS battery initial value, level, charging, resume, cleanup and unsupported fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
