const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
let native=true,calls=[],webCalls=[],reply={status:200,headers:{'Content-Type':'audio/mpeg'},data:btoa('ID3audio')},pendingOverride;
function compile(path,requireFn,extra={}){const box={exports:{},require:requireFn,URL,Headers,Response,Blob,Uint8Array,TextEncoder,DOMException,atob,AbortController,setTimeout,clearTimeout,...extra};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);return box.exports;}
const transport=compile('lib/android-tts.ts',()=>({Capacitor:{isNativePlatform:()=>native,getPlatform:()=> 'android'},CapacitorHttp:{request:options=>{calls.push(options);return pendingOverride||Promise.resolve(reply);}}}));
const tts=compile('lib/tts-service.ts',id=>id==='./android-tts'?transport:{},{fetch:async(url,init)=>{webCalls.push({url,init});return new Response('audio',{headers:{'Content-Type':'audio/mpeg'}});}});
const fish={provider:'FishAudio',apiKey:'test-fish-secret',defaultVoice:'fishvoice',model:'s2.1-pro-free'};
const eleven={provider:'ElevenLabs',apiKey:'test-eleven-secret',defaultVoice:'voice_123',model:'eleven_multilingual_v2'};
(async()=>{
let audio=await tts.synthesizeSpeech('你好',fish);assert.equal(await audio.text(),'ID3audio');assert.equal(webCalls.length,0);assert.equal(calls[0].url,'https://api.fish.audio/v1/tts');assert.equal(calls[0].headers.authorization,'Bearer test-fish-secret');assert.equal(calls[0].data.reference_id,'fishvoice');assert.equal(calls[0].data.text,'你好');assert.equal(calls[0].disableRedirects,true);assert.equal(calls[0].responseType,'arraybuffer');
await tts.synthesizeSpeech('Hello',eleven);assert(calls[1].url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/voice_123?'));assert.equal(calls[1].headers['xi-api-key'],'test-eleven-secret');assert.equal(calls[1].data.model_id,eleven.model);
await tts.synthesizeSpeech('custom',{...fish,baseUrl:'https://relay.example/v1'});assert.equal(calls[2].url,'https://relay.example/v1/tts');
reply={status:401,headers:{'content-type':'application/json'},data:{detail:{message:'invalid key'}}};await assert.rejects(()=>tts.synthesizeSpeech('x',eleven),/401.*invalid key/);
reply={status:503,headers:{'content-type':'text/plain'},data:'temporarily unavailable'};await assert.rejects(()=>tts.synthesizeSpeech('x',fish),/503.*temporarily unavailable/);
reply={status:302,headers:{location:'https://other.example'},data:''};await assert.rejects(()=>tts.synthesizeSpeech('x',fish),/重定向/);
const before=calls.length;await assert.rejects(()=>tts.synthesizeSpeech('x',{...fish,baseUrl:'http://relay.example/v1'}),/HTTPS/);assert.equal(calls.length,before);
const signal=new AbortController();signal.abort();await assert.rejects(()=>transport.fetchAndroidTts('https://api.fish.audio/v1/tts',{signal:signal.signal,body:'{}'}),e=>e.name==='AbortError');assert.equal(calls.length,before);
let finish;pendingOverride=new Promise(resolve=>finish=resolve);const active=new AbortController();const waiting=transport.fetchAndroidTts('https://api.fish.audio/v1/tts',{signal:active.signal,body:'{}'});active.abort();await assert.rejects(()=>waiting,e=>e.name==='AbortError');finish({status:200,headers:{},data:btoa('audio')});pendingOverride=undefined;
native=false;const nativeCount=calls.length;await tts.synthesizeSpeech('web',fish);await tts.synthesizeSpeech('web',eleven);assert.equal(webCalls[0].url,'/api/voice/fish-tts');assert.equal(webCalls[1].url,'/api/voice/elevenlabs-tts');assert.equal(calls.length,nativeCount);
await tts.synthesizeSpeech('custom',{...eleven,baseUrl:'https://relay.example/v1'});assert(webCalls[2].url.startsWith('https://relay.example/v1/text-to-speech/'));
const config=JSON.parse(fs.readFileSync('capacitor.config.json'));assert.equal(config.appName,'兔版float');assert.equal(config.appId,'app.ii.phone');assert.equal(config.server.hostname,'localhost');assert(fs.readFileSync('android/app/src/main/res/values/strings.xml','utf8').includes('name="app_name">兔版float<'));
console.log('PASS: Android official/custom TTS direct routing, keys/payloads, binary decoding, API JSON/plain errors, redirect rejection, HTTPS, abort, unchanged web proxy/custom routes, app name and stable origin/appId.');
})().catch(e=>{console.error(e);process.exitCode=1;});
