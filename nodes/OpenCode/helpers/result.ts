import type {
	AssistantMessage,
	IdleMessage,
	ModelRef,
	SessionError,
	SessionMessage,
	TokenUsage,
} from '../transport/types';

export interface ToolUse {
	name: string;
	status: string;
	error?: string;
}

export interface TurnResult {
	/** Text of every assistant step in the turn, joined. Reasoning is excluded. */
	reply: string;
	/** Agent and model of the last assistant step, i.e. who answered. */
	agent?: string;
	model?: string;
	finish?: string;
	/** True once an idle marker closes the turn. */
	completed: boolean;
	outcome?: IdleMessage['outcome'];
	error?: string;
	toolsUsed: ToolUse[];
	cost: number;
	tokens: TokenUsage;
	assistantMessageIds: string[];
}

const emptyTokens = (): TokenUsage => ({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } });

export function formatModel(model: ModelRef | undefined): string | undefined {
	if (!model) return undefined;
	return `${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ''}`;
}

/** Parses "provider/model" or "provider/model#variant", the same format OpenCode uses in its config. */
export function parseModel(value: string): ModelRef {
	const input = value.trim();
	const providerEnd = input.indexOf('/');
	if (providerEnd <= 0) throw new Error(`Model must look like "provider/model", got "${value}"`);
	const variantStart = input.indexOf('#', providerEnd + 1);
	const id = input.slice(providerEnd + 1, variantStart === -1 ? undefined : variantStart);
	const variant = variantStart === -1 ? undefined : input.slice(variantStart + 1);
	if (!id || (variant !== undefined && !variant)) throw new Error(`Model must look like "provider/model", got "${value}"`);
	return { providerID: input.slice(0, providerEnd), id, ...(variant ? { variant } : {}) };
}

export function errorText(error: SessionError | undefined): string | undefined {
	if (!error) return undefined;
	return [error.type, error.message].filter(Boolean).join(': ') || JSON.stringify(error);
}

/**
 * Collects the turn that answers `userMessageId` from an ascending timeline: every message after that user message
 * and before the next user message. Plugins may inject synthetic messages before it (they belong to the same turn),
 * and several assistant steps appear when the agent calls tools.
 */
export function collectTurn(messages: SessionMessage[], userMessageId: string): TurnResult | undefined {
	const start = messages.findIndex((message) => message.id === userMessageId);
	if (start === -1) return undefined;
	const result: TurnResult = {
		reply: '',
		completed: false,
		toolsUsed: [],
		cost: 0,
		tokens: emptyTokens(),
		assistantMessageIds: [],
	};
	const texts: string[] = [];
	for (const message of messages.slice(start + 1)) {
		if (message.type === 'user') break;
		if (message.type === 'idle') {
			const idle = message as IdleMessage;
			result.completed = true;
			result.outcome = idle.outcome;
			result.error = result.error ?? errorText(idle.error);
			break;
		}
		if (message.type !== 'assistant') continue;
		const assistant = message as AssistantMessage;
		result.assistantMessageIds.push(assistant.id);
		result.agent = assistant.agent;
		result.model = formatModel(assistant.model);
		result.finish = assistant.finish ?? result.finish;
		result.cost += assistant.cost ?? 0;
		if (assistant.tokens) addTokens(result.tokens, assistant.tokens);
		if (assistant.error) result.error = errorText(assistant.error);
		for (const part of assistant.content) {
			if (part.type === 'text' && part.text.trim()) texts.push(part.text.trim());
			if (part.type === 'tool') {
				result.toolsUsed.push({
					name: part.name,
					status: part.state.status,
					...(part.state.error ? { error: errorText(part.state.error) } : {}),
				});
			}
		}
	}
	result.reply = texts.join('\n\n');
	return result;
}

function addTokens(total: TokenUsage, add: TokenUsage) {
	total.input += add.input ?? 0;
	total.output += add.output ?? 0;
	total.reasoning += add.reasoning ?? 0;
	total.cache.read += add.cache?.read ?? 0;
	total.cache.write += add.cache?.write ?? 0;
}
