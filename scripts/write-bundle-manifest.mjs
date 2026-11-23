import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'android/app/src/main/assets/public');const files={};
function walk(dir){for(const name of fs.readdirSync(dir).sort()){if(name.startsWith('.'))continue;const file=path.join(dir,name);if(fs.statSync(file).isDirectory())walk(file);else{const relative=path.relative(dist,file).split(path.sep).join('/');files[relative]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}}
walk(dist);if(!files['index.html'])throw new Error('Sync Android web assets before writing the resource fingerprint');
const sorted=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,'en')));
const digest=crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
const version=JSON.parse(fs.readFileSync(path.join(root,'mobile/version.json'),'utf8'));
const target=path.join(root,'android/app/src/main/assets/float-bundle.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({schema:1,appId:version.applicationId,nativeBuild:version.versionCode,digest,files:sorted},null,2)+'\n');
console.log('Bundled resource fingerprint written');
