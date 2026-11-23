'use client';
import {useEffect,useState} from 'react';
import {loadPresets,loadBindingConfig,resolveBinding,saveBindingConfig,getCharacterBinding,setCharacterBinding} from '@/lib/settings-storage';
import type {ModuleOverride} from '@/lib/preset-module-overrides';
export function PresetModuleControls({characterId,appId='chat'}:{characterId:string;appId?:string}){
 const [,refresh]=useState(0);useEffect(()=>{const sync=()=>refresh(v=>v+1);window.addEventListener('settings-presets-updated',sync);window.addEventListener('settings-bindings-updated',sync);return()=>{window.removeEventListener('settings-presets-updated',sync);window.removeEventListener('settings-bindings-updated',sync);};},[]);
 const config=loadBindingConfig(),slot=resolveBinding(config,characterId,appId),presets=loadPresets();const preset=presets.find(x=>x.id===slot.presetId)||presets.find(x=>x.builtIn);
 if(!preset||!characterId)return null;
 const binding=getCharacterBinding(config,characterId);const values=binding.presetModuleOverrides?.[preset.id]||{};
 const ordered=[...(preset.prompt_order||[]).map(x=>x.identifier),...preset.prompts.map(x=>x.identifier)];
 const prompts=[...new Set(ordered)].flatMap(id=>{const p=preset.prompts.find(x=>x.identifier===id);return p?[p]:[];});
 const change=(id:string,value:ModuleOverride)=>{const latest=loadBindingConfig(),b=getCharacterBinding(latest,characterId);const overrides={...b.presetModuleOverrides,[preset.id]:{...b.presetModuleOverrides?.[preset.id],[id]:value}};saveBindingConfig(setCharacterBinding(latest,{...b,presetModuleOverrides:overrides}));refresh(v=>v+1);};
 return <details className="preset-module-controls"><summary>预设模块 · {preset.name}</summary><p className="menu-desc">正文随原预设同步，这里只调整当前角色的启用状态。</p>{prompts.map(p=>{const defaultOn=preset.prompt_order?.find(x=>x.identifier===p.identifier)?.enabled??p.enabled;return <label key={p.identifier}><span>{p.name||p.identifier}</span><select aria-label={`${p.name||p.identifier}启用状态`} value={values[p.identifier]||'inherit'} onChange={e=>change(p.identifier,e.target.value as ModuleOverride)}><option value="inherit">继承 · {defaultOn?'开':'关'}</option><option value="enabled">开启</option><option value="disabled">关闭</option></select></label>;})}</details>;
}
