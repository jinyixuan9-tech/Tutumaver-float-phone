const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),Module=require('module');let raw=null;
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const orig=Module._load;Module._load=function(req,parent,...rest){if(parent?.filename.endsWith('worldline-storage.ts')&&req==='./kv-db')return {registerKvMigration(){},kvGet:()=>raw,kvSet:(_,v)=>{raw=v}};return orig.call(this,req,parent,...rest)};
const st=require('../lib/worldline-storage.ts');
const base={id:'e',title:'晚餐',detail:'三人一起吃饭',occurredAt:'2026-08-08T10:30:00Z',visibility:'private',people:{a:{access:'witnessed',perspective:'A自己的想法'},b:{access:'witnessed',perspective:'B自己的想法'}}};
assert(st.isSharedWorldlineEvent(base));assert(!st.isSharedWorldlineEvent({...base,people:{a:base.people.a}}));assert(st.isSharedWorldlineEvent({...base,visibility:'public',people:{}}));
st.saveWorldlineState({activeId:'w',worlds:[{id:'w',name:'世界',events:[base],archive:[],progressHistory:[]}]});
assert.equal(st.worldlineEventsForCharacter('a')[0].perspective,'A自己的想法');assert.equal(st.worldlineEventsForCharacter('b')[0].perspective,'B自己的想法');assert.equal(st.worldlineEventsForCharacter('c').length,0,'未关联角色不能读未公开事件');
let saved=st.loadWorldlineState();saved.worlds[0].events[0].visibility='public';st.saveWorldlineState(saved);assert.equal(st.worldlineEventsForCharacter('c')[0].perspective,'','公开不传播他人个人视角');
// Execute the actual UI filter expressions with native timeline fixtures.
const text=fs.readFileSync('components/memory/memory-bank-page.tsx','utf8'),tree=ts.createSourceFile('x.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),expressions={};
function visit(n){if(ts.isCallExpression(n)&&['setShortTermEvents','setSharedEvents'].includes(n.expression.getText(tree))&&n.arguments[0]?.getText(tree).startsWith('timeline.filter'))expressions[n.expression.getText(tree)]=n.arguments[0].getText(tree);ts.forEachChild(n,visit)}visit(tree);
const timeline=[{id:'single',sourceApp:'worldline',sourceDetail:'worldline_event'},{id:'shared',sourceApp:'worldline',sourceDetail:'worldline_shared_event'},{id:'chat',sourceApp:'chat',sourceDetail:'direct'}];
function run(key){assert(expressions[key]);const code=ts.transpileModule('return '+expressions[key],{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return Function('timeline','isSharedMemoryEvent',code)(timeline,require('../lib/memory-classification.ts').isSharedMemoryEvent).map(e=>e.id)}
assert.deepEqual(run('setShortTermEvents'),['single','chat']);assert.deepEqual(run('setSharedEvents'),['shared']);
assert(fs.readFileSync('lib/short-term-assembler.ts','utf8').includes('sourceDetail: isSharedWorldlineEvent(event) ? "worldline_shared_event" : "worldline_event"'));
console.log('PASS: 单人/多人/公开分类、旧记录动态分类、未公开权限、私人视角隔离、共享不再重复出现在短期。');
