const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const source=fs.readFileSync('components/chat/chat-room.tsx','utf8');
const start=source.indexOf('    const offlineFooter = '),end=source.indexOf('\n    const chatRoomBackgroundStyle',start);
assert(start>=0&&end>start);
const code=ts.transpileModule(source.slice(start,end)+'\nexports.footer=offlineFooter;',{fileName:'footer.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const Icon=()=>React.createElement('i');let calls=0;
const box={exports:{},React,OfflineSceneClock:Icon,Pencil:Icon,RotateCcw:Icon,Trash2:Icon,offlineTextCount:t=>t.length,formatChatUiTime:t=>t,session:{id:'s'},isOfflineGenerating:false,offlineSceneBusy:false,handleOfflineEditStart(){},handleOfflineRetryFrom(){calls++;},window:{confirm:()=>false}};
vm.runInNewContext(code,box);
for(const turn of [{id:'a',userContent:'input',assistantContent:'answer',createdAt:'time'},{id:'b',userContent:'input',assistantContent:'',createdAt:'time'}]){
 const markup=renderToStaticMarkup(box.exports.footer(turn,'user',1));assert.equal(markup.includes('aria-label="重回线下回复"'),!turn.assistantContent,'only missing reply gets retry next to user input');
 assert(renderToStaticMarkup(box.exports.footer(turn,'assistant',2)).includes('aria-label="重回线下回复"'));
}
assert(!source.includes('尚无回复，可点击下方重回'),'no invented assistant placeholder');assert(source.includes('style={offlineDisplay.assistantContent.trim() ? undefined : { display: "none" }}'),'empty assistant card hidden');
console.log('PASS: actual offline footer render preserves retry with deleted reply, keeps retry on existing reply, no fake assistant placeholder.');
