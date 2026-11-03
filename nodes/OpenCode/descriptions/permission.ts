import type { INodeProperties } from 'n8n-workflow';

const op = (...operation: string[]) => ({ resource: ['permission'], operation });

export const permissionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['permission'] } },
		options: [
			{
				name: 'Get Pending',
				value: 'getPending',
				description: 'List actions of a session that wait for approval',
				action: 'Get pending permission requests',
			},
			{
				name: 'Reply',
				value: 'reply',
				description: 'Approve or reject a pending action',
				action: 'Reply to a permission request',
			},
		],
		default: 'getPending',
	},
];

export const permissionFields: INodeProperties[] = [
	{
		displayName: 'Session ID',
		name: 'sessionId',
		type: 'string',
		required: true,
		default: '',
		description: 'Session ID (ses_…)',
		displayOptions: { show: op('getPending', 'reply') },
	},
	{
		displayName: 'Request ID',
		name: 'requestId',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the pending request, from "Get Pending"',
		displayOptions: { show: op('reply') },
	},
	{
		displayName: 'Decision',
		name: 'decision',
		type: 'options',
		default: 'once',
		options: [
			{ name: 'Allow Once', value: 'once' },
			{ name: 'Allow Always', value: 'always', description: 'Allow and remember for this session' },
			{ name: 'Reject', value: 'reject' },
		],
		displayOptions: { show: op('reply') },
	},
	{
		displayName: 'Message',
		name: 'replyMessage',
		type: 'string',
		default: '',
		description: 'Optional note for the agent, e.g. why the action was rejected',
		displayOptions: { show: op('reply') },
	},
];
