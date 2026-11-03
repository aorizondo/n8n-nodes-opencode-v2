import type { INodeProperties } from 'n8n-workflow';

const show = { resource: ['command'], operation: ['run'] };

export const commandOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['command'] } },
		options: [
			{
				name: 'Run',
				value: 'run',
				description: 'Run a slash command in a session',
				action: 'Run a command',
			},
		],
		default: 'run',
	},
];

export const commandFields: INodeProperties[] = [
	{
		displayName: 'Session ID',
		name: 'sessionId',
		type: 'string',
		required: true,
		default: '',
		description: 'Session ID (ses_…)',
		displayOptions: { show },
	},
	{
		displayName: 'Command Name or ID',
		name: 'command',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCommands' },
		required: true,
		default: '',
		description:
			'Slash command without the "/". Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show },
	},
	{
		displayName: 'Arguments',
		name: 'arguments',
		type: 'string',
		default: '',
		description: 'Text passed to the command',
		displayOptions: { show },
	},
];
