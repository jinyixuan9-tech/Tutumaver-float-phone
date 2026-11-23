// Static render smoke checks; these do not replace visual testing on a phone.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
require.extensions['.css']=(m)=>{const names=new Proxy({},{get:(_,key)=>key==='__esModule'?false:key==='default'?names:String(key)});m.exports=names;};
const {YtbConversation}=require('../components/ytb/ytb-conversation.tsx');
const noop=()=>{};
let html=renderToStaticMarkup(React.createElement(YtbConversation,{messages:[{id:'m1',senderId:'char',name:'角色',avatar:'',original:'안녕하세요',translated:'你好',at:1},{id:'m2',senderId:'me',name:'用户',avatar:'',original:'晚上好',translated:'',at:2}],ownId:'me',peerId:'char',busy:false,group:false,onChannel:noop,onSend:noop,onUpdate:noop,onRetry:noop}));
assert(html.includes('안녕하세요')&&html.includes('你好')&&html.includes('晚上好'),'Both sides render; foreign replies expand both languages by default');
assert(html.includes('aria-expanded="true"'));assert(!html.includes('>翻译</button>'),'No separate translate button');assert(!html.includes('撤回'));
const {YtbLiveRoom}=require('../components/ytb/ytb-live-room.tsx');
const host={id:'char',ownerId:'a',ownerType:'character',name:'角色',avatar:''};const stream={id:'s',channelId:'char',title:'오늘의 노래',titleTranslated:'今天的歌',cover:'',status:'live',startedAt:1,viewers:10,lines:[],comments:[],calls:[]};
html=renderToStaticMarkup(React.createElement(YtbLiveRoom,{stream,host,state:{channels:[host]},clock:2,busy:false,onChannel:noop,onBack:noop,onEnd:noop,onCalls:noop,onAd:noop,onBell:noop,onSend:noop,onReact:noop,onSpeak:noop}));
assert(html.includes('오늘의 노래')&&html.includes('今天的歌'),'Stream title and its translation render together');assert(html.includes('aria-label="结束直播"'));assert(!html.includes('译／原文'));
console.log('PASS: conversation bilingual defaults, both sides, no translation/retraction buttons, livestream translated title and end control render.');
