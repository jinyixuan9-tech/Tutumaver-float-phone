import JSZip from 'jszip';
export type ImportedDocument = { id: string; name: string; source: string; text?: string; image?: string };
export const DOCUMENT_FILE_LIMIT=5*1024*1024,DOCUMENT_TEXT_LIMIT=60000;
function checkedText(text:string){if(!text.trim())throw Error('未读取到文字；扫描版 PDF 请改发图片，或使用可选中文字的 PDF');if(text.length>DOCUMENT_TEXT_LIMIT)throw Error('文件文字超过六万字，请分段后再上传');return text;}
export function docxXmlText(xml:string){
 const document=new DOMParser().parseFromString(xml,'application/xml');if(document.getElementsByTagName('parsererror').length)throw Error('Word 文档格式损坏');
 return Array.from(document.getElementsByTagNameNS('*','p')).map(p=>Array.from(p.getElementsByTagNameNS('*','t')).map(n=>n.textContent||'').join('')).join('\n');
}
type ZipTextStream={on:(event:string,listener:(data:Uint8Array)=>void)=>ZipTextStream;pause:()=>ZipTextStream;resume:()=>ZipTextStream};
async function docxText(file:File){
 const zip=await JSZip.loadAsync(await file.arrayBuffer());const entry=zip.file('word/document.xml');if(!entry)throw Error('不是可读取的 Word .docx 文件');
 const xml=await new Promise<string>((resolve,reject)=>{let bytes=0;const chunks:Uint8Array[]=[];const stream=(entry as unknown as {internalStream:(type:string)=>ZipTextStream}).internalStream('uint8array');stream.on('data',(chunk:Uint8Array)=>{bytes+=chunk.length;if(bytes>10*1024*1024){stream.pause();reject(Error('Word 解压后的正文过大，请分段'));return;}chunks.push(chunk);}).on('error',reject).on('end',()=>{const joined=new Uint8Array(bytes);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.length;}resolve(new TextDecoder().decode(joined));}).resume();});
 return checkedText(docxXmlText(xml));
}
async function pdfText(file:File){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('/document-reader-pdf/pdf.worker.min.mjs',location.href).href;
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),enableXfa:false,cMapUrl:new URL('/document-reader-pdf/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('/document-reader-pdf/standard_fonts/',location.href).href});
 try{const pdf=await task.promise;if(pdf.numPages>200)throw Error('PDF 超过 200 页，请拆分后再上传');let text='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();text+=`\n【第 ${i} 页】\n`+content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('');page.cleanup();if(text.length>DOCUMENT_TEXT_LIMIT)throw Error('PDF 文字超过六万字，请拆分后再上传');}return checkedText(text.replace(/【第 \d+ 页】/g,'').trim())?text:'';}finally{await task.destroy();}
}
export async function readDocumentFile(file:File):Promise<ImportedDocument>{
 if(file.size>DOCUMENT_FILE_LIMIT)throw Error('单个附件请控制在 5MB 以内');
 const base={id:crypto.randomUUID(),name:file.name,source:'本机文件 · 本次读取的副本'};
 if(file.type.startsWith('image/')){if(file.type==='image/svg+xml')throw Error('请使用 JPG、PNG 或 WebP 图片');const image=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(file);});return{...base,image};}
 if(/\.docx$/i.test(file.name))return{...base,text:await docxText(file)};
 if(/\.pdf$/i.test(file.name))return{...base,text:await pdfText(file)};
 if(/\.(txt|md|json|csv|js|ts|html|css|log)$/i.test(file.name))return{...base,text:checkedText(await file.text())};
 if(/\.doc$/i.test(file.name))throw Error('旧版 .doc 请先另存为 .docx 或 PDF');
 throw Error('支持图片、Word（.docx）、PDF 和文本文件');
}
