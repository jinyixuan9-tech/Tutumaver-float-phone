/** Browser-only Word 97–2003 text reader. Reads CFB/CLX; never executes embedded objects or macros.
 * Format reference: Microsoft MS-CFB and MS-DOC §2.4.1, §2.5.15.
 */
export function readLegacyWordDocument(buffer:ArrayBuffer):string {
 const bytes=new Uint8Array(buffer);const fail=()=>{throw Error('无法读取旧版 Word 正文：文件可能损坏或格式不受支持，请另存为 DOCX');};
 const view=new DataView(buffer);const u16=(p:number)=>{if(p<0||p+2>bytes.length)return fail();return view.getUint16(p,true);};const u32=(p:number)=>{if(p<0||p+4>bytes.length)return fail();return view.getUint32(p,true);};
 if(bytes.length<512||[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].some((v,i)=>bytes[i]!==v))return fail();
 if(u16(28)!==0xfffe)return fail();
 const sector=2**u16(30),miniSector=2**u16(32);if(![512,4096].includes(sector)||miniSector!==64)return fail();
 const total=Math.floor(bytes.length/sector)-1;const sectorBytes=(id:number)=>{if(id>=total)return fail();return bytes.subarray((id+1)*sector,(id+2)*sector);};
 const read32=(b:Uint8Array,p:number)=>{if(p<0||p+4>b.length)return fail();return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p,true);};
 const fatIds:number[]=[];for(let i=0;i<109;i++){const n=u32(76+4*i);if(n<0xfffffffa)fatIds.push(n);}
 let dif=u32(68);const seenDif=new Set<number>();for(let i=0;i<u32(72);i++){if(seenDif.has(dif))return fail();seenDif.add(dif);const b=sectorBytes(dif);for(let p=0;p<sector-4;p+=4){const n=read32(b,p);if(n<0xfffffffa)fatIds.push(n);}dif=read32(b,sector-4);}
 if(fatIds.length<u32(44))return fail();const fat:number[]=[];for(const id of fatIds.slice(0,u32(44))){const b=sectorBytes(id);for(let p=0;p<b.length;p+=4)fat.push(read32(b,p));}
 const chain=(start:number,table:number[],get:(id:number)=>Uint8Array,max:number):Uint8Array=>{const chunks:Uint8Array[]=[];const seen=new Set<number>();let id=start,size=0;while(id!==0xfffffffe&&id!==0xffffffff){if(id>=table.length||seen.has(id)||seen.size>total*8)return fail();seen.add(id);const b=get(id);chunks.push(b);size+=b.length;if(size>max)return fail();id=table[id];}const out=new Uint8Array(size);let at=0;for(const b of chunks){out.set(b,at);at+=b.length;}return out;};
 const directory=chain(u32(48),fat,sectorBytes,bytes.length);const streams=new Map<string,{start:number;size:number;type:number}>();
 for(let p=0;p+128<=directory.length;p+=128){const v=new DataView(directory.buffer,directory.byteOffset+p,128),len=v.getUint16(64,true);if(len<2||len>64)continue;const name=new TextDecoder('utf-16le').decode(directory.subarray(p,p+len-2));const hi=v.getUint32(124,true);if(sector===4096&&hi)return fail();streams.set(name,{start:v.getUint32(116,true),size:v.getUint32(120,true),type:directory[p+66]});}
 const root=[...streams.values()].find(s=>s.type===5);if(!root)return fail();
 const miniRoot=chain(root.start,fat,sectorBytes,bytes.length).subarray(0,root.size);
 const miniFatBytes=u32(64)?chain(u32(60),fat,sectorBytes,bytes.length):new Uint8Array();const miniFat:number[]=[];for(let p=0;p<miniFatBytes.length;p+=4)miniFat.push(read32(miniFatBytes,p));
 const stream=(name:string)=>{const s=streams.get(name);if(!s||s.size>bytes.length)return fail();const b=s.size<u32(56)?chain(s.start,miniFat,id=>{const p=id*miniSector;if(p+miniSector>miniRoot.length)return fail();return miniRoot.subarray(p,p+miniSector);},bytes.length):chain(s.start,fat,sectorBytes,bytes.length);if(b.length<s.size)return fail();return b.subarray(0,s.size);};
 const word=stream('WordDocument');const w=new DataView(word.buffer,word.byteOffset,word.byteLength);const r16=(p:number)=>{if(p+2>word.length)return fail();return w.getUint16(p,true);};const r32=(p:number)=>read32(word,p);
 if(r16(0)!==0xa5ec||r16(2)<0xc1)throw Error('暂不支持 Word 6/95，请另存为 DOCX');
 const flags=r16(10);if(flags&0x8100)throw Error('此 Word 文档已加密，请解密后导入');
 const table=stream(flags&0x200?'1Table':'0Table');let at=32;at+=2+r16(at)*2;const lw=at+2;at+=2+r16(at)*4;const pairs=r16(at);at+=2;if(pairs<34)return fail();
 const ccpText=r32(lw+12);if(ccpText>120000)throw Error('正文超过 12 万字，请拆分后导入');
 const fc=r32(at+33*8),len=r32(at+33*8+4);if(fc+len>table.length||!len)return fail();let p=fc;const end=fc+len;
 while(p<end&&table[p]===1){if(p+3>end)return fail();const n=table[p+1]|table[p+2]<<8;p+=3+n;}
 if(p+5>end||table[p]!==2)return fail();const plcLen=read32(table,p+1);p+=5;if(p+plcLen>end||(plcLen-4)%12)return fail();const count=(plcLen-4)/12;if(count>120000)return fail();
 let content='';for(let i=0;i<count;i++){const cp=read32(table,p+i*4),next=read32(table,p+(i+1)*4);if(next<cp)return fail();if(cp>=ccpText)break;const n=Math.min(next,ccpText)-cp;const fcRaw=read32(table,p+(count+1)*4+i*8+2);const compressed=!!(fcRaw&0x40000000);const offset=(fcRaw&0x3fffffff)/(compressed?2:1);if(!Number.isInteger(offset)||offset+n*(compressed?1:2)>word.length)return fail();content+=new TextDecoder(compressed?'windows-1252':'utf-16le').decode(word.subarray(offset,offset+n*(compressed?1:2)));}
 // Field instructions are not display text. Keep field results, paragraph and table-cell breaks.
 content=content.replace(/\x13[^\x14\x15]*\x14/g,'').replace(/\x13[^\x15]*\x15/g,'').replace(/\x15/g,'').replace(/[\r\x0b\x0c\x07]/g,'\n').replace(/[\x00-\x08\x0e-\x1f]/g,'').trim();
 if(!content)throw Error('文档没有可读取的正文文字，扫描图片文档需先转成文字');return content;
}
