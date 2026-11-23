// Run from the project root: node scripts/check-youtube-navigation.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { initialYtbNavigation, navigateYtb, backYtb, replaceYtb } = require('../lib/ytb-navigation.ts');
const own = 'user:me';
const at = (tab = 'home', extra = {}) => ({ current: { ...initialYtbNavigation().current, tab, ...extra }, history: [] });
const open = (n, type, id, patch) => navigateYtb(n, type === 'all' ? { type } : { type, id }, patch, own);
const channel = { type: 'channel', id: 'character:a' }, group = { type: 'group', id: 'g' }, thread = { type: 'thread', id: 't' };
let paths = 0;
for (const tab of ['home', 'discover', 'messages', 'mine']) {
 const root = at(tab, { channelTab: 'community', messageTab: 'community' });
 for (const type of ['data', 'editor']) {
  const n = open(root, type, own);
  assert.deepEqual(backYtb(n), root, `${tab} -> ${type} -> back`); paths++;
 }
}
let n = open(at(), 'channel', channel.id, { channelTab: 'community' });
const originalChannel = structuredClone(n);
n = open(n, 'group', 'g');
n = backYtb(n);assert.deepEqual(n, originalChannel);
n = backYtb(n);assert.equal(n.current.screen, null);assert.equal(n.current.tab, 'home');assert.equal(n.history.length, 0);paths++;
for (const type of ['group','thread']) {
 const root = at('messages', { messageTab: type === 'group' ? 'community' : 'dm' });
 let x = open(root,type,type === 'group'?'g':'t');const conversation=structuredClone(x);
 x=open(x,'channel',channel.id);x=backYtb(x);assert.deepEqual(x,conversation);
 x=backYtb(x);assert.deepEqual(x,root);paths++;
}
for (const type of ['data','editor','stream']) {
 let x=open(at(),'channel',channel.id,{channelTab:'replay'}),source=structuredClone(x);
 x=open(x,type,type==='stream'?'saved-recording':channel.id);assert.deepEqual(backYtb(x),source);paths++;
}
let cyc=open(at(),'channel',channel.id,{channelTab:'community'});cyc=open(cyc,'group','g');cyc=open(cyc,'channel',channel.id);
assert.equal(cyc.history.length,1,'Revisiting a destination unwinds rather than adds duplicate pages');
assert.equal(backYtb(cyc).current.screen,null);paths++;
let mine=at('mine',{channelTab:'community'}),ownPage=open(mine,'group','g');ownPage=open(ownPage,'channel',own,{channelTab:'community'});
assert.equal(ownPage.current.tab,'mine');assert.equal(ownPage.current.screen,null);assert.equal(ownPage.history.length,0);paths++;
let studio=open(at(),'studio',own);studio=replaceYtb(studio,{type:'stream',id:'new-stream'});assert.equal(backYtb(studio).current.screen,null,'Starting a live does not return to an obsolete studio');paths++;
let edit=open(originalChannel,'editor',channel.id);edit=backYtb(edit);assert.equal(edit.current.channelTab,'community');paths++;
const {migrateSocialWorldBookSelections}=(()=>{
 const Module=require('node:module');const load=Module._load;
 Module._load=function(name,parent,...args){if(parent?.filename.endsWith('social-worldbook-bindings.ts')&&name==='./kv-db')return{registerKvMigration(){}};if(parent?.filename.endsWith('social-worldbook-bindings.ts')&&name==='./settings-storage')return{};return load.call(this,name,parent,...args);};
 const out=require('../lib/social-worldbook-bindings.ts');Module._load=load;return out;
})();
const config={globalDefaults:{worldBookIds:['global']},appDefaults:{twitter:{worldBookIds:['new-choice']}},characterBindings:[]};
const migrated=migrateSocialWorldBookSelections(config,{twitter:['legacy'],topic:['topic-only'],theqoo:['forum-world']});
assert.deepEqual(migrated.appDefaults.twitter.worldBookIds,['new-choice'],'Existing unified bindings win');
assert.deepEqual(migrated.appDefaults.twitter.topicWorldBookIds,['topic-only'],'Topic books remain isolated');
assert.deepEqual(migrated.appDefaults.theqoo.worldBookIds,['forum-world']);
assert.deepEqual(migrateSocialWorldBookSelections(migrated,{twitter:['legacy'],topic:['topic-only'],theqoo:['forum-world']}),migrated,'Migration is idempotent');
assert.equal(config.appDefaults.theqoo,undefined,'Migration does not mutate the source');
console.log(`PASS: ${paths} navigation paths, origin/tab restoration, cycle prevention, studio replacement, worldbook migration priority/idempotence/topic isolation.`);
