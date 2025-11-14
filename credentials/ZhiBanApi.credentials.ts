import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ZhiBanApi implements ICredentialType {
	name = 'zhiBanApi';

	displayName = '值班 API';

	icon: Icon = { light: 'file:../icons/github.svg', dark: 'file:../icons/github.dark.svg' };

	documentationUrl = 'https://github.com/atorber/n8n-nodes-x';

	properties: INodeProperties[] = [
		{
			displayName: 'Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: '值班系统 Token',
		},
		{
			displayName: '值班 ID',
			name: 'zhibanId',
			type: 'string',
			default: '',
			required: true,
			description: '值班 ID',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'http://zhiban.baidu-int.com',
			url: '/api/open/v1/zhiban/search',
			method: 'POST',
		},
	};
}

