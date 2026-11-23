import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the worker and its support files from the installed pdfjs-dist version.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules/pdfjs-dist');
const output = path.join(root, 'public/document-reader-pdf');

await mkdir(output, { recursive: true });
for (const [from, to] of [
  ['legacy/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
  ['cmaps', 'cmaps'],
  ['standard_fonts', 'standard_fonts'],
]) {
  await cp(path.join(source, from), path.join(output, to), { recursive: true });
}
const { version } = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
console.log(`[document-reader] Prepared PDF worker, CMaps and fonts from pdfjs-dist ${version}.`);
