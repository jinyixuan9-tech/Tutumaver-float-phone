"use client";
import { SettingsToggle } from "@/components/settings-toggle";
import {useState} from "react";
import {loadSms,saveSms} from "@/lib/sms-storage";
import {loadCharacters} from "@/lib/character-storage";
import {loadCommunicationPolicy,saveCommunicationPolicy,type CommunicationOptions} from "@/lib/communication-policy";
export function CommunicationSettings({channel}:{channel:"sms"|"phone"}) {
 const [config,setConfig]=useState(loadCommunicationPolicy);const options=config[channel];
 const update=(key:keyof CommunicationOptions,value:boolean|string[])=>{const fresh=loadCommunicationPolicy();const next={...fresh,[channel]:{...fresh[channel],[key]:value}};saveCommunicationPolicy(next);if(channel==="sms"){const sms=loadSms();sms.proactive="on";saveSms(sms);}setConfig(next);};
 const choices=(key:"busyCharacterIds"|"proactiveCharacterIds"|"callbackCharacterIds"|"excludedCharacterIds")=>{
 const chars=loadCharacters().filter(c=>key==="excludedCharacterIds"||!options.excludedCharacterIds?.includes(c.id));
 const rows=(supporting:boolean)=>chars.filter(c=>!!c.tags?.includes("配角")===supporting).map(c=><div key={c.id} style={{display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,padding:"10px 0",fontSize:"inherit",borderBottom:"1px solid #ececf0",textAlign:"left"}}><span>{c.name}</span><SettingsToggle label={`${c.name}：${key==="excludedCharacterIds"?"引入联系人":key==="busyCharacterIds"?"忙时挂起":key==="callbackCharacterIds"?"忙完回拨":"主动联系"}`} checked={key==="excludedCharacterIds"?!options.excludedCharacterIds?.includes(c.id):(options[key]||[]).includes(c.id)} onChange={checked=>{const ids=options[key]||[];const add=key==="excludedCharacterIds"?!checked:checked;update(key,add?[...new Set([...ids,c.id])]:ids.filter(id=>id!==c.id));}}/></div>);
 return <div>{rows(false)}{chars.some(c=>c.tags?.includes("配角"))&&<details style={{marginTop:8}}><summary style={{padding:"10px 0",cursor:"pointer",color:"#85858b"}}>其他角色</summary>{rows(true)}</details>}</div>;
 };
 return <section style={{marginTop:22}}><details><summary style={{padding:"12px 0",cursor:"pointer"}}>引入联系人</summary><p>只影响本 App 的联系人入口和主动联系，移出后保留历史记录。</p>{choices("excludedCharacterIds")}</details><h3>忙时挂起</h3><div style={{display:"flex",flexDirection:"row",justifyContent:"space-between",alignItems:"center",minHeight:44,gap:12,textAlign:"left"}}><span>参考角色日历</span><SettingsToggle label="参考角色日历" checked={options.busyEnabled} onChange={checked=>update("busyEnabled",checked)}/></div><p style={{fontSize:12,color:"#888",lineHeight:1.6}}>默认关闭。为选中的角色按忙碌程度处理{channel==="sms"?"短信，忙完后再回应积累的来信，不显示忙碌或已读提示。":"接听；连续来电会作为可能有急事的线索，无法看手机时仍不会接通。"}</p>{options.busyEnabled&&choices("busyCharacterIds")}<h3>允许主动{channel==="sms"?"短信":"来电"}</h3><p style={{fontSize:12,color:"#888"}}>按性格、关系和近期交流决定是否联系，勾选不代表一定发送。</p>{choices("proactiveCharacterIds")}{channel==="phone"&&<><h3>允许忙完后回拨</h3><p style={{fontSize:12,color:"#888"}}>根据未接来电和后续联系判断，不保证每次回拨。</p>{choices("callbackCharacterIds")}</>}</section>;
}
