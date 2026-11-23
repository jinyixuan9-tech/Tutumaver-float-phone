const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
function load(file,stubs){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in stubs)return stubs[n];throw Error('Missing '+n)},m,m.exports);return m.exports;}
const values=new Map(),db={kvGet:k=>values.get(k),kvSet:(k,v)=>values.set(k,v),registerKvMigration(){}};
global.window={dispatchEvent(){}};global.CustomEvent=class{};
(async()=>{
const images=load('lib/text-image-storage.ts',{'./kv-db':db});let record=images.loadTextImage('chat','one','原描述');record=images.saveTextImage({...record,previewRef:'asset://generated'});record=images.adoptTextImage(record);assert.equal(record.adoptedRef,'asset://generated');assert.equal(record.previewRef,undefined);record=images.revertTextImage(record);assert.equal(record.textMode,true);assert.equal(record.previousRef,'asset://generated');assert.equal(record.adoptedRef,undefined);
const lang=load('lib/image-prompt-language.ts',{'./kv-db':db});assert.equal(lang.loadImagePromptLanguage(),'zh');lang.saveImagePromptLanguage('en');assert(lang.imagePromptLanguageInstruction().includes('英语'));assert(lang.imagePromptLanguageInstruction().includes('不改变正文'));
let visit={id:'visit1',owner:'char',mode:'decrypt'},visits=[visit],messages=[],counter=0;const storage={createOrGetSession:()=>({id:'session'}),pushChatMessage:m=>{const saved={...m,id:'message'+(++counter)};messages.push(saved);return saved;},loadChatMessages:()=>messages,deleteChatMessagesByIds:(s,ids)=>{messages=messages.filter(m=>!ids.includes(m.id));}};
global.Event=class{};
const access={currentPhoneVisit:()=>visit,phoneVisits:()=>visits,phoneOperationId:()=> 'op'+(++counter),savePhoneVisit:v=>{visits=visits.map(x=>x.id===v.id?v:x)}};
let browser;
const play=load('lib/checkphone-play.ts',{'./browser-video-share':{undoBrowserShares:id=>browser.undoBrowserShares(id)},'./kv-db':db,'./character-storage':{loadCharacters:()=>[]},'./character-world-storage':{loadCharacterWorldGroups:()=>[]},'./phone-reconcile':{pruneReconciliations(){}},'./checkphone-communications':{isUserCommunicationName:()=>true},'./checkphone-access':access,'./chat-storage':storage});
browser=load('lib/browser-video-share.ts',{'./kv-db':db,'./chat-share-targets':{resolveChatShareSession:target=>({id:target.startsWith('groupchat:')?'group':'session'})},'./chat-storage':storage,'./checkphone-access':access,'./checkphone-play':play,'./chat-notification-events':{openSharedChatSession(){}},'./reverse-phone-state':{activeReverse:()=>false}});
const video={id:'v',title:'Original title',titleZh:'不应发给模型的译文',author:'Author',tags:['tag'],duration:'3:10',description:'Original description',descriptionZh:'译文描述',comments:[1,2,3,4].map(i=>({id:'c'+i,author:'a'+i,text:'original '+i,translation:'评论译文'+i}))};
const snap=browser.browserVideoSnapshot(video,'user');video.tags.push('new');video.comments[0].text='changed';assert.deepEqual(snap.tags,['tag']);assert.equal(snap.comments[0].text,'original 1');assert.equal(snap.comments.length,3);assert(!browser.browserSnapshotText(snap).includes('译文'));assert(!browser.browserSnapshotText(snap).includes('original 4'));
browser.shareBrowserVideoToChat(video,'char');assert.equal(messages.at(-1).role,'user');browser.shareBrowserVideoToChat(video,'groupchat:g');assert.equal(messages.at(-1).sessionId,'group');
const role=browser.shareBrowserVideoToChat(video,'user','char');browser.shareBrowserVideoToChat(video,'user','char');assert.equal(messages.filter(m=>m.role==='assistant').length,1);assert.equal(role.mediaData.browserVideoSnapshot.source,'role');assert(!role.content.includes('user-during-phone-visit'));assert.equal(browser.browserShareMemory('char').length,0);
browser.registerPendingBrowserShares(visit);
let thread=play.playThreads(visit.id)[0];
assert.equal(thread.messages.length,1);
assert.equal(thread.messages[0].id,role.id);
play.addPlayMessage(thread,'普通代发消息','outgoing');
play.commitPlayVisit(visit);
assert.equal(messages.filter(m=>m.role==='assistant').length,2);
assert.equal(messages.filter(m=>m.id===role.id).length,1);
thread=play.playThreads(visit.id)[0];
assert.equal(thread.chatIds.length,2);
play.updatePlayKnowledge(thread.id,'发现两条账号发出的消息，实际操作者未知');
assert.match(play.phonePlayMemory('char')[0].content,/实际操作者未知/);
// Mark the shared thread removed through the production undo path.
play.undoPhoneVisit(visit.id,true);
assert.equal(messages.filter(m=>m.role==='assistant').length,0);
assert.equal(play.phonePlayMemory('char').length,0);
visit=null;
assert.throws(()=>browser.shareBrowserVideoToChat(video,'user','char'));
console.log('PASS original-only immutable snapshots, share dedup, common phone thread, no duplicate on commit, shared memory and undo');
})().catch(e=>{console.error(e);process.exitCode=1;});
