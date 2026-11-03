// Subset of the OpenCode V2 wire types this node reads (see @opencode/schema). Only the fields used here are declared.

export interface ModelRef {
	providerID: string;
	id: string;
	variant?: string;
}

export interface PermissionRule {
	action: string;
	resource: string;
	effect: 'allow' | 'deny' | 'ask';
}

export interface SessionInfo {
	id: string;
	title?: string;
	agent?: string;
	model?: ModelRef;
	cost: number;
	tokens: TokenUsage;
	outcome?: 'succeeded' | 'failed' | 'interrupted';
	location: { directory: string };
	permissions?: PermissionRule[];
	metadata?: Record<string, unknown>;
	time: { created: number; updated: number; idle?: number };
}

export interface TokenUsage {
	input: number;
	output: number;
	reasoning: number;
	cache: { read: number; write: number };
}

export interface SessionError {
	type?: string;
	message?: string;
	[key: string]: unknown;
}

export interface AssistantText {
	type: 'text';
	text: string;
}

export interface AssistantReasoning {
	type: 'reasoning';
	text: string;
}

export interface AssistantTool {
	type: 'tool';
	id: string;
	name: string;
	state: {
		status: 'streaming' | 'running' | 'completed' | 'error';
		input?: unknown;
		error?: SessionError;
	};
}

export type AssistantContent = AssistantText | AssistantReasoning | AssistantTool;

export interface UserMessage {
	type: 'user';
	id: string;
	text: string;
	time: { created: number };
}

export interface AssistantMessage {
	type: 'assistant';
	id: string;
	agent: string;
	model: ModelRef;
	content: AssistantContent[];
	finish?: string;
	cost?: number;
	tokens?: TokenUsage;
	error?: SessionError;
	time: { created: number; completed?: number };
}

export interface IdleMessage {
	type: 'idle';
	id: string;
	outcome: 'succeeded' | 'failed' | 'interrupted';
	error?: SessionError;
	time: { created: number };
}

export interface OtherMessage {
	type: Exclude<string, 'user' | 'assistant' | 'idle'>;
	id: string;
	time: { created: number };
	[key: string]: unknown;
}

export type SessionMessage = UserMessage | AssistantMessage | IdleMessage | OtherMessage;

export interface MessagePage {
	data: SessionMessage[];
	cursor: { previous?: string | null; next?: string | null };
}

export interface InboxUser {
	id: string;
	sessionID: string;
	type: 'user';
	delivery: 'steer' | 'queue';
	time: { created: number };
}

export interface PermissionRequest {
	id: string;
	sessionID: string;
	action: string;
	resources: string[];
	message?: string;
}

export interface AgentInfo {
	id: string;
	name?: string;
	description?: string;
	mode: 'primary' | 'subagent' | 'all';
	hidden: boolean;
}

export interface ModelInfo {
	id: string;
	providerID: string;
	name?: string;
}
