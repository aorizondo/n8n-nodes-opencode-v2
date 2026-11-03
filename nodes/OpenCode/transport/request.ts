import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export { sleep } from 'n8n-workflow';

export const CREDENTIAL_NAME = 'openCodeV2Api';

export type OpenCodeContext = IExecuteFunctions | ILoadOptionsFunctions;

export interface RequestInput {
	method: IHttpRequestMethods;
	path: string;
	body?: IDataObject;
	qs?: IDataObject;
	/** Working directory for location-scoped routes (agents, models, plugins). Sent as location[directory]. */
	directory?: string;
	timeoutMs?: number;
	itemIndex?: number;
}

export async function baseUrl(ctx: OpenCodeContext): Promise<string> {
	const credentials = await ctx.getCredentials(CREDENTIAL_NAME);
	return String(credentials.baseUrl ?? '').replace(/\/+$/, '');
}

/**
 * Calls the OpenCode V2 HTTP API with the node's credentials. Session routes resolve their location from the session,
 * so only location-scoped list routes need `directory`. The query key must be `location[directory]`: `?directory=`
 * is ignored by the server.
 */
export async function openCodeRequest<T = unknown>(ctx: OpenCodeContext, input: RequestInput): Promise<T> {
	const qs: IDataObject = { ...(input.qs ?? {}) };
	if (input.directory) qs['location[directory]'] = input.directory;
	const options: IHttpRequestOptions = {
		method: input.method,
		baseURL: await baseUrl(ctx),
		url: input.path,
		qs,
		json: true,
		timeout: input.timeoutMs,
	};
	if (input.body !== undefined) options.body = input.body;
	try {
		return (await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL_NAME, options)) as T;
	} catch (error) {
		// Callers that set a timeout (long-poll slices) need to tell "still running" from real failures, so the
		// timeout is tagged on the wrapped error instead of being inferred from its message later.
		const timedOut = input.timeoutMs !== undefined && isTimeoutError(error);
		const wrapped = new NodeApiError(ctx.getNode(), error as JsonObject, {
			itemIndex: input.itemIndex,
			message: timedOut ? `OpenCode request to ${input.path} timed out` : describeError(error),
		});
		if (timedOut) timedOutErrors.add(wrapped);
		throw wrapped;
	}
}

/** OpenCode errors carry a tagged body such as { _tag: "SessionNotFoundError", message }. Surface it when present. */
export function describeError(error: unknown): string {
	const candidate = error as {
		message?: string;
		description?: string;
		response?: { status?: number; data?: unknown };
		cause?: { response?: { status?: number; data?: unknown } };
	};
	const response = candidate.response ?? candidate.cause?.response;
	const data = response?.data as { _tag?: string; message?: string } | string | undefined;
	if (data && typeof data === 'object' && (data._tag || data.message)) {
		return [data._tag, data.message].filter(Boolean).join(': ');
	}
	if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 500);
	return candidate.message ?? 'OpenCode request failed';
}

const timedOutErrors = new WeakSet<object>();

export function isTimeoutError(error: unknown): boolean {
	if (typeof error === 'object' && error !== null && timedOutErrors.has(error)) return true;
	const text = JSON.stringify({
		message: (error as Error)?.message,
		code: (error as { code?: string })?.code,
		cause: (error as { cause?: { code?: string; message?: string } })?.cause,
	});
	return /timeout|ETIMEDOUT|ECONNABORTED|ECONNRESET|socket hang up|aborted|504|502/i.test(text);
}
