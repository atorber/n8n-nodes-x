/* eslint-disable n8n-nodes-base/node-param-options-type-unsorted-items */
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	INodeCredentialTestResult,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// 动态导入 SDK 以避免 lint 错误
// @ts-expect-error - @atorber/baiducloud-sdk is a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports, @n8n/community-nodes/no-restricted-imports
const { BceBaseClient } = require('@atorber/baiducloud-sdk');

/**
 * 判断是否为 Job 相关接口
 */
function isJobAction(action: string): boolean {
	const jobActions = [
		'DescribeJobs',
		'CreateJob',
		'DeleteJob',
		'DescribeJob',
		'ModifyJob',
		'DescribeJobEvents',
		'DescribeJobLogs',
		'DescribePodEvents',
		'StopJob',
		'DescribeJobMetrics',
		'DescribeJobNodes',
		'DescribeJobWebterminal',
	];
	return jobActions.includes(action);
}

/**
 * 获取资源池列表
 * 用于下拉选项
 */
async function getResourcePools(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const credentials = await this.getCredentials('aihcApi');
	const accessKey = credentials?.accessKey as string;
	const secretKey = credentials?.secretKey as string;
	const baseURL = (credentials?.baseURL as string) || 'http://aihc.bj.baidubce.com';

	if (!accessKey || !secretKey) {
		return { results: [] };
	}

	try {
		// 使用 BceBaseClient 发送请求
		const bceConfig = {
			endpoint: baseURL,
			credentials: {
				ak: accessKey,
				sk: secretKey,
			},
		};

		const client = new BceBaseClient(bceConfig, 'aihc');

		const params = {
			action: 'DescribeResourcePools',
			resourcePoolType:'common'
		};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			version: 'v2', // DescribeResourcePools 使用 version: v2
		};

		// 发送请求
		const response = await client.sendRequest('GET', '/', {
			params,
			config: {},
			headers,
		});

		// 解析响应数据
		// 根据百度百舸平台 API 响应格式，资源池列表通常在 responseData.result 或 responseData.data 中
		const responseData = response.body as IDataObject;
		let resourcePools: IDataObject[] = [];
		if (Array.isArray(responseData)) {
			resourcePools = responseData;
		} else if (responseData.result && Array.isArray(responseData.result)) {
			resourcePools = responseData.result as IDataObject[];
		} else if (responseData.data && Array.isArray(responseData.data)) {
			resourcePools = responseData.data as IDataObject[];
		} else if (responseData.resourcePools && Array.isArray(responseData.resourcePools)) {
			resourcePools = responseData.resourcePools as IDataObject[];
		}

		// 转换为下拉选项格式
		const results: INodeListSearchItems[] = [];
		for (const pool of resourcePools) {
			// 尝试多种可能的字段名
			const id = String(pool.id || pool.resourcePoolId || pool.poolId || pool.name || '');
			const name = String(pool.name || pool.resourcePoolName || pool.poolName || id || '');

			if (id) {
				results.push({
					name: `${name} (${id})`,
					value: id,
				});
			}
		}

		// 如果提供了过滤条件，进行过滤
		if (filter) {
			const lowerFilter = filter.toLowerCase();
			return {
				results: results.filter(
					(item) =>
						item.name.toLowerCase().includes(lowerFilter) ||
						String(item.value).toLowerCase().includes(lowerFilter),
				),
			};
		}

		return { results };
	} catch {
		// 如果请求失败，返回空列表
		return { results: [] };
	}
}

