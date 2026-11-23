import { boundSocialWorldBooks } from "./social-worldbook-bindings";
import type { TwitterState } from "./twitter-storage";

/** Every consumer uses the unified app/character bindings. */
export function selectedTwitterWorldBooks(_state: TwitterState, sensitive = false, characterId?: string) {
  return boundSocialWorldBooks("twitter", characterId, sensitive);
}

export function twitterWorldBookText(state: TwitterState, sensitive = false, maxLength = 3200): string {
  return selectedTwitterWorldBooks(state, sensitive)
    .map(book => `${book.name}：${book.entries.filter(entry => !entry.disable).map(entry => entry.content).join("；")}`)
    .join("\n").slice(0, maxLength);
}
