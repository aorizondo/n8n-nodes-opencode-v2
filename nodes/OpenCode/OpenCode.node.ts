import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { executeChat } from './actions/chat';
import { executeCommand } from './actions/command';
import { executePermission } from './actions/permission';
import { executeSession } from './actions/session';
import { chatFields, chatOperations } from './descriptions/chat';
import { commandFields, commandOperations } from './descriptions/command';
import { permissionFields, permissionOperations } from './descriptions/permission';
import { sessionFields, sessionOperations } from './descriptions/session';
import { getAgents, getCommands, getModels } from './methods/loadOptions';

export class OpenCode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenCode V2',
		name: 'openCode',
		icon: { light: 'file:opencode.svg', dark: 'file:opencode.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Chat with OpenCode V2 agents in persistent sessions, switch agents within a session, and run agent tasks that use tools',
		defaults: {
			name: 'OpenCode V2',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'openCodeV2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Chat', value: 'chat', description: 'Chatbot conversations mapped to sessions' },
					{ name: 'Command', value: 'command', description: 'Slash commands' },
					{ name: 'Permission', value: 'permission', description: 'Actions waiting for approval' },
					{ name: 'Session', value: 'session', description: 'Agent tasks and session management' },
				],
				default: 'chat',
			},
			...chatOperations,
			...chatFields,
			...sessionOperations,
			...sessionFields,
			...permissionOperations,
			...permissionFields,
			...commandOperations,
			...commandFields,
		],
	};

	methods = {
		loadOptions: { getAgents, getModels, getCommands },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let result: IDataObject | IDataObject[];
				switch (resource) {
					case 'chat':
						result = await executeChat(this, operation, i);
						break;
					case 'session':
						result = await executeSession(this, operation, i);
						break;
					case 'permission':
						result = await executePermission(this, operation, i);
						break;
					case 'command':
						result = await executeCommand(this, operation, i);
						break;
					default:
						throw new NodeOperationError(this.getNode(), `Unknown resource "${resource}"`, { itemIndex: i });
				}
				for (const json of Array.isArray(result) ? result : [result]) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Both constructors hand back an error that is already of their type, so nothing is lost here.
				if (error instanceof NodeApiError) throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
