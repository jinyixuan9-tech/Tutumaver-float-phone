import type { Character } from "./character-types";
import type { UserIdentity } from "@/components/settings/user-identity";
import { resolveUserIdentity } from "./settings-storage";
import { loadCharacters } from "./character-storage";
export const USER_KNOWLEDGE_LEVELS = { stranger: "陌生", known: "认识", familiar: "熟悉", close: "亲近" } as const;
export type UserKnowledgeLevel = keyof typeof USER_KNOWLEDGE_LEVELS;
export function isUserKnowledgeLevel(value: unknown): value is UserKnowledgeLevel {
 return typeof value === "string" && Object.hasOwn(USER_KNOWLEDGE_LEVELS,value);
}
export function scopeUserIdentity(identity: UserIdentity, relationship: string = "known"): UserIdentity {
 const level = isUserKnowledgeLevel(relationship) ? relationship : "known";
 if(level === "stranger") return {...identity,gender:"",age:"",occupation:"",bio:"",customSettings:"",closeSettings:""};
 if(level === "known") return {...identity,customSettings:"",closeSettings:""};
 if(level === "familiar") return {...identity,closeSettings:""};
 return {...identity};
}
export function userKnowledgeLevel(character: Character, identityId: string): UserKnowledgeLevel {
 const value = character.userKnowledgeLevels?.[identityId];
 return isUserKnowledgeLevel(value) ? value : "known";
}
/** Resolvers freeze legacy tiers to the original Chat binding once, before applying them. */
export function filterUserIdentityForCharacter(identity: UserIdentity | null | undefined, character: Character): UserIdentity | null {
 if(!identity) return null;
 let current = character;
 if(!current.userKnowledgeLevels && isUserKnowledgeLevel(current.userRelationship)) {
  resolveUserIdentity(current.id,"chat");
  current = loadCharacters().find(c=>c.id===current.id) || current;
 }
 return scopeUserIdentity(identity,userKnowledgeLevel(current,identity.id));
}
export function commonUserRelationship(characters: Character[], identityId?: string): UserKnowledgeLevel {
 const order = ["stranger","known","familiar","close"] as const;
 return characters.reduce<UserKnowledgeLevel>((level,c)=>{
  const next = identityId ? userKnowledgeLevel(loadCharacters().find(item=>item.id===c.id) || c,identityId) : isUserKnowledgeLevel(c.userRelationship) ? c.userRelationship : "known";
  return order.indexOf(next)<order.indexOf(level)?next:level;
 },"close");
}
