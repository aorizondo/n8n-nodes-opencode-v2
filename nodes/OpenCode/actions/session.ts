import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { collectTurn } from '../helpers/result';
import { interruptSession, listMessages } from '../helpers/session';
import { openCodeRequest } from '../transport/request';
import type { SessionInfo } from '../transport/types';
import { readModel, readPermissions, runTurn, shapeTurn, type TurnOptions } from './turn';

export async function executeSession(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const sessionId = () => {
		const value = String(ctx.getNodeParameter('sessionId', itemIndex, '') ?? '').trim();
		if (!value) throw new NodeOperationError(ctx.getNode(), 'Session ID is empty', { itemIndex });
		return value;
	};
	const path = (id: string) => `/api/session/${encodeURIComponent(id)}`;

	switch (operation) {
		case 'prompt': {
			const text = String(ctx.getNodeParameter('message', itemIndex, '') ?? '');
			if (!text.trim()) throw new NodeOperationError(ctx.getNode(), 'Prompt is empty', { itemIndex });
			const options = ctx.getNodeParameter('options', itemIndex, {}) as TurnOptions;
			const existing = String(ctx.getNodeParameter('sessionId', itemIndex, '') ?? '').trim();
			const agent = String(ctx.getNodeParameter('agent', itemIndex, '') ?? '').trim();
			return runTurn(
				ctx,
				itemIndex,
				{
					id: existing || undefined,
					title: options.title || `n8n: ${ctx.getWorkflow().name ?? 'workflow'}`,
					directory: ctx.getNodeParameter('directory', itemIndex) as string,
					agent: agent || undefined,
					model: readModel(ctx, options.model, itemIndex),
					permissions: readPermissions(ctx, itemIndex),
					metadata: { source: 'n8n' },
				},
				text,
				{ ...options, timeout: options.timeout ?? 600 },
				ctx.getNodeParameter('waitForCompletion', itemIndex, true) as boolean,
			);
		}
		case 'getResult': {
			const id = sessionId();
			const messages = await listMessages(ctx, id, itemIndex);
			let userMessageId = String(ctx.getNodeParameter('userMessageId', itemIndex, '') ?? '').trim();
			if (!userMessageId) {
				const lastUser = [...messages].reverse().find((message) => message.type === 'user');
				if (!lastUser) return { sessionId: id, status: 'empty', reply: '' };
				userMessageId = lastUser.id;
			}
			const turn = collectTurn(messages, userMessageId);
			if (!turn) {
				throw new NodeOperationError(ctx.getNode(), `Message ${userMessageId} not found in session ${id}`, {
					itemIndex,
					description: 'The prompt may not have been delivered yet, or it is older than the last 200 messages.',
				});
			}
			return {
				sessionId: id,
				messageId: userMessageId,
				...shapeTurn(turn),
				status: turn.completed ? (turn.outcome ?? 'succeeded') : 'running',
			};
		}
		case 'get': {
			const response = await openCodeRequest<{ data: SessionInfo }>(ctx, {
				method: 'GET',
				path: path(sessionId()),
				itemIndex,
			});
			return response.data as unknown as IDataObject;
		}
		case 'getAll': {
			const returnAll = ctx.getNodeParameter('returnAll', itemIndex, false) as boolean;
			const limit = returnAll ? Infinity : (ctx.getNodeParameter('limit', itemIndex, 50) as number);
			const filters = ctx.getNodeParameter('filters', itemIndex, {}) as { directory?: string; search?: string };
			const sessions: SessionInfo[] = [];
			let cursor: string | undefined;
			do {
				const qs: IDataObject = { limit: Math.min(100, limit - sessions.length) };
				if (cursor) qs.cursor = cursor;
				else qs.order = 'desc';
				if (filters.directory) qs.directory = filters.directory;
				if (filters.search) qs.search = filters.search;
				const page = await openCodeRequest<{ data: SessionInfo[]; cursor: { next?: string | null } }>(ctx, {
					method: 'GET',
					path: '/api/session',
					qs,
					itemIndex,
				});
				sessions.push(...page.data);
				cursor = page.data.length ? (page.cursor.next ?? undefined) : undefined;
			} while (cursor && sessions.length < limit);
			return sessions.slice(0, limit) as unknown as IDataObject[];
		}
		case 'delete': {
			const id = sessionId();
			await openCodeRequest(ctx, { method: 'DELETE', path: path(id), itemIndex });
			return { sessionId: id, deleted: true };
		}
		case 'interrupt': {
			const id = sessionId();
			const response = await interruptSession(ctx, id, itemIndex);
			return { sessionId: id, interrupted: response.interrupted };
		}
		case 'switchAgent': {
			const id = sessionId();
			const agent = String(ctx.getNodeParameter('agent', itemIndex, '') ?? '').trim();
			if (!agent) throw new NodeOperationError(ctx.getNode(), 'Agent is empty', { itemIndex });
			await openCodeRequest(ctx, { method: 'POST', path: `${path(id)}/agent`, body: { agent }, itemIndex });
			return { sessionId: id, agent };
		}
	}
	throw new NodeOperationError(ctx.getNode(), `Unknown session operation "${operation}"`, { itemIndex });
}
