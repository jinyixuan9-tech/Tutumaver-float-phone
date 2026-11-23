const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file){const m={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);return m.exports}
const {isSingleEmoji,voiceBubbleWidth,cssGeneratedText}=load('lib/chat-presentation.ts');
for(const value of ['🥰','❤️','👍🏽','👨‍👩‍👧‍👦','👩🏽‍🚀','🇰🇷','1️⃣',' 🥰\n'])assert(isSingleEmoji(value),value);
for(const value of ['','hello','123','hi🥰','🥰🥰','[🥰]','https://x.test'])assert(!isSingleEmoji(value),value);
const widths=[1,5,10,30,60,120].map(voiceBubbleWidth);assert(widths.slice(0,5).every((n,i)=>!i||n>widths[i-1]));assert.equal(widths.at(-1),220);assert.equal(voiceBubbleWidth(Infinity),96);
assert.equal(cssGeneratedText('"Reply to " attr(data-name)',()=> '备注名'),'Reply to 备注名');assert.equal(cssGeneratedText('"a\\a b"',()=>null),'a\nb');assert.equal(cssGeneratedText('none',()=>null),'');
const {scopeSessionCSS}=load('lib/css-scoper.ts');
assert.equal(scopeSessionCSS(':root:where(.chat-app[data-chat-theme="dark"] *) {color:white}', '.session-x'),'.session-x:where(.chat-app[data-chat-theme="dark"] *) {color:white}');
const scoped=scopeSessionCSS(':root .a:is(.b,.c), :root [data-label="a,b"] {color:red}', '.session-x');assert(scoped.includes('.a:is(.b,.c)'));assert(scoped.includes('[data-label="a,b"]'));assert(!scoped.includes('.b,.session'));
const ordered=scopeSessionCSS('@layer skin.layout, skin.translation; :root {--gap:4px} @layer skin.layout {:root .a {margin:0}}','.session-x');
assert(ordered.includes('@layer skin.layout, skin.translation;'));
assert(ordered.includes('.session-x {--gap:4px}'));
assert(ordered.includes('.session-x .a {margin:0}'));
assert(!ordered.includes(':root'));
console.log('PASS complete emoji sequences, duration width bounds, screenshot text, nested/quoted selectors and layer-order scoping');
