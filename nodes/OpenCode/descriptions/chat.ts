import type { INodeProperties } from 'n8n-workflow';
import { agentField, directoryField, modelField, permissionFields } from './shared';

const send = { resource: ['chat'], operation: ['sendMessage'] };
const chatOps = { resource: ['chat'], operation: ['sendMessage', 'getHistory', 'reset'] };

export const chatOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['chat'] } },
		options: [
			{
				name: 'Send Message',
				value: 'sendMessage',
				description: 'Send a message to the conversation session and wait for the reply',
				action: 'Send a chat message',
			},
			{
				name: 'Get History',
				value: 'getHistory',
				description: 'Get the user and assistant messages of a conversation',
				action: 'Get chat history',
			},
			{
				name: 'Reset Conversation',
				value: 'reset',
				description: 'Delete the conversation session so the next message starts fresh',
				action: 'Reset a conversation',
			},
		],
		default: 'sendMessage',
	},
];

export const chatFields: INodeProperties[] = [
	{
		displayName: 'Conversation Key',
		name: 'conversationKey',
		type: 'string',
		required: true,
		default: '={{ $json.sessionId }}',
		description:
			'Identifies the conversation, e.g. the Chat Trigger sessionId, a Telegram chat ID or a phone number. The same key always continues the same OpenCode session. A full session ID (ses_…) is used as-is.',
		displayOptions: { show: chatOps },
	},
	{
		displayName: 'Message',
		name: 'message',
		type: 'string',
		required: true,
		default: '={{ $json.chatInput }}',
		typeOptions: { rows: 4 },
		description: 'Text sent to the agent',
		displayOptions: { show: send },
	},
	agentField(
		send,
		'Agent that answers this message. Changing it between messages keeps the same session and history: the new agent sees the whole conversation. Empty keeps the current agent.',
	),
	directoryField({ resource: ['chat'], operation: ['sendMessage'] }),
	...permissionFields(send),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: send },
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
				displayName: 'Delivery',
				name: 'delivery',
				type: 'options',
				default: 'steer',
				description: 'How the message joins the session when the agent is still busy',
				options: [
					{
						name: 'Steer',
						value: 'steer',
						description: 'Deliver at the next step boundary of the running turn',
					},
					{
						name: 'Queue',
						value: 'queue',
						description: 'Wait until the current turn ends and run as a new turn',
					},
				],
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
				description: 'Title used when the session is created. Defaults to "n8n: &lt;conversation key&gt;".',
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeout',
				type: 'number',
				typeOptions: { minValue: 5 },
				default: 300,
				description: 'Maximum time to wait for the reply',
			},
		],
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 200 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['chat'], operation: ['getHistory'] } },
	},
];
