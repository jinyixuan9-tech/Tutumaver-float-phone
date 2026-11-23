'use client';
import {CityDiaryApp} from './icity-app';
export function DiaryApp({onClose,onNotice}:{onClose:()=>void;onNotice?:(message:string)=>void}){return <CityDiaryApp onClose={onClose} onNotice={onNotice}/>;}
