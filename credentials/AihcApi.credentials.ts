import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AihcApi implements ICredentialType {
	name = 'aihcApi';

	displayName = '百度百舸平台 API';

	icon: Icon = { light: 'file:../icons/github.svg', dark: 'file:../icons/github.dark.svg' };

	documentationUrl = 'https://cloud.baidu.com/doc/AIHC/s/4maz04s1c';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Key (AK)',
			name: 'accessKey',
			type: 'string',
			default: '',
			required: true,
			description: '百度云 Access Key',
		},
		{
			displayName: 'Secret Key (SK)',
			name: 'secretKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: '百度云 Secret Key',
		},
		{
			displayName: 'Base URL',
			name: 'baseURL',
			type: 'string',
			default: 'http://aihc.bj.baidubce.com',
			required: false,
			description: 'API 基础URL，默认为百度百舸平台地址',
		},
	];

	// 注意：百度云的签名认证需要在节点代码中手动实现
	// 因为签名算法需要根据请求动态计算
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {},
	};

	// 注意：百度百舸平台需要签名认证，凭证测试可能无法完全验证
	// 实际的 API 调用需要在节点中完成，因为签名算法需要在节点代码中动态计算
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseURL}}',
			url: '/',
			method: 'GET',
			qs: {
				action: 'DescribeJobs',
			},
		},
	};
}

