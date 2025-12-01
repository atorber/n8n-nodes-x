import type {
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class IoTCoreApi implements ICredentialType {
	name = 'ioTCoreApi';

	displayName = '百度云 IoT Core API';

	icon: Icon = { light: 'file:../icons/github.svg', dark: 'file:../icons/github.dark.svg' };

	documentationUrl = 'https://cloud.baidu.com/doc/IOT/s/4k8vqjq8x';

	properties: INodeProperties[] = [
		{
			displayName: '用户名',
			name: 'username',
			type: 'string',
			default: 'afwqhkb/ai_aihcmentor',
			required: true,
			description: 'IoT Core 用户名',
		},
		{
			displayName: '密码',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: 'CfwVcdoWaPoJBMNs',
			required: true,
			description: 'IoT Core 密码',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://afwqhkb.iot.gz.baidubce.com',
			url: '/auth',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: {
				username: '={{$credentials.username}}',
				password: '={{$credentials.password}}',
				tokenLifeSpanInSeconds: 300,
			},
		},
	};
}

