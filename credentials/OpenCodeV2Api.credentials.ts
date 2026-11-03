import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OpenCodeV2Api implements ICredentialType {
	name = 'openCodeV2Api';

	displayName = 'OpenCode V2 API';

	icon: Icon = { light: 'file:../nodes/OpenCode/opencode.svg', dark: 'file:../nodes/OpenCode/opencode.dark.svg' };

	documentationUrl = 'https://github.com/aorizondo/n8n-nodes-opencode-v2#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'http://opencode:4096',
			description:
				'Base URL of the OpenCode V2 server started with "opencode serve". Prefer the internal network URL when n8n runs next to it.',
			required: true,
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: 'opencode',
			description: 'OpenCode V2 always uses "opencode" as the username',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Value of OPENCODE_SERVER_PASSWORD (or OPENCODE_PASSWORD) on the server',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.username}}',
				password: '={{$credentials.password}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/info',
			method: 'GET',
		},
	};
}
