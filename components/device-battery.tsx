'use client';
import {useEffect,useState} from 'react';
import {observeDeviceBattery,type DeviceBattery} from '@/lib/device-battery';
export function DeviceBatteryIndicator(){
 const [battery,setBattery]=useState<DeviceBattery|null>(null);
 useEffect(()=>observeDeviceBattery(setBattery),[]);
 return <svg viewBox="0 0 26 12" className="status-battery" role="img" aria-label={battery?`电量 ${battery.percent}%${battery.charging?'，充电中':''}`:'电量暂不可读'} fill="currentColor">
 <rect x=".5" y=".5" width="22" height="11" rx="2.6" fill="none" stroke="currentColor" strokeOpacity=".5"/>
 <rect x="22.7" y="4" width="1.8" height="4" rx=".7" opacity=".5"/>
 {battery&&<><rect x="2" y="2" width={19*battery.percent/100} height="8" rx="1.5" opacity=".25"/><text x={battery.charging?9:11.5} y="8.7" textAnchor="middle" fontSize="7.5" fontWeight="700">{battery.percent}</text>{battery.charging&&<path d="M18 2 15 6.2h2L16 10l4-5h-2z"/>}</>}
 </svg>
}
