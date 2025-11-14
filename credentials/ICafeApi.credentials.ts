import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ICafeApi implements ICredentialType {
	name = 'iCafeApi';

	displayName = 'iCafe API';

	icon: Icon = { light: 'file:../icons/github.svg', dark: 'file:../icons/github.dark.svg' };

	documentationUrl = 'https://github.com/atorber/n8n-nodes-bce-pro';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseURL',
			type: 'string',
			default: 'http://icafeapi.baidu-int.com',
			required: true,
			description: 'iCafe API 基础URL',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: '空间标识',
			name: 'space',
			type: 'string',
			default: '',
			required: true,
			description: 'iCafe空间标识',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			qs: {
				u: '={{$credentials.username}}',
				pw: '={{$credentials.password}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseURL}}',
			url: '=/api/spaces/{{$credentials.space}}/cards',
			method: 'GET',
			qs: {
				iql: '类型 != EKS调度问题',
			},
		},
	};
}

