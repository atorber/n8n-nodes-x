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
		{
			displayName: '默认资源池ID',
			name: 'defaultResourcePoolId',
			type: 'string',
			default: '',
			required: false,
            placeholder: '输入资源池ID',
			description: '默认资源池ID，在需要使用资源池时如果节点参数未填写则使用此值',
		},
		{
			displayName: '默认队列',
			name: 'defaultQueue',
			type: 'string',
			default: '',
			required: false,
            placeholder: '输入队列名称或ID',
			description: '默认队列名称或ID，在需要使用队列时如果节点参数未填写则使用此值',
		},
		{
			displayName: 'PFS 实例 ID',
			name: 'defaultPfsInstanceId',
			type: 'string',
			default: '',
			required: false,
			placeholder: '输入 PFS 实例 ID',
			description: '默认 PFS 实例 ID，在创建任务时如果需要使用数据源且未指定 PFS 实例ID，则使用此值',
		},
		{
			displayName: '源路径',
			name: 'sourcePath',
			type: 'string',
			default: '',
			required: false,
			placeholder: '输入源路径',
			description: '源路径配置，用于指定数据源或资源的路径',
		},
	];

	// 注意：百度云的签名认证需要在节点代码中手动实现
	// 因为签名算法需要根据请求动态计算
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {},
	};

	// 注意：百度百舸平台需要签名认证，凭证测试通过节点中的 credentialTest 方法实现
	// 该方法会调用数据集列表查询接口进行验证，使用 BceBaseClient 生成正确的签名
	// credentialTest 方法的名称必须与凭证名称匹配（aihcApi -> aihcApi）
	// 注意：n8n 会优先使用节点中的 credentialTest 方法（如果存在），而不是此处的 test 配置
	// 此处的 test 配置仅用于满足 lint 要求，实际测试会使用节点中的 credentialTest.aihcApi 方法
	// 如果看到 "The resource you are requesting could not be found" 错误，
	// 请检查 n8n 控制台是否有 [Aihc] credentialTest.aihcApi 被调用 的日志
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseURL}}',
			url: '/',
			method: 'GET',
			qs: {
				action: 'DescribeDatasets',
				pageNumber: '1',
				pageSize: '1',
			},
		},
	};
}

