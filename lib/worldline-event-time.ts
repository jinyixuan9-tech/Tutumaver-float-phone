/** datetime-local uses the device's local clock; stored events remain absolute ISO instants. */
export function worldlineLocalTime(value = new Date().toISOString()): string {
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return "";
  const pad=(n:number)=>String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function worldlineTimeError(start:string,end?:string): string {
  const from=Date.parse(start);
  if(!Number.isFinite(from))return "请选择事件日期和时间。";
  if(end!==undefined&&(!end||!Number.isFinite(Date.parse(end))))return "请选择结束日期和时间。";
  if(end&&Date.parse(end)<=from)return "结束时间需晚于开始时间；跨天事件请选择结束日期。";
  return "";
}
export function worldlineTimeLabel(event:{occurredAt:string;endsAt?:string},iso=false):string {
  if(iso)return event.endsAt?`${event.occurredAt} 至 ${event.endsAt}`:event.occurredAt;
  const start=new Date(event.occurredAt),end=event.endsAt?new Date(event.endsAt):null;
  if(!Number.isFinite(start.getTime()))return event.occurredAt;
  const date=(d:Date)=>new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
  if(!end||!Number.isFinite(end.getTime()))return date(start);
  const sameDay=start.getFullYear()===end.getFullYear()&&start.getMonth()===end.getMonth()&&start.getDate()===end.getDate();
  const to=sameDay?new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}).format(end):date(end);
  return `${date(start)} — ${to}`;
}
