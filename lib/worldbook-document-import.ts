import {readLegacyWordDocument} from "./legacy-word-document";
/** Existing worldbook JSON import stays in settings-storage. This reader handles plain narrative documents only. */
import JSZip from "jszip";
import {createWorldBook} from "./settings-storage";
import type {WorldBookConfig,WorldBookEntry} from "./settings-types";
const LIMIT=5*1024*1024,MAX_TEXT=120000,CHUNK=5000;
export async function parseWorldBookDocument(file:File):Promise<WorldBookConfig>{return worldBookFromDocumentText(file.name,await readWorldBookDocumentText(file));}
export async function readWorldBookDocumentText(file:File):Promise<string>{
 if(file.size>LIMIT)throw Error("世界书文档不能超过 5MB，请拆分后导入。");
 let content="";
 if(/\.(txt|md)$/i.test(file.name)){
   const bytes=new Uint8Array(await file.arrayBuffer());
   try{content=new TextDecoder(bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8',{fatal:true}).decode(bytes);}catch{throw Error('文本文档编码无法识别，请另存为 UTF-8 后导入');}
 }
 else if(/\.docx$/i.test(file.name)){
   const zip=await JSZip.loadAsync(await file.arrayBuffer());
   const item=zip.file("word/document.xml");if(!item)throw Error("Word 文件缺少正文，请检查 .docx 格式。");
   const xml=await item.async("string");if(xml.length>MAX_TEXT*7)throw Error("Word 正文过大，请拆分。");
   const parsed=new DOMParser().parseFromString(xml,"application/xml");
   if(parsed.getElementsByTagName("parsererror").length)throw Error("Word 文档解析失败。");
   content=Array.from(parsed.getElementsByTagNameNS("*","p")).map(para=>Array.from(para.getElementsByTagNameNS("*","t")).map(e=>e.textContent||"").join("")).join("\n");
 }else if(/\.doc$/i.test(file.name)){content=readLegacyWordDocument(await file.arrayBuffer());}
 else throw Error("请导入 TXT、Markdown、DOC 或 DOCX 文档。");
 content=content.replace(/\u0000/g,"").trim();
 if(!content)throw Error("文档没有可读取的文字。");
 if(content.length>MAX_TEXT)throw Error("世界书正文超过 12 万字，请分批导入。");
 return content;
}
export function worldBookFromDocumentText(filename:string,content:string):WorldBookConfig{
 content=content.replace(/\u0000/g,'').trim();
 if(!content)throw Error('文档没有可导入的正文');
 if(content.length>MAX_TEXT)throw Error('正文超过 12 万字，请拆分');
 const name=filename.replace(/\.(txt|md|doc|docx)$/i,"").trim()||"导入的世界书";
 const book=createWorldBook(name);
 // Content remains user-editable; split into entries without discarding any text.
 const chunks:string[]=[];let remaining=content;
 while(remaining.length){let n=Math.min(CHUNK,remaining.length);if(n<remaining.length){const cut=remaining.lastIndexOf("\n",n);if(cut>n/2)n=cut+1;}chunks.push(remaining.slice(0,n).trim());remaining=remaining.slice(n);}
 book.entries=chunks.filter(Boolean).map((part,i):WorldBookEntry=>({uid:`document_${book.id}_${i}`,key:name,content:part,comment:`${filename} · 第 ${i+1}/${chunks.length} 段`,use_regex:false,disable:false,constant:false,position:0,insertion_order:100,role:0}));
 book.description=`从 ${filename} 导入，拆分成 ${book.entries.length} 条。默认关键词为世界书名称，可按需调整触发词或改为常驻。`;
 return book;
}
