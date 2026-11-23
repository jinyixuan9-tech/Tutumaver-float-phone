const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const root=process.cwd();
function fixture(actions,{books=[],summaryError=false,visibleChecks=false}={}){
 const kv=new Map(),events=[],calls=[],reads=[],posts=[{id:'p1',authorId:'user',authorType:'user',content:'one post'}];let ui={app:'chat',view:'thread'},count=0;
 const sessions=[{id:'sa',contactId:'a'},{id:'sb',contactId:'b'}],messages=[{id:'m1',sessionId:'sb',role:'user',content:'recent text',createdAt:'2026-11-03'}];
 const stubs={
 './kv-db':{kvGet:k=>kv.get(k),kvSet:(k,v)=>kv.set(k,v),registerKvMigration(){}},
 './chat-storage':{loadChatSessions:()=>sessions,loadChatContacts:()=>[{characterId:'a'},{characterId:'b'}],loadChatMessages:id=>messages.filter(m=>m.sessionId===id),getLastVisibleSessionMessage:id=>messages.findLast(m=>m.sessionId===id),getChatMessagePreview:m=>m.content,updateChatMessage(){},pushChatMessage:m=>{const row={...m,id:'new'+count++};messages.push(row);return row}},
 './moments-storage':{loadMomentPosts:()=>posts,loadAllMomentComments:()=>[]},
 './chat-offline-storage':{getLastChatOfflineTurn:()=>null,getChatOfflineTurnPreview:()=>''},
 './chat-profile-storage':{resolveChatCharacterDisplayName:c=>c.name},
 './character-storage':{loadCharacters:()=>[{id:'a',name:'A'},{id:'b',name:'B'}]},
 './shopping-storage':{loadShoppingState:()=>({cartItems:[{id:'shop1'}],foodCartItems:[{id:'food1'}],orders:[{id:'order1',mode:'food'}]})},
 './reading-storage':{hydrateReadingStorage:async()=>{},loadBooks:()=>books,loadProgress:async()=>({chapterIndex:0,scrollPosition:0,readingMode:'scroll'}),loadChapters:async()=>[{index:0,title:'Chapter',paragraphs:['visible line']}]},
 './checkphone-access':{phoneOperationId:()=>String(++count)},
 './reverse-phone-motion':{reverseWait:async(ms,signal)=>{if(signal?.aborted)throw new DOMException('Paused','AbortError');if(ms===120)await new Promise(r=>setTimeout(r,1))},revealReverseSelector:async selector=>{if(visibleChecks&&selector.includes('data-reverse-session-id')&&ui.view!=='list')throw Error('页面尚未准备好，未读取未显示的内容。');}}
 };
 const window={dispatchEvent:e=>{events.push({type:e.type,detail:e.detail});if(e.type==='rabbit-reverse-navigation')ui=e.detail}};
 function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+'/lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(n in stubs)return stubs[n];throw Error('unexpected '+n)},window,Event:class{},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o?.detail}},console,Date,Math,JSON,Set,Map,Error,DOMException,AbortController,setTimeout,clearTimeout,CSS:{escape:x=>x}});return exports}
 stubs['./chat-list-entry']={removedChatEntries:()=>[]};stubs['./browser-collection']={loadBrowserCollection:()=>({items:[],favorites:[],history:[],opened:[]})};
 const state=load('reverse-phone-state');stubs['./reverse-phone-state']=state;const data=load('reverse-phone-data');stubs['./reverse-phone-data']={...data,readReversePage:async p=>{reads.push(p);return data.readReversePage(p)}};
 stubs['./reverse-phone-prompt']={reverseLineText:l=>l.original,requestReverseJson:async(_,prompt)=>{calls.push(prompt);if(prompt.startsWith('本次查看手机')){if(summaryError)throw Error('provider 503');return{messages:[]}}const action=actions.shift();if(!action)throw Error('no scripted action');return{speech:[],postThoughts:[],action}}};
 const runtime=load('reverse-phone-runtime');return{state,data,runtime,events,calls,reads,getUi:()=>ui};
}
const tick=()=>new Promise(r=>setTimeout(r,1));
async function pauseCase(actions,options){const f=fixture(actions,options);let rejected;const run=f.runtime.startReversePhone('a','sa').catch(e=>{rejected=e});for(let i=0;i<1000&&!f.state.activeReverse()?.paused&&!rejected;i++)await tick();const error=f.state.activeReverse()?.error,ui=f.getUi();assert(error||rejected,'expected pause or rejection');const v=f.state.activeReverse();if(v)await f.runtime.finishReversePhone(v.id,true);await run;return{error,rejected,ui,reads:f.reads}}
(async()=>{
 {const f=fixture([{type:'open_app',target:'moments'},{type:'finish'}]);await f.runtime.startReversePhone('a','sa');assert.equal(f.state.activeReverse(),null);assert.equal(f.state.reverseVisits()[0].stopped,false);console.log('PASS moments → silent finish');}
 {const f=fixture([{type:'open_app',target:'moments'},{type:'scroll',text:'down'},{type:'finish'}],{visibleChecks:true});await f.runtime.startReversePhone('a','sa');assert.equal(f.state.activeReverse(),null);assert(f.events.some(e=>e.type==='rabbit-reverse-navigation'&&e.detail.view==='list'));console.log('PASS moments scroll switches visible page before list read');}
 {const f=fixture([{type:'open_app',target:'moments'},{type:'open_app',target:'shopping',text:'cart'},{type:'scroll',text:'down'},{type:'open_app',target:'shopping',text:'food_orders'},{type:'open_app',target:'reading'},{type:'open_book',target:'book1'},{type:'finish'}],{books:[{id:'book1',title:'Book',author:'Author'}]});await f.runtime.startReversePhone('a','sa');assert.equal(f.state.activeReverse(),null);assert(f.events.some(e=>e.detail?.scroll===1));assert(f.reads.some(p=>p.mode==='food'&&p.view==='orders'));assert(f.reads.some(p=>p.app==='reading'&&p.view==='book'));console.log('PASS shopping scroll, takeaway, reading shelf and book, normal end');}
 {const f=fixture([{type:'open_app',target:'moments'},{type:'open_book',target:'missing'},{type:'finish'}]);await f.runtime.startReversePhone('a','sa');assert.equal(f.state.activeReverse(),null);assert(!f.reads.some(p=>p.app==='reading'));console.log('PASS empty shelf never opens nonexistent book');}
 {const f=fixture([{type:'open_app',target:'moments'},{type:'finish'}],{summaryError:true});await f.runtime.startReversePhone('a','sa');const run=f.state.reverseVisits()[0];assert(run.endedAt);assert.equal(run.finishError,'provider 503');assert.equal(f.state.activeReverse(),null);console.log('PASS finish reply error stored separately from ended visit');}
 {const f=fixture([{type:'open_contacts'},{type:'open_chat',target:'b'},{type:'finish'}]);await f.runtime.startReversePhone('a','sa');assert(f.reads.some(p=>p.view==='thread'&&p.target==='sb'));console.log('PASS existing conversation accessible through contacts');}
 console.log('Inspection 008 route regression suite passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
