/** Hide publisher bookkeeping and present release notes as text, never executable HTML. */
export function cleanUpdateNotes(text:string|undefined){return(text||'').replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/^#{1,6}\s+/gm,'').trim();}
