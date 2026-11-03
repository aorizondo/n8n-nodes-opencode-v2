import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { isTimeoutError, openCodeRequest, sleep } from '../transport/request';
import type {
	InboxUser,
	MessagePage,
	ModelRef,
	PermissionRequest,
	PermissionRule,
	SessionInfo,
	SessionMessage,
} from '../transport/types';
import { sameRules } from './permissions';
import { collectTurn, formatModel, type TurnResult } from './result';

export interface EnsureSessionInput {
	id?: string;
	title?: string;
	directory: string;
	agent?: string;
	model?: ModelRef;
	permissions?: PermissionRule[];
	metadata?: IDataObject;
}

export interface EnsuredSession {
	session: SessionInfo;
	agentSwitched: boolean;
	modelSwitched: boolean;
}

/**
 * Creates the session or returns the existing one with the same id, then aligns agent, model and permissions with the
 * requested ones. Switching agent or model keeps the history: the next turn simply runs with the new agent, which sees
 * the whole conversation. Permissions are replaced as a whole (PATCH replaces the ruleset).
 */
export async function ensureSession(
	ctx: IExecuteFunctions,
	input: EnsureSessionInput,
	itemIndex: number,
): Promise<EnsuredSession> {
	const body: IDataObject = { location: { directory: input.directory } };
	if (input.id) body.id = input.id;
	if (input.title) body.title = input.title;
	if (input.agent) body.agent = input.agent;
	if (input.model) body.model = input.model as unknown as IDataObject;
	if (input.permissions) body.permissions = input.permissions as unknown as IDataObject[];
	if (input.metadata) body.metadata = input.metadata;
	const created = await openCodeRequest<{ data: SessionInfo }>(ctx, {
		method: 'POST',
		path: '/api/session',
		body,
		itemIndex,
	});
	const session = created.data;
	let agentSwitched = false;
	let modelSwitched = false;
	if (input.agent && session.agent !== input.agent) {
		await openCodeRequest(ctx, {
			method: 'POST',
			path: `/api/session/${encodeURIComponent(session.id)}/agent`,
			body: { agent: input.agent },
			itemIndex,
		});
		session.agent = input.agent;
		agentSwitched = true;
	}
	if (input.model && formatModel(session.model) !== formatModel(input.model)) {
		await openCodeRequest(ctx, {
			method: 'POST',
			path: `/api/session/${encodeURIComponent(session.id)}/model`,
			body: { model: input.model as unknown as IDataObject },
			itemIndex,
		});
		session.model = input.model;
		modelSwitched = true;
	}
	if (input.permissions && !sameRules(session.permissions, input.permissions)) {
		await openCodeRequest(ctx, {
			method: 'PATCH',
			path: `/api/session/${encodeURIComponent(session.id)}`,
			body: { permissions: input.permissions as unknown as IDataObject[] },
			itemIndex,
		});
		session.permissions = input.permissions;
	}
	return { session, agentSwitched, modelSwitched };
}

export interface PromptInput {
	text: string;
	delivery?: 'steer' | 'queue';
	files?: IDataObject[];
}

export async function sendPrompt(
	ctx: IExecuteFunctions,
	sessionId: string,
	input: PromptInput,
	itemIndex: number,
	timeoutMs: number,
): Promise<InboxUser> {
	const body: IDataObject = { text: input.text };
	if (input.delivery) body.delivery = input.delivery;
	if (input.files?.length) body.files = input.files;
	const response = await openCodeRequest<{ data: InboxUser }>(ctx, {
		method: 'POST',
		path: `/api/session/${encodeURIComponent(sessionId)}/prompt`,
		body,
		itemIndex,
		// Plugins run their prompt hooks before the server answers, which can take tens of seconds.
		timeoutMs,
	});
	return response.data;
}

export async function listMessages(
	ctx: IExecuteFunctions,
	sessionId: string,
	itemIndex: number,
	limit = 200,
): Promise<SessionMessage[]> {
	const page = await openCodeRequest<MessagePage>(ctx, {
		method: 'GET',
		path: `/api/session/${encodeURIComponent(sessionId)}/message`,
		qs: { order: 'desc', limit },
		itemIndex,
	});
	return [...page.data].reverse();
}

export async function getTurn(
	ctx: IExecuteFunctions,
	sessionId: string,
	userMessageId: string,
	itemIndex: number,
): Promise<TurnResult | undefined> {
	return collectTurn(await listMessages(ctx, sessionId, itemIndex), userMessageId);
}

export type TimeoutBehavior = 'error' | 'interrupt' | 'partial';

export interface WaitOptions {
	timeoutMs: number;
	pollIntervalMs: number;
	autoRejectPermissions: boolean;
}

export interface WaitOutcome {
	turn?: TurnResult;
	timedOut: boolean;
	rejectedPermissions: PermissionRequest[];
}

/**
 * Waits until the turn answering `userMessageId` ends with an idle marker. Long-polls the server's wait endpoint in
 * short slices (so reverse proxies never see a request long enough to cut) and checks the timeline between slices.
 * Pending permission requests can be rejected so a missing human does not block the run.
 */
export async function waitForTurn(
	ctx: IExecuteFunctions,
	sessionId: string,
	userMessageId: string,
	itemIndex: number,
	options: WaitOptions,
): Promise<WaitOutcome> {
	const deadline = Date.now() + options.timeoutMs;
	const rejectedPermissions: PermissionRequest[] = [];
	let waitSupported = true;
	for (;;) {
		const turn = await getTurn(ctx, sessionId, userMessageId, itemIndex);
		if (turn?.completed) return { turn, timedOut: false, rejectedPermissions };
		if (options.autoRejectPermissions) {
			rejectedPermissions.push(...(await rejectPendingPermissions(ctx, sessionId, itemIndex)));
		}
		const remaining = deadline - Date.now();
		if (remaining <= 0) return { turn, timedOut: true, rejectedPermissions };
		const slice = Math.min(remaining, 25_000);
		if (waitSupported) {
			try {
				await openCodeRequest(ctx, {
					method: 'POST',
					path: `/api/experimental/session/${encodeURIComponent(sessionId)}/wait`,
					itemIndex,
					timeoutMs: slice,
				});
				continue;
			} catch (error) {
				// A timed-out slice just means the agent is still working. Anything else (route removed in a newer
				// server, proxy refusing long requests) falls back to plain polling.
				if (isTimeoutError(error)) continue;
				waitSupported = false;
			}
		}
		await sleep(Math.min(options.pollIntervalMs, Math.max(remaining, 0)));
	}
}

export async function rejectPendingPermissions(
	ctx: IExecuteFunctions,
	sessionId: string,
	itemIndex: number,
): Promise<PermissionRequest[]> {
	const pending = await openCodeRequest<{ data: PermissionRequest[] }>(ctx, {
		method: 'GET',
		path: `/api/session/${encodeURIComponent(sessionId)}/permission`,
		itemIndex,
	});
	for (const request of pending.data) {
		await openCodeRequest(ctx, {
			method: 'POST',
			path: `/api/session/${encodeURIComponent(sessionId)}/permission/${encodeURIComponent(request.id)}/reply`,
			body: {
				decision: 'reject',
				message: 'Rejected automatically by n8n: no one is available to approve this action.',
			},
			itemIndex,
		});
	}
	return pending.data;
}

export async function interruptSession(ctx: IExecuteFunctions, sessionId: string, itemIndex: number) {
	return openCodeRequest<{ interrupted: boolean }>(ctx, {
		method: 'POST',
		path: `/api/session/${encodeURIComponent(sessionId)}/interrupt`,
		itemIndex,
	});
}
