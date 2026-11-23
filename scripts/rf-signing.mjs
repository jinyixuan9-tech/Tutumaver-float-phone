/** Rabbit Float self-service Android signing for GitHub Actions.
 * Signing material is kept encrypted on a separate `rf-signing` fork branch.
 * The first key is created only with an explicit initialize action; regular
 * builds never silently rotate signing keys.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const branch = 'rf-signing';
const alias = 'rabbitfloat';
const secret = process.env.RF_SIGNING_PASSPHRASE || '';
const mode = process.argv[2];
const keyPath = join(root, 'android', 'rf-signing.p12');
const propertyPath = join(root, 'android', 'signing.properties');
const envelopeFile = 'signing.backup.enc';
const versionFile = join(root, 'mobile', 'version.json');
function git(...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
function hasBranch() {
  const result = spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch], { cwd: root, encoding: 'utf8' });
  if (result.status === 0) return true;
  if (result.status === 2) return false;
  throw new Error('Cannot query signing branch: check GitHub repository permissions or network.');
}
function cryptoKey(salt) { return scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); }
function encrypt(buffer) {
  const salt = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cryptoKey(salt), iv);
  const payload = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return JSON.stringify({ schema: 1, algorithm: 'aes-256-gcm+scrypt', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: payload.toString('base64') }) + '\n';
}
function decrypt(envelope) {
  const item = JSON.parse(envelope);
  if (item.schema !== 1 || item.algorithm !== 'aes-256-gcm+scrypt') throw new Error('Unknown signing backup format.');
  const decipher = createDecipheriv('aes-256-gcm', cryptoKey(Buffer.from(item.salt, 'base64')), Buffer.from(item.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(item.tag, 'base64'));
  try { return Buffer.concat([decipher.update(Buffer.from(item.data, 'base64')), decipher.final()]); }
  catch { throw new Error('Signing backup could not be decrypted: wrong secret or corrupted backup. Never regenerate a new key for an existing installation.'); }
}
function createKey() {
  if (secret.length < 20) throw new Error('Set RF_SIGNING_PASSPHRASE to a strong secret of at least 20 characters before initialization.');
  mkdirSync(dirname(keyPath), { recursive: true });
  if (existsSync(keyPath)) throw new Error('A signing key file already exists in this checkout.');
  const keytool = spawnSync('keytool', ['-genkeypair', '-v', '-storetype', 'PKCS12', '-keystore', keyPath, '-storepass', secret, '-keypass', secret, '-alias', alias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Rabbit Float Personal, OU=Personal Build, O=Rabbit Float, C=US', '-noprompt'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (keytool.status !== 0) throw new Error('keytool could not create personal signing key; verify Java is installed.');
  return readFileSync(keyPath);
}
function saveNewBranch(envelope) {
  // Create an orphan commit from git objects without touching the main branch.
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: envelope, encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['mktree'], { cwd: root, input: `100644 blob ${blob}\t${envelopeFile}\n`, encoding: 'utf8' }).trim();
  const commit = execFileSync('git', ['commit-tree', tree, '-m', 'Initialize encrypted personal APK signing backup'], { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Rabbit Float Signer', GIT_AUTHOR_EMAIL: 'actions@users.noreply.github.com', GIT_COMMITTER_NAME: 'Rabbit Float Signer', GIT_COMMITTER_EMAIL: 'actions@users.noreply.github.com' } }).trim();
  try { git('push', 'origin', `${commit}:refs/heads/${branch}`); }
  catch { throw new Error('Could not publish encrypted backup; check Actions contents: write permission.'); }
  console.log('Encrypted personal key backup created in branch rf-signing. Back up signing.backup.enc and keep your password separately.');
}
function fetchBackup() {
  git('fetch', '--no-tags', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`);
  return git('show', `refs/remotes/origin/${branch}:${envelopeFile}`);
}
function writeSigning(buffer) {
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, buffer, { mode: 0o600 });
  writeFileSync(propertyPath, `storeFile=rf-signing.p12\nstorePassword=${secret}\nkeyAlias=${alias}\nkeyPassword=${secret}\n`, { mode: 0o600 });
  const check = spawnSync('keytool', ['-list', '-keystore', keyPath, '-storetype', 'PKCS12', '-storepass', secret, '-alias', alias], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (check.status !== 0) throw new Error('Cannot verify personal APK signing key; wrong secret or damaged backup.');
}
function versionForRun() {
  const v = JSON.parse(readFileSync(versionFile, 'utf8'));
  const runNumber = Number(process.env.GITHUB_RUN_NUMBER);
  if (!Number.isSafeInteger(v.versionCode) || v.versionCode < 1 || !Number.isSafeInteger(runNumber) || runNumber < 1 || runNumber >= 100000) throw new Error('Invalid app version or GitHub workflow run number.');
  const code = v.versionCode * 100000 + runNumber;
  if (code > 2100000000) throw new Error('Android version code exceeds supported range.');
  v.versionCode = code;
  // Keep the public version name stable; the generated APK filename includes run and SHA.
  writeFileSync(versionFile, JSON.stringify(v) + '\n');
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(output, `version_name=${v.versionName}\nversion_code=${code}\n`);
  }
  console.log(`Using release version ${v.versionName}, internal versionCode ${code}.`);
}
if (!['initialize', 'build'].includes(mode)) throw new Error('Specify mode: initialize or build.');
if (!secret) throw new Error('Missing RF_SIGNING_PASSPHRASE GitHub Actions secret.');
if (!/^[A-Za-z0-9_-]{20,}$/.test(secret)) throw new Error('Signing password must be 20+ characters using letters, numbers, underscore, or hyphen; use exactly the same Secret for future builds.');
if (mode === 'initialize') {
  if (hasBranch()) throw new Error('Personal signing key already exists. Initialization is one-time only. Select build to retain update compatibility.');
  const buffer = createKey();
  try { saveNewBranch(encrypt(buffer)); } finally { rmSync(keyPath, { force: true }); }
} else if (!hasBranch()) {
  throw new Error('No signing backup found. First run workflow_dispatch with Initialize signing selected. If it was deleted, restore your encrypted backup; do not create a new signing key.');
}
const buffer = decrypt(fetchBackup());
writeSigning(buffer);
// Runners discard all files after the job; .gitignore protects signing material in checkout.
// The per-run version must be computed only for actual release APK generation.
versionForRun();
