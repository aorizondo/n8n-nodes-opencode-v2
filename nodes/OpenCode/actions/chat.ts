import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { resolveSessionId } from '../helpers/session-id';
import { listMessages } from '../helpers/session';
import { openCodeRequest } from '../transport/request';
import type { AssistantMessage, UserMessage } from '../transport/types';
import { readModel, readPermissions, runTurn, type TurnOptions } from './turn';

export async function executeChat(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const conversationKey = String(ctx.getNodeParameter('conversationKey', itemIndex, '') ?? '').trim();
	if (!conversationKey) {
		throw new NodeOperationError(ctx.getNode(), 'Conversation Key is empty', {
			itemIndex,
			description: 'Map it to a value that identifies the conversation, such as the Chat Trigger sessionId.',
		});
	}
	const sessionId = resolveSessionId(conversationKey);

	if (operation === 'sendMessage') {
		const text = String(ctx.getNodeParameter('message', itemIndex, '') ?? '');
		if (!text.trim()) throw new NodeOperationError(ctx.getNode(), 'Message is empty', { itemIndex });
		const options = ctx.getNodeParameter('options', itemIndex, {}) as TurnOptions;
		const agent = String(ctx.getNodeParameter('agent', itemIndex, '') ?? '').trim();
		const result = await runTurn(
			ctx,
			itemIndex,
			{
				id: sessionId,
				title: options.title || `n8n: ${conversationKey}`,
				directory: ctx.getNodeParameter('directory', itemIndex) as string,
				agent: agent || undefined,
				model: readModel(ctx, options.model, itemIndex),
				permissions: readPermissions(ctx, itemIndex),
				metadata: { source: 'n8n', conversationKey },
			},
			text,
			options,
			true,
		);
		return { conversationKey, ...result };
	}

	if (operation === 'getHistory') {
		const limit = ctx.getNodeParameter('limit', itemIndex, 50) as number;
		const messages = await listMessages(ctx, sessionId, itemIndex, 200);
		return messages
			.filter((message) => message.type === 'user' || message.type === 'assistant')
			.map((message) => {
				if (message.type === 'user') {
					const user = message as UserMessage;
					return { role: 'user', id: user.id, text: user.text, time: user.time.created };
				}
				const assistant = message as AssistantMessage;
				return {
					role: 'assistant',
					id: assistant.id,
					agent: assistant.agent,
					text: assistant.content
						.flatMap((part) => (part.type === 'text' && part.text.trim() ? [part.text.trim()] : []))
						.join('\n\n'),
					time: assistant.time.created,
				};
			})
			.filter((entry) => entry.role === 'user' || entry.text)
			.slice(-limit)
			.map((entry) => ({ conversationKey, sessionId, ...entry }));
	}

	if (operation === 'reset') {
		await openCodeRequest(ctx, {
			method: 'DELETE',
			path: `/api/session/${encodeURIComponent(sessionId)}`,
			itemIndex,
		}).catch((error) => {
			// Resetting a conversation that never started is not an error.
			if (/SessionNotFound|404/.test(String((error as Error).message))) return undefined;
			throw error;
		});
		return { conversationKey, sessionId, reset: true };
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown chat operation "${operation}"`, { itemIndex });
}
