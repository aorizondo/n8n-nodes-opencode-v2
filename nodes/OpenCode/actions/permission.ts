import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { openCodeRequest } from '../transport/request';
import type { PermissionRequest } from '../transport/types';

export async function executePermission(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const sessionId = String(ctx.getNodeParameter('sessionId', itemIndex, '') ?? '').trim();
	if (!sessionId) throw new NodeOperationError(ctx.getNode(), 'Session ID is empty', { itemIndex });
	const base = `/api/session/${encodeURIComponent(sessionId)}/permission`;

	if (operation === 'getPending') {
		const response = await openCodeRequest<{ data: PermissionRequest[] }>(ctx, {
			method: 'GET',
			path: base,
			itemIndex,
		});
		return response.data as unknown as IDataObject[];
	}

	if (operation === 'reply') {
		const requestId = String(ctx.getNodeParameter('requestId', itemIndex, '') ?? '').trim();
		if (!requestId) throw new NodeOperationError(ctx.getNode(), 'Request ID is empty', { itemIndex });
		const decision = ctx.getNodeParameter('decision', itemIndex) as string;
		const message = String(ctx.getNodeParameter('replyMessage', itemIndex, '') ?? '').trim();
		const body: IDataObject = { decision };
		if (message) body.message = message;
		await openCodeRequest(ctx, {
			method: 'POST',
			path: `${base}/${encodeURIComponent(requestId)}/reply`,
			body,
			itemIndex,
		});
		return { sessionId, requestId, decision };
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown permission operation "${operation}"`, { itemIndex });
}
