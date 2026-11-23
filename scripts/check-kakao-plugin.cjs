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
const builtin = load('lib/builtin-chat-plugin.ts');
const data = new Map(); let hydrated = true;
global.window = {dispatchEvent(){}};
global.CustomEvent = class {constructor(type, init){this.type=type;this.detail=init?.detail}};
const storage = load('lib/chat-plugin-storage.ts', {
  './builtin-chat-plugin':builtin,
  './kv-db':{kvGet:k=>data.get(k)??null,kvSet:(k,v)=>data.set(k,v),kvRemove:k=>data.delete(k),registerKvMigration(){},isKvHydrated:()=>hydrated},
  './chat-plugin-types':{CHAT_PLUGIN_API_VERSION:1}
});
let list = storage.loadChatPlugins();
assert.equal(list.length,1); assert.equal(list[0].enabled,false); assert.equal(list[0].manifest.name,'kakao经典键位插件');
assert.equal(storage.loadChatPlugins().length,1);
for (const enabled of [true,false]) {
  const old={...list[0],enabled,settings:{custom:'kept'},installedAt:'old-date',manifest:{...list[0].manifest,version:'0.10.0'},code:'old-code'};
  data.set('chat_plugins_v3',JSON.stringify([old])); data.set('chat_plugin_kakao_seed_v1','1');
  const updated=storage.loadChatPlugins()[0];
  assert.equal(updated.enabled,enabled);assert.deepEqual(updated.settings,old.settings);assert.equal(updated.installedAt,'old-date');
  assert.equal(updated.code,builtin.BUILTIN_KAKAO_PLUGIN_CODE);assert.equal(updated.manifest.version,'0.13.1');
}
data.set('chat_plugins_v3','[]');data.set('chat_plugin_kakao_seed_v1','1');assert.deepEqual(storage.loadChatPlugins(),[]);
data.clear();hydrated=false;assert.deepEqual(storage.loadChatPlugins(),[]);assert.equal(data.size,0);hydrated=true;
console.log('PASS plugin migration: new opt-in install, idempotence, enabled/disabled settings preservation, intentional deletion and hydration');

