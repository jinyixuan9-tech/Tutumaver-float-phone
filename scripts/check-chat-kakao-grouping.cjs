const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=fs.readFileSync('components/chat/chat-room.tsx','utf8'),ast=ts.createSourceFile('room.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['kktCalendarDay','kktCalendarMinute','buildKktDisplayGroups']);
const text=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const build=new Function('uiRole','getChatFlowVisibleContent',code+';return buildKktDisplayGroups;')(m=>m.role,m=>m.content||'');
const base={role:'user',content:'文字',createdAt:'2026-11-20T10:00:00Z'};
const messages=[{...base,id:'u1'},{...base,id:'u2',createdAt:'2026-11-20T10:00:40Z'},{...base,id:'u3',createdAt:'2026-11-20T10:01:00Z'},
 {...base,id:'a1',role:'assistant',responseBatchId:'r1',senderCharacterId:'a'},{...base,id:'a2',role:'assistant',responseBatchId:'r1',senderCharacterId:'a'},
 {...base,id:'b1',role:'assistant',responseBatchId:'r1',senderCharacterId:'b'},
 {...base,id:'system',role:'system'},{...base,id:'u4'},{...base,id:'nextday',createdAt:'2026-11-21T10:00:00Z'}];
const {byId,dateStarts}=build(messages,true);
assert.equal(byId.get('u1').lastId,'u2');assert.equal(byId.get('u2').firstId,'u1');assert.notEqual(byId.get('u2').key,byId.get('u3').key);
assert.equal(byId.get('a1').lastId,'a2');assert.notEqual(byId.get('a1').key,byId.get('b1').key);assert(!byId.has('system'));
assert.equal(byId.get('u4').firstId,'u4');assert(dateStarts.has('u1')&&dateStarts.has('nextday'));
assert(!build([{...base,id:'withdrawn',isRetracted:true},{...base,id:'thought',content:'',innerMonologue:'思考'}],false).byId.size);
console.log('PASS message groups: same-minute user runs, response batches, group sender boundaries, notices, date changes, retracted/thought-only records');
