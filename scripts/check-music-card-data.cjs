const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,stubs){const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};new Function('require','module','exports',code)(name=>{if(name in stubs)return stubs[name];throw Error('Unexpected dependency '+name)},module,module.exports);return module.exports;}
(async()=>{
 let saved={id:'song',sessionId:'s',createdAt:'today',mediaData:{musicTitle:'王菲 - 我爱你',musicLastPosition:42}},details=0;
 const binding=load('lib/music-card-data.ts',{'./music-storage':{loadAllTracks:async()=>[]},'./music-service':{unifiedSearch:async()=>[{title:'我爱你',artist:'王菲',neteaseResult:{id:1,name:'我爱你',artists:'王菲',duration:0}}],getNeteaseSongDetail:async()=>{details++;return{coverUrl:'https://cover',duration:241,name:'我爱你',artists:'王菲'}}},'./chat-storage':{loadChatMessages:()=>[saved],updateMessageMediaData:(id,d)=>{saved={...saved,mediaData:d}}}});
 global.window={dispatchEvent(){}};global.CustomEvent=class{};
 const track=await binding.bindMusicCard(saved);assert.equal(track.id,'netease_1');assert.equal(track.coverUrl,'https://cover');assert.equal(track.duration,241);assert.equal(saved.mediaData.musicLastPosition,42);assert.equal(details,1);
 saved.mediaData.musicCoverUrl=undefined;await binding.bindMusicCard(saved);assert.equal(details,2);assert.equal(saved.mediaData.musicCoverUrl,'https://cover');
 saved={...saved,id:'wrong',mediaData:{musicTitle:'不存在',musicArtist:'王菲'}};assert.equal(await binding.bindMusicCard(saved),null);
 console.log('PASS legacy singer-title resolution, detail cover/duration backfill, existing ID repair, seek position preservation, reject wrong song');
})().catch(e=>{console.error(e);process.exitCode=1});
