"use client";
export type DisclosureChoice = { id: string; name: string };
export function SocialDisclosure({ options, known, mutual, onChange }: { options: DisclosureChoice[]; known: string[]; mutual: string[]; onChange: (known: string[], mutual: string[]) => void }) {
 return <section className="social-disclosure"><strong>向谁披露真实身份</strong><p>仅限已有关系的人。私下知情不改变公开身份。</p>{options.length ? options.map(o => <label key={o.id}><span>{o.name}</span><select aria-label={`${o.name}的披露方向`} value={mutual.includes(o.id) ? "both" : known.includes(o.id) ? "one" : "none"} onChange={e => onChange([...known.filter(id=>id!==o.id), ...(e.target.value!=="none"?[o.id]:[])], [...mutual.filter(id=>id!==o.id), ...(e.target.value==="both"?[o.id]:[])])}><option value="none">不披露</option><option value="one">让对方知道我是谁</option><option value="both">互相知道身份</option></select></label>) : <p>先在角色关系中建立关系线。</p>}</section>;
}
