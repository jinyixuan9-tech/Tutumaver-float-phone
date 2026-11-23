"use client";
import { SettingsToggle } from "@/components/settings-toggle";
import type { Character } from "@/lib/character-types";
import { USER_KNOWLEDGE_LEVELS, type UserKnowledgeLevel } from "@/lib/user-knowledge";
import { CHARACTER_LANGUAGES, type CharacterLanguage } from "@/lib/character-language";
export type CharacterPreferences = Pick<Character, "nativeLanguage" | "communicationLanguage" | "languageUsage" | "chineseProxyInput" | "userKnowledgeLevels">;
export function CharacterLanguageSettings({ value, onChange, editing, identityId, identityName, defaultLevel }: { value: CharacterPreferences; onChange: (value: CharacterPreferences) => void; editing: boolean; identityId?: string; identityName?: string; defaultLevel: UserKnowledgeLevel }) {
    const patch = (next: Partial<CharacterPreferences>) => onChange({ ...value, ...next });
    return <div className="char-log-entry mb-4 border-t border-dashed border-[#999] pt-3">
        <div className="char-log-entry-header"><span>LANGUAGE / KNOWLEDGE</span></div>
        <div className="char-preferences">
            {([ ["nativeLanguage", "母语"], ["communicationLanguage", "日常交流语言"] ] as const).map(([key,label]) => <label key={key}>{label}{editing ? <select className="char-archive-input" value={value[key] || "persona"} onChange={e => patch({ [key]: e.target.value as CharacterLanguage })}>{Object.entries(CHARACTER_LANGUAGES).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select> : <span>{CHARACTER_LANGUAGES[value[key] || "persona"]}</span>}</label>)}
            <p className="char-archive-p">日常语言作为默认，具体能力与切换习惯在下方填写。</p>
            <div style={{display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,minHeight:38,textAlign:"left"}}><span>中文代输入</span>{editing ? <SettingsToggle label="中文代输入" checked={value.chineseProxyInput !== false} onChange={checked => patch({chineseProxyInput:checked})}/> : <span>{value.chineseProxyInput !== false ? "已开启" : "已关闭"}</span>}</div>
            <p className="char-archive-p">开启时中文代入当前交流语言；关闭时按实际语言理解。</p>
            <label>语言习惯{editing ? <textarea className="char-archive-input" rows={3} value={value.languageUsage || ""} placeholder="例如：日语母语、韩语流利、中文只会简单问候" onChange={e => patch({ languageUsage: e.target.value })} /> : <span>{value.languageUsage || "遵循人设与情境"}</span>}</label>
            <label>对 {identityName || "当前用户身份"} 的了解程度{editing && identityId ? <select className="char-archive-input" aria-label="用户资料了解程度" value={value.userKnowledgeLevels?.[identityId] || defaultLevel} onChange={e => patch({ userKnowledgeLevels: { ...value.userKnowledgeLevels, [identityId]: e.target.value as UserKnowledgeLevel } })}>{Object.entries(USER_KNOWLEDGE_LEVELS).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select> : <span>{identityId ? USER_KNOWLEDGE_LEVELS[value.userKnowledgeLevels?.[identityId] || defaultLevel] : "请先绑定用户身份"}</span>}</label>
            <p className="char-archive-p">只控制这份用户资料的透露范围 朋友、恋人等关系在地图牵线里设置 不随关系自动开放资料</p>
        </div>
    </div>;
}
