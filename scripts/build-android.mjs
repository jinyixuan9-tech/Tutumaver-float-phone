import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'mobile/version.json'),'utf8'));
if(version.applicationId!=='tutumaver.float.phone'||!Number.isSafeInteger(version.versionCode)||version.versionCode<1||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version.versionName))throw new Error('Invalid mobile/version.json. Keep applicationId unchanged; increase versionCode for each update.');
for(const name of ['signing.properties','float-release.p12'])if(!fs.existsSync(path.join(root,'android',name)))throw new Error(`Restore ${name} from your private signing backup to android/ first. Do not generate a new key for updates.`);
function run(cmd,args,cwd=root){const result=spawnSync(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
run('npx',['vite','build','--config','vite.mobile.config.mjs']);
// Capacitor copy can retain old hashed bundles; regenerate only the built web assets.
fs.rmSync(path.join(root,'android/app/src/main/assets/public'),{recursive:true,force:true});
run('npx',['cap','sync','android']);
run(process.execPath,['scripts/write-bundle-manifest.mjs']);
run(process.platform==='win32'?'gradlew.bat':'./gradlew',[':app:clean','assembleRelease','--no-daemon'],path.join(root,'android'));
console.log('APK: android/app/build/outputs/apk/release/app-release.apk');
