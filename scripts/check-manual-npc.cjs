const fs=require('fs'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict'),Module=require('module');
const root=process.cwd(),kv=new Map();let chars=[{id:'a',name:'A',persona:'主角',canvasX:50,canvasY:50,tags:[]},{id:'f',name:'F',persona:'前辈',tags:[]}],nextId=0,autoPost={autoPostDisabledCharacterIds:[]};
const mocks={
 'kv-db':{registerKvMigration(){},kvGet:k=>kv.get(k)||null,kvSet:(k,v)=>kv.set(k,v)},
 'settings-storage':{loadUserIdentities:()=>[],resolveUserIdentity:()=>null,loadApiConfigs:()=>[],loadBindingConfig:()=>({}),resolveBinding:()=>({})},
 'character-storage':{loadCharacters:()=>chars,saveCharacters:x=>{chars=x},createCharacter:data=>({...data,id:'npc_'+(++nextId),createdAt:new Date().toISOString()})},
 'chat-storage':{loadChatContacts:()=>[]},
 'moments-storage':{loadMomentsConfig:()=>autoPost,saveMomentsConfig:x=>{autoPost=x}},
 'memory-storage':{loadMemoryConfig:()=>({})},'memory-service':{retrieveCoreMemoriesForPrompt:async()=>[],retrieveMemoriesForPrompt:async()=>[]},'memory-injector':{},
 'api-helpers':{simpleLLMCall:async()=>{throw Error('手动添加不得调用API')}},
};
const old=Module._load;Module._load=function(req,parent,...rest){const key=path.basename(req).replace(/\.ts$/,'');if(parent?.filename.startsWith(root+'/lib/')&&mocks[key])return mocks[key];return old.call(this,req,parent,...rest)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
global.CustomEvent=class{constructor(name){this.type=name}};global.window={dispatchEvent(){}};
const world=require('../lib/character-world-storage.ts'),npc=require('../lib/npc-generator.ts'),wl=require('../lib/worldline-storage.ts');
world.loadCharacterWorldGroups();const g=world.createCharacterWorldGroup('测试世界');world.moveCharacterToWorld('a',g.id);world.moveCharacterToWorld('f',g.id);
const draft=name=>({name,persona:'独立人设',personality:'开朗',briefPersona:'队员',relationLabel:'队友',reverseRelationLabel:'队友',avatar:'https://example.com/avatar.png'});
const b=npc.materializeSupportingCharacter(draft('B'),'a',{worldId:g.id});assert(b.tags.includes('配角'));assert.equal(b.avatar,'https://example.com/avatar.png');assert.equal(world.getCharacterWorldGroupId(b.id),g.id);assert(autoPost.autoPostDisabledCharacterIds.includes(b.id));
const c=npc.materializeSupportingCharacter(draft('C'),'',{worldId:g.id});assert.equal(world.getCharacterWorldGroupId(c.id),g.id);let group=world.loadCharacterWorldGroups().find(x=>x.id===g.id);assert(!group.relations.some(r=>r.fromCharacterId===c.id||r.toCharacterId===c.id),'暂不关联不能产生空人物关系');
world.addCharacterWorldRelation(g.id,b.id,c.id,'队友',{bidirectional:true});world.addCharacterWorldRelation(g.id,b.id,'f','后辈');world.addCharacterWorldRelation(g.id,c.id,'f','后辈');
group=world.loadCharacterWorldGroups().find(x=>x.id===g.id);assert(group.relations.some(r=>r.fromCharacterId===b.id&&r.toCharacterId===c.id));assert(group.relations.some(r=>r.fromCharacterId===c.id&&r.toCharacterId==='f'));assert.equal(chars.filter(x=>x.id===b.id).length,1,'多关系共用同一张人物卡');
const noAvatar=npc.materializeSupportingCharacter({...draft('D'),avatar:'javascript:alert(1)'},'a');assert.equal(noAvatar.avatar,null);
const before=chars.length;assert.throws(()=>npc.materializeSupportingCharacter(draft('无效'),'gone',{worldId:g.id}));assert.equal(chars.length,before,'无效关联在建档前拒绝');assert.throws(()=>npc.materializeSupportingCharacter(draft('无效'),'',{worldId:'gone'}));assert.equal(chars.length,before);
const blank=world.createCharacterWorldGroup('空世界');const solo=npc.materializeSupportingCharacter(draft('独立配角'),'',{worldId:blank.id});assert.equal(world.getCharacterWorldGroupId(solo.id),blank.id,'空世界可以先手动加配角');
const event={id:'event',title:'队内会议',detail:'B和C一起参加',occurredAt:'2026-08-08T12:00:00Z',visibility:'private',people:{[b.id]:{access:'witnessed',perspective:'B自己的看法'},[c.id]:{access:'witnessed',perspective:'C自己的看法'}}};wl.saveWorldlineState({activeId:'w',worlds:[{id:'w',name:'世界线',archive:[{name:'规则',entries:[{title:'背景',content:'测试世界背景'}]}],events:[event],currentState:'当前进度',progressHistory:[],characterIds:[b.id,c.id]}]});
assert(wl.worldlineContextForApp('chat').includes('测试世界背景'));assert(wl.worldlineContextForApp('chat').includes('当前进度'));assert.equal(wl.worldlineEventsForCharacter(b.id)[0].perspective,'B自己的看法');assert.equal(wl.worldlineEventsForCharacter(c.id)[0].perspective,'C自己的看法');assert.equal(wl.worldlineEventsForCharacter('f').length,0,'拉线不等于知道私人事件');
let state=wl.loadWorldlineState();state.worlds[0].events=[];wl.saveWorldlineState(state);assert.equal(wl.worldlineEventsForCharacter(b.id).length,0);
console.log('PASS: 手动无API建档、可选关联/空世界建档、同世界多角色/NPC互连、头像校验、无效目标不留残卡、世界背景/当前进度/私人事件和视角权限、删事件撤回');
