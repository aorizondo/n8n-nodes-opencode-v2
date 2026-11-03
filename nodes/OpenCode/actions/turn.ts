import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { presetRules, type PermissionPreset } from '../helpers/permissions';
import { parseModel, type TurnResult } from '../helpers/result';
import {
	ensureSession,
	interruptSession,
	listMessages,
	sendPrompt,
	waitForTurn,
	type EnsureSessionInput,
	type TimeoutBehavior,
} from '../helpers/session';
import { isTimeoutError } from '../transport/request';
import type { ModelRef, PermissionRule } from '../transport/types';

export interface TurnOptions {
	autoRejectPermissions?: boolean;
	delivery?: 'steer' | 'queue';
	includeRaw?: boolean;
	model?: string;
	onTimeout?: TimeoutBehavior;
	timeout?: number;
	title?: string;
}

export function readPermissions(ctx: IExecuteFunctions, itemIndex: number): PermissionRule[] | undefined {
	const preset = ctx.getNodeParameter('permissionPreset', itemIndex, 'readOnly') as PermissionPreset;
	const custom = preset === 'custom' ? stringify(ctx.getNodeParameter('customPermissions', itemIndex, '[]')) : undefined;
	try {
		return presetRules(preset, custom);
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), (error as Error).message, { itemIndex });
	}
}

export function readModel(ctx: IExecuteFunctions, value: string | undefined, itemIndex: number): ModelRef | undefined {
	if (!value?.trim()) return undefined;
	try {
		return parseModel(value);
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), (error as Error).message, { itemIndex });
	}
}

/**
 * One full turn: make sure the session exists with the requested agent/model/permissions, send the text, wait for the
 * reply and shape it. Shared by Chat → Send Message and Session → Send Prompt.
 */
export async function runTurn(
	ctx: IExecuteFunctions,
	itemIndex: number,
	session: EnsureSessionInput,
	text: string,
	options: TurnOptions,
	wait: boolean,
): Promise<IDataObject> {
	const timeoutMs = Math.max(5, options.timeout ?? 300) * 1000;
	const ensured = await ensureSession(ctx, session, itemIndex);
	const sessionId = ensured.session.id;
	const sentAt = Date.now();
	const admitted = await sendPrompt(ctx, sessionId, { text, delivery: options.delivery }, itemIndex, timeoutMs).catch(
		(error) => {
			if (!isTimeoutError(error)) throw error;
			throw new NodeOperationError(
				ctx.getNode(),
				`OpenCode did not accept the message within ${timeoutMs / 1000}s (session ${sessionId})`,
				{
					itemIndex,
					description:
						'Plugins loaded for the working directory (for example memory plugins) run before the message is accepted. Use a working directory without project plugins, or raise the timeout.',
				},
			);
		},
	);
	const base: IDataObject = {
		sessionId,
		messageId: admitted.id,
		agentSwitched: ensured.agentSwitched,
		// Time OpenCode took to accept the message. High values come from the folder's plugins (prompt hooks run
		// before admission), not from the model.
		admittedMs: Date.now() - sentAt,
	};
	if (!wait) return { ...base, status: 'running' };

	const outcome = await waitForTurn(ctx, sessionId, admitted.id, itemIndex, {
		timeoutMs,
		pollIntervalMs: 2000,
		autoRejectPermissions: options.autoRejectPermissions ?? true,
	});
	let status: string = outcome.turn?.completed ? (outcome.turn.outcome ?? 'succeeded') : 'running';
	if (outcome.timedOut) {
		const behavior = options.onTimeout ?? 'interrupt';
		if (behavior === 'error') {
			throw new NodeOperationError(
				ctx.getNode(),
				`OpenCode did not finish within ${timeoutMs / 1000}s (session ${sessionId})`,
				{ itemIndex, description: 'Raise the timeout, or choose another "On Timeout" behavior.' },
			);
		}
		if (behavior === 'interrupt') {
			await interruptSession(ctx, sessionId, itemIndex);
			status = 'interrupted';
		} else {
			status = 'timeout';
		}
	}
	const output: IDataObject = {
		...base,
		...shapeTurn(outcome.turn),
		status,
	};
	if (outcome.rejectedPermissions.length) {
		output.rejectedPermissions = outcome.rejectedPermissions.map((request) => ({
			action: request.action,
			resources: request.resources,
		}));
	}
	if (options.includeRaw) output.messages = await rawTurn(ctx, sessionId, admitted.id, itemIndex);
	return output;
}

export function shapeTurn(turn: TurnResult | undefined): IDataObject {
	if (!turn) return { reply: '' };
	const output: IDataObject = {
		reply: turn.reply,
		agent: turn.agent,
		model: turn.model,
		finish: turn.finish,
		toolsUsed: turn.toolsUsed as unknown as IDataObject[],
		cost: turn.cost,
		tokens: turn.tokens as unknown as IDataObject,
	};
	if (turn.error) output.error = turn.error;
	return output;
}

async function rawTurn(ctx: IExecuteFunctions, sessionId: string, userMessageId: string, itemIndex: number) {
	const messages = await listMessages(ctx, sessionId, itemIndex);
	const start = messages.findIndex((message) => message.id === userMessageId);
	return (start === -1 ? [] : messages.slice(start)) as unknown as IDataObject[];
}

function stringify(value: unknown): string {
	return typeof value === 'string' ? value : JSON.stringify(value);
}
