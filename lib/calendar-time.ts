import { formatZonedPromptTimestamp } from "./character-time";
export function calendarWallTimeToInstant(date:string,time:string,zone:string):number {
 const target=Date.parse(`${date}T${time}:00Z`);let candidate=target;
 for(let n=0;n<3;n++){const shown=Date.parse(formatZonedPromptTimestamp(new Date(candidate),zone).replace(" ","T")+":00Z");const delta=target-shown;if(!delta)break;candidate+=delta;}
 return candidate;
}
