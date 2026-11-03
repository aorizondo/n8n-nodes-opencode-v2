import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { openCodeRequest } from '../transport/request';

export async function executeCommand(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject> {
	if (operation !== 'run') {
		throw new NodeOperationError(ctx.getNode(), `Unknown command operation "${operation}"`, { itemIndex });
	}
	const sessionId = String(ctx.getNodeParameter('sessionId', itemIndex, '') ?? '').trim();
	if (!sessionId) throw new NodeOperationError(ctx.getNode(), 'Session ID is empty', { itemIndex });
	const name = String(ctx.getNodeParameter('command', itemIndex, '') ?? '')
		.trim()
		.replace(/^\//, '');
	if (!name) throw new NodeOperationError(ctx.getNode(), 'Command is empty', { itemIndex });
	const text = String(ctx.getNodeParameter('arguments', itemIndex, '') ?? '');
	await openCodeRequest(ctx, {
		method: 'POST',
		path: `/api/session/${encodeURIComponent(sessionId)}/command`,
		body: { name, text },
		itemIndex,
	});
	return { sessionId, command: name, executed: true };
}
