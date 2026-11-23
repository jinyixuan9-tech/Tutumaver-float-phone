import {inspectionAppAllowed} from './phone-inspection-settings';
import {loadCity,cityEntries} from './icity-store';
import {loadBrowserCollection} from './browser-collection';
import {removedChatEntries} from './chat-list-entry';
import {loadChatSessions,loadChatContacts,getLastVisibleSessionMessage,loadChatMessages,getChatMessagePreview} from './chat-storage';
import {getLastChatOfflineTurn,getChatOfflineTurnPreview} from './chat-offline-storage';
import {resolveChatCharacterDisplayName} from './chat-profile-storage';
import {loadCharacters} from './character-storage';
import {loadMomentPosts,loadAllMomentComments} from './moments-storage';
import {loadShoppingState} from './shopping-storage';
import {loadBooks,loadChapters,loadProgress,hydrateReadingStorage} from './reading-storage';
import {activeReverse,reverseCanSeeChat,saveReverse} from './reverse-phone-state';
export type ReversePage={app:'chat'|'moments'|'shopping'|'reading'|'browser'|'icity';view:'list'|'contacts'|'thread'|'cart'|'orders'|'book'|'site'|'video'|'diary';target?:string;offset:number;mode?:'shop'|'food'};
export function reverseSessionName(id:string){const s=loadChatSessions().find(x=>x.id===id);const c=loadCharacters().find(c=>c.id===s?.contactId);return s?.isGroup?s.groupName||'群聊':s?.alias||(c?resolveChatCharacterDisplayName(c):'联系人');}
export async function reverseOverview(owner=activeReverse()?.owner){
 const allowed=(app:string)=>!owner||inspectionAppAllowed(owner,app);
 if(allowed('reading'))await hydrateReadingStorage();const shopping=allowed('shopping')?loadShoppingState():null;
 const city=allowed('icity')?loadCity():null;
 return {apps:[...(allowed('chat')?['chat','moments']:[]),...(allowed('shopping')?['shopping']:[]),...(allowed('browser')?['browser']:[]),...(city&&(cityEntries(city).some(e=>e.author==='user')||city.books.some(b=>b.kind==='exchange'&&b.members.includes('user')))?['icity']:[]),...(allowed('reading')&&loadBooks().length?['reading']:[])],chatCount:allowed('chat')?visibleSessions().length:0,contactCount:allowed('chat')?loadChatContacts().length:0,cartCount:shopping?shopping.cartItems.length+shopping.foodCartItems.length:0,bookCount:allowed('reading')?loadBooks().length:0};
}
export async function readReversePage(page:ReversePage):Promise<{label:string;content:string;messageIds?:string[];postIds?:string[];itemIds?:string[]}>{
 const owner=activeReverse()?.owner;if(owner&&!inspectionAppAllowed(owner,page.app))throw Error('user已关闭该查看范围');
 if(page.app==='icity'){
  const s=loadCity(),rows=cityEntries(s).filter(e=>e.author==='user'&&s.books.find(b=>b.id===e.book)?.kind==='personal');
  if(page.view==='diary'){
   const e=rows.find(e=>e.id===page.target);if(!e)throw Error('日记已经不存在');
   const visit=activeReverse();const unlocked=e.visibility!=='private'||visit?.cityUnlocked?.includes(e.id);
   return {label:unlocked?'查看了你的iCity日记':'看到了你的iCity私密日记封面',content:JSON.stringify(unlocked?{id:e.id,title:e.title,text:e.text,visibility:e.visibility,photos:e.photos?.map(p=>p.startsWith('text://')?decodeURIComponent(p.slice(7)):'配图'),createdAt:e.createdAt}:{id:e.id,visibility:'private',text:'这是一篇非公开日记，未读取正文'}),itemIds:[e.id]};
  }
  const part=rows.slice(page.offset*4,page.offset*4+4),exchanges=page.offset===0?s.books.filter(b=>b.kind==='exchange'&&b.members.includes('user')).map(b=>({kind:'exchange',bookId:b.id,peer:b.members.filter(id=>id!=='user').map(id=>s.accounts.find(a=>a.id===id)?.name||'账号'),notice:'只能看见交换关系，不能读取正文或预览'})):[];return {label:'查看了你的iCity日记本',content:JSON.stringify([...part.map(e=>e.visibility==='private'?{id:e.id,visibility:e.visibility,text:'这是一篇非公开日记'}:{id:e.id,title:e.title,visibility:e.visibility,text:e.text.slice(0,420)}),...exchanges]),itemIds:part.map(e=>e.id)};
 }
 if(page.app==='chat'&&page.view==='thread'){
  if(!page.target||!reverseCanSeeChat(page.target))throw Error('未发现该聊天');
  const visit=activeReverse();const all=loadChatMessages(page.target);
  let windowIds=visit?.messageWindows?.[page.target];
  if(!windowIds){windowIds=all.slice(-50).map(m=>m.id);if(visit)saveReverse({...visit,messageWindows:{...visit.messageWindows,[page.target]:windowIds}});}
  const allowed=new Set(windowIds),messages=all.filter(m=>allowed.has(m.id)&&!m.isRetracted&&['user','assistant'].includes(m.role));const end=Math.max(0,messages.length-Math.min(8,page.offset)*6),part=messages.slice(Math.max(0,end-6),end);
  return{label:`查看了与${reverseSessionName(page.target)}的聊天`,content:JSON.stringify(part.map(m=>({id:m.id,role:m.role,text:getChatMessagePreview(m),time:m.createdAt}))),messageIds:part.map(m=>m.id)};
 }
 if(page.app==='chat'&&page.view!=='contacts')return{label:'查看了你的Chat列表',content:JSON.stringify(visibleSessions().slice(page.offset*8,page.offset*8+8).map(s=>({id:s.id,name:reverseSessionName(s.id),isGroup:!!s.isGroup,preview:getLastVisibleSessionMessage(s.id)?getChatMessagePreview(getLastVisibleSessionMessage(s.id)!):getChatOfflineTurnPreview(getLastChatOfflineTurn(s.id))})))};
 if(page.app==='chat'&&page.view==='contacts')return{label:'查看了你的联系人',content:JSON.stringify(loadChatContacts().slice(page.offset*12,page.offset*12+12).map(c=>({id:c.characterId,sessionId:loadChatSessions().find(s=>s.contactId===c.characterId&&!s.isGroup&&reverseCanSeeChat(s.id))?.id,name:(()=>{const char=loadCharacters().find(x=>x.id===c.characterId);return char?resolveChatCharacterDisplayName(char):'联系人';})()})))};
 if(page.app==='moments'){const visit=activeReverse();let ids=visit?.momentWindow;if(!ids){ids=loadMomentPosts().slice(0,3+Math.floor(Math.random()*3)).map(p=>p.id);if(visit)saveReverse({...visit,momentWindow:ids});}const wanted=new Set(ids),posts=loadMomentPosts().filter(p=>wanted.has(p.id));return{label:'查看了你的朋友圈',content:JSON.stringify({posts:posts.map(p=>({id:p.id,author:p.authorId,authorType:p.authorType,text:p.content,photoDescription:p.photoDescription,time:p.createdAt})),comments:loadAllMomentComments().filter(c=>wanted.has(c.postId)).map(c=>({postId:c.postId,author:c.authorId,text:c.content}))}),postIds:posts.map(p=>p.id)};}
 if(page.app==='browser'){const s=loadBrowserCollection('user');if(page.view==='video'){const video=[...s.items,...s.favorites].find(v=>v.id===page.target);if(!video)throw Error('这条浏览器内容已经不存在');return {label:'查看了浏览器条目详情',content:JSON.stringify(video)};}return {label:page.view==='site'?'查看了浏览器第二页':'查看了浏览器首页',content:JSON.stringify(page.view==='site'?{kind:'虚构媒体网站',items:s.items.map(v=>({id:v.id,title:v.title,author:v.author,tags:v.tags})),favorites:s.favorites.map(v=>({id:v.id,title:v.title})),opened:s.opened,empty:!s.items.length&&!s.favorites.length}:{searches:s.history,notice:'这是实际保存的搜索记录；未生成条目不代表看过。第二页可以发现网站外观，但不能虚构搜索或观看行为。'})};}
 if(page.app==='shopping'){const state=loadShoppingState();let rows:{id:string}[]=page.view==='orders'?state.orders.filter(o=>(o.mode||'shop')===(page.mode||'shop')&&!o.canceledAt):(page.mode==='food'?state.foodCartItems:state.cartItems);if(typeof document!=='undefined'){const ids=new Set(Array.from(document.querySelectorAll<HTMLElement>('[data-active-app="shopping"] [data-reverse-shopping-id]')).map(e=>e.dataset.reverseShoppingId));rows=rows.filter(r=>ids.has(r.id));}const part=rows.slice(page.offset*5,page.offset*5+5);return{label:page.view==='orders'?(page.mode==='food'?'查看了你的外卖记录':'查看了你的购物记录'):(page.mode==='food'?'查看了你的外卖购物车':'查看了你的购物车'),content:JSON.stringify(part),itemIds:part.map(r=>r.id)};}

 const books=loadBooks();if(page.view!=='book')return{label:'查看了你的书架',content:JSON.stringify(books.map(b=>({id:b.id,title:b.title,author:b.author})))};
 const book=books.find(b=>b.id===page.target);if(!book)throw Error('书籍不存在');if(typeof document!=='undefined'){const root=document.querySelector<HTMLElement>('[data-active-app="reading"] [data-reverse-book-id]');if(!root||root.dataset.reverseBookId!==book.id)throw Error('阅读页面尚未打开');const viewport=root.querySelector<HTMLElement>('[data-ui="body"]')?.getBoundingClientRect();const lines=viewport?Array.from(root.querySelectorAll<HTMLElement>('.reading-line')).filter(e=>{const b=e.getBoundingClientRect();return e.getClientRects().length&&b.bottom>viewport.top&&b.top<viewport.bottom&&b.right>viewport.left&&b.left<viewport.right}).map(e=>e.textContent||'').filter(Boolean):[];return {label:`翻看了《${book.title}》`,content:JSON.stringify({title:book.title,paragraphs:lines.slice(0,12),notice:lines.length?'实际屏幕可见正文':'当前未读取正文，不得补造'})};}const progress=await loadProgress(book.id),chapters=await loadChapters(book.id);const chapter=chapters.find(c=>c.index===(progress?.chapterIndex||0));const base=progress?.readingMode==='scroll'?Math.floor((chapter?.paragraphs.length||0)*Math.min(1,Math.max(0,progress.scrollPosition))):Math.max(0,Math.floor(progress?.scrollPosition||0))*6;return{label:`翻看了《${book.title}》`,content:JSON.stringify({title:book.title,progress,chapter:chapter?.title,paragraphs:chapter?.paragraphs.slice(base+page.offset*8,base+page.offset*8+8)})};
}

function visibleSessions(){const contacts=new Set(loadChatContacts().map(c=>c.characterId));const time=(id:string)=>Math.max(Date.parse(getLastVisibleSessionMessage(id)?.createdAt||'')||0,Date.parse(getLastChatOfflineTurn(id)?.createdAt||'')||0);return loadChatSessions().filter(s=>!removedChatEntries().includes(s.id)&&reverseCanSeeChat(s.id)&&(s.isGroup||contacts.has(s.contactId))&&(!!getLastVisibleSessionMessage(s.id)||!!getLastChatOfflineTurn(s.id))).sort((a,b)=>Number(!!b.isPinned)-Number(!!a.isPinned)||time(b.id)-time(a.id));}
