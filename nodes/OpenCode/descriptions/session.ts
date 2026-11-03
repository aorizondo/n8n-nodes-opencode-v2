import type { INodeProperties } from 'n8n-workflow';
import { agentField, directoryField, modelField, permissionFields } from './shared';

const op = (...operation: string[]) => ({ resource: ['session'], operation });

export const sessionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['session'] } },
		options: [
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a session and its history',
				action: 'Delete a session',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a session',
				action: 'Get a session',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List sessions',
				action: 'Get many sessions',
			},
			{
				name: 'Get Result',
				value: 'getResult',
				description: 'Get the reply to a prompt sent without waiting',
				action: 'Get the result of a prompt',
			},
			{
				name: 'Interrupt',
				value: 'interrupt',
				description: 'Stop the running turn of a session',
				action: 'Interrupt a session',
			},
			{
				name: 'Send Prompt',
				value: 'prompt',
				description: 'Send a task to a new or existing session, optionally waiting for the result',
				action: 'Send a prompt',
			},
			{
				name: 'Switch Agent',
				value: 'switchAgent',
				description: 'Change the agent that answers the next turns, keeping the history',
				action: 'Switch the agent of a session',
			},
		],
		default: 'prompt',
	},
];

export const sessionFields: INodeProperties[] = [
	{
		displayName: 'Session ID',
		name: 'sessionId',
		type: 'string',
		default: '',
		description: 'Existing session (ses_…). Leave empty to create a new session.',
		displayOptions: { show: op('prompt') },
	},
	{
		displayName: 'Session ID',
		name: 'sessionId',
		type: 'string',
		required: true,
		default: '',
		description: 'Session ID (ses_…)',
		displayOptions: { show: op('get', 'delete', 'getResult', 'interrupt', 'switchAgent') },
	},
	{
		displayName: 'Prompt',
		name: 'message',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 6 },
		description: 'Task for the agent',
		displayOptions: { show: op('prompt') },
	},
	agentField(op('prompt'), 'Agent that runs the task. Empty keeps the session agent (or the server default).'),
	{
		...agentField(op('switchAgent'), 'Agent for the next turns'),
		required: true,
	},
	directoryField(op('prompt')),
	...permissionFields(op('prompt')),
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		description:
			'Whether to wait for the agent to finish. When off, the node returns at once with the IDs needed by "Get Result".',
		displayOptions: { show: op('prompt') },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: op('prompt') },
		options: [
			{
				displayName: 'Auto-Reject Permission Requests',
				name: 'autoRejectPermissions',
				type: 'boolean',
				default: true,
				description:
					'Whether to reject actions that wait for approval instead of letting the run hang until the timeout',
			},
			{
				displayName: 'Include Reasoning and Raw Messages',
				name: 'includeRaw',
				type: 'boolean',
				default: false,
				description: 'Whether to include the raw turn messages in the output',
			},
			modelField(),
			{
				displayName: 'On Timeout',
				name: 'onTimeout',
				type: 'options',
				default: 'interrupt',
				options: [
					{ name: 'Interrupt and Return Partial', value: 'interrupt' },
					{ name: 'Return Partial (Keep Running)', value: 'partial' },
					{ name: 'Throw Error', value: 'error' },
				],
			},
			{
				displayName: 'Session Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'Title for a new session. Defaults to "n8n: &lt;workflow name&gt;".',
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeout',
				type: 'number',
				typeOptions: { minValue: 5 },
				default: 600,
				description: 'Maximum time to wait for the result',
			},
		],
	},
	{
		displayName: 'Prompt Message ID',
		name: 'userMessageId',
		type: 'string',
		default: '',
		description:
			'The "messageId" returned by "Send Prompt". Empty uses the latest prompt of the session.',
		displayOptions: { show: op('getResult') },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: op('getAll') },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { ...op('getAll'), returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: op('getAll') },
		options: [
			{
				displayName: 'Directory',
				name: 'directory',
				type: 'string',
				default: '',
				description: 'Only sessions in this absolute directory',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Text contained in the session title',
			},
		],
	},
];
