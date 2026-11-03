import { createHash } from 'crypto';

const PREFIX = 'ses_n8n_';
const MAX_SLUG = 64;

/**
 * Maps a conversation key (chat id, phone number, Chat Trigger sessionId…) to a stable OpenCode session id.
 * OpenCode returns the existing session when POST /api/session receives an id it already knows, so the same key
 * always lands in the same session without storing anything in n8n. Ids must start with "ses"; the list orders by
 * time and only uses the id as a tie-breaker, so a custom id does not disturb ordering.
 */
export function sessionIdForConversation(conversationKey: string): string {
	const key = conversationKey.trim();
	if (!key) throw new Error('Conversation key is empty');
	const slug = key.replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_');
	const hash = createHash('sha256').update(key).digest('hex').slice(0, 10);
	// Keys that differ only in replaced characters ("a.b" vs "a b") would collide, so a hash suffix is added whenever
	// the slug is not the key itself or would be truncated.
	if (slug === key && slug.length <= MAX_SLUG) return PREFIX + slug;
	return `${PREFIX}${slug.slice(0, MAX_SLUG - 11)}_${hash}`;
}

/** Accepts a full session id as-is and turns anything else into a conversation-derived id. */
export function resolveSessionId(value: string): string {
	const trimmed = value.trim();
	return trimmed.startsWith('ses_') ? trimmed : sessionIdForConversation(trimmed);
}
