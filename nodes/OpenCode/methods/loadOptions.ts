import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { openCodeRequest } from '../transport/request';
import type { AgentInfo, ModelInfo } from '../transport/types';

function directoryOf(ctx: ILoadOptionsFunctions): string | undefined {
	try {
		const value = ctx.getCurrentNodeParameter('directory');
		return typeof value === 'string' && value.startsWith('/') ? value : undefined;
	} catch {
		return undefined;
	}
}

const keep: INodePropertyOptions = { name: '(Keep Current / Default)', value: '' };

export async function getAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = await openCodeRequest<{ data: AgentInfo[] }>(this, {
		method: 'GET',
		path: '/api/agent',
		directory: directoryOf(this),
	});
	const agents = response.data
		.filter((agent) => !agent.hidden && agent.mode !== 'subagent')
		.map((agent) => ({
			name: agent.name && agent.name !== agent.id ? `${agent.name} (${agent.id})` : agent.id,
			value: agent.id,
			description: agent.description,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	return [keep, ...agents];
}

export async function getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = await openCodeRequest<{ data: ModelInfo[] }>(this, {
		method: 'GET',
		path: '/api/model',
		directory: directoryOf(this),
	});
	const models = response.data
		.map((model) => {
			const value = `${model.providerID}/${model.id}`;
			return { name: model.name ? `${model.name} (${value})` : value, value };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
	return [keep, ...models];
}

export async function getCommands(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = await openCodeRequest<{ data: Array<{ name: string; description?: string }> }>(this, {
		method: 'GET',
		path: '/api/command',
	});
	return response.data
		.map((command) => ({ name: `/${command.name}`, value: command.name, description: command.description }))
		.sort((a, b) => a.name.localeCompare(b.name));
}
