/** Capture only selected visible rows, using their normal (non-selection) layout. */
function dataUrl(blob:Blob){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
export async function captureSelectedChat(root:HTMLElement,ids:Set<string>):Promise<Blob>{
 await document.fonts.ready;
 const selected=Array.from(root.querySelectorAll<HTMLElement>('.chat-msg-wrapper')).filter(e=>ids.has((e.id||'').replace(/^message-/,'')));
 if(selected.length!==ids.size)throw Error('部分选中消息尚未加载，请先翻到这些消息后重试');
 const width=Math.round(root.clientWidth||root.getBoundingClientRect().width);if(width<100)throw Error('聊天窗口不可见');
 const cache=new Map<string,Promise<string>>(),jobs:Promise<unknown>[]=[],fonts=new Set<string>();let running=0;const waiting:(()=>void)[]=[];
 const asset=(url:string)=>{const absolute=new URL(url,document.baseURI).href;if(!cache.has(absolute))cache.set(absolute,(async()=>{if(running>=6)await new Promise<void>(r=>waiting.push(r));running++;try{const response=await fetch(absolute);if(!response.ok)throw Error('图片或字体暂时无法读取');return await dataUrl(await response.blob());}finally{running--;waiting.shift()?.();}})());return cache.get(absolute)!;};
 const inline=async(value:string)=>{const matches=[...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)];const replacements=await Promise.all(matches.map(async m=>m[1].startsWith('data:')||m[1].startsWith('#')?m[0]:`url("${await asset(m[1])}")`));let result=value;matches.forEach((m,i)=>{result=result.replace(m[0],replacements[i]);});return result;};
 const copyStyle=(source:Element,clone:HTMLElement,pseudo?:string)=>{const style=getComputedStyle(source,pseudo);let css='';for(const prop of Array.from(style))css+=`${prop}:${style.getPropertyValue(prop)};`;clone.setAttribute('style',css);if(css.includes('url('))jobs.push(inline(css).then(value=>clone.setAttribute('style',value)));for(const font of style.fontFamily.split(','))fonts.add(font.trim().replace(/["']/g,''));};
 const snapshot=(source:HTMLElement):HTMLElement=>{const clone=source.cloneNode(false) as HTMLElement;copyStyle(source,clone);for(const name of ['id','data-active','data-highlight','data-multi-selected','data-multi-select','data-selected'])clone.removeAttribute(name);
  if(source instanceof HTMLImageElement){clone.removeAttribute('srcset');if(source.currentSrc)jobs.push(asset(source.currentSrc).then(url=>(clone as HTMLImageElement).src=url));}
  for(const pseudo of ['::before','::after']){const ps=getComputedStyle(source,pseudo);if(ps.content&&!['none','normal'].includes(ps.content)){const span=document.createElement('span');copyStyle(source,span,pseudo);if(ps.content.startsWith('"'))span.textContent=ps.content.slice(1,-1);clone.append(span);}}
  for(const child of Array.from(source.childNodes)){if(child instanceof HTMLElement){if(child.matches('.chat-multi-select-check,.chat-context-menu,button,input,textarea,[data-ui="multi-select"]'))continue;clone.append(snapshot(child));}else clone.append(child.cloneNode(true));}return clone;
 };
 const wrapper=document.createElement('div');wrapper.setAttribute('xmlns','http://www.w3.org/1999/xhtml');const style=getComputedStyle(root);Object.assign(wrapper.style,{width:width+'px',padding:'20px 16px',boxSizing:'border-box',display:'flex',flexDirection:'column',gap:'12px',backgroundColor:style.backgroundColor==='rgba(0, 0, 0, 0)'?'#f5f5f7':style.backgroundColor,backgroundImage:style.backgroundImage,backgroundSize:'cover',backgroundPosition:'center',fontFamily:style.fontFamily,color:style.color});jobs.push(inline(style.backgroundImage).then(value=>{wrapper.style.backgroundImage=value;}));
 // Remove selection attributes only during the synchronous style snapshot. Restore before yielding a frame.
 const saved=selected.map(row=>({row,attrs:['data-multi-select','data-selected','data-highlight','data-active'].map(key=>[key,row.getAttribute(key)] as const)}));
 try{for(const {row,attrs} of saved)for(const [key] of attrs)row.removeAttribute(key);for(const row of selected){const copy=snapshot(row);Object.assign(copy.style,{position:'relative',height:'auto',minHeight:'0',paddingLeft:'0',paddingRight:'0',width:'100%',maxWidth:'100%',margin:'0',transform:'none',background:'transparent'});wrapper.append(copy);}}finally{for(const {row,attrs} of saved)for(const [key,value] of attrs)if(value!==null)row.setAttribute(key,value);}
 const fontStyles=document.createElement('style');const fontJobs:Promise<string>[]=[];for(const sheet of Array.from(document.styleSheets)){try{for(const rule of Array.from(sheet.cssRules))if(rule instanceof CSSFontFaceRule&&fonts.has(rule.style.fontFamily.replace(/["']/g,'')))fontJobs.push(inline(rule.cssText));}catch{}}jobs.push(Promise.all(fontJobs).then(r=>{fontStyles.textContent=r.join('\n');}));wrapper.prepend(fontStyles);await Promise.all(jobs);for(const copy of Array.from(wrapper.children).filter((e):e is HTMLElement=>e instanceof HTMLElement&&e!==fontStyles))Object.assign(copy.style,{position:"relative",height:"auto",minHeight:"0",paddingLeft:"0",paddingRight:"0",width:"100%",maxWidth:"100%",margin:"0",transform:"none",background:"transparent"});
 // Computed styles use layout pixels, even when the phone shell is visually scaled.
 // Keep that layout width and measure actual descendants, including custom bubble tails/transforms.
 const measure=document.createElement('div');Object.assign(measure.style,{position:'fixed',left:'-20000px',top:'0',width:width+'px'});measure.append(wrapper);document.body.append(measure);let height:number,outputWidth=width,output=wrapper;
 try{
  await new Promise(requestAnimationFrame);const frame=wrapper.getBoundingClientRect();height=Math.ceil(frame.height);let left=16,right=width-16,top=0,bottom=height;
  for(const el of Array.from(wrapper.querySelectorAll('*'))){const r=el.getBoundingClientRect();if(!r.width&&!r.height)continue;left=Math.min(left,r.left-frame.left);right=Math.max(right,r.right-frame.left);top=Math.min(top,r.top-frame.top);bottom=Math.max(bottom,r.bottom-frame.top);}
  const extraLeft=Math.max(0,Math.ceil(16-left)),extraRight=Math.max(0,Math.ceil(right-(width-16))),extraTop=Math.max(0,Math.ceil(-top)),extraBottom=Math.max(0,Math.ceil(bottom-height));
  if(extraLeft||extraRight||extraTop||extraBottom){
   outputWidth=width+extraLeft+extraRight;height+=extraTop+extraBottom;
   output=document.createElement('div');output.setAttribute('xmlns','http://www.w3.org/1999/xhtml');Object.assign(output.style,{width:outputWidth+'px',height:height+'px',position:'relative',boxSizing:'border-box',overflow:'visible',backgroundColor:wrapper.style.backgroundColor,backgroundImage:wrapper.style.backgroundImage,backgroundSize:wrapper.style.backgroundSize,backgroundPosition:wrapper.style.backgroundPosition});
   wrapper.style.background='transparent';wrapper.style.transform=`translate(${extraLeft}px,${extraTop}px)`;output.append(wrapper);
  }
 }finally{measure.remove();}
 if(height<1||height>16000||outputWidth>16000||outputWidth*height>24000000)throw Error('所选内容过长，请分成两张截图');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(output)}</foreignObject></svg>`;
 const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('当前设备无法生成这张截图'));image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
 const scale=Math.min(2,Math.sqrt(24000000/(outputWidth*height)));const canvas=document.createElement('canvas');canvas.width=Math.ceil(outputWidth*scale);canvas.height=Math.ceil(height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建截图');ctx.scale(scale,scale);ctx.drawImage(img,0,0);return new Promise<Blob>((resolve,reject)=>{try{canvas.toBlob(blob=>blob?resolve(blob):reject(Error('截图保存失败')),'image/png');}catch{reject(Error('部分外部图片不允许截图，请换成本地图片'));}});
}
let pendingMoment:Blob|null=null;
export function queueMomentScreenshot(blob:Blob){pendingMoment=blob;window.dispatchEvent(new Event('chat-screenshot-to-moments'));}
export function takeMomentScreenshot(){const blob=pendingMoment;pendingMoment=null;return blob;}
