"use client";
export function SettingsToggle({checked,onChange,label}:{checked:boolean;onChange:(value:boolean)=>void;label:string}) {
 return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={()=>onChange(!checked)} style={{position:"relative",display:"block",flex:"0 0 44px",width:44,minWidth:44,height:26,minHeight:26,padding:0,margin:0,border:0,borderRadius:20,background:checked?"#34c759":"#dedee3",boxShadow:"none",cursor:"pointer",transition:"background .18s"}}><span aria-hidden="true" style={{position:"absolute",top:3,left:checked?21:3,width:20,height:20,borderRadius:"50%",background:"white",boxShadow:"0 1px 3px #0002",transition:"left .18s"}}/></button>;
}
