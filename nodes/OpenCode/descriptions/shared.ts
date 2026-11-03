import type { INodeProperties } from 'n8n-workflow';

export const agentField = (show: Record<string, string[]>, description: string): INodeProperties => ({
	displayName: 'Agent Name or ID',
	name: 'agent',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getAgents', loadOptionsDependsOn: ['directory'] },
	default: '',
	description: `${description}. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.`,
	displayOptions: { show },
});

export const modelField = (show?: Record<string, string[]>): INodeProperties => ({
	displayName: 'Model Name or ID',
	name: 'model',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getModels', loadOptionsDependsOn: ['directory'] },
	default: '',
	description:
		'Model as "provider/model" (optionally "#variant"). Empty keeps the session or agent default. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	...(show ? { displayOptions: { show } } : {}),
});

export const directoryField = (show: Record<string, string[]>): INodeProperties => ({
	displayName: 'Working Directory',
	name: 'directory',
	type: 'string',
	default: '/tmp',
	required: true,
	description:
		'Absolute path on the OpenCode server where the session works. Plugins of that folder run before every message is accepted (memory plugins can add tens of seconds), so chatbots work best in a folder with no project plugins.',
	displayOptions: { show },
});

export const permissionFields = (show: Record<string, string[]>): INodeProperties[] => [
	{
		displayName: 'Permissions',
		name: 'permissionPreset',
		type: 'options',
		default: 'readOnly',
		description:
			'What the agent may do. In every preset except "Agent Defaults", asking the user and touching folders outside the working directory are denied, since nobody can approve them during a workflow.',
		options: [
			{
				name: 'Agent Defaults',
				value: 'agent',
				description: 'Keep the agent and server rules (actions that need approval will wait or be auto-rejected)',
			},
			{
				name: 'Custom (JSON)',
				value: 'custom',
				description: 'Your own ruleset; the last matching rule wins',
			},
			{
				name: 'Full Auto',
				value: 'fullAuto',
				description: 'Allow every tool, including shell and edits',
			},
			{
				name: 'Read Only',
				value: 'readOnly',
				description: 'Read, search and fetch web pages; no edits, no shell',
			},
			{
				name: 'Workspace Write',
				value: 'workspaceWrite',
				description: 'Edit files and use tools, but no shell commands',
			},
		],
		displayOptions: { show },
	},
	{
		displayName: 'Custom Rules',
		name: 'customPermissions',
		type: 'json',
		default: '[\n  {"action": "*", "resource": "*", "effect": "deny"},\n  {"action": "read", "resource": "*", "effect": "allow"}\n]',
		description:
			'Array of {"action","resource","effect"}. Actions are tool names (read, edit, shell, glob, grep, webfetch, websearch, subagent, question…) or "&lt;mcpServer&gt;_&lt;tool&gt;". Effect is allow, deny or ask.',
		displayOptions: { show: { ...show, permissionPreset: ['custom'] } },
	},
];
