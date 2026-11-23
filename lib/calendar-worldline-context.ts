import {activeWorldline,worldlineEnabledForApp} from './worldline-storage';
/** Current facts first, with uncertainty preserved; never truncate behind the entire archive. */
export function calendarWorldlineContext():string{
 const w=activeWorldline();if(!w||!worldlineEnabledForApp(w,'calendar'))return '';
 const history=w.progressHistory||[],current=history.at(-1)?.text||w.currentState;
 const previous=history.at(-2)?.text;
 const background=(w.archive||[]).flatMap(g=>g.entries.map(e=>`${g.name} / ${e.title}：${e.content}`)).join('\n').slice(0,1800);
 const events=w.events.filter(e=>e.visibility==='public').sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,5).map(e=>`${e.occurredAt} ${e.title}：${e.detail.slice(0,500)}`).join('\n');
 return [`【当前世界线进展｜保留传闻、待定、已确认的原有状态】${current||'暂无'}`,previous?`上一条进展（状态以前面最新进展为准）：${previous.slice(0,2200)}`:'',events?`近期公开事件：${events}`:'',background?`背景资料（仅作事实补充，不要求逐条生成日程）：${background}`:''].filter(Boolean).join('\n\n');
}
