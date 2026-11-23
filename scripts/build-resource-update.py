#!/usr/bin/env python3
"""Build signed cumulative web-resource updates for one exact native APK baseline."""
from pathlib import Path
import argparse,hashlib,json,re,zipfile
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);p.add_argument('--dist',default='mobile-dist');p.add_argument('--sequence',type=int,required=True);p.add_argument('--id',required=True);p.add_argument('--label',required=True);p.add_argument('--notes-file',required=True);p.add_argument('--output',required=True);p.add_argument('--signing',default='android/signing.properties');a=p.parse_args()
if a.sequence<1 or not re.fullmatch(r'[A-Za-z0-9._-]{1,80}',a.id):raise SystemExit('Invalid resource sequence or ID')
base=json.loads(Path(a.baseline).read_text());dist=Path(a.dist);files={}
for f in sorted(dist.rglob('*')):
 if f.is_file() and not any(x.startswith('.') for x in f.relative_to(dist).parts):files[f.relative_to(dist).as_posix()]=hashlib.sha256(f.read_bytes()).hexdigest()
for relative,digest in base['files'].items():
 if relative in ['cordova.js','cordova_plugins.js'] or relative.startswith('plugins/'):
  files.setdefault(relative,digest)
if not files.get('index.html'):raise SystemExit('Build mobile web assets first')
manifest={'schema':1,'appId':base['appId'],'nativeBuild':base['nativeBuild'],'baseDigest':base['digest'],'resourceId':a.id,'sequence':a.sequence,'label':a.label,'notes':Path(a.notes_file).read_text(),'files':files}
if len(manifest['notes'])>16000 or len(a.label)>100:raise SystemExit('Update description too long')
raw=json.dumps(manifest,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
props=dict(line.strip().split('=',1) for line in Path(a.signing).read_text().splitlines() if '=' in line and not line.lstrip().startswith('#'))
key_path=Path(a.signing).parent/props['storeFile'];key,cert,_=pkcs12.load_key_and_certificates(key_path.read_bytes(),props['storePassword'].encode())
if cert.fingerprint(hashes.SHA256()).hex()!='49adc3d38f121f2b57968459f49de05a9066505ce43b981381dd079f92775092':raise SystemExit('Signing certificate does not match the existing APK')
signature=key.sign(raw,padding.PKCS1v15(),hashes.SHA256());changed=[r for r,h in files.items() if base['files'].get(r)!=h]
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('manifest.json',raw);z.writestr('manifest.sig',signature)
 for relative in changed:z.write(dist/relative,'www/'+relative)
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 cert.public_key().verify(z.read('manifest.sig'),z.read('manifest.json'),padding.PKCS1v15(),hashes.SHA256())
print(json.dumps({'output':str(out),'resourceId':a.id,'nativeBuild':base['nativeBuild'],'changedFiles':len(changed),'bytes':out.stat().st_size},ensure_ascii=False))