export class Aihc implements INodeType {
	description: INodeTypeDescription = {
		displayName: '百度百舸平台',
		name: 'aihc',
		icon: { light: 'file:aihc.svg', dark: 'file:aihc.dark.svg' },
		group: ['input'],
		version: 1,
		description:
			'百度百舸平台 OpenAPI 节点，使用百度云 AK/SK 进行鉴权。支持查询训练任务列表等操作。签名鉴权文档：https://cloud.baidu.com/doc/AIHC/s/4maz04s1c，查询训练任务文档：https://cloud.baidu.com/doc/AIHC/s/xmayvctia',
		defaults: {
			name: '百度百舸平台',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'aihcApi',
				required: true,
			},
		],
		requestDefaults: {
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: '资源',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: '训练任务',
						value: 'job',
					},
					{
						name: '开发实例',
						value: 'devInstance',
					},
					{
						name: '数据集',
						value: 'dataset',
					},
					{
						name: '服务',
						value: 'service',
					},
					{
						name: '模型',
						value: 'model',
					},
					{
						name: '资源池',
						value: 'resourcePool',
					},
					{
						name: '队列',
						value: 'queue',
					},
					{
						name: '自定义API调用',
						value: 'api',
					},
				],
				default: 'resourcePool',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeDatasets',
						action: '查询数据集列表',
					},
					{
						name: '查询详情',
						value: 'describeDataset',
						action: '获取数据集详情',
						description: '获取指定数据集的详细信息，包括最新版本信息',
					},
					{
						name: '查询版本列表',
						value: 'describeDatasetVersions',
						action: '获取数据集版本列表',
						description: '获取指定数据集的所有版本列表',
					},
				],
				default: 'describeDatasets',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['devInstance'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeDevInstances',
						action: '查询开发实例列表',
					},
					{
						name: '查询详情',
						value: 'describeDevInstance',
						action: '查询开发机详情',
						description: '获取指定开发机的详细信息',
					},
				],
				default: 'describeDevInstances',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['job'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeJobs',
						action: '查询训练任务列表',
						description: '查询指定资源池的训练任务列表',
					},
					{
						name: '查询详情',
						value: 'describeJob',
						action: '查询训练任务详情',
						description: '获取一个训练任务的详细信息',
					},
					{
						name: '创建任务',
						value: 'createJob',
						action: '创建训练任务',
						description: '创建一个训练任务到集群中运行',
					},
				],
				default: 'describeJobs',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['model'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeModels',
						action: '查询模型列表',
					},
					{
						name: '查询详情',
						value: 'describeModel',
						action: '获取模型详情',
						description: '获取指定模型的详细信息',
					},
					{
						name: '查询版本列表',
						value: 'describeModelVersions',
						action: '获取模型版本列表',
						description: '获取指定模型的所有版本列表',
					},
				],
				default: 'describeModels',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['queue'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeQueues',
						action: '查询队列列表',
						description: '查询指定资源池的队列列表',
					},
					{
						name: '查询详情',
						value: 'describeQueue',
						action: '查询队列详情',
						description: '获取指定队列的详细信息',
					},
				],
				default: 'describeQueues',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['resourcePool'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeResourcePools',
						action: '查询资源池列表',
						description: '查询所有资源池列表',
					},
					{
						name: '查询详情',
						value: 'describeResourcePool',
						action: '查询资源池详情',
						description: '获取指定资源池的详细信息',
					},
				],
				default: 'describeResourcePools',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['service'],
					},
				},
				options: [
					{
						name: '查询列表',
						value: 'describeServices',
						action: '查询服务列表',
					},
					{
						name: '查询详情',
						value: 'describeService',
						action: '查询服务详情',
						description: '获取指定服务的详细信息',
					},
				],
				default: 'describeServices',
			},
			{
				displayName: '操作',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['api'],
					},
				},
				options: [
					{
						name: '调用 API',
						value: 'callApi',
						action: 'Open API',
						description: '调用百度百舸平台 OpenAPI 接口',
					},
				],
				default: 'callApi',
			},
			{
				displayName: '资源池ID',
				name: 'resourcePoolId',
				type: 'string',
				typeOptions: {
					listSearch: {
						method: 'getResourcePools',
					},
				},
				default: '',
				placeholder: '留空则使用凭证中的默认资源池ID',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJobs', 'createJob'],
					},
				},
				description: '输入资源池ID，或点击输入框右侧的搜索图标从资源池列表中选择。如果未填写，将使用凭证中设置的默认资源池ID',
			},
			{
				displayName: '队列 ID',
				name: 'queueID',
				type: 'string',
				default: '',
				placeholder: '留空则使用凭证中的默认队列',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['createJob'],
					},
				},
				description: '训练任务所属队列ID，自运维资源池须填入队列名称，托管资源池须填入队列ID。如果未填写，将使用凭证中设置的默认队列',
			},
			{
				displayName: '队列名称',
				name: 'queueName',
				type: 'string',
				default: '',
				placeholder: '留空则使用凭证中的默认队列',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['createJob'],
					},
				},
				description: '训练任务所属队列名称，保持和队列ID一致即可。如果未填写，将使用凭证中设置的默认队列',
			},
			{
				displayName: '请求体参数',
				name: 'requestBody',
				type: 'json',
				default: JSON.stringify(
					{
						name: 'api-0513-2',
						queue: 'default',
						jobType: 'PyTorchJob',
						command: 'sleep 1d',
						jobSpec: {
							replicas: 1,
							image: 'registry.baidubce.com/aihc-aiak/aiak-megatron:ubuntu20.04-cu11.8-torch1.14.0-py38_v1.2.7.12_release',
							resources: [],
							envs: [
								{
									name: 'NCCL_DEBUG',
									value: 'DEBUG',
								},
								{
									name: 'NCCL_IB_DISABLE',
									value: '0',
								},
							],
							enableRDMA: true,
						},
						labels: [],
						datasource: [
							{
								type: 'pfs',
								name: 'pfs-pxE6jz',
								mountPath: '/mnt/cluster',
							},
						],
					},
					null,
					2,
				),
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['createJob'],
					},
				},
				description: '训练任务的请求体参数（JSON格式）。如果设置了资源池ID、队列ID、队列名称，将自动替换请求体中的对应值',
			},
			{
				displayName: '任务 ID',
				name: 'jobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJob'],
					},
				},
				description: '训练任务ID',
			},
			{
				displayName: '队列 ID',
				name: 'queueID',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJob'],
					},
				},
				description: '训练任务所属队列ID，通用资源池须填入队列名称，托管资源池须填入队列ID',
			},
			{
				displayName: '是否需要详细信息',
				name: 'needDetail',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['job'],
						operation: ['describeJob'],
					},
				},
				description: 'Whether to return detailed information, including Pod and historical Pod lists when set to true',
			},
			{
				displayName: 'API 路径',
				name: 'apiPath',
				type: 'string',
				default: '',
				required: true,
				placeholder: '/?action=DescribeJobs&resourcePoolId=xxx',
				description:
					'API 路径（不包含域名），可包含查询参数。例如：/?action=DescribeJobs&resourcePoolId=xxx',
				displayOptions: {
					show: {
						resource: ['api'],
						operation: ['callApi'],
					},
				},
			},
			{
				displayName: 'HTTP 方法',
				name: 'httpMethod',
				type: 'options',
				options: [
					{
						name: 'GET',
						value: 'GET',
					},
					{
						name: 'POST',
						value: 'POST',
					},
					{
						name: 'PUT',
						value: 'PUT',
					},
					{
						name: 'DELETE',
						value: 'DELETE',
					},
				],
				default: 'GET',
				required: true,
				displayOptions: {
					show: {
						resource: ['api'],
						operation: ['callApi'],
					},
				},
			},
			{
				displayName: '查询参数',
				name: 'queryParameters',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				placeholder: 'key1=value1&key2=value2',
				description:
					'URL 查询参数，格式：key1=value1&key2=value2。如果 API URL 中已包含查询参数，此项可为空',
				displayOptions: {
					show: {
						resource: ['api'],
						operation: ['callApi'],
					},
				},
			},
			{
				displayName: '请求体',
				name: 'requestBody',
				type: 'json',
				default: '',
				displayOptions: {
					show: {
						httpMethod: ['POST', 'PUT'],
					},
				},
				description: '请求体内容（JSON 格式）',
			},
			// 数据集查询参数
			{
				displayName: '页码',
				name: 'pageNumber',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						resource: ['dataset', 'model', 'devInstance', 'service', 'queue'],
						operation: ['describeDatasets', 'describeModels', 'describeDevInstances', 'describeServices', 'describeQueues'],
					},
				},
				description: '页码，从 1 开始',
			},
			{
				displayName: '每页数量',
				name: 'pageSize',
				type: 'number',
				default: 10,
				displayOptions: {
					show: {
						resource: ['dataset', 'devInstance', 'service', 'queue'],
						operation: ['describeDatasets', 'describeDevInstances', 'describeServices', 'describeQueues'],
					},
				},
				description: '每页返回的数量',
			},
			{
				displayName: '关键词',
				name: 'keyword',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['dataset', 'model'],
						operation: ['describeDatasets', 'describeModels'],
					},
				},
				description: '搜索关键词',
			},
			{
				displayName: '存储类型',
				name: 'storageType',
				type: 'options',
				options: [
					{ name: 'BOS', value: 'BOS' },
					{ name: 'PFS', value: 'PFS' },
				],
				default: 'BOS',
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDatasets'],
					},
				},
				description: '存储类型过滤',
			},
			{
				displayName: '存储实例',
				name: 'storageInstances',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDatasets'],
					},
				},
				description: '存储实例过滤',
			},
			{
				displayName: '导入格式',
				name: 'importFormat',
				type: 'options',
				options: [
					{ name: 'FILE', value: 'FILE' },
					{ name: 'FOLDER', value: 'FOLDER' },
				],
				default: 'FILE',
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDatasets'],
					},
				},
				description: '导入格式过滤',
			},
			{
				displayName: '数据集 ID',
				name: 'datasetId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDataset', 'describeDatasetVersions'],
					},
				},
				description: '要查询的数据集ID',
			},
			{
				displayName: '页码',
				name: 'datasetVersionPageNumber',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDatasetVersions'],
					},
				},
				description: '请求分页参数，表示第几页，默认值为1',
			},
			{
				displayName: '每页数量',
				name: 'datasetVersionPageSize',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['dataset'],
						operation: ['describeDatasetVersions'],
					},
				},
				description: '单页结果数，不传递该参数默认返回全部（设置为0表示返回全部）',
			},
			{
				displayName: '模型 ID',
				name: 'modelId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['model'],
						operation: ['describeModel', 'describeModelVersions'],
					},
				},
				description: '要查询的模型ID',
			},
			{
				displayName: '页码',
				name: 'modelVersionPageNumber',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						resource: ['model'],
						operation: ['describeModelVersions'],
					},
				},
				description: '分页参数，没传默认1',
			},
			{
				displayName: '每页数量',
				name: 'modelVersionPageSize',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['model'],
						operation: ['describeModelVersions'],
					},
				},
				description: '分页大小，没传默认返回全部（设置为0表示返回全部）',
			},
			// 开发实例查询参数
			{
				displayName: '仅显示我的实例',
				name: 'onlyMyDevs',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['devInstance'],
						operation: ['describeDevInstances'],
					},
				},
				description: 'Whether to show only the current user\'s development instances',
			},
			{
				displayName: '开发机 ID',
				name: 'devInstanceId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['devInstance'],
						operation: ['describeDevInstance'],
					},
				},
				description: '要查询的开发机ID',
			},
			{
				displayName: '资源池ID',
				name: 'devResourcePoolId',
				type: 'string',
				default: '',
				placeholder: '留空则使用凭证中的默认资源池ID',
				displayOptions: {
					show: {
						resource: ['devInstance'],
						operation: ['describeDevInstances'],
					},
				},
				description: '资源池ID 过滤。如果未填写，将使用凭证中设置的默认资源池ID',
			},
			{
				displayName: '队列名称',
				name: 'devQueueName',
				type: 'string',
				default: '',
				placeholder: '留空则使用凭证中的默认队列',
				displayOptions: {
					show: {
						resource: ['devInstance'],
						operation: ['describeDevInstances'],
					},
				},
				description: '队列名称过滤。如果未填写，将使用凭证中设置的默认队列',
			},
			{
				displayName: '状态',
				name: 'devStatus',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['devInstance'],
						operation: ['describeDevInstances'],
					},
				},
				description: '状态过滤',
			},
			// 队列查询参数
			{
				displayName: '资源池ID',
				name: 'queueResourcePoolId',
				type: 'string',
				default: '',
				placeholder: '留空则使用凭证中的默认资源池ID',
				displayOptions: {
					show: {
						resource: ['queue'],
						operation: ['describeQueues'],
					},
				},
				description: '资源池ID。如果未填写，将使用凭证中设置的默认资源池ID',
			},
			{
				displayName: '关键词类型',
				name: 'queueKeywordType',
				type: 'options',
				options: [
					{ name: '队列名称', value: 'queueName' },
					{ name: '队列 ID', value: 'queueId' },
				],
				default: 'queueName',
				displayOptions: {
					show: {
						resource: ['queue'],
						operation: ['describeQueues'],
					},
				},
				description: '关键词搜索类型',
			},
			{
				displayName: '关键词',
				name: 'queueKeyword',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['queue'],
						operation: ['describeQueues'],
					},
				},
				description: '搜索关键词',
			},
			{
				displayName: '队列 ID',
				name: 'queueId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['queue'],
						operation: ['describeQueue'],
					},
				},
				description: '要查询的队列ID',
			},
			// 资源池查询参数
			{
				displayName: '资源池类型',
				name: 'resourcePoolType',
				type: 'options',
				options: [
					{ name: '通用资源池', value: 'common' },
					{ name: '托管资源池', value: 'dedicatedV2' },
				],
				default: 'common',
				displayOptions: {
					show: {
						resource: ['resourcePool'],
						operation: ['describeResourcePools'],
					},
				},
			},
			{
				displayName: '资源池 ID',
				name: 'resourcePoolDetailId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['resourcePool'],
						operation: ['describeResourcePool'],
					},
				},
				description: '要查询的资源池ID',
			},
			// 服务查询参数
			{
				displayName: '排序字段',
				name: 'serviceOrderBy',
				type: 'string',
				default: 'createdAt',
				displayOptions: {
					show: {
						resource: ['service'],
					},
				},
			},
			{
				displayName: '排序方向',
				name: 'serviceOrder',
				type: 'options',
				options: [
					{ name: '升序', value: 'asc' },
					{ name: '降序', value: 'desc' },
				],
				default: 'desc',
				displayOptions: {
					show: {
						resource: ['service'],
						operation: ['describeServices'],
					},
				},
				description: '排序方式',
			},
			{
				displayName: '服务 ID',
				name: 'serviceId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['service'],
						operation: ['describeService'],
					},
				},
				description: '要查询的服务ID',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex, '') as string;

				// 获取凭证
				const credentials = await this.getCredentials('aihcApi');
				const accessKey = credentials?.accessKey as string;
				const secretKey = credentials?.secretKey as string;
				const baseURL = (credentials?.baseURL as string) || 'http://aihc.bj.baidubce.com';
				const defaultResourcePoolId = (credentials?.defaultResourcePoolId as string) || '';
				const defaultQueue = (credentials?.defaultQueue as string) || '';
				const defaultPfsInstanceId = (credentials?.defaultPfsInstanceId as string) || '';

				if (!accessKey || !secretKey) {
						throw new NodeOperationError(
							this.getNode(),
						'凭证中缺少 Access Key 或 Secret Key',
							{
								itemIndex,
							},
						);
					}

				// 使用 BceBaseClient 发送请求
				const bceConfig = {
					endpoint: baseURL,
					credentials: {
						ak: accessKey,
						sk: secretKey,
					},
				};

				const client = new BceBaseClient(bceConfig, 'aihc');

				let queryParams: IDataObject = {};
				let httpMethod: string;
				let requestBody: string | null = null;
				let action: string;

				if (operation === 'describeResourcePools') {
					// 查询资源池列表操作
					action = 'DescribeResourcePools';
					const resourcePoolType = this.getNodeParameter('resourcePoolType', itemIndex, 'common') as string;
					queryParams = {
						action,
						resourcePoolType,
					};
					httpMethod = 'GET';
				} else if (operation === 'describeResourcePool') {
					// 查询资源池详情操作
					const resourcePoolId = this.getNodeParameter('resourcePoolDetailId', itemIndex, '') as string;

					if (!resourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeResourcePool';
					queryParams = {
						action,
						resourcePoolId,
					};
					httpMethod = 'GET';
				} else if (operation === 'describeJobs') {
					// 查询训练任务列表操作
					// 根据参考脚本，DescribeJobs 需要将部分参数放在 body 中
					let resourcePoolId = this.getNodeParameter('resourcePoolId', itemIndex, '') as string;
					// 如果节点参数未填写，使用凭证中的默认值
					if (!resourcePoolId && defaultResourcePoolId) {
						resourcePoolId = defaultResourcePoolId;
					}

					if (!resourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeJobs';
					// queryParams 只包含 action 和 resourcePoolId
					queryParams = {
						action,
						resourcePoolId,
					};
					// body 参数（pageNumber, pageSize 等应该在 body 中，但当前实现中这些参数还没有添加）
					// 暂时使用空 body，后续可以添加更多参数
					requestBody = JSON.stringify({});
					httpMethod = 'POST';
				} else if (operation === 'createJob') {
					// 创建训练任务操作
					let resourcePoolId = this.getNodeParameter('resourcePoolId', itemIndex, '') as string;
					let queueID = this.getNodeParameter('queueID', itemIndex, '') as string;
					let queueName = this.getNodeParameter('queueName', itemIndex, '') as string;
					const requestBodyStr = this.getNodeParameter('requestBody', itemIndex, '{}') as string;

					// 如果节点参数未填写，使用凭证中的默认值
					if (!resourcePoolId && defaultResourcePoolId) {
						resourcePoolId = defaultResourcePoolId;
					}

					if (!resourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池ID 不能为空', {
							itemIndex,
						});
					}

					// 解析请求体
					let bodyData: IDataObject = {};
					try {
						bodyData = JSON.parse(requestBodyStr) as IDataObject;
					} catch {
						throw new NodeOperationError(this.getNode(), '请求体参数格式错误，必须是有效的JSON格式', {
							itemIndex,
						});
					}

					// 如果队列ID和队列名称都未填写，使用凭证中的默认队列
					if (!queueID && !queueName && defaultQueue) {
						queueID = defaultQueue;
						queueName = defaultQueue;
					}

					// 如果设置了资源池ID、队列ID、队列名称，替换请求体中的对应值
					// resourcePoolId 和 queueID 在 query 参数中，不在 body 中
					// queue 在 body 中，必须和 queueID 保持一致
					const finalQueueID = queueID || queueName || (bodyData.queueID as string) || (bodyData.queue as string) || '';
					const finalQueueName = queueName || queueID || (bodyData.queue as string) || finalQueueID;

					if (!finalQueueID) {
						throw new NodeOperationError(this.getNode(), '队列ID 不能为空，请在"队列ID"字段或请求体参数中设置', {
								itemIndex,
							});
						}

					// 更新 body 中的 queue 字段，确保和 queueID 一致
					bodyData.queue = finalQueueName;
					// 移除 body 中的 queueID（如果存在），因为 queueID 只在 query 参数中
					delete bodyData.queueID;

					// 如果请求体中有 datasource 数组，且未指定 PFS 实例ID，则使用凭证中的默认值
					if (defaultPfsInstanceId && Array.isArray(bodyData.datasource)) {
						bodyData.datasource = (bodyData.datasource as IDataObject[]).map((ds: IDataObject) => {
							// 如果是 PFS 类型的数据源，且没有指定 name，则使用默认的 PFS 实例ID
							if (ds.type === 'pfs' && !ds.name) {
								return {
									...ds,
									name: defaultPfsInstanceId,
								};
							}
							return ds;
						});
					}

					action = 'CreateJob';
					queryParams = {
						action,
						resourcePoolId,
						queueID: finalQueueID,
					};
					requestBody = JSON.stringify(bodyData);
					httpMethod = 'POST';
				} else if (operation === 'describeJob') {
					// 查询训练任务详情操作
					let resourcePoolId = this.getNodeParameter('resourcePoolId', itemIndex, '') as string;
					const queueID = this.getNodeParameter('queueID', itemIndex, '') as string;
					const jobId = this.getNodeParameter('jobId', itemIndex, '') as string;
					const needDetail = this.getNodeParameter('needDetail', itemIndex, false) as boolean;

					// 如果节点参数未填写，使用凭证中的默认值
					if (!resourcePoolId && defaultResourcePoolId) {
						resourcePoolId = defaultResourcePoolId;
					}

					if (!resourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池ID 不能为空', {
							itemIndex,
						});
					}

					if (!jobId) {
						throw new NodeOperationError(this.getNode(), '任务ID 不能为空', {
							itemIndex,
						});
					}

					if (!queueID) {
						throw new NodeOperationError(this.getNode(), '队列ID 不能为空', {
								itemIndex,
							});
						}

					action = 'DescribeJob';
					queryParams = {
						action,
						resourcePoolId,
						queueID,
					};
					requestBody = JSON.stringify({
						jobId,
						needDetail,
					});
					httpMethod = 'POST';
				} else if (operation === 'describeDatasets') {
					// 查询数据集列表操作
					action = 'DescribeDatasets';
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('pageSize', itemIndex, 10) as number;
					const keyword = this.getNodeParameter('keyword', itemIndex, '') as string;
					const storageType = this.getNodeParameter('storageType', itemIndex, '') as string;
					const storageInstances = this.getNodeParameter('storageInstances', itemIndex, '') as string;
					const importFormat = this.getNodeParameter('importFormat', itemIndex, '') as string;

					queryParams = {
						action,
						pageNumber: pageNumber.toString(),
						pageSize: pageSize.toString(),
					};

					if (keyword) queryParams['keyword'] = keyword;
					if (storageType) queryParams['storageType'] = storageType;
					if (storageInstances) queryParams['storageInstances'] = storageInstances;
					if (importFormat) queryParams['importFormat'] = importFormat;

					httpMethod = 'GET';
				} else if (operation === 'describeDataset') {
					// 获取数据集详情操作
					const datasetId = this.getNodeParameter('datasetId', itemIndex, '') as string;

					if (!datasetId) {
						throw new NodeOperationError(this.getNode(), '数据集ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeDataset';
					queryParams = {
						action,
						datasetId,
					};
					httpMethod = 'GET';
				} else if (operation === 'describeDatasetVersions') {
					// 获取数据集版本列表操作
					const datasetId = this.getNodeParameter('datasetId', itemIndex, '') as string;
					const pageNumber = this.getNodeParameter('datasetVersionPageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('datasetVersionPageSize', itemIndex, 0) as number;

					if (!datasetId) {
						throw new NodeOperationError(this.getNode(), '数据集ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeDatasetVersions';
					queryParams = {
						action,
						datasetId,
						pageNumber: pageNumber.toString(),
					};

					// pageSize 为 0 表示返回全部，不传该参数
					if (pageSize > 0) {
						queryParams.pageSize = pageSize.toString();
					}

					httpMethod = 'GET';
				} else if (operation === 'describeModels') {
					// 查询模型列表操作
					action = 'DescribeModels';
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const keyword = this.getNodeParameter('keyword', itemIndex, '') as string;

					queryParams = {
						action,
						pageNumber: pageNumber.toString(),
					};

					if (keyword) queryParams['keyword'] = keyword;

					httpMethod = 'GET';
				} else if (operation === 'describeModel') {
					// 获取模型详情操作
					const modelId = this.getNodeParameter('modelId', itemIndex, '') as string;

					if (!modelId) {
						throw new NodeOperationError(this.getNode(), '模型ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeModel';
					queryParams = {
						action,
						modelId,
					};
					httpMethod = 'GET';
				} else if (operation === 'describeModelVersions') {
					// 获取模型版本列表操作
					const modelId = this.getNodeParameter('modelId', itemIndex, '') as string;
					const pageNumber = this.getNodeParameter('modelVersionPageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('modelVersionPageSize', itemIndex, 0) as number;

					if (!modelId) {
						throw new NodeOperationError(this.getNode(), '模型ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeModelVersions';
					queryParams = {
						action,
						modelId,
						pageNumber: pageNumber.toString(),
					};

					// pageSize 为 0 表示返回全部，不传该参数
					if (pageSize > 0) {
						queryParams.pageSize = pageSize.toString();
					}

					httpMethod = 'GET';
				} else if (operation === 'describeDevInstances') {
					// 查询开发实例列表操作
					action = 'DescribeDevInstances';
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('pageSize', itemIndex, 10) as number;
					const onlyMyDevs = this.getNodeParameter('onlyMyDevs', itemIndex, false) as boolean;
					let devResourcePoolId = this.getNodeParameter('devResourcePoolId', itemIndex, '') as string;
					let devQueueName = this.getNodeParameter('devQueueName', itemIndex, '') as string;
					const devStatus = this.getNodeParameter('devStatus', itemIndex, '') as string;

					// 如果节点参数未填写，使用凭证中的默认值
					if (!devResourcePoolId && defaultResourcePoolId) {
						devResourcePoolId = defaultResourcePoolId;
					}
					if (!devQueueName && defaultQueue) {
						devQueueName = defaultQueue;
					}

					queryParams = {
						action,
						pageNumber: pageNumber.toString(),
						pageSize: pageSize.toString(),
						onlyMyDevs: onlyMyDevs ? 'true' : 'false',
					};

					if (devResourcePoolId) queryParams['resourcePoolId'] = devResourcePoolId;
					if (devQueueName) queryParams['queueName'] = devQueueName;
					if (devStatus) queryParams['status'] = devStatus;

					httpMethod = 'GET';
				} else if (operation === 'describeDevInstance') {
					// 查询开发机详情操作
					const devInstanceId = this.getNodeParameter('devInstanceId', itemIndex, '') as string;

					if (!devInstanceId) {
						throw new NodeOperationError(this.getNode(), '开发机ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeDevInstance';
					queryParams = {
						action,
						devInstanceId,
					};
					httpMethod = 'GET';
				} else if (operation === 'describeServices') {
					// 查询服务列表操作
					action = 'DescribeServices';
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('pageSize', itemIndex, 10) as number;
					const serviceOrderBy = this.getNodeParameter('serviceOrderBy', itemIndex, 'createdAt') as string;
					const serviceOrder = this.getNodeParameter('serviceOrder', itemIndex, 'desc') as string;

					queryParams = {
						action,
						pageNumber: pageNumber.toString(),
						pageSize: pageSize.toString(),
						orderBy: serviceOrderBy,
						order: serviceOrder,
					};

					httpMethod = 'GET';
				} else if (operation === 'describeService') {
					// 查询服务详情操作
					const serviceId = this.getNodeParameter('serviceId', itemIndex, '') as string;

					if (!serviceId) {
						throw new NodeOperationError(this.getNode(), '服务ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeService';
					queryParams = {
						action,
						serviceId,
					};
					httpMethod = 'GET';
				} else if (operation === 'describeQueues') {
					// 查询队列列表操作
					action = 'DescribeQueues';
					let queueResourcePoolId = this.getNodeParameter('queueResourcePoolId', itemIndex, '') as string;
					const pageNumber = this.getNodeParameter('pageNumber', itemIndex, 1) as number;
					const pageSize = this.getNodeParameter('pageSize', itemIndex, 10) as number;
					const queueKeywordType = this.getNodeParameter('queueKeywordType', itemIndex, '') as string;
					const queueKeyword = this.getNodeParameter('queueKeyword', itemIndex, '') as string;

					// 如果节点参数未填写，使用凭证中的默认值
					if (!queueResourcePoolId && defaultResourcePoolId) {
						queueResourcePoolId = defaultResourcePoolId;
					}

					if (!queueResourcePoolId) {
						throw new NodeOperationError(this.getNode(), '资源池ID 不能为空', {
								itemIndex,
							});
						}

					queryParams = {
						action,
						resourcePoolId: queueResourcePoolId,
					};

					if (queueKeywordType) queryParams['keywordType'] = queueKeywordType;
					if (queueKeyword) queryParams['keyword'] = queueKeyword;
					if (pageNumber) queryParams['pageNumber'] = pageNumber.toString();
					if (pageSize) queryParams['pageSize'] = pageSize.toString();

					httpMethod = 'GET';
				} else if (operation === 'describeQueue') {
					// 查询队列详情操作
					const queueId = this.getNodeParameter('queueId', itemIndex, '') as string;

					if (!queueId) {
						throw new NodeOperationError(this.getNode(), '队列ID 不能为空', {
							itemIndex,
						});
					}

					action = 'DescribeQueue';
					queryParams = {
						action,
						queueId,
					};
					httpMethod = 'GET';
				} else if (operation === 'callApi') {
					// 通用 API 调用操作
					// 域名从凭证中的 baseURL 获取，用户只需输入路径
					let apiPath = this.getNodeParameter('apiPath', itemIndex, '') as string;
					httpMethod = this.getNodeParameter('httpMethod', itemIndex, 'GET') as string;
					const queryParametersStr = this.getNodeParameter('queryParameters', itemIndex, '') as string;
					const requestBodyStr = this.getNodeParameter('requestBody', itemIndex, '') as string;

					if (!apiPath) {
						throw new NodeOperationError(this.getNode(), 'API 路径不能为空', {
								itemIndex,
							});
						}

					// 如果用户输入了完整 URL（包含域名），提取路径部分
					// 域名应该从凭证中的 baseURL 获取
					if (apiPath.startsWith('http://') || apiPath.startsWith('https://')) {
						try {
							// @ts-expect-error - URL is a Node.js built-in global
							const url = new URL(apiPath);
							apiPath = url.pathname + url.search;
						} catch {
							// 如果 URL 解析失败，尝试简单提取
							const match = apiPath.match(/https?:\/\/[^/]+(\/.*)/);
							if (match) {
								apiPath = match[1];
							}
						}
					}

					// 确保路径以 / 开头
					if (!apiPath.startsWith('/')) {
						apiPath = '/' + apiPath;
					}

					// 解析路径中的查询参数
					if (apiPath.includes('?')) {
						const queryString = apiPath.split('?')[1];
						const params = queryString.split('&');
						for (const param of params) {
							const [key, value] = param.split('=');
							if (key) {
								queryParams[key] = decodeURIComponent(value || '');
							}
						}
					}

					// 解析额外的查询参数（如果提供）
					if (queryParametersStr) {
						const params = queryParametersStr.split('&');
						for (const param of params) {
							const [key, value] = param.split('=');
							if (key) {
								queryParams[key] = decodeURIComponent(value || '');
							}
						}
					}

					// 获取 action
					action = (queryParams.action as string) || '';

					// 解析请求体
					if (requestBodyStr && (httpMethod === 'POST' || httpMethod === 'PUT')) {
						requestBody = requestBodyStr;
					}
					} else {
						throw new NodeOperationError(this.getNode(), `未知操作: ${operation}`, {
							itemIndex,
						});
					}

				// 构建请求头（根据参考脚本）
				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
				};

				// Job 相关接口使用 X-API-Version: v2，其他接口使用 version: v2
				if (isJobAction(action)) {
					headers['X-API-Version'] = 'v2';
				} else {
					headers['version'] = 'v2';
				}

				// 发送请求
				let response;
				if (httpMethod === 'POST' || httpMethod === 'PUT') {
					response = await client.sendRequest(httpMethod, '/', {
						params: queryParams,
						config: {},
						headers,
						body: requestBody || null,
					});
				} else {
					response = await client.sendRequest(httpMethod, '/', {
						params: queryParams,
						config: {},
						headers,
					});
				}

				// 解析响应数据
				const responseData = response.body;

				// 处理响应
				if (Array.isArray(responseData)) {
					for (const item of responseData) {
						returnData.push({
							json: item as IDataObject,
							pairedItem: { item: itemIndex },
						});
					}
				} else {
					returnData.push({
						json: responseData as IDataObject,
						pairedItem: { item: itemIndex },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: this.getInputData(itemIndex)[0].json,
						error,
						pairedItem: { item: itemIndex },
					});
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}

	methods = {
		listSearch: {
			getResourcePools,
		},
		credentialTest: {
			async aihcApi(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				// @ts-expect-error - console 在 Node.js 环境中可用
				console.log('[Aihc] credentialTest.aihcApi 被调用');
				// @ts-expect-error - console 在 Node.js 环境中可用
				console.log('[Aihc] credential.data keys:', Object.keys(credential.data || {}));

				const accessKey = credential.data?.accessKey as string;
				const secretKey = credential.data?.secretKey as string;
				const baseURL = (credential.data?.baseURL as string) || 'http://aihc.bj.baidubce.com';

				// @ts-expect-error - console 在 Node.js 环境中可用
				console.log('[Aihc] accessKey:', accessKey ? `${accessKey.substring(0, 4)}...` : '未设置');
				// @ts-expect-error - console 在 Node.js 环境中可用
				console.log('[Aihc] secretKey:', secretKey ? '已设置' : '未设置');
				// @ts-expect-error - console 在 Node.js 环境中可用
				console.log('[Aihc] baseURL:', baseURL);

				if (!accessKey || !secretKey) {
					// @ts-expect-error - console 在 Node.js 环境中可用
					console.log('[Aihc] 凭证验证失败：缺少 Access Key 或 Secret Key');
					return {
						status: 'Error',
						message: '凭证中缺少 Access Key 或 Secret Key',
					};
				}

				try {
					// 使用 BceBaseClient 发送请求
					const bceConfig = {
						endpoint: baseURL,
						credentials: {
							ak: accessKey,
							sk: secretKey,
						},
					};

					const client = new BceBaseClient(bceConfig, 'aihc');

					// 调用数据集列表查询接口进行验证
					const queryParams = {
						action: 'DescribeDatasets',
						pageNumber: '1',
						pageSize: '1',
					};

					const headers: Record<string, string> = {
						'Content-Type': 'application/json',
						version: 'v2',
					};

					// @ts-expect-error - console 在 Node.js 环境中可用
					console.log('[Aihc] 发送请求到:', baseURL);
					// @ts-expect-error - console 在 Node.js 环境中可用
					console.log('[Aihc] 查询参数:', JSON.stringify(queryParams, null, 2));
					// @ts-expect-error - console 在 Node.js 环境中可用
					console.log('[Aihc] 请求头:', JSON.stringify(headers, null, 2));

					const response = await client.sendRequest('GET', '/', {
						params: queryParams,
						config: {},
						headers,
					});

					// @ts-expect-error - console 在 Node.js 环境中可用
					console.log('[Aihc] 响应状态:', response.statusCode || 'N/A');
					// @ts-expect-error - console 在 Node.js 环境中可用
					console.log('[Aihc] 响应体:', JSON.stringify(response.body, null, 2));

					// 检查响应是否成功
					if (response.body && typeof response.body === 'object') {
						// 如果响应包含错误信息，返回错误
						if ('code' in response.body && response.body.code) {
							// @ts-expect-error - console 在 Node.js 环境中可用
							console.log('[Aihc] API 返回错误:', response.body.code, response.body.message);
							return {
								status: 'Error',
								message: `API 请求失败: ${response.body.code} - ${response.body.message || '未知错误'}`,
							};
						}
						// 验证成功
						// @ts-expect-error - console 在 Node.js 环境中可用
						console.log('[Aihc] 凭证验证成功');
						return {
							status: 'OK',
							message: '凭证验证成功',
						};
					}

					// @ts-expect-error - console 在 Node.js 环境中可用
					console.log('[Aihc] 无效的 API 响应格式');
					return {
						status: 'Error',
						message: '无效的 API 响应',
					};
				} catch (error) {
					// @ts-expect-error - console 在 Node.js 环境中可用
					console.error('[Aihc] 凭证验证异常:', error);
					
					// 提供更详细的错误信息
					let errorMessage = '凭证验证失败';
					if (error instanceof Error) {
						errorMessage = `${errorMessage}: ${error.message}`;
						if (error.stack) {
							// @ts-expect-error - console 在 Node.js 环境中可用
							console.error('[Aihc] 错误堆栈:', error.stack);
						}
					} else {
						errorMessage = `${errorMessage}: ${String(error)}`;
					}
					
					return {
						status: 'Error',
						message: errorMessage,
					};
				}
			},
		},
	};
}
