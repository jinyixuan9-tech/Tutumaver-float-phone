import type { TwitterPost } from "./twitter-storage";
/** Enumerate every saved reply with cycle protection, independent of viewport limits. */
export function twitterThreadReplies(posts: TwitterPost[], rootId: string): Array<{post: TwitterPost; depth: number}> {
  const children = new Map<string, TwitterPost[]>();
  for (const post of posts) if (post.replyToId) children.set(post.replyToId, [...(children.get(post.replyToId) || []), post]);
  for (const group of children.values()) group.sort((a,b) => a.createdAt-b.createdAt);
  const seen = new Set([rootId]);
  const stack = (children.get(rootId) || []).slice().reverse().map(post => ({post,depth:0}));
  const result: Array<{post:TwitterPost;depth:number}> = [];
  while (stack.length) {
    const entry = stack.pop()!;
    if (seen.has(entry.post.id)) continue;
    seen.add(entry.post.id); result.push(entry);
    for (const post of (children.get(entry.post.id) || []).slice().reverse()) stack.push({post,depth:entry.depth+1});
  }
  return result;
}
