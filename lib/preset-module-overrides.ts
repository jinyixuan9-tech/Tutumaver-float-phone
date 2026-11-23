import type {BindingConfig,PresetConfig} from './settings-types';
export type ModuleOverride='inherit'|'enabled'|'disabled';
/** Pure projection: never copy preset text into a character or mutate the original preset. */
export function applyPresetModuleOverrides(preset:PresetConfig,config:BindingConfig,characterId?:string):PresetConfig {
 if(!characterId)return preset;
 const overrides=config.characterBindings.find(x=>x.characterId===characterId)?.presetModuleOverrides?.[preset.id];
 if(!overrides)return preset;
 const enabled=(id:string,fallback:boolean)=>overrides[id]==='enabled'?true:overrides[id]==='disabled'?false:fallback;
 return {...preset,prompts:preset.prompts.map(p=>({...p,enabled:enabled(p.identifier,p.enabled)})),prompt_order:preset.prompt_order?.map(p=>({...p,enabled:enabled(p.identifier,p.enabled)}))};
}
