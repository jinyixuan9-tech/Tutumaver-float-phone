/** Shared for manually hosted and AI hosted WVS lives. */
export function initialWvsViewers(fans:number,random=Math.random){return Math.max(320,Math.round(Math.max(1000,fans||100000)*(0.018+random()*0.05)));}
export function nextWvsViewers(current:number,round:number,random=Math.random){return Math.max(120,Math.round(current*(round<3?1.08+random()*0.24:0.96+random()*0.16)));}
