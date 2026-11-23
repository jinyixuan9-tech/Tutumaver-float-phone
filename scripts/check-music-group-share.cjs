const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, stubs = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module = {exports:{}};
  new Function('require', 'module', 'exports', code)(name => {
    if (name in stubs) return stubs[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
global.window={dispatchEvent(){}};global.CustomEvent=class {};
let shared=[],together=[],closed=0;
const groups={chatShareGroups:()=>[{id:'group-1',groupName:'测试群',participantIds:['a','b']}],GROUP_SHARE_PREFIX:'groupchat:'};
const Group=load('components/chat/group-share-targets.tsx',{'@/lib/chat-share-targets':groups}).GroupShareTargets;
const target={id:'group-1',groupName:'测试群'};
const Sheet=load('components/music/music-share-sheet.tsx',{
 '@/components/chat/group-share-targets':{GroupShareTargets:Group},
 react:{useMemo:f=>f(),useState:()=>['',()=>{}]},'@/lib/character-storage':{loadCharacters:()=>[]},
 '@/lib/chat-profile-storage':{},'@/lib/chat-storage':{pushChatMessage:m=>shared.push(m)},
 '@/lib/chat-share-targets':{resolveChatShareSession:id=>{assert.equal(id,'groupchat:group-1');return target}},
 '@/lib/together-listening':{startListenSession:id=>together.push(id)}
}).default;
const nodes=[];function walk(n){if(!n||typeof n!=='object')return;nodes.push(n);for(const c of [n.props?.children].flat(Infinity))walk(c)}
walk(Sheet({track:{id:'song',title:'红豆',duration:255},onClose:()=>closed++,onShared:n=>assert.equal(n,'测试群')}));
const group=nodes.find(n=>n.type===Group);assert.equal(group.props.actionLabel,'分享');
const row=Group(group.props).props.children[1][0];row.props.onClick();
assert.equal(shared.length,1);assert.equal(shared[0].sessionId,'group-1');assert.equal(shared[0].mediaType,'music_share');assert.equal(shared[0].mediaData.musicTrackId,'song');assert.equal(closed,1);assert.equal(together.length,0);
console.log('PASS music group share button routes one card to selected group without starting together listening');
